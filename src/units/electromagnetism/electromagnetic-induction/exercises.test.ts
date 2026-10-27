/**
 * 電磁誘導の演習問題のテスト。正解が、問題の条件で棒の運動方程式を数値積分した結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  X0,
  flux,
  initialState,
  step,
  timeConstant,
  type InductionParams,
  type InductionState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function run(p: InductionParams, duration: number): InductionState {
  let s = initialState(p);
  const n = Math.round(duration / DT);
  for (let i = 0; i < n; i++) s = step(p, s, DT);
  return s;
}

describe('正解がシミュレーションと一致する', () => {
  it('誘導電流: 動き始めの微小時間 h の磁束の変化 ΔΦ/h を R で割った値', () => {
    for (const ex of sampleExercises(template('induced-current'))) {
      const p = ex.sim.params as InductionParams;
      const h = timeConstant(p) * 1e-7;
      const s = step(p, initialState(p), h);
      const emf = (flux(p, s.x) - flux(p, X0)) / h; // ファラデーの法則（棒の減速による差は h/τ 程度）
      expect(relativeError(value(ex), emf / p.R)).toBeLessThan(1e-6);
    }
  });

  it('電磁力: 動き始めの微小時間の運動量の変化 mΔv/h', () => {
    for (const ex of sampleExercises(template('braking-force'))) {
      const p = ex.sim.params as InductionParams;
      const h = timeConstant(p) * 1e-7;
      const s = step(p, initialState(p), h);
      expect(relativeError(value(ex), (-p.m * (s.v - p.v0)) / h)).toBeLessThan(1e-6);
    }
  });

  it('終端速度: 20τ 後の速さ（残りは e^{−20} ≈ 2e-9 倍）', () => {
    for (const ex of sampleExercises(template('terminal-velocity'), 20)) {
      const p = ex.sim.params as InductionParams;
      const s = run(p, 20 * timeConstant(p));
      expect(relativeError(value(ex), s.v)).toBeLessThan(1e-6);
    }
  });

  it('ジュール熱: 20τ 後までに発生した熱の累計', () => {
    for (const ex of sampleExercises(template('total-heat'), 20)) {
      const p = ex.sim.params as InductionParams;
      const s = run(p, 20 * timeConstant(p));
      // 残りの運動エネルギーは e^{−40} 倍。RK4（Δt ≤ τ/25）の誤差は 1e-7 程度
      expect(relativeError(value(ex), s.heat)).toBeLessThan(1e-6);
    }
  });
});
