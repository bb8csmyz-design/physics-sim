/**
 * 屈折の演習問題のテスト。正解を、フェルマーの原理（光学距離が最小の道すじ）・反射率（フレネルの式）・
 * 波の場の周期から独立に確かめる。
 */
import { describe, expect, it } from 'vitest';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { PARAMS, electricField, fermatCrossing, reflectance, type RefractionParams } from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;
const DEG = Math.PI / 180;

describe('正解が独立な方法と一致する', () => {
  it('屈折角: A から原点へ入射角 θ₁ で入った光が、正解の屈折角で B へ進む道すじは光学距離が最小', () => {
    for (const ex of sampleExercises(template('refraction-sine'))) {
      const p = ex.sim.params as RefractionParams;
      const th2 = Math.asin(value(ex));
      const a = { x: -Math.tan(p.theta1 * DEG), y: 1 };
      const b = { x: Math.tan(th2), y: -1 };
      // 最小値の近くで光学距離は 2 次関数なので、探索で求まる位置の精度は √(丸め誤差) ≈ 1e-8 程度
      expect(Math.abs(fermatCrossing(p, a, b))).toBeLessThan(1e-6);
    }
  });

  it('臨界角: それより 0.5° 小さい入射角では一部が透過し、0.5° 大きいと反射率 100%', () => {
    for (const ex of sampleExercises(template('critical-angle'))) {
      const p = ex.sim.params as RefractionParams;
      const thc = Math.asin(value(ex)) / DEG;
      expect(reflectance({ ...p, theta1: thc - 0.5 })).toBeLessThan(0.99);
      expect(reflectance({ ...p, theta1: thc + 0.5 })).toBeCloseTo(1, 12);
    }
  });

  it('媒質中の波長: 垂直入射のとき、媒質 2 の電場は y 方向に正解の波長で繰り返す', () => {
    for (const ex of sampleExercises(template('wavelength'), 20)) {
      const p = ex.sim.params as RefractionParams;
      const l = value(ex) * 1e-9;
      for (const tau of [0, 0.13, 0.4]) {
        const e0 = electricField(p, 0, -1e-9, tau);
        expect(electricField(p, 0, -1e-9 - l, tau)).toBeCloseTo(e0, 9);
        // 半波長ずれると符号が反転する
        expect(electricField(p, 0, -1e-9 - l / 2, tau)).toBeCloseTo(-e0, 9);
      }
    }
  });

  it('全反射の判定: 反射率が 100% かどうか', () => {
    for (const ex of sampleExercises(template('total-reflection-judge'))) {
      const R = reflectance(ex.sim.params as RefractionParams);
      expect(R > 1 - 1e-12 ? 1 : 0).toBe(ex.given!.total);
    }
  });
});
