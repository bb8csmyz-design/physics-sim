/**
 * 荷電粒子の運動の演習問題のテスト。正解が、運動方程式 m dv/dt = q(E + v × B) を数値積分した軌道と
 * 一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  initialState,
  period,
  step,
  type ParticleParams,
  type ParticleState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function simulate(p: ParticleParams, duration: number): ParticleState[] {
  const states = [initialState(p)];
  let s = states[0]!;
  for (let i = 0; i < Math.round(duration / DT); i++) {
    s = step(p, s, DT);
    states.push(s);
  }
  return states;
}

// RK4（|ω|Δt ≤ 0.01）の 1 周あたりの誤差は 1e-9 程度。最大値は Δt ごとの標本なので (ωΔt)²/8 ほどずれる
describe('正解が軌道の数値積分と一致する', () => {
  it('半径: 1 周の間の y の幅（直径）の半分', () => {
    for (const ex of sampleExercises(template('radius'), 20)) {
      const p = ex.sim.params as ParticleParams;
      const ys = simulate(p, period(p)).map((s) => s.y);
      const r = (Math.max(...ys) - Math.min(...ys)) / 2;
      expect(relativeError(value(ex), r)).toBeLessThan(1e-4);
    }
  });

  it('周期: 打ち出した点に戻ってくる時刻', () => {
    for (const ex of sampleExercises(template('period'), 20)) {
      const p = ex.sim.params as ParticleParams;
      const states = simulate(p, 1.2 * period(p));
      // 半周より後で打ち出した点（原点）に最も近づく時刻 = 1 周（Δt 刻みの標本なので誤差 Δt 以下）
      let best = Infinity;
      let tBest = 0;
      states.forEach((s, i) => {
        const t = i * DT;
        if (t < 0.5 * period(p)) return;
        const d = Math.hypot(s.x, s.y);
        if (d < best) {
          best = d;
          tBest = t;
        }
      });
      expect(Math.abs(value(ex) - tBest)).toBeLessThanOrEqual(DT);
    }
  });

  it('回る向き: 打ち出した直後に y 方向へ曲がる向き（下なら時計回り）', () => {
    for (const ex of sampleExercises(template('rotation-direction'))) {
      const p = ex.sim.params as ParticleParams;
      const s = simulate(p, 10 * DT).at(-1)!;
      expect(s.y < 0 ? 1 : 0).toBe(ex.given!.clockwise);
    }
  });

  it('速度選別: その速さで打ち出すと y がほぼ 0 のまま進む', () => {
    for (const ex of sampleExercises(template('velocity-selector'), 20)) {
      const p = { ...(ex.sim.params as ParticleParams), v0: value(ex) };
      const ys = simulate(p, 2).map((s) => Math.abs(s.y));
      expect(Math.max(...ys)).toBeLessThan(1e-9);
      expect(ex.sim.params.v0).toBeCloseTo(value(ex), 9);
    }
  });
});
