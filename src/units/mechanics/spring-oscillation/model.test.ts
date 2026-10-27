/**
 * ばねの単振動モデルの物理的な正しさのテスト。
 * 解析解・周期の公式・エネルギー保存・等時性を、パラメータ範囲の端も含めて確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  acceleration,
  amplitude,
  analyticState,
  angularFrequency,
  energies,
  initialState,
  period,
  referenceCirclePoint,
  step,
  type SpringParams,
  type SpringState,
} from './model';

/** dt 刻みで duration 秒シミュレーションし、時系列を返す */
function simulate(p: SpringParams, duration: number, dt = DT) {
  const n = Math.round(duration / dt);
  const ts = [0];
  const states: SpringState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, dt);
    ts.push(i * dt);
    states.push(s);
  }
  return { ts, states };
}

/** 静止したままになる初期条件（x0 = v0 = 0）を除いたパラメータの組 */
const MOVING_CORNERS = paramCorners(PARAMS).filter((p) => p.x0 !== 0 || p.v0 !== 0);
const DEFAULT = defaultParams(PARAMS);

describe('公式', () => {
  it('m = 1 kg, k = 4 N/m のとき ω = 2 rad/s, T = π s', () => {
    const p = { ...DEFAULT, m: 1, k: 4 };
    expect(angularFrequency(p)).toBeCloseTo(2, 12);
    expect(period(p)).toBeCloseTo(Math.PI, 12);
  });

  it('質量を 4 倍にすると周期は 2 倍、ばね定数を 4 倍にすると周期は 1/2', () => {
    expect(period({ ...DEFAULT, m: 4 * DEFAULT.m }) / period(DEFAULT)).toBeCloseTo(2, 12);
    expect(period({ ...DEFAULT, k: 4 * DEFAULT.k }) / period(DEFAULT)).toBeCloseTo(0.5, 12);
  });

  it('振幅: 初速 0 なら A = |x₀|、x₀ = 0 なら A = |v₀|/ω', () => {
    expect(amplitude({ ...DEFAULT, x0: -0.2, v0: 0 })).toBeCloseTo(0.2, 12);
    const p = { ...DEFAULT, x0: 0, v0: 1.5 };
    expect(amplitude(p)).toBeCloseTo(1.5 / angularFrequency(p), 12);
  });

  it('加速度は変位に比例し逆向き（a = -ω²x）', () => {
    const w = angularFrequency(DEFAULT);
    expect(acceleration(DEFAULT, 0.1)).toBeCloseTo(-w * w * 0.1, 12);
    expect(acceleration(DEFAULT, 0)).toBeCloseTo(0, 15);
  });
});

describe('数値計算と解析解の一致', () => {
  it('既定パラメータで 10 周期後も解析解と一致する（誤差 < 振幅の 1e-4）', () => {
    const T = period(DEFAULT);
    const { ts, states } = simulate(DEFAULT, 10 * T);
    const A = amplitude(DEFAULT);
    let maxErr = 0;
    ts.forEach((t, i) => {
      maxErr = Math.max(maxErr, Math.abs(states[i]!.x - analyticState(DEFAULT, t).x));
    });
    // 速度ベルレ法の位相誤差は 1 rad あたり (ωΔt)²/24 程度で、10 周期で約 3e-5
    expect(maxErr / A).toBeLessThan(1e-4);
  });

  it('パラメータ範囲の全隅で、3 周期後の位置・速度が解析解と一致する', () => {
    for (const p of MOVING_CORNERS) {
      const T = period(p);
      const { ts, states } = simulate(p, 3 * T);
      const last = states[states.length - 1]!;
      const exact = analyticState(p, ts[ts.length - 1]!);
      const A = amplitude(p);
      const w = angularFrequency(p);
      expect(Math.abs(last.x - exact.x) / A, JSON.stringify(p)).toBeLessThan(1e-3);
      expect(Math.abs(last.v - exact.v) / (A * w), JSON.stringify(p)).toBeLessThan(1e-3);
    }
  });

  it('つりあいの位置で静止させると、そのまま静止し続ける', () => {
    const p = { ...DEFAULT, x0: 0, v0: 0 };
    const { states } = simulate(p, 5);
    expect(states.every((s) => s.x === 0 && s.v === 0)).toBe(true);
  });
});

