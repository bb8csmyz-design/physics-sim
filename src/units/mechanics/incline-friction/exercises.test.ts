/**
 * 斜面の演習問題のテスト。正解が、問題の条件で動かしたシミュレーションの結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  energies,
  initialState,
  step,
  type InclineParams,
  type InclineState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

// 区間ごとの解析解で進めるので打ち切り誤差はなく、残るのは丸め誤差だけ
const EXACT = 1e-9;

/** cond を満たすまで進めた状態（運動は区間ごとに解析解なので、刻み幅によらず厳密） */
function runUntil(p: InclineParams, cond: (s: InclineState, prev: InclineState) => boolean) {
  let s = initialState(p);
  for (let i = 0; i < 100_000; i++) {
    const next = step(p, s, DT);
    if (cond(next, s)) return { prev: s, next };
    s = next;
  }
  throw new Error('条件に達しない');
}

/**
 * 最高点（速度が 0 になった瞬間）の状態。滑り降りる条件では、止まったステップの残りの時間で
 * 下り始めてしまうので、止まる直前の状態から 1 μs 刻みで進め直す（下った距離は 1e-12 m 程度）
 */
function topState(p: InclineParams): InclineState {
  let { prev: s } = runUntil(p, (q) => q.v <= 0);
  while (s.v > 0) s = step(p, s, DT / 1000);
  return s;
}

describe('正解がシミュレーションと一致する', () => {
  it('上る距離: 速度が 0 になった位置', () => {
    for (const ex of sampleExercises(template('stop-distance'))) {
      const top = topState(ex.sim.params as InclineParams);
      expect(relativeError(value(ex), top.s)).toBeLessThan(EXACT);
    }
  });

  it('戻ってきたときの速さ: 出発点を下向きに通過するときの |v|', () => {
    for (const ex of sampleExercises(template('return-speed'))) {
      const p = ex.sim.params as InclineParams;
      const { prev, next } = runUntil(p, (s, q) => s.v < 0 && q.s >= 0 && s.s < 0);
      // ステップ内で線形補間（1 ms の間の速度変化は小さい）
      const v = prev.v + ((0 - prev.s) / (next.s - prev.s)) * (next.v - prev.v);
      expect(relativeError(value(ex), Math.abs(v))).toBeLessThan(1e-4);
    }
  });

  it('発熱: 止まるまでの発熱。力学的エネルギーの減少と等しい', () => {
    for (const ex of sampleExercises(template('heat'))) {
      const p = ex.sim.params as InclineParams;
      const top = topState(p);
      expect(relativeError(value(ex), top.heat)).toBeLessThan(EXACT);
      const e0 = energies(p, initialState(p)).total;
      expect(relativeError(e0 - energies(p, top).total, top.heat)).toBeLessThan(EXACT);
    }
  });

  it('最高点で静止するか: 止まった 1 秒後にまだ止まっているか', () => {
    for (const ex of sampleExercises(template('slide-or-stay'))) {
      const p = ex.sim.params as InclineParams;
      let s = topState(p);
      for (let i = 0; i < 1000; i++) s = step(p, s, DT);
      expect(s.v < 0 ? 1 : 0).toBe(ex.given!.slides);
      const a = ex.answer;
      if (a.kind !== 'choice') throw new Error('選択問題のはず');
      expect(a.options[a.correct]).toBe(
        s.v < 0 ? '最高点から斜面を滑り降りる' : '最高点で静止したままになる',
      );
    }
  });
});
