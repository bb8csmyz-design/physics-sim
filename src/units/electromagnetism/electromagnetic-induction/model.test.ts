/**
 * 磁場中のレール上を動く導体棒（電磁誘導）の物理的な正しさのテスト。
 * 誘導起電力 V = vBl、ファラデーの法則、レンツの法則、解析解（指数関数的に終端速度へ近づく）、
 * エネルギー収支（外力の仕事 = 運動エネルギーの増加 + ジュール熱）を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  X0,
  analyticState,
  chargePassed,
  current,
  emf,
  flux,
  initialState,
  kineticEnergy,
  magneticForce,
  step,
  terminalVelocity,
  timeConstant,
  type InductionParams,
  type InductionState,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const DURATION = 3;

function simulate(p: InductionParams, duration: number) {
  const n = Math.round(duration / DT);
  const states: InductionState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, DT);
    states.push(s);
  }
  return states;
}

/** 全隅の 3 秒間の運動（複数のテストで共有する） */
const RUNS = new Map<InductionParams, InductionState[]>();
function run(p: InductionParams) {
  let r = RUNS.get(p);
  if (!r) RUNS.set(p, (r = simulate(p, DURATION)));
  return r;
}

describe('誘導起電力と公式', () => {
  it('B = 0.5 T, l = 0.5 m, v = 2 m/s のとき V = vBl = 0.5 V、R = 1 Ω なら I = 0.5 A', () => {
    const p = { ...DEFAULT, B: 0.5, l: 0.5, R: 1 };
    expect(emf(p, 2)).toBeCloseTo(0.5, 12);
    expect(current(p, 2)).toBeCloseTo(0.5, 12);
    // 棒が受ける力 IBl = 0.125 N（運動と逆向き）
    expect(magneticForce(p, 2)).toBeCloseTo(-0.125, 12);
  });

  it('終端速度 v_f = FR/(Bl)²: このとき外力と電磁力がつりあう', () => {
    for (const p of CORNERS) {
      const vf = terminalVelocity(p);
      expect(p.F + magneticForce(p, vf)).toBeCloseTo(0, 12);
    }
  });

  it('ファラデーの法則: 起電力 = 磁束の時間変化率 dΦ/dt（数値微分と比較）', () => {
    for (const p of CORNERS) {
      const states = run(p);
      for (let i = 100; i < states.length - 1; i += 700) {
        const dPhi = (flux(p, states[i + 1]!.x) - flux(p, states[i - 1]!.x)) / (2 * DT);
        // 中心差分の打ち切り誤差は (Δt²/6)|d³Φ/dt³| = Bl(Δt²/6)|v − v_f|/τ²（解析解から）
        const v = states[i]!.v;
        const tau = timeConstant(p);
        const bound = (p.B * p.l * DT * DT * Math.abs(v - terminalVelocity(p))) / (6 * tau * tau);
        expect(Math.abs(dPhi - emf(p, v)), JSON.stringify(p)).toBeLessThan(1.01 * bound + 1e-12);
      }
    }
  });

  it('レンツの法則: 棒が受ける力は常に速度と逆向き（運動を妨げる）', () => {
    for (const p of CORNERS) {
      const maxPower = Math.max(...run(p).map((s) => magneticForce(p, s.v) * s.v));
      expect(maxPower, JSON.stringify(p)).toBeLessThanOrEqual(0);
    }
  });

  it('右に動くと（磁束が増えると）電流は時計回り（棒の中を上から下へ）', () => {
    expect(current(DEFAULT, 1)).toBeGreaterThan(0);
    expect(current(DEFAULT, -1)).toBeLessThan(0);
  });
});

