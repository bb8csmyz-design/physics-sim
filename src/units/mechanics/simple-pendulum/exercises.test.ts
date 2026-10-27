/**
 * 単振り子の演習問題のテスト。正解が、問題の条件で数値積分したシミュレーションの結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  initialState,
  smallAnglePeriod,
  step,
  tangentialVelocity,
  tension,
  type PendulumParams,
  type PendulumState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function simulate(p: PendulumParams, duration: number): PendulumState[] {
  const states = [initialState(p)];
  let s = states[0]!;
  for (let i = 0; i < Math.round(duration / DT); i++) {
    s = step(p, s, DT);
    states.push(s);
  }
  return states;
}

function measuredPeriod(p: PendulumParams): number {
  const states = simulate(p, 2.3 * smallAnglePeriod(p));
  return estimatePeriod(
    states.map((_, i) => i * DT),
    states.map((s) => s.theta),
  );
}

/** 最下点（θ が正から負に変わるステップ）での状態を線形補間で求める */
function atBottom(p: PendulumParams) {
  const states = simulate(p, smallAnglePeriod(p));
  const i = states.findIndex((s) => s.theta <= 0);
  const a = states[i - 1]!;
  const b = states[i]!;
  const r = a.theta / (a.theta - b.theta);
  return { theta: 0, omega: a.omega + r * (b.omega - a.omega) };
}

describe('正解がシミュレーションと一致する', () => {
  it('周期: 振れ角 5° 以下なら公式と測った周期のずれは θ₀²/16 ≈ 0.05% 以下', () => {
    for (const ex of sampleExercises(template('period'), 20)) {
      const T = measuredPeriod(ex.sim.params as PendulumParams);
      expect(relativeError(value(ex), T)).toBeLessThan(1e-3);
    }
  });

  it('最下点での速さ（吉田 4 次法の誤差 + 補間の誤差は 1e-5 程度）', () => {
    for (const ex of sampleExercises(template('bottom-speed'), 20)) {
      const p = ex.sim.params as PendulumParams;
      const v = Math.abs(tangentialVelocity(p, atBottom(p)));
      expect(relativeError(value(ex), v)).toBeLessThan(1e-4);
    }
  });

  it('最下点での張力', () => {
    for (const ex of sampleExercises(template('bottom-tension'), 20)) {
      const p = ex.sim.params as PendulumParams;
      expect(relativeError(value(ex), tension(p, atBottom(p)))).toBeLessThan(1e-4);
    }
  });

  it('周期の変化: 変更前後で測った周期の比', () => {
    for (const ex of sampleExercises(template('period-scaling'), 20)) {
      const after = ex.sim.params as PendulumParams;
      const before = { ...after, L: ex.given!.L!, m: ex.given!.m! };
      const ratio = measuredPeriod(after) / measuredPeriod(before);
      expect(relativeError(ratio, ex.given!.ratio!)).toBeLessThan(1e-3);
    }
  });
});
