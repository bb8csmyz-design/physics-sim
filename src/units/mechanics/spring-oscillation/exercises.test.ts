/**
 * ばねの単振動の演習問題のテスト。正解が、問題の条件で動かしたシミュレーションの結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  initialState,
  period,
  step,
  type SpringParams,
  type SpringState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function simulate(p: SpringParams, duration: number) {
  const ts = [0];
  const states: SpringState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= Math.round(duration / DT); i++) {
    s = step(p, s, DT);
    ts.push(i * DT);
    states.push(s);
  }
  return { ts, states };
}

// 速度ベルレ法（ωΔt ≤ 0.04）の位相・振幅の誤差は 1e-4 程度なので、1e-3 で比べる
const TOL = 1e-3;

describe('正解がシミュレーションと一致する', () => {
  it('周期: x-t グラフから測った周期', () => {
    for (const ex of sampleExercises(template('period'), 20)) {
      const p = ex.sim.params as SpringParams;
      const { ts, states } = simulate(p, 3.2 * period(p));
      const T = estimatePeriod(
        ts,
        states.map((s) => s.x),
      );
      expect(relativeError(value(ex), T)).toBeLessThan(TOL);
    }
  });

  it('最大の速さ: 1 周期のあいだの |v| の最大値', () => {
    for (const ex of sampleExercises(template('max-speed'), 20)) {
      const p = ex.sim.params as SpringParams;
      const { states } = simulate(p, period(p));
      const vmax = Math.max(...states.map((s) => Math.abs(s.v)));
      expect(relativeError(value(ex), vmax)).toBeLessThan(TOL);
    }
  });

  it('途中の位置での速さ: x が指定の位置を通過するときの |v|', () => {
    for (const ex of sampleExercises(template('speed-at-position'), 20)) {
      const p = ex.sim.params as SpringParams;
      const x = ex.given!.x!;
      const { states } = simulate(p, period(p) / 2);
      // 放した直後は x が減っていくので、最初に x を下回るステップで線形補間する
      const i = states.findIndex((s) => s.x < x);
      const a = states[i - 1]!;
      const b = states[i]!;
      const v = a.v + ((x - a.x) / (b.x - a.x)) * (b.v - a.v);
      expect(relativeError(value(ex), Math.abs(v))).toBeLessThan(TOL);
    }
  });

  it('周期の変化: 変更前後のシミュレーションの周期の比', () => {
    for (const ex of sampleExercises(template('period-scaling'), 20)) {
      const after = ex.sim.params as SpringParams;
      const before = { ...after, m: ex.given!.mBefore!, k: ex.given!.kBefore! };
      const measure = (p: SpringParams) => {
        const { ts, states } = simulate(p, 2.2 * period(p));
        return estimatePeriod(
          ts,
          states.map((s) => s.x),
        );
      };
      expect(relativeError(measure(after) / measure(before), ex.given!.ratio!)).toBeLessThan(TOL);
      // 正しい選択肢が、比が 1 より大きいか小さいかと合っている
      const correct = ex.answer.kind === 'choice' ? ex.answer.options[ex.answer.correct]! : '';
      expect(correct.includes('dfrac')).toBe(ex.given!.ratio! < 1);
    }
  });
});
