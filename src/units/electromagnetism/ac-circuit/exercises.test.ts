/**
 * 交流回路の演習問題のテスト。正解が、回路の微分方程式 v = Ri + L di/dt + q/C を
 * 数値積分した定常状態の電流・電力と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  initialState,
  sourceVoltage,
  step,
  type AcParams,
  type AcState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 定常状態から 1 周期（Δt で割り切れる分割）動かし、電流の最大値・2 乗平均・電力の平均を測る */
function measure(p: AcParams) {
  const n = Math.round(1 / p.f / DT);
  const dt = 1 / p.f / n;
  let s: AcState = initialState(p, 'steady');
  let imax = 0;
  let i2 = 0;
  for (let k = 0; k < n; k++) {
    s = step(p, s, k * dt, dt);
    imax = Math.max(imax, Math.abs(s.i));
    i2 += s.i * s.i;
  }
  return { imax, irms: Math.sqrt(i2 / n), power: s.work / (n * dt) };
}

// RK4 の誤差は 1e-8 程度。最大値は Δt ごとの標本なので (ωΔt)²/8 ≈ 3e-5 ほど小さく出る
describe('正解が数値積分した定常状態と一致する', () => {
  it('インピーダンス = 電圧の最大値 / 電流の最大値', () => {
    for (const ex of sampleExercises(template('impedance'), 20)) {
      const p = ex.sim.params as AcParams;
      const { imax } = measure(p);
      expect(relativeError(value(ex), (Math.SQRT2 * p.Ve) / imax)).toBeLessThan(1e-4);
    }
  });

  it('電流の実効値 = 1 周期の 2 乗平均の平方根', () => {
    for (const ex of sampleExercises(template('rms-current'), 20)) {
      const { irms } = measure(ex.sim.params as AcParams);
      expect(relativeError(value(ex), irms)).toBeLessThan(1e-6);
    }
  });

  it('平均の消費電力 = 電源が 1 周期にした仕事 / 周期', () => {
    for (const ex of sampleExercises(template('power'), 20)) {
      const { power } = measure(ex.sim.params as AcParams);
      expect(relativeError(value(ex), power)).toBeLessThan(1e-6);
    }
  });

  it('共振周波数: その周波数では電流の実効値が最大で、電流と電圧が同位相（i = v/R）', () => {
    for (const ex of sampleExercises(template('resonance'), 20)) {
      const p = { ...(ex.sim.params as AcParams), f: value(ex) };
      const at = measure(p).irms;
      expect(relativeError(at, p.Ve / p.R)).toBeLessThan(1e-6);
      expect(measure({ ...p, f: p.f * 1.02 }).irms).toBeLessThan(at);
      expect(measure({ ...p, f: p.f * 0.98 }).irms).toBeLessThan(at);
      const s = step(p, initialState(p, 'steady'), 0, 1e-4);
      expect(s.i).toBeCloseTo(sourceVoltage(p, 1e-4) / p.R, 6);
    }
  });
});
