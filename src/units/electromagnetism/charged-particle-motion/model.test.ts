/**
 * 一様な電場・磁場中の荷電粒子の運動の物理的な正しさのテスト。
 * 解析解（円運動・サイクロイド・放物運動）、回転半径と周期の公式、磁場が仕事をしないこと、
 * エネルギー保存、速度選別（E/B で直進）を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  acceleration,
  analyticState,
  driftVelocity,
  energies,
  initialState,
  lorentzForce,
  omega,
  period,
  radius,
  step,
  type ParticleParams,
  type ParticleState,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

function simulate(p: ParticleParams, duration: number, dt = DT) {
  const n = Math.round(duration / dt);
  const ts = [0];
  const states: ParticleState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, dt);
    ts.push(i * dt);
    states.push(s);
  }
  return { ts, states };
}

/** 全隅の 6 秒間の運動（複数のテストで共有する） */
const RUNS = new Map<ParticleParams, ReturnType<typeof simulate>>();
function runCorner(p: ParticleParams) {
  let r = RUNS.get(p);
  if (!r) RUNS.set(p, (r = simulate(p, 6)));
  return r;
}

describe('回転半径と周期の公式', () => {
  it('m = 2 g, q = 2 mC, B = 1 T, v₀ = 1 m/s のとき r = mv/(qB) = 1 m, T = 2πm/(qB) = 2π s', () => {
    const p = { ...DEFAULT, m: 2, q: 2, B: 1, E: 0, v0: 1 };
    expect(radius(p)).toBeCloseTo(1, 12);
    expect(period(p)).toBeCloseTo(2 * Math.PI, 12);
  });

  it('速さを 2 倍にすると半径は 2 倍、周期は変わらない', () => {
    const p = { ...DEFAULT, E: 0, v0: 1 };
    const p2 = { ...p, v0: 2 };
    expect(radius(p2) / radius(p)).toBeCloseTo(2, 12);
    expect(period(p2)).toBe(period(p));
  });

  it('磁場か電荷が 0 なら円運動しない（半径・周期は無限大）', () => {
    expect(radius({ ...DEFAULT, B: 0 })).toBe(Infinity);
    expect(period({ ...DEFAULT, q: 0 })).toBe(Infinity);
  });
});

describe('数値計算と解析解の一致', () => {
  it('パラメータ範囲の全隅で、6 秒間の軌道が解析解と一致する', () => {
    for (const p of CORNERS) {
      const { ts, states } = runCorner(p);
      // 位置の大きさの目安（打ち出しの速さか到達した速さ × 時間、最低 1 cm）
      let maxErr = 0;
      let scale = 0.01;
      ts.forEach((t, i) => {
        const a = analyticState(p, t);
        maxErr = Math.max(maxErr, Math.hypot(states[i]!.x - a.x, states[i]!.y - a.y));
        scale = Math.max(scale, Math.hypot(a.x, a.y));
      });
      // RK4 の大域誤差は (ωΔt)⁴ ωt 程度で、|ω|Δt ≤ 0.008, ωt ≤ 48 なら 10⁻⁷ 以下
      expect(maxErr / scale, JSON.stringify(p)).toBeLessThan(1e-7);
    }
  });

  it('電場がなければ等速円運動: 測った周期と半径が公式と一致する（周期 8 秒以下の全隅）', () => {
    // 周期の長い隅も含めた全隅の軌道は、上の解析解との比較で確かめている（テスト時間の上限のため）
    for (const p of CORNERS.filter(
      (c) => c.E === 0 && c.v0 > 0 && omega(c) !== 0 && period(c) <= 8,
    )) {
      const T = period(p);
      const { ts, states } = simulate(p, 2.2 * T);
      const measured = estimatePeriod(
        ts,
        states.map((s) => s.vy),
      );
      expect(relativeError(measured, T), JSON.stringify(p)).toBeLessThan(1e-4);
      const ys = states.map((s) => s.y);
      const diameter = Math.max(...ys) - Math.min(...ys);
      expect(relativeError(diameter / 2, radius(p)), JSON.stringify(p)).toBeLessThan(1e-4);
    }
  });

  it('電場がなければ、軌道は中心 (0, −v₀/ω)・半径 r の円の上にある', () => {
    const p = { ...DEFAULT, E: 0 };
    const cy = -p.v0 / omega(p);
    for (const s of simulate(p, period(p)).states) {
      expect(relativeError(Math.hypot(s.x, s.y - cy), radius(p))).toBeLessThan(1e-9);
    }
  });
});

