/**
 * ヤングの実験・回折格子の演習問題のテスト。正解を、各スリットからの光をスクリーン上で
 * 重ね合わせた強さ（superposedIntensity。遠方の近似をしない数値計算）と比べる。
 */
import { describe, expect, it } from 'vitest';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  GRATING_PARAMS,
  PRESET_CHOICES,
  YOUNG_PARAMS,
  gratingConfig,
  superposedIntensity,
  youngConfig,
  type GratingParams,
  type YoungParams,
} from './model';

checkExercises(
  EXERCISES,
  (ex) => (ex.sim.choices!.mode === 'grating' ? GRATING_PARAMS : YOUNG_PARAMS),
  PRESET_CHOICES,
);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

describe('正解が光の重ね合わせと一致する', () => {
  for (const id of ['young-spacing', 'young-medium']) {
    it(`${id}: 正解の間隔の位置は明線（強さ 1）、その半分の位置は暗線（強さ 0）`, () => {
      for (const ex of sampleExercises(template(id), 20)) {
        const c = youngConfig(ex.sim.params as YoungParams);
        const dx = value(ex) * 1e-3;
        // 近似式 Δx = Lλ/(nd) のずれは (Δx/L)² 程度（1e-6 以下）なので、強さは 1 からほとんどずれない
        expect(superposedIntensity(c, dx)).toBeGreaterThan(0.999);
        expect(superposedIntensity(c, 2 * dx)).toBeGreaterThan(0.999);
        expect(superposedIntensity(c, dx / 2)).toBeLessThan(1e-3);
      }
    });
  }

  it('回折格子の 1 次の方向（tan θ₁ = x/L）で強さが最大（1）', () => {
    for (const ex of sampleExercises(template('grating-angle'), 20)) {
      const c = gratingConfig(ex.sim.params as GratingParams);
      const th = Math.asin(value(ex));
      const x = c.L * Math.tan(th);
      expect(superposedIntensity(c, x)).toBeGreaterThan(0.999);
      // 少しずれると N = 10 本の格子では強さが大きく下がる（明線が鋭い）
      expect(superposedIntensity(c, c.L * Math.tan(th * 1.05))).toBeLessThan(0.9);
    }
  });

  it('最大の次数: m 次は sin θ < 1 で現れ、m + 1 次は現れない', () => {
    for (const ex of sampleExercises(template('grating-max-order'), 20)) {
      const c = gratingConfig(ex.sim.params as GratingParams);
      const m = value(ex);
      expect(Number.isInteger(m)).toBe(true);
      expect((m * c.lambda) / c.d).toBeLessThan(1);
      expect(((m + 1) * c.lambda) / c.d).toBeGreaterThan(1);
      // m 次の方向は明線になっている
      const th = Math.asin((m * c.lambda) / c.d);
      expect(superposedIntensity(c, c.L * Math.tan(th))).toBeGreaterThan(0.99);
    }
  });
});
