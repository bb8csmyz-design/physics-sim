/**
 * 鉛直ばね振り子の演習問題のテスト。正解が、問題の条件で動かしたシミュレーションと一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  initialState,
  netForce,
  period,
  step,
  stretch,
  type VSpringParams,
  type VSpringState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function simulate(p: VSpringParams, duration: number): VSpringState[] {
  const states = [initialState(p)];
  let s = states[0]!;
  for (let i = 0; i < Math.round(duration / DT); i++) {
    s = step(p, s, DT);
    states.push(s);
  }
  return states;
}

// 速度ベルレ法（ωΔt ≤ 0.032）の振幅・位相の誤差は 1e-4 程度。標本の最大値は真の最大値より
// (ωΔt)²/8 ≈ 1.3e-4 倍ほど小さくなりうるので、1e-3 で比べる
const TOL = 1e-3;

describe('正解がシミュレーションと一致する', () => {
  it('つりあいの伸び: その位置で合力が 0 になり、静止し続ける', () => {
    for (const ex of sampleExercises(template('equilibrium-stretch'))) {
      const p = ex.sim.params as VSpringParams;
      const states = simulate(p, 1);
      // k·(mg/k) − mg は丸め誤差で厳密な 0 にならないので、1 秒後のずれが 1e-12 m 以下であることを見る
      expect(Math.max(...states.map((s) => Math.abs(s.x)))).toBeLessThan(1e-12);
      expect(netForce(p, 0)).toBeCloseTo(0, 12);
      expect(relativeError(value(ex), stretch(p, 0))).toBeLessThan(1e-12);
    }
  });

  it('ばねの伸びの最大値: 1 周期のあいだの伸びの最大', () => {
    for (const ex of sampleExercises(template('max-stretch'))) {
      const p = ex.sim.params as VSpringParams;
      const maxStretch = Math.max(...simulate(p, period(p)).map((s) => stretch(p, s.x)));
      expect(relativeError(value(ex), maxStretch)).toBeLessThan(TOL);
    }
  });

  it('周期: x-t から測った周期', () => {
    for (const ex of sampleExercises(template('period-from-stretch'), 20)) {
      const p = ex.sim.params as VSpringParams;
      const states = simulate(p, 3.2 * period(p));
      const T = estimatePeriod(
        states.map((_, i) => i * DT),
        states.map((s) => s.x),
      );
      expect(relativeError(value(ex), T)).toBeLessThan(TOL);
    }
  });

  it('最大の速さ', () => {
    for (const ex of sampleExercises(template('max-speed'))) {
      const p = ex.sim.params as VSpringParams;
      const vmax = Math.max(...simulate(p, period(p)).map((s) => Math.abs(s.v)));
      expect(relativeError(value(ex), vmax)).toBeLessThan(TOL);
    }
  });
});
