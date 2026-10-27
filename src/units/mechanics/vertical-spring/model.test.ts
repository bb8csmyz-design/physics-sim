/**
 * 鉛直ばね振り子モデルの物理的な正しさのテスト。
 * つりあいの伸び、解析解・周期の公式、重力を含めたエネルギー保存を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import {
  DT,
  NATURAL_LENGTH,
  PARAMS,
  acceleration,
  amplitude,
  analyticState,
  angularFrequency,
  energies,
  equilibriumStretch,
  initialState,
  netForce,
  period,
  springForce,
  step,
  stretch,
  type VSpringParams,
  type VSpringState,
} from './model';

function simulate(p: VSpringParams, duration: number, dt = DT) {
  const n = Math.round(duration / dt);
  const ts = [0];
  const states: VSpringState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, dt);
    ts.push(i * dt);
    states.push(s);
  }
  return { ts, states };
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const MOVING = CORNERS.filter((p) => p.x0 !== 0 || p.v0 !== 0);

describe('つりあいと公式', () => {
  it('つりあいの伸び d = mg/k。m = 0.5 kg, k = 20 N/m で 0.245 m', () => {
    expect(equilibriumStretch({ ...DEFAULT, m: 0.5, k: 20 })).toBeCloseTo(0.245, 12);
  });

  it('つりあいの位置（x = 0）では弾性力 kd と重力 mg がつりあい、合力は 0', () => {
    for (const p of CORNERS) {
      expect(springForce(p, 0)).toBeCloseTo(p.m * G_ACCEL, 12);
      expect(netForce(p, 0)).toBeCloseTo(0, 12);
    }
  });

  it('合力は変位に比例し逆向き（F = −kx）で、加速度は a = −ω²x', () => {
    for (const x of [-0.2, 0.05, 0.3]) {
      expect(netForce(DEFAULT, x)).toBeCloseTo(-DEFAULT.k * x, 12);
      expect(acceleration(DEFAULT, x)).toBeCloseTo(-(angularFrequency(DEFAULT) ** 2) * x, 12);
    }
  });

  it('周期は水平ばねと同じ T = 2π√(m/k)（重力加速度を含まない）', () => {
    expect(period({ ...DEFAULT, m: 1, k: 4 * Math.PI ** 2 })).toBeCloseTo(1, 12);
  });
});

describe('数値計算と解析解の一致', () => {
  it('パラメータ範囲の全隅で、3 周期後の位置・速度が解析解と一致する', () => {
    for (const p of MOVING) {
      const T = period(p);
      const { ts, states } = simulate(p, 3 * T);
      const last = states.at(-1)!;
      const exact = analyticState(p, ts.at(-1)!);
      const A = amplitude(p);
      // 速度ベルレ法の位相誤差は 1 rad あたり (ωΔt)²/24 で、3 周期（6π rad）でも 3e-4 以下
      expect(Math.abs(last.x - exact.x) / A, JSON.stringify(p)).toBeLessThan(1e-3);
      expect(
        Math.abs(last.v - exact.v) / (A * angularFrequency(p)),
        JSON.stringify(p),
      ).toBeLessThan(1e-3);
    }
  });

  it('シミュレーションから測った周期が T = 2π√(m/k) と一致する（全隅）', () => {
    for (const p of MOVING) {
      const T = period(p);
      const { ts, states } = simulate(p, 5.2 * T);
      const measured = estimatePeriod(
        ts,
        states.map((s) => s.x),
      );
      expect(relativeError(measured, T), JSON.stringify(p)).toBeLessThan(1e-4);
    }
  });

  it('振動の中心はつりあいの位置: 最高点と最下点の変位が ±A', () => {
    for (const p of MOVING) {
      const { states } = simulate(p, period(p));
      const xs = states.map((s) => s.x);
      expect(relativeError(Math.max(...xs), amplitude(p)), JSON.stringify(p)).toBeLessThan(1e-4);
      expect(relativeError(Math.min(...xs), -amplitude(p)), JSON.stringify(p)).toBeLessThan(1e-4);
    }
  });

  it('つりあいの位置で静止させると、そのまま静止し続ける', () => {
    const p = { ...DEFAULT, x0: 0, v0: 0 };
    const { states } = simulate(p, 3);
    expect(states.every((s) => Math.abs(s.x) < 1e-15 && Math.abs(s.v) < 1e-14)).toBe(true);
  });
});

describe('エネルギー保存', () => {
  it('運動エネルギー + 弾性エネルギー + 重力の位置エネルギーが保存され、ドリフトしない（全隅）', () => {
    for (const p of MOVING) {
      const n = Math.round((30 * period(p)) / DT);
      const e0 = energies(p, initialState(p));
      let s = initialState(p);
      let firstMax = 0;
      let lastMax = 0;
      for (let i = 1; i <= n; i++) {
        s = step(p, s, DT);
        // 振動のエネルギー ½kA² を基準にした誤差（重力の位置エネルギーの基準の取り方によらない）
        const err = Math.abs(energies(p, s).total - e0.total) / (0.5 * p.k * amplitude(p) ** 2);
        if (i <= n / 10) firstMax = Math.max(firstMax, err);
        if (i > n - n / 10) lastMax = Math.max(lastMax, err);
      }
      // 速度ベルレ法のエネルギー誤差は (ωΔt)²/4 程度で頭打ちになる
      const bound = (angularFrequency(p) * DT) ** 2 / 2;
      expect(Math.max(firstMax, lastMax), JSON.stringify(p)).toBeLessThan(bound);
      expect(lastMax, JSON.stringify(p)).toBeLessThan(firstMax * 1.05 + 1e-15);
    }
  });

  it('弾性エネルギーと重力の位置エネルギーの和は ½kx² + ½kd²（重力は振動の中心をずらすだけ）', () => {
    for (const p of CORNERS) {
      const d = equilibriumStretch(p);
      for (const x of [-0.3, -0.1, 0, 0.2]) {
        const e = energies(p, { x, v: 0 });
        expect(e.elastic + e.gravity).toBeCloseTo(0.5 * p.k * x * x + 0.5 * p.k * d * d, 12);
        expect(e.restoring).toBeCloseTo(0.5 * p.k * x * x, 12);
      }
    }
  });

  it('つりあいの位置を基準にすると K + ½kx² = ½kA²（水平ばねと同じ形）', () => {
    for (const p of MOVING) {
      const e = energies(p, initialState(p));
      expect(relativeError(e.kinetic + e.restoring, 0.5 * p.k * amplitude(p) ** 2)).toBeLessThan(
        1e-12,
      );
    }
  });
});

describe('定性的な性質', () => {
  it('ばねの伸びは「つりあいの伸び − 変位」で、最下点で最大（d + A）', () => {
    for (const p of MOVING) {
      const { states } = simulate(p, period(p));
      const maxStretch = Math.max(...states.map((s) => stretch(p, s.x)));
      const expected = equilibriumStretch(p) + amplitude(p);
      expect(Math.abs(maxStretch - expected), JSON.stringify(p)).toBeLessThan(1e-4 * amplitude(p));
    }
  });

  it('パラメータ範囲全体で、ばねが縮みきらない（描画用の自然長より縮みが小さい）', () => {
    for (const p of CORNERS) {
      const minStretch = equilibriumStretch(p) - amplitude(p);
      expect(NATURAL_LENGTH + minStretch, JSON.stringify(p)).toBeGreaterThan(0.1);
    }
  });

  it('質量を 4 倍にすると周期は 2 倍、つりあいの伸びは 4 倍', () => {
    const a = { ...DEFAULT, m: 0.2 };
    const b = { ...DEFAULT, m: 0.8 };
    expect(period(b) / period(a)).toBeCloseTo(2, 12);
    expect(equilibriumStretch(b) / equilibriumStretch(a)).toBeCloseTo(4, 12);
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で ωΔt ≤ 0.04', () => {
    for (const p of CORNERS) expect(angularFrequency(p) * DT).toBeLessThanOrEqual(0.04);
  });
});
