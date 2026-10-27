/**
 * RL 回路の過渡現象の物理的な正しさのテスト。
 * 解析解（指数関数）、時定数 τ = L/R、自己誘導起電力の性質（直後は E、十分後は 0）、
 * エネルギー収支（電池の仕事 = コイルのエネルギー + ジュール熱）を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  analyticState,
  coilEnergy,
  coilVoltage,
  henries,
  initialState,
  step,
  timeConstant,
  type RlParams,
  type RlState,
  type SwitchPosition,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

function simulate(p: RlParams, s0: RlState, duration: number, sw: SwitchPosition) {
  const n = Math.round(duration / DT);
  const states = [s0];
  let s = s0;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, DT, sw);
    states.push(s);
  }
  return states;
}

/** 十分時間がたった状態（電流 E/R、熱・仕事は 0 から数える） */
const steady = (p: RlParams): RlState => ({ I: p.E / p.R, heat: 0, work: 0, charge: 0 });

describe('公式', () => {
  it('L = 400 mH, R = 20 Ω のとき τ = L/R = 20 ms', () => {
    expect(timeConstant({ ...DEFAULT, L: 400, R: 20 })).toBeCloseTo(0.02, 12);
  });

  it('スイッチを入れた直後: 電流は 0 で、コイルの電圧（自己誘導起電力）は電池の起電力 E に等しい', () => {
    for (const p of CORNERS) expect(coilVoltage(p, 0, 'a')).toBe(p.E);
  });

  it('十分時間がたつと: 電流は E/R、コイルの電圧は 0（コイルは導線と同じ）', () => {
    for (const p of CORNERS) {
      const s = analyticState(p, initialState(), 40 * timeConstant(p), 'a');
      expect(relativeError(s.I, p.E / p.R)).toBeLessThan(1e-12);
      expect(Math.abs(coilVoltage(p, s.I, 'a'))).toBeLessThan(1e-12 * p.E);
    }
  });
});

describe('数値計算と解析解の一致', () => {
  it('a 側: パラメータ範囲の全隅で、3τ の間 I(t) = (E/R)(1 − e^{−t/τ}) と一致する', () => {
    for (const p of CORNERS) {
      const states = simulate(p, initialState(), 3 * timeConstant(p), 'a');
      let maxErr = 0;
      states.forEach((s, i) => {
        maxErr = Math.max(maxErr, Math.abs(s.I - analyticState(p, initialState(), i * DT, 'a').I));
      });
      // RK4 の大域誤差は (Δt/τ)⁴ 程度で、Δt/τ ≤ 0.02 なら 1.6×10⁻⁷ 以下
      expect(maxErr / (p.E / p.R), JSON.stringify(p)).toBeLessThan(2e-7);
      // 積算量（ジュール熱・電池の仕事・電気量）も解析解と一致する
      const last = states[states.length - 1]!;
      const a = analyticState(p, initialState(), (states.length - 1) * DT, 'a');
      expect(relativeError(last.heat, a.heat), JSON.stringify(p)).toBeLessThan(2e-7);
      expect(relativeError(last.work, a.work), JSON.stringify(p)).toBeLessThan(2e-7);
      expect(relativeError(last.charge, a.charge), JSON.stringify(p)).toBeLessThan(2e-7);
    }
  });

  it('b 側: パラメータ範囲の全隅で、電流が (E/R)e^{−t/τ} で減衰する', () => {
    for (const p of CORNERS) {
      const states = simulate(p, steady(p), 3 * timeConstant(p), 'b');
      let maxErr = 0;
      states.forEach((s, i) => {
        maxErr = Math.max(
          maxErr,
          Math.abs(s.I - (p.E / p.R) * Math.exp(-(i * DT) / timeConstant(p))),
        );
      });
      expect(maxErr / (p.E / p.R), JSON.stringify(p)).toBeLessThan(2e-7);
    }
  });

  it('時定数 τ 後には、電流は最終値の 1 − 1/e ≈ 63% になる', () => {
    const p = DEFAULT;
    const states = simulate(p, initialState(), timeConstant(p), 'a');
    expect(states[states.length - 1]!.I / (p.E / p.R)).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it('スイッチを切り替えても電流は連続（急には変わらない）で、コイルの電圧の向きが逆になる', () => {
    const p = DEFAULT;
    const mid = simulate(p, initialState(), timeConstant(p) / 2, 'a');
    const s = mid[mid.length - 1]!;
    expect(coilVoltage(p, s.I, 'a')).toBeGreaterThan(0);
    // 切り替え直後: 電流を保とうとして、コイルの電圧は −RI（電池のかわりに電流を流し続ける）
    expect(coilVoltage(p, s.I, 'b')).toBeCloseTo(-p.R * s.I, 12);
    const next = step(p, s, DT, 'b');
    expect(Math.abs(next.I - s.I) / s.I).toBeLessThan((DT / timeConstant(p)) * 1.01);
  });

  it('電流がなく b 側なら、何も変化しない', () => {
    for (const s of simulate(DEFAULT, initialState(), 0.01, 'b')) expect(s.I).toBe(0);
  });
});

describe('キルヒホッフの法則とエネルギー収支', () => {
  it('電池の仕事 = コイルのエネルギー ½LI² + ジュール熱（全隅・全時刻）', () => {
    for (const p of CORNERS) {
      let maxErr = 0;
      for (const s of simulate(p, initialState(), 3 * timeConstant(p), 'a')) {
        maxErr = Math.max(maxErr, Math.abs(s.work - coilEnergy(p, s.I) - s.heat));
      }
      const scale = coilEnergy(p, p.E / p.R);
      // 積算量の RK4 誤差も (Δt/τ)⁴ 程度
      expect(maxErr / scale, JSON.stringify(p)).toBeLessThan(2e-7);
    }
  });

  it('b 側に切り替えると、コイルに蓄えられていたエネルギー ½L(E/R)² がすべてジュール熱になる', () => {
    for (const p of CORNERS) {
      // 20τ 後の残りのエネルギーは e⁻⁴⁰ 倍で無視できる
      const states = simulate(p, steady(p), 20 * timeConstant(p), 'b');
      const s = states[states.length - 1]!;
      expect(relativeError(s.heat, coilEnergy(p, p.E / p.R)), JSON.stringify(p)).toBeLessThan(1e-7);
      expect(s.work).toBe(0);
    }
  });

  it('自己誘導起電力 V_L = L dI/dt（電流の数値微分と比較）', () => {
    const p = DEFAULT;
    const states = simulate(p, initialState(), timeConstant(p), 'a');
    for (let i = 1; i < states.length - 1; i += 97) {
      const dIdt = (states[i + 1]!.I - states[i - 1]!.I) / (2 * DT);
      // 中心差分の誤差は (Δt²/6)|d³I/dt³| = (Δt/τ)²/6 × (E/R)/τ 程度（相対 10⁻⁴ 未満）
      expect(relativeError(henries(p) * dIdt, coilVoltage(p, states[i]!.I, 'a'))).toBeLessThan(
        1e-4,
      );
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で Δt ≤ τ/50', () => {
    for (const p of CORNERS) expect(DT).toBeLessThanOrEqual(timeConstant(p) / 50 + 1e-15);
  });
});