describe('ローレンツ力の向き', () => {
  it('正電荷・B > 0（⊙）で右向きに打ち出すと、力は下向き（時計回りに回る）', () => {
    const p = { ...DEFAULT, q: 2, B: 1, E: 0 };
    const f = lorentzForce(p, initialState(p));
    expect(f.x).toBeCloseTo(0, 15);
    expect(f.y).toBeLessThan(0);
    // 1/4 周期後には右下の位置で下向きに動いている
    const s = analyticState(p, period(p) / 4);
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(0);
    expect(s.vy).toBeLessThan(0);
  });

  it('負電荷または磁場を逆向き（⊗）にすると、回る向きが逆になる', () => {
    for (const p of [
      { ...DEFAULT, q: -2, B: 1, E: 0 },
      { ...DEFAULT, q: 2, B: -1, E: 0 },
    ]) {
      expect(lorentzForce(p, initialState(p)).y).toBeGreaterThan(0);
    }
  });

  it('ローレンツ力は常に速度に垂直（大きさは |q|vB）', () => {
    for (const p of CORNERS) {
      for (const s of runCorner(p).states.filter((_, i) => i % 500 === 0)) {
        const f = lorentzForce(p, s);
        const v = Math.hypot(s.vx, s.vy);
        const fm = Math.hypot(f.x, f.y);
        expect(Math.abs(f.x * s.vx + f.y * s.vy)).toBeLessThanOrEqual(1e-15 * (fm * v + 1));
        expect(fm).toBeCloseTo(Math.abs(p.q * 1e-3 * p.B) * v, 12);
      }
    }
  });
});

describe('エネルギー', () => {
  it('磁場は仕事をしない: 電場がなければ速さが一定（20 周期でもドリフトしない）', () => {
    for (const p of CORNERS.filter((c) => c.E === 0 && c.v0 > 0)) {
      // 周期の長い組は 30 秒で打ち切る（テスト時間の上限）
      const n = Math.round(Math.min(20 * period(p), 30) / DT);
      let s = initialState(p);
      let maxErr = 0;
      for (let i = 0; i < n; i++) {
        s = step(p, s, DT);
        maxErr = Math.max(maxErr, relativeError(Math.hypot(s.vx, s.vy), p.v0));
      }
      // RK4 の 1 周期あたりのエネルギー誤差は (ωΔt)⁵ 程度で、20 周期でも 10⁻⁸ に届かない
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('電場があるとき、運動エネルギーと電場による位置エネルギー −qEy の和が保存される（全隅）', () => {
    for (const p of CORNERS) {
      const { states } = runCorner(p);
      const e0 = energies(p, states[0]!).total;
      const scale = Math.max(...states.map((s) => energies(p, s).kinetic));
      if (scale === 0) continue;
      const maxErr = Math.max(...states.map((s) => Math.abs(energies(p, s).total - e0)));
      expect(maxErr / scale, JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });
});

describe('電場と磁場の両方があるとき', () => {
  it('速度選別: v₀ = E/B なら電場の力とローレンツ力がつりあって直進する', () => {
    const p = { ...DEFAULT, E: 1.5, B: 1.5, v0: 1 };
    const a = acceleration(p, initialState(p));
    expect(Math.hypot(a.x, a.y)).toBeLessThan(1e-12);
    const { states } = simulate(p, 10);
    for (const s of states) expect(Math.abs(s.y)).toBeLessThan(1e-9);
  });

  it('1 周期あたりに進む距離から求めた平均の速さは E/B（電荷の符号によらない）', () => {
    for (const p of CORNERS.filter((c) => c.E > 0 && omega(c) !== 0 && period(c) <= 8)) {
      const T = period(p);
      const s = analyticState(p, T);
      const { states } = simulate(p, Math.round(T / DT) * DT);
      const last = states[states.length - 1]!;
      expect(relativeError(s.x / T, driftVelocity(p)), JSON.stringify(p)).toBeLessThan(1e-12);
      // 数値計算でも 1 周期後に y = 0 に戻り、x は (E/B)T だけ進む
      expect(Math.abs(last.y), JSON.stringify(p)).toBeLessThan(2e-3 * Math.abs(radius(p)) + 1e-9);
      expect(
        relativeError(last.x, driftVelocity(p) * Math.round(T / DT) * DT),
        JSON.stringify(p),
      ).toBeLessThan(5e-3);
    }
  });

  it('静止状態から放すとサイクロイドを描き、最大の速さは 2E/B', () => {
    const p = { ...DEFAULT, E: 1, B: 1, v0: 0 };
    const { states } = simulate(p, period(p));
    const vmax = Math.max(...states.map((s) => Math.hypot(s.vx, s.vy)));
    expect(relativeError(vmax, (2 * p.E) / p.B)).toBeLessThan(1e-5);
    // 最大の速さになるのは最も電位の低い点（y が最大 = 正電荷では −qEy が最小）
    expect(Math.min(...states.map((s) => s.y))).toBeGreaterThanOrEqual(-1e-12);
  });

  it('磁場が 0 なら電場の中の放物運動: y = ½(qE/m)(x/v₀)²', () => {
    const p = { ...DEFAULT, B: 0, E: 2, v0: 1.5 };
    for (const s of simulate(p, 3).states) {
      const a = (p.q * 1e-3 * p.E) / (p.m * 1e-3);
      expect(s.y).toBeCloseTo(0.5 * a * (s.x / p.v0) ** 2, 9);
    }
  });

  it('電荷が 0 なら力を受けず等速直線運動', () => {
    const p = { ...DEFAULT, q: 0, E: 2 };
    const { ts, states } = simulate(p, 3);
    states.forEach((s, i) => {
      expect(s.y).toBe(0);
      expect(s.x).toBeCloseTo(p.v0 * ts[i]!, 12);
    });
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で |ω|Δt ≤ 0.01（1 周期あたり 600 ステップ以上）', () => {
    for (const p of CORNERS) expect(Math.abs(omega(p)) * DT).toBeLessThanOrEqual(0.01);
  });
});
