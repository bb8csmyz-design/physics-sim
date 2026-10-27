/**
 * はしごのつりあいの演習問題のテスト。正解が、つりあいの式（力とモーメント）を満たし、
 * 問題の条件で動かしたシミュレーションで静止する・滑り出すことが一致するかを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  forces,
  initialState,
  step,
  torquesAboutBottom,
  type LadderParams,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 0.5 秒動かして、はしごが動いたか */
function slides(p: LadderParams): boolean {
  let s = initialState(p);
  for (let i = 0; i < 500; i++) s = step(p, s, DT);
  return Math.abs(s.theta - (p.theta * Math.PI) / 180) > 1e-9;
}

describe('正解がつりあいの式とシミュレーションに一致する', () => {
  it('壁からの垂直抗力: 下端のまわりのモーメントの和が 0、はしごは静止したまま', () => {
    for (const ex of sampleExercises(template('wall-force'))) {
      const p = ex.sim.params as LadderParams;
      const s = initialState(p);
      expect(relativeError(value(ex), forces(p, s).N2)).toBeLessThan(1e-12);
      const tq = torquesAboutBottom(p);
      expect(Math.abs(tq.ladder + tq.person + tq.wall)).toBeLessThan(1e-9);
      expect(slides(p)).toBe(false);
    }
  });

  it('最小の静止摩擦係数: 少し上なら静止し、少し下なら滑り出す', () => {
    for (const ex of sampleExercises(template('min-friction'))) {
      const p = ex.sim.params as LadderParams;
      const muMin = value(ex);
      const f = forces(p, initialState(p)).f;
      expect(relativeError(muMin, f / ((p.m + p.M) * G_ACCEL))).toBeLessThan(1e-12);
      expect(slides({ ...p, mu: muMin * 1.001 })).toBe(false);
      expect(slides({ ...p, mu: muMin * 0.999 })).toBe(true);
      expect(slides(p)).toBe(false);
    }
  });

  it('人が上れる限界: その手前では静止し、少し先では滑り出す', () => {
    for (const ex of sampleExercises(template('max-climb'))) {
      const p = ex.sim.params as LadderParams;
      const dMax = value(ex);
      expect(slides({ ...p, d: dMax - 1e-3 })).toBe(false);
      expect(slides({ ...p, d: dMax + 1e-3 })).toBe(true);
      expect(slides(p)).toBe(false);
    }
  });

  it('滑るかどうかの判定', () => {
    for (const ex of sampleExercises(template('slip-judge'))) {
      expect(slides(ex.sim.params as LadderParams) ? 0 : 1).toBe(ex.given!.stays);
    }
  });
});
