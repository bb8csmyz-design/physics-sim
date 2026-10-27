/**
 * RL 回路の演習問題のテスト。正解が、問題の条件で回路の微分方程式を数値積分した結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  coilEnergy,
  initialState,
  step,
  timeConstant,
  type RlParams,
  type RlState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function run(p: RlParams, duration: number): RlState {
  let s = initialState();
  const n = Math.round(duration / DT);
  for (let i = 0; i < n; i++) s = step(p, s, DT, 'a');
  return s;
}

// RK4（Δt ≤ τ/50）の誤差は (Δt/τ)⁴ ≈ 1e-7 程度。20τ 後の残りは e^{−20} ≈ 2e-9
describe('正解がシミュレーションと一致する', () => {
  it('十分に時間がたったとき（20τ）の電流', () => {
    for (const ex of sampleExercises(template('steady-current'), 20)) {
      const p = ex.sim.params as RlParams;
      const s = run(p, 20 * timeConstant(p));
      expect(relativeError(value(ex), s.I * 1e3)).toBeLessThan(1e-6);
    }
  });

  it('閉じた直後の電流の増え方: 最初の 1 ステップの ΔI/Δt', () => {
    for (const ex of sampleExercises(template('initial-rate'), 20)) {
      const p = ex.sim.params as RlParams;
      const h = timeConstant(p) * 1e-6;
      const s = step(p, initialState(), h, 'a');
      // ΔI/Δt = (E/L)(1 − h/(2τ) + …) なので、h = τ×10⁻⁶ なら相対誤差は 5e-7
      expect(relativeError(value(ex), s.I / h)).toBeLessThan(1e-6);
    }
  });

  it('時定数: t = τ で電流が (E/R)(1 − 1/e)', () => {
    for (const ex of sampleExercises(template('time-constant'), 20)) {
      const p = ex.sim.params as RlParams;
      const tau = value(ex) / 1e3;
      const n = Math.floor(tau / DT);
      const s = step(p, run(p, n * DT), tau - n * DT, 'a');
      expect(relativeError(s.I, (p.E / p.R) * (1 - Math.exp(-1)))).toBeLessThan(1e-6);
    }
  });

  it('コイルのエネルギー: 20τ 後の ½LI²。電池の仕事 = ジュール熱 + ½LI²', () => {
    for (const ex of sampleExercises(template('coil-energy'), 20)) {
      const p = ex.sim.params as RlParams;
      const s = run(p, 20 * timeConstant(p));
      const U = coilEnergy(p, s.I);
      expect(relativeError(value(ex), U * 1e3)).toBeLessThan(1e-6);
      expect(relativeError(s.work, s.heat + U)).toBeLessThan(1e-6);
    }
  });
});
