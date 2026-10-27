/**
 * RC 回路の演習問題のテスト。正解が、問題の条件で回路の微分方程式を数値積分した結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  capacitorVoltage,
  current,
  initialState,
  step,
  timeConstant,
  type RcParams,
  type RcState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 充電（スイッチ a）を duration 秒シミュレーションする */
function charge(p: RcParams, duration: number): RcState[] {
  const states = [initialState()];
  let s = states[0]!;
  for (let i = 0; i < Math.round(duration / DT); i++) {
    s = step(p, s, DT, 'a');
    states.push(s);
  }
  return states;
}

// RK4（Δt ≤ τ/100）の誤差は (Δt/τ)⁴ ≈ 1e-8 程度
describe('正解がシミュレーションと一致する', () => {
  it('閉じた直後の電流', () => {
    for (const ex of sampleExercises(template('initial-current'))) {
      const p = ex.sim.params as RcParams;
      expect(relativeError(value(ex), current(p, initialState().q, 'a') * 1e3)).toBeLessThan(1e-12);
    }
  });

  it('時定数: t = τ でコンデンサーの電圧が E(1 − 1/e)', () => {
    for (const ex of sampleExercises(template('time-constant'), 20)) {
      const p = ex.sim.params as RcParams;
      const tau = value(ex);
      const n = Math.floor(tau / DT);
      const states = charge(p, n * DT);
      // 最後のステップの残り（τ − nΔt）を小さな刻みで進める
      const s = step(p, states[n]!, tau - n * DT, 'a');
      expect(relativeError(capacitorVoltage(p, s.q), p.E * (1 - Math.exp(-1)))).toBeLessThan(1e-6);
    }
  });

  it('電圧が半分になる時刻: シミュレーションで V_C が E/2 を横切る時刻', () => {
    for (const ex of sampleExercises(template('half-time'), 20)) {
      const p = ex.sim.params as RcParams;
      const states = charge(p, 2 * timeConstant(p));
      const i = states.findIndex((s) => capacitorVoltage(p, s.q) >= p.E / 2);
      const v0 = capacitorVoltage(p, states[i - 1]!.q);
      const v1 = capacitorVoltage(p, states[i]!.q);
      const t = (i - 1 + (p.E / 2 - v0) / (v1 - v0)) * DT;
      // 線形補間の誤差は Δt²/τ 程度（相対 1e-4 以下）
      expect(relativeError(value(ex), t)).toBeLessThan(1e-4);
    }
  });

  it('ジュール熱: 十分に時間がたった（20τ）ときの発熱の累計', () => {
    for (const ex of sampleExercises(template('joule-heat'), 20)) {
      const p = ex.sim.params as RcParams;
      const states = charge(p, 20 * timeConstant(p));
      const s = states[states.length - 1]!;
      expect(relativeError(value(ex), s.heat * 1e3)).toBeLessThan(1e-6);
      // 電池の仕事の半分
      expect(relativeError(s.heat, s.work / 2)).toBeLessThan(1e-6);
    }
  });
});
