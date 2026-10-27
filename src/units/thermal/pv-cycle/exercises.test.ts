/**
 * 熱サイクルの演習問題のテスト。正解を、p-V 図の経路の数値積分（W = ∫p dV）と
 * 内部エネルギー U = nC_VT・第一法則 Q = ΔU + W から独立に求めた値と比べる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  CYCLES,
  PRESET_CHOICES,
  buildCycle,
  internalEnergy,
  processPoint,
  type CycleId,
  type GasKind,
  type Process,
} from './model';

checkExercises(EXERCISES, (ex) => CYCLES[ex.sim.choices!.cycle as CycleId].params, PRESET_CHOICES);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;
const cycleOf = (ex: { sim: { params: object; choices?: Readonly<Record<string, string>> } }) =>
  buildCycle(ex.sim.choices!.cycle as CycleId, ex.sim.choices!.gas as GasKind, ex.sim.params);

/** 過程の経路に沿って W = ∫p dV を台形則で求める（分割 20000。誤差は 1e-8 程度） */
function workAlong(gas: GasKind, n: number, proc: Process): number {
  const N = 20_000;
  let W = 0;
  let prev = processPoint(gas, n, proc, 0);
  for (let i = 1; i <= N; i++) {
    const x = processPoint(gas, n, proc, i / N);
    W += 0.5 * (prev.p + x.p) * (x.V - prev.V);
    prev = x;
  }
  return W;
}

/** 第一法則 Q = ΔU + W から求めた熱量 */
function heatAlong(gas: GasKind, n: number, proc: Process): number {
  return (
    internalEnergy(gas, n, proc.end.T) -
    internalEnergy(gas, n, proc.start.T) +
    workAlong(gas, n, proc)
  );
}

describe('正解が p-V 図の数値積分と第一法則に一致する', () => {
  it('正味の仕事 = 1 サイクルの ∮p dV', () => {
    for (const ex of sampleExercises(template('net-work'), 10)) {
      const c = cycleOf(ex);
      const W = c.processes.reduce((a, proc) => a + workAlong(c.gas, c.n, proc), 0);
      expect(relativeError(value(ex), W)).toBeLessThan(1e-6);
    }
  });

  it('定圧変化の熱量 = ΔU + ∫p dV', () => {
    for (const ex of sampleExercises(template('isobaric-heat'), 10)) {
      const c = cycleOf(ex);
      expect(relativeError(value(ex), heatAlong(c.gas, c.n, c.processes[1]!))).toBeLessThan(1e-6);
    }
  });

  it('カルノーサイクルの熱効率 = 正味の仕事 / 吸収した熱', () => {
    for (const ex of sampleExercises(template('carnot-efficiency'), 10)) {
      const c = cycleOf(ex);
      const qs = c.processes.map((proc) => heatAlong(c.gas, c.n, proc));
      const W = c.processes.reduce((a, proc) => a + workAlong(c.gas, c.n, proc), 0);
      const Qin = qs.filter((q) => q > 0).reduce((a, q) => a + q, 0);
      expect(relativeError(value(ex), W / Qin)).toBeLessThan(1e-5);
    }
  });

  it('符号の組み合わせ: 数値積分した Q, W と ΔU の符号に一致する', () => {
    for (const ex of sampleExercises(template('process-signs'))) {
      const c = cycleOf(ex);
      const proc = c.processes[ex.given!.index!]!;
      const W = workAlong(c.gas, c.n, proc);
      const Q = heatAlong(c.gas, c.n, proc);
      const dU = internalEnergy(c.gas, c.n, proc.end.T) - internalEnergy(c.gas, c.n, proc.start.T);
      const scale = c.n * 8.314 * proc.start.T;
      const sign = (x: number) => (Math.abs(x) < 1e-6 * scale ? '= 0' : x > 0 ? '> 0' : '< 0');
      const a = ex.answer;
      if (a.kind !== 'choice') throw new Error('選択問題のはず');
      expect(a.options[a.correct]).toBe(`$Q ${sign(Q)}$, $W ${sign(W)}$, $\\Delta U ${sign(dU)}$`);
    }
  });
});
