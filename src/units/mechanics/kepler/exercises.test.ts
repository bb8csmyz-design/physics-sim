/**
 * 人工衛星の演習問題のテスト。正解が、問題の条件で軌道を数値積分した結果と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { EARTH_RADIUS } from '@/core/physics/constants';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  GM,
  PARAMS,
  distance,
  initialState,
  speed,
  step,
  type KeplerParams,
  type KeplerState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 打ち出しの速さだけを正確な値 v [m/s] にした初期状態 */
const launch = (p: KeplerParams, v: number): KeplerState => ({ ...initialState(p), vy: v });

// 吉田 4 次法（1 ステップで回る角 ≤ 1.9e-3 rad）の 1 周あたりの誤差は 1e-10 程度
describe('正解がシミュレーションと一致する', () => {
  it('円軌道の速さ: その速さで打ち出すと半径が変わらない', () => {
    for (const ex of sampleExercises(template('circular-speed'), 8)) {
      const p = ex.sim.params as KeplerParams;
      expect(Math.abs(p.v0 - value(ex))).toBeLessThanOrEqual(0.05 + 1e-9);
      let s = launch(p, value(ex) * 1000);
      const r0 = distance(s);
      for (let i = 0; i < 20_000; i++) {
        s = step(p, s, DT);
        expect(relativeError(distance(s), r0)).toBeLessThan(1e-8);
      }
    }
  });

  it('円軌道の周期: 1 周して x 軸を下から上へ横切るまでの時間', () => {
    for (const ex of sampleExercises(template('circular-period'), 8)) {
      const p = ex.sim.params as KeplerParams;
      let s = launch(p, Math.sqrt(GM / (p.r0 * EARTH_RADIUS)));
      let t = 0;
      let prev = s;
      // 半周を過ぎてから y が負から正に変わる時刻を線形補間で求める
      while (!(t > value(ex) / 2 && prev.y < 0 && s.y >= 0)) {
        prev = s;
        s = step(p, s, DT);
        t += DT;
      }
      const tCross = t - DT + (-prev.y / (s.y - prev.y)) * DT;
      expect(relativeError(value(ex), tCross)).toBeLessThan(1e-6);
    }
  });

  it('脱出速度: その速さで打ち出すと、遠方で力学的エネルギー 0 の速さ √(2GM/r) になる', () => {
    for (const ex of sampleExercises(template('escape-speed'), 8)) {
      const p = ex.sim.params as KeplerParams;
      let s = launch(p, value(ex) * 1000);
      while (!s.escaped) s = step(p, s, DT);
      expect(relativeError(speed(s), Math.sqrt((2 * GM) / distance(s)))).toBeLessThan(1e-8);
      // スライダーの値（脱出速度より少し大きい）では脱出し、0.2 km/s 下げると戻ってくる
      expect(p.v0 * 1000).toBeGreaterThan(value(ex) * 1000);
    }
  });

  it('遠地点での速さ: 動径方向の速度が 0 になる点（遠地点）での速さ', () => {
    for (const ex of sampleExercises(template('apogee-speed'), 8)) {
      const p = ex.sim.params as KeplerParams;
      let s = initialState(p);
      let prev: KeplerState;
      // 遠地点: 距離が増加から減少に変わる点
      do {
        prev = s;
        s = step(p, s, DT);
      } while (distance(s) >= distance(prev) && !s.escaped);
      expect(s.escaped).toBe(false);
      expect(relativeError(distance(prev) / EARTH_RADIUS, ex.given!.rA!)).toBeLessThan(5e-3);
      // 問題文の遠地点の距離は有効数字 3 桁なので、正解もその丸め（0.5%）の範囲で一致する
      expect(relativeError(value(ex), speed(prev) / 1000)).toBeLessThan(5e-3);
    }
  });
});
