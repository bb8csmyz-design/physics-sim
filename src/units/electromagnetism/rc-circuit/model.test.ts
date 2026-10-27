/**
 * RC 回路の過渡現象の物理的な正しさのテスト。
 * 解析解（指数関数）、時定数 τ = RC の意味、キルヒホッフの法則、エネルギー収支
 * （電池の仕事 = 静電エネルギー + ジュール熱。充電では半分が熱になる）を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  analyticState,
  capacitorEnergy,
  capacitorVoltage,
  current,
  farads,
  initialState,
  ohms,
  step,
  timeConstant,
  type RcParams,
  type RcState,
  type SwitchPosition,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

function simulate(p: RcParams, s0: RcState, duration: number, sw: SwitchPosition) {
  const n = Math.round(duration / DT);
  const states = [s0];
  let s = s0;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, DT, sw);
    states.push(s);
  }
  return states;
}

/** 満充電の状態（電気量 CE、熱・仕事は 0 から数える） */
const full = (p: RcParams): RcState => ({ q: farads(p) * p.E, heat: 0, work: 0 });

describe('公式', () => {
  it('R = 5 kΩ, C = 200 μF のとき τ = RC = 1.0 s', () => {
    expect(timeConstant({ ...DEFAULT, R: 5, C: 200 })).toBeCloseTo(1, 12);
  });

  it('スイッチを入れた直後: コンデンサーの電圧は 0（導線と同じ）で、電流は E/R', () => {
    for (const p of CORNERS) {
      expect(capacitorVoltage(p, 0)).toBe(0);
      expect(current(p, 0, 'a')).toBeCloseTo(p.E / ohms(p), 15);
    }
  });

  it('十分時間がたつと: 電流は 0（コンデンサーは断線と同じ）で、電気量は CE', () => {
    for (const p of CORNERS) {
      const s = analyticState(p, initialState(), 30 * timeConstant(p), 'a');
      expect(relativeError(s.q, farads(p) * p.E)).toBeLessThan(1e-12);
      expect(Math.abs(current(p, s.q, 'a'))).toBeLessThan(1e-12 * (p.E / ohms(p)));
    }
  });
});

describe('数値計算と解析解の一致', () => {
  it('充電: パラメータ範囲の全隅で、3τ の間 q(t) = CE(1 − e^{−t/τ}) と一致する', () => {
    for (const p of CORNERS) {
      const states = simulate(p, initialState(), 3 * timeConstant(p), 'a');
      let maxErr = 0;
      states.forEach((s, i) => {
        maxErr = Math.max(maxErr, Math.abs(s.q - analyticState(p, initialState(), i * DT, 'a').q));
      });
      // RK4 の大域誤差は (Δt/τ)⁴ 程度で、Δt/τ ≤ 0.01 なら 10⁻⁸ 以下
      expect(maxErr / (farads(p) * p.E), JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('放電: パラメータ範囲の全隅で、3τ の間 q(t) = CE e^{−t/τ} と一致する', () => {
    for (const p of CORNERS) {
      const states = simulate(p, full(p), 3 * timeConstant(p), 'b');
      let maxErr = 0;
      states.forEach((s, i) => {
        maxErr = Math.max(
          maxErr,
          Math.abs(s.q - farads(p) * p.E * Math.exp(-(i * DT) / timeConstant(p))),
        );
      });
      expect(maxErr / (farads(p) * p.E), JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('時定数 τ 後には、充電は 1 − 1/e ≈ 63%、放電は 1/e ≈ 37% になる', () => {
    const p = DEFAULT;
    const tau = timeConstant(p);
    const charge = simulate(p, initialState(), tau, 'a');
    const discharge = simulate(p, full(p), tau, 'b');
    const Q = farads(p) * p.E;
    expect(charge[charge.length - 1]!.q / Q).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(discharge[discharge.length - 1]!.q / Q).toBeCloseTo(Math.exp(-1), 6);
  });

  it('途中でスイッチを切り替えても電気量（コンデンサーの電圧）は連続で、電流は向きが逆になる', () => {
    const p = DEFAULT;
    const mid = simulate(p, initialState(), 0.5, 'a');
    const s = mid[mid.length - 1]!;
    const before = current(p, s.q, 'a');
    const after = current(p, s.q, 'b');
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(0);
    // 切り替え直後の電流は −V_C/R
    expect(after).toBeCloseTo(-capacitorVoltage(p, s.q) / ohms(p), 15);
    const next = step(p, s, DT, 'b');
    expect(Math.abs(next.q - s.q)).toBeLessThan(Math.abs(after) * DT * 1.001);
  });

  it('電荷がなく放電側なら、何も変化しない', () => {
    for (const s of simulate(DEFAULT, initialState(), 1, 'b')) expect(s.q).toBe(0);
  });
});

describe('キルヒホッフの法則とエネルギー収支', () => {
  it('どの時刻でも E = RI + q/C（電圧の和は起電力に等しい）', () => {
    for (const p of CORNERS) {
      for (const s of simulate(p, initialState(), timeConstant(p), 'a').filter(
        (_, i) => i % 50 === 0,
      )) {
        const I = current(p, s.q, 'a');
        expect(ohms(p) * I + capacitorVoltage(p, s.q)).toBeCloseTo(p.E, 10);
      }
    }
  });

  it('電池の仕事 = 静電エネルギー + ジュール熱（全隅・全時刻）', () => {
    for (const p of CORNERS) {
      const states = simulate(p, initialState(), 3 * timeConstant(p), 'a');
      let maxErr = 0;
      for (const s of states) {
        maxErr = Math.max(maxErr, Math.abs(s.work - capacitorEnergy(p, s.q) - s.heat));
      }
      const U = 0.5 * farads(p) * p.E ** 2;
      expect(maxErr / U, JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('充電しきると、電池の仕事 CE² の半分が静電エネルギー、残り半分がジュール熱になる（R によらない）', () => {
    for (const p of CORNERS) {
      // 20τ 後の残りは e⁻²⁰ ≈ 2×10⁻⁹ なので、充電しきったとみなせる
      const states = simulate(p, initialState(), 20 * timeConstant(p), 'a');
      const s = states[states.length - 1]!;
      const CE2 = farads(p) * p.E ** 2;
      expect(relativeError(s.work, CE2), JSON.stringify(p)).toBeLessThan(1e-7);
      expect(relativeError(capacitorEnergy(p, s.q), CE2 / 2), JSON.stringify(p)).toBeLessThan(1e-7);
      expect(relativeError(s.heat, CE2 / 2), JSON.stringify(p)).toBeLessThan(1e-7);
    }
  });

  it('放電しきると、最初の静電エネルギー ½CE² がすべてジュール熱になる', () => {
    for (const p of CORNERS) {
      const states = simulate(p, full(p), 20 * timeConstant(p), 'b');
      const s = states[states.length - 1]!;
      expect(relativeError(s.heat, 0.5 * farads(p) * p.E ** 2)).toBeLessThan(1e-7);
      expect(s.work).toBe(0);
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で Δt ≤ τ/100', () => {
    for (const p of CORNERS) expect(DT).toBeLessThanOrEqual(timeConstant(p) / 100 + 1e-15);
  });
});
