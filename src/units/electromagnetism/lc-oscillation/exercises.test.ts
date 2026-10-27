/**
 * LC 回路の演習問題のテスト。正解が、問題の条件で回路の方程式を数値積分した結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  energies,
  initialState,
  period,
  step,
  type LcParams,
  type LcState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function simulate(p: LcParams, duration: number): LcState[] {
  const states = [initialState(p)];
  let s = states[0]!;
  for (let i = 0; i < Math.round(duration / DT); i++) {
    s = step(p, s, DT);
    states.push(s);
  }
  return states;
}

// 速度ベルレ法（ωΔt ≤ 0.04）の位相・振幅の誤差は 1e-4 程度
const TOL = 1e-3;

describe('正解がシミュレーションと一致する', () => {
  it('周期・周波数: 電気量の振動から測った周期', () => {
    for (const ex of sampleExercises(template('period'), 20)) {
      const p = ex.sim.params as LcParams;
      const states = simulate(p, 3.3 * period(p));
      const T = estimatePeriod(
        states.map((_, i) => i * DT),
        states.map((s) => s.q),
      );
      const expected = ex.given!.askFreq ? 1 / T : T * 1e3;
      expect(relativeError(value(ex), expected)).toBeLessThan(TOL);
    }
  });

  it('電流の最大値: 1 周期の間の |i| の最大', () => {
    for (const ex of sampleExercises(template('max-current'), 20)) {
      const p = ex.sim.params as LcParams;
      const imax = Math.max(...simulate(p, period(p)).map((s) => Math.abs(s.i)));
      expect(relativeError(value(ex), imax * 1e3)).toBeLessThan(TOL);
    }
  });

  it('エネルギーの配分: 電気量が指定の割合になる瞬間のコイルのエネルギー', () => {
    for (const ex of sampleExercises(template('energy-split'), 20)) {
      const p = ex.sim.params as LcParams;
      const states = simulate(p, period(p) / 4);
      const q0 = states[0]!.q;
      const target = ex.given!.frac! * q0;
      const i = states.findIndex((s) => s.q <= target);
      const a = states[i - 1]!;
      const b = states[i]!;
      const r = (a.q - target) / (a.q - b.q);
      const UB = energies(p, a).magnetic + r * (energies(p, b).magnetic - energies(p, a).magnetic);
      expect(relativeError(value(ex), UB * 1e3)).toBeLessThan(TOL);
    }
  });
});
