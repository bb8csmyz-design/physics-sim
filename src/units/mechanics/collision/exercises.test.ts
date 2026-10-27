/**
 * 衝突の演習問題のテスト。正解が、問題の条件で衝突させたシミュレーションの結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  collisionTime,
  energies,
  initialState,
  momenta,
  step,
  type CollisionParams,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 衝突の少しあとまで進めた状態 */
function afterCollisionState(p: CollisionParams) {
  let s = initialState(p);
  const n = Math.ceil((collisionTime(p) + 0.05) / DT);
  for (let i = 0; i < n; i++) s = step(p, s, DT);
  expect(s.collidedAt).not.toBeNull();
  return s;
}

describe('正解がシミュレーションと一致する', () => {
  it('衝突後の速度。運動量の和も保存されている', () => {
    for (const ex of sampleExercises(template('velocity-after'))) {
      const p = ex.sim.params as CollisionParams;
      const s = afterCollisionState(p);
      const askA = ex.statement.includes("v_A'");
      const v = askA ? s.vA : s.vB;
      expect(Math.abs(value(ex) - v)).toBeLessThan(1e-9 * Math.max(1, Math.abs(v)));
      const P0 = p.mA * p.vA + p.mB * p.vB;
      expect(Math.abs(momenta(p, s).total - P0)).toBeLessThan(1e-12 * (1 + Math.abs(P0)));
      // 反発係数の式（遠ざかる速さ = e × 近づく速さ）
      expect(s.vB - s.vA).toBeCloseTo(p.e * (p.vA - p.vB), 10);
    }
  });

  it('失われた力学的エネルギー = 衝突前後の運動エネルギーの差', () => {
    for (const ex of sampleExercises(template('energy-loss'))) {
      const p = ex.sim.params as CollisionParams;
      const s = afterCollisionState(p);
      const k0 = 0.5 * p.mA * p.vA ** 2 + 0.5 * p.mB * p.vB ** 2;
      expect(relativeError(value(ex), k0 - energies(p, s).total)).toBeLessThan(1e-9);
    }
  });

  it('B が受けた力積 = B の運動量の変化 = −(A の運動量の変化)', () => {
    for (const ex of sampleExercises(template('impulse'))) {
      const p = ex.sim.params as CollisionParams;
      const s = afterCollisionState(p);
      const dpB = p.mB * (s.vB - p.vB);
      const dpA = p.mA * (s.vA - p.vA);
      expect(relativeError(value(ex), Math.abs(dpB))).toBeLessThan(1e-9);
      expect(dpA + dpB).toBeCloseTo(0, 10);
    }
  });
});
