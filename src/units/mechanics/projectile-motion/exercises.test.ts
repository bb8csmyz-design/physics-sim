/**
 * 放物運動の演習問題のテスト。正解が、問題の条件で数値積分したシミュレーションの結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  initialState,
  speed,
  step,
  type ProjectileParams,
  type ProjectileState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 着地まで（または duration 秒まで）シミュレーションし、最高点の高さと最後の状態を返す */
function fly(p: ProjectileParams, duration = 60) {
  let s: ProjectileState = initialState(p);
  let maxY = s.y;
  let t = 0;
  while (!s.landed && t < duration) {
    s = step(p, s, DT);
    t += DT;
    maxY = Math.max(maxY, s.y);
  }
  return { s, maxY, t };
}

// 空気抵抗なしの運動は RK4 で厳密に再現される（2 次式なので打ち切り誤差 0）。最高点は
// 1 ms ごとの標本の最大値なので、真の頂点より最大 g(Δt/2)²/2 ≈ 1.2e-6 m 低い
describe('正解がシミュレーションと一致する', () => {
  it('最高点の高さ', () => {
    for (const ex of sampleExercises(template('max-height'))) {
      const { maxY } = fly(ex.sim.params as ProjectileParams);
      expect(Math.abs(value(ex) - maxY)).toBeLessThan(2e-6);
    }
  });

  it('水平到達距離（着地点の x）', () => {
    for (const ex of sampleExercises(template('range'))) {
      const { s } = fly(ex.sim.params as ProjectileParams);
      expect(s.landed).toBe(true);
      expect(relativeError(value(ex), s.x)).toBeLessThan(1e-9);
    }
  });

  it('水平投射: 着地点の距離または着地の速さ', () => {
    for (const ex of sampleExercises(template('horizontal-throw'))) {
      const { s } = fly(ex.sim.params as ProjectileParams);
      const sim = ex.given!.askSpeed ? speed(s) : s.x;
      expect(relativeError(value(ex), sim)).toBeLessThan(1e-9);
    }
  });

  it('終端速度: 落下を続けると速さが終端速度に近づき、加速度が 0 になる', () => {
    for (const ex of sampleExercises(template('terminal-speed'), 20)) {
      const p = ex.sim.params as ProjectileParams;
      // 地面のない条件（十分高いところから）で 20τ だけ落とす。残る差は e^{−20} ≈ 2e-9 倍
      const tau = p.m / p.k;
      const { s } = fly({ ...p, h0: 1e7 }, 20 * tau);
      expect(relativeError(value(ex), speed(s))).toBeLessThan(1e-6);
    }
  });

  it('同時に投げた 2 球: 水平に投げても、静かに放しても滞空時間は同じ', () => {
    for (const ex of sampleExercises(template('compare-fall'), 20)) {
      const p = ex.sim.params as ProjectileParams;
      const a = fly(p);
      const b = fly({ ...p, v0: 0, theta: 90 });
      expect(Math.abs(a.t - b.t)).toBeLessThan(DT / 2);
    }
  });
});
