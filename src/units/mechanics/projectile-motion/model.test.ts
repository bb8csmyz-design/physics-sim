/**
 * 落下運動・放物運動モデルの物理的な正しさのテスト。
 * 解析解（放物線・空気抵抗ありの指数関数解）、最高点・到達距離の公式、
 * エネルギー保存（空気抵抗があるときは発熱を含めた収支）を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import {
  DT,
  PARAMS,
  analyticState,
  energies,
  flightSummary,
  idealSummary,
  initialState,
  speed,
  step,
  terminalSpeed,
  type ProjectileParams,
  type ProjectileState,
} from './model';

/** 着地するまで（または maxTime まで）シミュレーションし、時系列を返す */
function simulate(p: ProjectileParams, maxTime = 60, dt = DT) {
  const ts = [0];
  const states: ProjectileState[] = [initialState(p)];
  let s = states[0]!;
  let t = 0;
  while (!s.landed && t < maxTime) {
    const prev = s;
    s = step(p, s, dt);
    // 着地したステップは途中で止まるので、実際に進んだ時間を解析解の時刻に合わせて求める
    t += dt;
    if (s.landed) t = t - dt + landingFraction(p, prev, dt);
    ts.push(t);
    states.push(s);
  }
  return { ts, states };
}

/** 着地ステップで実際に進んだ時間（二分法の結果と同じものを、速度の変化から逆算する） */
function landingFraction(p: ProjectileParams, prev: ProjectileState, dt: number): number {
  let lo = 0;
  let hi = dt;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (step(p, prev, mid).landed) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** 全隅のシミュレーション結果は複数のテストで使うので、1 回だけ計算して使い回す */
const cache = new Map<string, ReturnType<typeof simulate>>();
function simulateCached(p: ProjectileParams) {
  const key = JSON.stringify(p);
  let r = cache.get(key);
  if (!r) {
    r = simulate(p);
    cache.set(key, r);
  }
  return r;
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
/** 空気抵抗ありの代表的な条件 */
const DRAG = { ...DEFAULT, k: 0.5, m: 1, v0: 20, theta: 60, h0: 5 };

describe('空気抵抗なし: 公式', () => {
  it('v₀ = 19.6 m/s, θ = 30°, h = 0 のとき t₁ = 1 s, H = 4.9 m, R = 19.6²·sin60°/9.8', () => {
    const s = idealSummary({ ...DEFAULT, v0: 19.6, theta: 30, h0: 0, k: 0 });
    expect(s.apexTime).toBeCloseTo(1, 12);
    expect(s.maxHeight).toBeCloseTo(4.9, 12);
    expect(s.flightTime).toBeCloseTo(2, 12);
    expect(s.range).toBeCloseTo((19.6 ** 2 * Math.sin(Math.PI / 3)) / G_ACCEL, 10);
    expect(s.landingSpeed).toBeCloseTo(19.6, 12);
  });

  it('h = 0 では R = v₀² sin 2θ / g, 滞空時間 = 2t₁（上りと下りが対称）', () => {
    for (const theta of [10, 30, 45, 60, 80]) {
      const p = { ...DEFAULT, v0: 12, theta, h0: 0, k: 0 };
      const s = idealSummary(p);
      expect(s.range).toBeCloseTo((144 * Math.sin((2 * theta * Math.PI) / 180)) / G_ACCEL, 10);
      expect(s.flightTime).toBeCloseTo(2 * s.apexTime, 12);
    }
  });

  it('h = 0 では θ = 45° で到達距離が最大になり、θ と 90° − θ で同じ距離になる', () => {
    const R = (theta: number) => idealSummary({ ...DEFAULT, v0: 15, theta, h0: 0, k: 0 }).range;
    for (let th = 0; th <= 90; th++) expect(R(th)).toBeLessThanOrEqual(R(45) + 1e-12);
    for (const th of [15, 30, 40]) expect(R(th)).toBeCloseTo(R(90 - th), 10);
  });

  it('自由落下: v₀ = 0 なら t = √(2h/g), 着地の速さ √(2gh)', () => {
    const p = { ...DEFAULT, v0: 0, h0: 19.6, k: 0 };
    const s = idealSummary(p);
    expect(s.flightTime).toBeCloseTo(2, 12);
    expect(s.landingSpeed).toBeCloseTo(19.6, 12);
    expect(s.range).toBe(0);
  });
});

describe('数値計算と解析解の一致', () => {
  it('空気抵抗なし: パラメータ範囲の全隅で、軌道が放物線（解析解）と一致する', () => {
    for (const p of CORNERS.filter((c) => c.k === 0)) {
      const { ts, states } = simulateCached(p);
      let maxErr = 0;
      ts.forEach((t, i) => {
        const a = analyticState(p, t);
        const s = states[i]!;
        maxErr = Math.max(maxErr, Math.abs(s.x - a.x), Math.abs(s.vx - a.vx));
        if (!s.landed) maxErr = Math.max(maxErr, Math.abs(s.y - a.y), Math.abs(s.vy - a.vy));
      });
      // RK4 は 2 次多項式の解を厳密に再現するので、誤差は丸め誤差のみ
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-9);
    }
  });

  it('空気抵抗あり: パラメータ範囲の全隅で、指数関数の解析解と一致する', () => {
    for (const p of CORNERS.filter((c) => c.k > 0)) {
      const { ts, states } = simulateCached(p);
      const vRef = Math.max(p.v0, terminalSpeed(p), 1);
      let maxErr = 0;
      ts.forEach((t, i) => {
        const a = analyticState(p, t);
        const s = states[i]!;
        maxErr = Math.max(maxErr, Math.abs(s.vx - a.vx) / vRef, Math.abs(s.x - a.x));
        if (!s.landed) {
          maxErr = Math.max(maxErr, Math.abs(s.vy - a.vy) / vRef, Math.abs(s.y - a.y));
        }
      });
      // RK4 の大域誤差は (kΔt/m)⁴ 程度（≤ 1e-8）の相対誤差
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('シミュレーションの最高点・着地時刻・到達距離が公式（この条件での値）と一致する', () => {
    for (const p of CORNERS) {
      const { ts, states } = simulateCached(p);
      const sum = flightSummary(p);
      const maxY = Math.max(...states.map((s) => s.y));
      const last = states[states.length - 1]!;
      expect(last.landed, JSON.stringify(p)).toBe(true);
      // 最高点は刻み Δt ごとの値から測るので、頂点付近の誤差は g(Δt)²/8 ≈ 1.2e-6 m 以下
      expect(Math.abs(maxY - sum.maxHeight), JSON.stringify(p)).toBeLessThan(2e-6);
      expect(Math.abs(ts[ts.length - 1]! - sum.flightTime), JSON.stringify(p)).toBeLessThan(1e-9);
      expect(Math.abs(last.x - sum.range), JSON.stringify(p)).toBeLessThan(1e-7);
      expect(Math.abs(speed(last) - sum.landingSpeed), JSON.stringify(p)).toBeLessThan(1e-7);
    }
  });
});

describe('空気抵抗の効果', () => {
  it('空気抵抗があると最高点は低く、到達距離は短くなる', () => {
    const ideal = idealSummary(DRAG);
    const drag = flightSummary(DRAG);
    expect(drag.maxHeight).toBeLessThan(ideal.maxHeight);
    expect(drag.range).toBeLessThan(ideal.range);
    expect(drag.apexTime).toBeLessThan(ideal.apexTime);
    expect(drag.landingSpeed).toBeLessThan(ideal.landingSpeed);
  });

  it('k → 0 の極限で空気抵抗なしの公式に近づく', () => {
    const ideal = idealSummary({ ...DRAG, k: 0 });
    const weak = flightSummary({ ...DRAG, k: 1e-6 });
    // 補正は k t/m 程度の相対量（≈ 1e-6 × 4 s）
    expect(relativeError(weak.maxHeight, ideal.maxHeight)).toBeLessThan(1e-5);
    expect(relativeError(weak.range, ideal.range)).toBeLessThan(1e-5);
  });

  it('十分長く落下すると速さは終端速度 mg/k に近づき、それを超えない', () => {
    const p = { ...DEFAULT, v0: 0, h0: 1e6, k: 0.5, m: 0.5 }; // τ = 1 s, v_T = 9.8 m/s
    let s = initialState(p);
    let maxV = 0;
    for (let i = 0; i < 20 / DT; i++) {
      s = step(p, s, DT);
      maxV = Math.max(maxV, speed(s));
    }
    // 20τ 後の差は v_T e^{-20} ≈ 2e-8
    expect(relativeError(speed(s), terminalSpeed(p))).toBeLessThan(1e-8);
    expect(maxV).toBeLessThanOrEqual(terminalSpeed(p) * (1 + 1e-12));
  });

  it('水平方向の速度は単調に減り、鉛直方向の加速度の大きさは上昇中 g より大きく下降中 g より小さい', () => {
    const { states } = simulate(DRAG);
    for (let i = 1; i < states.length; i++) {
      expect(states[i]!.vx).toBeLessThan(states[i - 1]!.vx);
    }
    const c = DRAG.k / DRAG.m;
    for (const s of states.filter((x) => !x.landed)) {
      const ay = -G_ACCEL - c * s.vy;
      if (s.vy > 0) expect(-ay).toBeGreaterThan(G_ACCEL);
      if (s.vy < 0) expect(-ay).toBeLessThan(G_ACCEL);
    }
  });
});

describe('エネルギー', () => {
  it('空気抵抗なし: 力学的エネルギーが保存される（パラメータ範囲の全隅）', () => {
    for (const p of CORNERS.filter((c) => c.k === 0)) {
      const { states } = simulateCached(p);
      const e0 = energies(p, states[0]!).total;
      const maxErr = Math.max(...states.map((s) => Math.abs(energies(p, s).total - e0)));
      // RK4 は放物運動を厳密に解くので、誤差は丸め誤差のみ
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-9 * (1 + e0));
      expect(states.every((s) => s.heat === 0)).toBe(true);
    }
  });

  it('空気抵抗あり: 力学的エネルギーの減少分が発熱に等しい（K + U + Q = 一定、全隅）', () => {
    for (const p of CORNERS.filter((c) => c.k > 0)) {
      const { states } = simulateCached(p);
      const e0 = energies(p, states[0]!).total;
      let maxErr = 0;
      let increased = false;
      let prevTotal = e0;
      for (const s of states) {
        const e = energies(p, s);
        maxErr = Math.max(maxErr, Math.abs(e.total + e.heat - e0));
        if (e.total > prevTotal + 1e-12) increased = true;
        prevTotal = e.total;
      }
      // 発熱 Q も同じ RK4 で積分しているので、収支の誤差は (kΔt/m)⁴ 程度の相対量
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-8 * (1 + e0));
      // 散逸があるので力学的エネルギーは増えない
      expect(increased, JSON.stringify(p)).toBe(false);
    }
  });
});

describe('定性的な性質・極限', () => {
  it('地面から静かに放した（v₀ = 0, h = 0）物体は、着地済みのまま動かない', () => {
    const p = { ...DEFAULT, v0: 0, h0: 0 };
    const s0 = initialState(p);
    expect(s0.landed).toBe(true);
    expect(step(p, s0, DT)).toEqual(s0);
  });

  it('鉛直投げ上げ（θ = 90°）では x = 0 のまま、自由落下は空気抵抗があっても真下に落ちる', () => {
    for (const p of [
      { ...DEFAULT, theta: 90, k: 0 },
      { ...DEFAULT, theta: 90, k: 0.5 },
      { ...DEFAULT, v0: 0, h0: 10, k: 0.5 },
    ]) {
      const { states } = simulate(p);
      expect(states.every((s) => s.x === 0)).toBe(true);
    }
  });

  it('空気抵抗なしでは質量によらず同じ軌道になる', () => {
    const a = flightSummary({ ...DEFAULT, m: 0.1 });
    const b = flightSummary({ ...DEFAULT, m: 5 });
    expect(a).toEqual(b);
  });

  it('空気抵抗ありでは、同じ k なら重い物体ほど遠くまで飛ぶ', () => {
    const light = flightSummary({ ...DRAG, m: 0.5 });
    const heavy = flightSummary({ ...DRAG, m: 2 });
    expect(heavy.range).toBeGreaterThan(light.range);
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で kΔt/m ≤ 0.01（RK4 の誤差が十分小さい）', () => {
    for (const p of CORNERS) expect((p.k * DT) / p.m).toBeLessThanOrEqual(0.01);
  });

  it('刻み幅を 1/10 にしても結果が変わらない（Δt に依存しない）', () => {
    const coarse = simulate(DRAG, 60, DT).states;
    const fine = simulate(DRAG, 60, DT / 10).states;
    const a = coarse[coarse.length - 1]!;
    const b = fine[fine.length - 1]!;
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-8);
  });
});
