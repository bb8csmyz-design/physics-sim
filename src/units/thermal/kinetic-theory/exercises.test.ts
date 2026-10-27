/**
 * 気体分子運動論の演習問題のテスト。正解が、問題の条件で分子を動かしたシミュレーションと一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  PARAMS,
  crossingTime,
  initialState,
  meanSquareSpeed,
  measuredPressure,
  moleculeMass,
  step,
  type KineticParams,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

describe('正解がシミュレーションと一致する', () => {
  it('二乗平均速度: シミュレーションの分子の √⟨v²⟩（温度に合わせて速度をそろえてある）', () => {
    for (const ex of sampleExercises(template('rms-speed'))) {
      const p = ex.sim.params as KineticParams;
      expect(relativeError(value(ex), Math.sqrt(meanSquareSpeed(initialState(p))))).toBeLessThan(
        1e-12,
      );
    }
  });

  it('平均運動エネルギー: 分子の ½m⟨v²⟩。動かしても（弾性衝突なので）変わらない', () => {
    for (const ex of sampleExercises(template('mean-kinetic-energy'), 10)) {
      const p = ex.sim.params as KineticParams;
      const s = step(p, initialState(p), 10 * crossingTime(p));
      const ke = 0.5 * moleculeMass(p) * meanSquareSpeed(s);
      expect(relativeError(value(ex), ke)).toBeLessThan(1e-10);
    }
  });

  it('圧力: 100 回横切る時間の力積から測った圧力（端数の誤差は 3% 以下）', () => {
    for (const ex of sampleExercises(template('pressure'), 10)) {
      const p = ex.sim.params as KineticParams;
      const s = step(p, initialState(p), 100 * crossingTime(p));
      expect(relativeError(measuredPressure(p, s), value(ex))).toBeLessThan(0.03);
    }
  });

  it('温度と二乗平均速度: 2 つの温度での √⟨v²⟩ の比', () => {
    for (const ex of sampleExercises(template('rms-scaling'))) {
      const after = ex.sim.params as KineticParams;
      const before = { ...after, T: ex.given!.T1! };
      const ratio = Math.sqrt(
        meanSquareSpeed(initialState(after)) / meanSquareSpeed(initialState(before)),
      );
      expect(relativeError(ratio, ex.given!.ratio!)).toBeLessThan(1e-12);
    }
  });
});
