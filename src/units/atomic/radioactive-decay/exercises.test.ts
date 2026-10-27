/**
 * 放射性崩壊の演習問題のテスト。正解（期待値）を、多数の試行（シードを変えたシミュレーション）の平均と比べる。
 * 崩壊は確率的なので、許容誤差は標準誤差の 5 倍（偶然に外れる確率は 10⁻⁶ 程度）にする。
 */
import { describe, expect, it } from 'vitest';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { PARAMS, decayedBy, initialState, type DecayParams } from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;
const TRIALS = 100;

/** 時刻 t に残っている数の、TRIALS 回の試行の平均と標準誤差 */
function remainingStats(p: DecayParams, t: number): { mean: number; se: number } {
  const xs = Array.from({ length: TRIALS }, (_, i) => {
    const s = initialState(p, i + 1);
    return s.sorted.length - decayedBy(s, t);
  });
  const mean = xs.reduce((a, b) => a + b, 0) / TRIALS;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (TRIALS - 1);
  return { mean, se: Math.sqrt(v / TRIALS) };
}

describe('正解（期待値）が多数回のシミュレーションの平均と一致する', () => {
  it('残っている数', () => {
    for (const ex of sampleExercises(template('remaining'), 5)) {
      const { mean, se } = remainingStats(ex.sim.params as DecayParams, ex.given!.t!);
      expect(Math.abs(mean - value(ex))).toBeLessThan(5 * se);
    }
  });

  it('半減期: その時間がたつと平均で半分が残っている', () => {
    for (const ex of sampleExercises(template('half-life'), 5)) {
      const p = ex.sim.params as DecayParams;
      const { mean, se } = remainingStats(p, value(ex));
      expect(Math.abs(mean - p.N0 / 2)).toBeLessThan(5 * se);
    }
  });

  it('経過時間: その時間に残っている割合が (1/2)^k', () => {
    for (const ex of sampleExercises(template('elapsed-time'), 5)) {
      const p = ex.sim.params as DecayParams;
      const { mean, se } = remainingStats(p, value(ex));
      expect(Math.abs(mean - p.N0 / 2 ** ex.given!.k!)).toBeLessThan(5 * se);
    }
  });

  it('放射能: はじめの短い時間（T/100）に崩壊した数 ÷ 時間 の平均', () => {
    for (const ex of sampleExercises(template('activity'), 5)) {
      const p = ex.sim.params as DecayParams;
      const w = p.T / 100;
      const xs = Array.from({ length: TRIALS }, (_, i) => decayedBy(initialState(p, i + 1), w) / w);
      const mean = xs.reduce((a, b) => a + b, 0) / TRIALS;
      const se = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (TRIALS - 1) / TRIALS);
      // 幅 w の間に放射能は (1/2)^{1/100} 倍まで減るので、平均は A₀ より 0.35% ほど小さい
      const expected = (p.N0 * (1 - 0.5 ** 0.01)) / w;
      expect(Math.abs(mean - expected)).toBeLessThan(5 * se);
      expect(Math.abs(expected / value(ex) - 1)).toBeLessThan(0.004);
    }
  });
});