describe('周期と等時性', () => {
  it('シミュレーションから測った周期が T = 2π√(m/k) と一致する（パラメータ範囲の全隅）', () => {
    for (const p of MOVING_CORNERS) {
      const T = period(p);
      const { ts, states } = simulate(p, 5.2 * T);
      const measured = estimatePeriod(
        ts,
        states.map((s) => s.x),
      );
      expect(relativeError(measured, T), JSON.stringify(p)).toBeLessThan(1e-4);
    }
  });

  it('振幅を変えても周期は変わらない（等時性）', () => {
    const periods = [0.05, 0.2, 0.5].map((x0) => {
      const p = { ...DEFAULT, x0, v0: 0 };
      const { ts, states } = simulate(p, 5.2 * period(p));
      return estimatePeriod(
        ts,
        states.map((s) => s.x),
      );
    });
    for (const T of periods) expect(relativeError(T, periods[0]!)).toBeLessThan(1e-5);
  });

  it('振動の最大変位が振幅 A に一致する', () => {
    for (const p of MOVING_CORNERS) {
      const { states } = simulate(p, period(p));
      const maxX = Math.max(...states.map((s) => Math.abs(s.x)));
      expect(relativeError(maxX, amplitude(p)), JSON.stringify(p)).toBeLessThan(1e-4);
    }
  });
});

describe('エネルギー保存', () => {
  it('力学的エネルギー ½mv² + ½kx² が 30 周期にわたって保存され、ドリフトしない', () => {
    const PERIODS = 30;
    for (const p of MOVING_CORNERS) {
      const n = Math.round((PERIODS * period(p)) / DT);
      const e0 = energies(p, initialState(p)).total;
      let s = initialState(p);
      let firstMax = 0; // 最初の 3 周期の最大誤差
      let lastMax = 0; // 最後の 3 周期の最大誤差
      for (let i = 1; i <= n; i++) {
        s = step(p, s, DT);
        const err = relativeError(energies(p, s).total, e0);
        if (i <= n / 10) firstMax = Math.max(firstMax, err);
        if (i > n - n / 10) lastMax = Math.max(lastMax, err);
      }
      // 速度ベルレ法のエネルギー誤差は最大 (ωΔt)²/4 程度で頭打ちになる
      const bound = (angularFrequency(p) * DT) ** 2 / 2;
      expect(Math.max(firstMax, lastMax), JSON.stringify(p)).toBeLessThan(bound);
      expect(lastMax, JSON.stringify(p)).toBeLessThan(firstMax * 1.05 + 1e-15);
    }
  });

  it('全エネルギーは ½kA² に等しい', () => {
    for (const p of MOVING_CORNERS) {
      const e = energies(p, initialState(p)).total;
      expect(relativeError(e, 0.5 * p.k * amplitude(p) ** 2)).toBeLessThan(1e-12);
    }
  });

  it('つりあいの位置では運動エネルギーが最大、端では弾性エネルギーが最大', () => {
    const p = { ...DEFAULT, x0: 0.3, v0: 0 };
    const T = period(p);
    const atEnd = energies(p, analyticState(p, 0));
    const atCenter = energies(p, analyticState(p, T / 4));
    expect(atEnd.kinetic).toBeCloseTo(0, 12);
    expect(atCenter.potential).toBeCloseTo(0, 12);
    expect(atCenter.kinetic).toBeCloseTo(atEnd.potential, 12);
  });
});

describe('等速円運動との対応', () => {
  it('参照円上の点は常に半径 A の円周上にあり、x 座標が変位と一致する', () => {
    const p = { ...DEFAULT, x0: 0.2, v0: 1 };
    const { states } = simulate(p, 2 * period(p));
    const A = amplitude(p);
    for (const s of states) {
      const q = referenceCirclePoint(p, s);
      expect(q.x).toBe(s.x);
      expect(relativeError(Math.hypot(q.x, q.y), A)).toBeLessThan(1e-4);
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で ωΔt ≤ 0.04（1 周期あたり 150 ステップ以上）', () => {
    for (const p of paramCorners(PARAMS)) {
      expect(angularFrequency(p) * DT).toBeLessThanOrEqual(0.04);
    }
  });
});
