/**
 * 光電効果の演習問題のテスト。正解を、光電子を放出・運動させるシミュレーション（sampleEmission・
 * propagate・step）の結果と比べる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { ELECTRON_MASS, ELECTRON_VOLT } from '@/core/physics/constants';
import { Rng, seedRng } from '@/core/random';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { DT, PARAMS, initialState, sampleEmission, step, type PhotoParams } from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 陽極の電位 V で 200 ns 動かしたとき、陽極に達した電子の数 */
function collectedAt(p: PhotoParams, V: number): number {
  let s = initialState(7);
  for (let i = 0; i < 2000; i++) s = step({ ...p, V }, s, DT);
  return s.collected;
}

describe('正解がシミュレーションと一致する', () => {
  it('運動エネルギーの最大値: 放出した 20000 個の光電子の運動エネルギーの最大値', () => {
    for (const ex of sampleExercises(template('max-kinetic-energy'), 20)) {
      const p = ex.sim.params as PhotoParams;
      const rng = new Rng(seedRng(3));
      let kmax = 0;
      for (let i = 0; i < 20_000; i++) {
        const e = sampleEmission(p, rng);
        kmax = Math.max(
          kmax,
          (0.5 * ELECTRON_MASS * (e.vx ** 2 + e.vy ** 2 + e.vz ** 2)) / ELECTRON_VOLT,
        );
      }
      // 一様分布の 20000 個の標本の最大値は、上限より平均 1/20000 だけ小さい
      expect(kmax).toBeLessThanOrEqual(value(ex) * (1 + 1e-12));
      expect(relativeError(kmax, value(ex))).toBeLessThan(1e-3);
    }
  });

  it('阻止電圧: それより浅い電圧では陽極に届く電子があり、少し深い電圧では 1 個も届かない', () => {
    for (const ex of sampleExercises(template('stopping-voltage'), 10)) {
      const p = ex.sim.params as PhotoParams;
      const V0 = value(ex);
      // V = −V₀/2 で届く割合は 1 − x + x ln x ≈ 15%（x = 1/2）。200 ns で数十個が届く
      expect(collectedAt(p, -0.5 * V0)).toBeGreaterThan(0);
      expect(collectedAt(p, -1.01 * V0)).toBe(0);
    }
  });

  it('限界波長: 少し短い波長では光電子が出て、少し長い波長では出ない', () => {
    for (const ex of sampleExercises(template('threshold-wavelength'), 10)) {
      const p = ex.sim.params as PhotoParams;
      const l0 = value(ex);
      const emitted = (lambda: number) => {
        let s = initialState(5);
        for (let i = 0; i < 200; i++) s = step({ ...p, lambda }, s, DT);
        return s.emitted;
      };
      expect(emitted(l0 * 0.99)).toBeGreaterThan(0);
      expect(emitted(l0 * 1.01)).toBe(0);
    }
  });

  it('光電子が出るかの判定', () => {
    for (const ex of sampleExercises(template('emission-judge'))) {
      const p = ex.sim.params as PhotoParams;
      let s = initialState(5);
      for (let i = 0; i < 200; i++) s = step(p, s, DT);
      expect(s.emitted > 0 ? 1 : 0).toBe(ex.given!.emits);
    }
  });
});
