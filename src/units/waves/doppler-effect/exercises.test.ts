/**
 * ドップラー効果の演習問題のテスト。正解が、問題の条件で波面を伝えたシミュレーションで
 * 観測者が測る振動数（波面の到達間隔）・波面の間隔と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  frontCenter,
  initialState,
  measuredFrequency,
  step,
  V,
  type DopplerParams,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 観測者に波面が 3 枚届くまで動かす（すれ違う前。到達時刻は厳密に求まる） */
function firstMeasurement(p: DopplerParams): number {
  let s = initialState(p);
  while (s.received < 3) s = step(p, s, DT);
  expect(s.xs).toBeLessThan(s.xo);
  return measuredFrequency(s);
}

describe('正解がシミュレーションと一致する', () => {
  for (const id of ['moving-source', 'moving-observer', 'wind']) {
    it(`${id}: 観測者が波面の到達間隔から測った振動数`, () => {
      for (const ex of sampleExercises(template(id), 20)) {
        const f = firstMeasurement(ex.sim.params as DopplerParams);
        expect(relativeError(value(ex), f)).toBeLessThan(1e-9);
      }
    });
  }

  it('波長: 音源の前方にある隣り合う波面の間隔', () => {
    for (const ex of sampleExercises(template('wavelength'), 20)) {
      const p = ex.sim.params as DopplerParams;
      let s = initialState(p);
      while (s.emitted < 3) s = step(p, s, DT);
      const [a, b] = s.fronts as [{ te: number; xe: number }, { te: number; xe: number }];
      // 前方の端の位置 = 中心 + 半径
      const edge = (f: { te: number; xe: number }) => frontCenter(p, f, s.t) + V * (s.t - f.te);
      expect(relativeError(value(ex), edge(a) - edge(b))).toBeLessThan(1e-9);
    }
  });
});
