/**
 * 単振り子モデルの物理的な正しさのテスト。
 * 周期の公式（小振幅）と楕円積分による厳密な周期、エネルギー保存、張力の公式を、
 * パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import {
  DT,
  PARAMS,
  angularFrequency,
  bottomSpeed,
  bottomTension,
  endTension,
  energies,
  exactPeriod,
  initialState,
  position,
  smallAnglePeriod,
  smallAngleTheta,
  step,
  tangentialVelocity,
  tension,
  type PendulumParams,
  type PendulumState,
} from './model';

function simulate(p: PendulumParams, duration: number, dt = DT) {
  const n = Math.round(duration / dt);
  const ts = [0];
  const states: PendulumState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, dt);
    ts.push(i * dt);
    states.push(s);
  }
  return { ts, states };
}

function measuredPeriod(p: PendulumParams, periods = 5.2) {
  const { ts, states } = simulate(p, periods * exactPeriod(p));
  return estimatePeriod(
    ts,
    states.map((s) => s.theta),
  );
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const MOVING = CORNERS.filter((p) => p.theta0 > 0);

describe('周期', () => {
  it('L = g/(4π²) m のとき T₀ = 1 s', () => {
    expect(smallAnglePeriod({ ...DEFAULT, L: G_ACCEL / (4 * Math.PI ** 2) })).toBeCloseTo(1, 12);
  });

  it('振れ角が小さい（2°）とき、測った周期が公式 T₀ = 2π√(L/g) と一致する', () => {
    for (const L of [0.2, 1, 2]) {
      const p = { ...DEFAULT, L, theta0: 2 };
      // 有限振幅の補正は θ₀²/16 ≈ 7.6e-5
      expect(relativeError(measuredPeriod(p), smallAnglePeriod(p))).toBeLessThan(1e-4);
    }
  });

  it('全隅で、測った周期が楕円積分による厳密な周期 4√(L/g)K(sin(θ₀/2)) と一致する', () => {
    for (const p of MOVING) {
      // 吉田の 4 次法の位相誤差は (ωΔt)⁴ 程度で無視でき、ゼロ交差の線形補間の誤差も小さい
      expect(relativeError(measuredPeriod(p), exactPeriod(p)), JSON.stringify(p)).toBeLessThan(
        1e-6,
      );
    }
  });

  it('振れ角が大きいほど周期は長い。θ₀ = 90° では公式の約 1.180 倍', () => {
    const ratio = (theta0: number) =>
      exactPeriod({ ...DEFAULT, theta0 }) / smallAnglePeriod(DEFAULT);
    expect(ratio(90)).toBeCloseTo(1.18034, 5);
    // 級数展開 1 + θ₀²/16 + 11θ₀⁴/3072 と小さい角で一致する
    const th = (10 * Math.PI) / 180;
    expect(ratio(10)).toBeCloseTo(1 + th ** 2 / 16 + (11 * th ** 4) / 3072, 7);
    for (let a = 1; a < 90; a++) expect(ratio(a + 1)).toBeGreaterThan(ratio(a));
  });

  it('周期は質量によらない', () => {
    expect(measuredPeriod({ ...DEFAULT, m: 0.1 })).toBeCloseTo(
      measuredPeriod({ ...DEFAULT, m: 2 }),
      10,
    );
  });
});

describe('解説の例題', () => {
  it('L = 1.0 m で T ≈ 2.0 s、振れ角 20° で約 0.8%・80° で約 14% 長い、60° で最下点の張力 2mg', () => {
    expect(smallAnglePeriod({ ...DEFAULT, L: 1 })).toBeCloseTo(2.0, 1);
    const ratio = (theta0: number) =>
      exactPeriod({ ...DEFAULT, theta0 }) / smallAnglePeriod(DEFAULT) - 1;
    expect(ratio(20)).toBeCloseTo(0.008, 3);
    expect(ratio(80)).toBeCloseTo(0.14, 2);
    const p = { ...DEFAULT, theta0: 60 };
    expect(bottomTension(p)).toBeCloseTo(2 * p.m * G_ACCEL, 12);
  });
});

describe('単振動の近似', () => {
  it('振れ角が小さいとき、θ(t) が近似解 θ₀ cos ωt と一致する（誤差は θ₀³ 程度）', () => {
    const p = { ...DEFAULT, theta0: 3 };
    const { ts, states } = simulate(p, 2 * smallAnglePeriod(p));
    const th0 = (3 * Math.PI) / 180;
    const maxErr = Math.max(
      ...ts.map((t, i) => Math.abs(states[i]!.theta - smallAngleTheta(p, t))),
    );
    // 周期のずれ θ₀²/16 による位相のずれが 2 周期で 2π·2·θ₀²/16 ≈ 2e-3 rad、振幅をかけて θ₀ × 2e-3
    expect(maxErr / th0).toBeLessThan(3e-3);
  });

  it('振れ角が大きいと近似解からはっきりずれる（θ₀ = 60° で 2 周期後に振幅の 20% 以上）', () => {
    const p = { ...DEFAULT, theta0: 60 };
    const T0 = smallAnglePeriod(p);
    const { states } = simulate(p, 2 * T0);
    const th0 = Math.PI / 3;
    // 周期が約 7% 長いので、2 周期で位相が約 0.86 rad 遅れ、θ₀(1 − cos 0.86) ≈ 0.35θ₀ ずれる
    expect(Math.abs(states.at(-1)!.theta - smallAngleTheta(p, 2 * T0)) / th0).toBeGreaterThan(0.2);
  });
});

describe('エネルギー保存と張力', () => {
  it('力学的エネルギーが 30 周期にわたって保存され、ドリフトしない（全隅）', () => {
    for (const p of MOVING) {
      const n = Math.round((30 * exactPeriod(p)) / DT);
      const e0 = energies(p, initialState(p)).total;
      let s = initialState(p);
      let firstMax = 0;
      let lastMax = 0;
      for (let i = 1; i <= n; i++) {
        s = step(p, s, DT);
        const err = relativeError(energies(p, s).total, e0);
        if (i <= n / 10) firstMax = Math.max(firstMax, err);
        if (i > n - n / 10) lastMax = Math.max(lastMax, err);
      }
      // 吉田の 4 次法のエネルギー誤差は (ωΔt)⁴ ≈ 2e-9 程度
      expect(Math.max(firstMax, lastMax), JSON.stringify(p)).toBeLessThan(1e-8);
      expect(lastMax, JSON.stringify(p)).toBeLessThan(firstMax * 1.5 + 1e-13);
    }
  });

  it('反対側の同じ高さ（−θ₀）まで振れる', () => {
    for (const p of MOVING) {
      const { states } = simulate(p, exactPeriod(p));
      const minTheta = Math.min(...states.map((s) => s.theta));
      const th0 = (p.theta0 * Math.PI) / 180;
      // 端は刻み Δt の途中にあるので、記録された最小値は端から最大 ½(g/L)sin θ₀ (Δt/2)² だけずれる
      const bound = 0.5 * (G_ACCEL / p.L) * Math.sin(th0) * (DT / 2) ** 2 + 1e-9;
      expect(Math.abs(minTheta + th0), JSON.stringify(p)).toBeLessThan(bound);
    }
  });

  it('最下点の速さ √(2gL(1 − cos θ₀)) と張力 mg(3 − 2cos θ₀)、端での張力 mg cos θ₀ が公式と一致する', () => {
    for (const p of MOVING) {
      const { states } = simulate(p, exactPeriod(p));
      // 最下点（|θ| が最小）と端（|θ̇| が最小）の状態
      const bottom = states.reduce((a, b) => (Math.abs(b.theta) < Math.abs(a.theta) ? b : a));
      expect(
        relativeError(Math.abs(tangentialVelocity(p, bottom)), bottomSpeed(p)),
        JSON.stringify(p),
      ).toBeLessThan(1e-4);
      expect(relativeError(tension(p, bottom), bottomTension(p)), JSON.stringify(p)).toBeLessThan(
        1e-4,
      );
      expect(tension(p, initialState(p))).toBeCloseTo(endTension(p), 12);
    }
  });

  it('張力は最下点で最大で、重力 mg より大きい', () => {
    const p = { ...DEFAULT, theta0: 45 };
    const { states } = simulate(p, exactPeriod(p));
    const maxT = Math.max(...states.map((s) => tension(p, s)));
    expect(relativeError(maxT, bottomTension(p))).toBeLessThan(1e-6);
    expect(maxT).toBeGreaterThan(p.m * G_ACCEL);
  });
});

describe('定性的な性質', () => {
  it('θ₀ = 0 なら最下点で静止したまま（張力 = mg）', () => {
    const p = { ...DEFAULT, theta0: 0 };
    const { states } = simulate(p, 2);
    expect(states.every((s) => s.theta === 0 && s.omega === 0)).toBe(true);
    expect(tension(p, states.at(-1)!)).toBeCloseTo(p.m * G_ACCEL, 12);
  });

  it('おもりは常に固定点から距離 L の円周上にある', () => {
    const { states } = simulate(DEFAULT, 3);
    for (const s of states) {
      const q = position(DEFAULT, s);
      expect(Math.hypot(q.x, q.y)).toBeCloseTo(DEFAULT.L, 12);
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で ωΔt ≤ 0.04', () => {
    for (const p of CORNERS) expect(angularFrequency(p) * DT).toBeLessThanOrEqual(0.04);
  });
});