describe('数値計算と解析解の一致', () => {
  it('パラメータ範囲の全隅で、速度・位置・ジュール熱が解析解と一致する', () => {
    for (const p of CORNERS) {
      const states = run(p);
      const a = analyticState(p, DURATION);
      const s = states[states.length - 1]!;
      const vScale = Math.max(Math.abs(a.v), p.v0, 1e-3);
      // RK4 の大域誤差は (Δt/τ)⁴ 程度で、Δt/τ ≤ 0.04 なら 10⁻⁶ 以下
      expect(Math.abs(s.v - a.v) / vScale, JSON.stringify(p)).toBeLessThan(1e-6);
      expect(
        Math.abs(s.x - a.x) / Math.max(Math.abs(a.x - X0), 1e-3),
        JSON.stringify(p),
      ).toBeLessThan(1e-6);
      expect(Math.abs(s.heat - a.heat), JSON.stringify(p)).toBeLessThan(
        1e-6 * (a.heat + a.work + 1e-6),
      );
    }
  });

  it('時定数 τ 後には、終端速度との差が 1/e（約 37%）になる', () => {
    const p = { ...DEFAULT, v0: 0 };
    const tau = timeConstant(p);
    const states = simulate(p, tau);
    const v = states[states.length - 1]!.v;
    const vf = terminalVelocity(p);
    expect(relativeError((vf - v) / vf, Math.exp(-1))).toBeLessThan(1e-3);
  });

  it('十分時間がたつと終端速度 v_f に達する（τ ≤ 0.5 s の隅）', () => {
    for (const p of CORNERS.filter((c) => timeConstant(c) <= 0.5)) {
      const states = run(p);
      const v = states[states.length - 1]!.v;
      // 3 s ≥ 6τ なので、残りの差は e⁻⁶ ≈ 0.25% 以下
      const vf = terminalVelocity(p);
      expect(Math.abs(v - vf), JSON.stringify(p)).toBeLessThanOrEqual(
        Math.exp(-6) * Math.abs(p.v0 - vf) + 1e-9,
      );
    }
  });

  it('外力も初速度もなければ、棒は静止したまま', () => {
    const p = { ...DEFAULT, F: 0, v0: 0 };
    for (const s of simulate(p, 1)) {
      expect(s.x).toBe(X0);
      expect(s.v).toBe(0);
    }
  });

  it('外力が 0 なら、速度は v₀e^{−t/τ} で減衰する', () => {
    const p = { ...DEFAULT, F: 0, v0: 2 };
    const tau = timeConstant(p);
    const states = simulate(p, 1);
    states.forEach((s, i) => {
      expect(relativeError(s.v, 2 * Math.exp(-(i * DT) / tau))).toBeLessThan(1e-9);
    });
  });
});

describe('エネルギー収支', () => {
  it('外力の仕事 = 運動エネルギーの増加 + ジュール熱（全隅・全時刻）', () => {
    for (const p of CORNERS) {
      const states = run(p);
      const K0 = kineticEnergy(p, states[0]!);
      let maxErr = 0;
      for (const s of states) {
        const balance = s.work - (kineticEnergy(p, s) - K0) - s.heat;
        maxErr = Math.max(maxErr, Math.abs(balance) / (s.work + s.heat + K0 + 1e-6));
      }
      // RK4 の大域誤差は (Δt/τ)⁴ 程度で、Δt/τ ≤ 0.04 なら 2.6×10⁻⁶ 以下
      expect(maxErr, JSON.stringify(p)).toBeLessThan(3e-6);
      // 外力の仕事は F × 移動距離
      const last = states[states.length - 1]!;
      expect(last.work).toBeCloseTo(p.F * (last.x - X0), 9);
    }
  });

  it('終端速度では、外力の仕事率 Fv がそのまま抵抗の消費電力 I²R になる', () => {
    for (const p of CORNERS) {
      const vf = terminalVelocity(p);
      expect(relativeError(current(p, vf) ** 2 * p.R, p.F * vf)).toBeLessThan(1e-12);
    }
  });

  it('外力が 0 なら、止まるまでに発生するジュール熱は最初の運動エネルギー ½mv₀² に等しい', () => {
    const p = { ...DEFAULT, F: 0, v0: 2 };
    const states = simulate(p, 20 * timeConstant(p));
    const last = states[states.length - 1]!;
    expect(relativeError(last.heat, 0.5 * p.m * 4)).toBeLessThan(1e-6);
  });

  it('回路を流れた電気量 q = ΔΦ/R は ∫I dt に等しい', () => {
    const p = DEFAULT;
    const states = simulate(p, 2);
    let q = 0;
    for (let i = 1; i < states.length; i++) {
      q += ((current(p, states[i - 1]!.v) + current(p, states[i]!.v)) / 2) * DT;
    }
    expect(relativeError(chargePassed(p, states[states.length - 1]!), q)).toBeLessThan(1e-6);
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で Δt ≤ τ/25', () => {
    for (const p of CORNERS) expect(DT).toBeLessThanOrEqual(timeConstant(p) / 25);
  });
});
