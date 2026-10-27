/**
 * サンドボックスの演習問題のテスト。答え合わせ用の配置（JSON）を読み込んで動かし、正解と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { DT, PARAMS, compile, initialState, step, type SandboxState } from './model';
import { parseSandbox } from './storage';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 答え合わせの配置を読み込んで duration 秒動かす */
function run(state: string, duration: number, onStep?: (s: SandboxState) => void) {
  const saved = parseSandbox(state);
  const world = compile(saved.design, saved.params);
  let s = initialState(world);
  for (let i = 0; i < Math.round(duration / DT); i++) {
    s = step(world, s, DT);
    onStep?.(s);
  }
  return { world, s, saved };
}

describe('正解が、答え合わせの配置で動かした結果と一致する', () => {
  it('アトウッドの器械: 0.3 秒間の変位 ½at² から求めた加速度、張力は運動方程式から', () => {
    for (const ex of sampleExercises(template('atwood'), 20)) {
      const t = 0.3;
      const { world, s, saved } = run(ex.sim.state!, t);
      const a = (2 * Math.abs(s.y[0]! - world.y0[0]!)) / (t * t);
      const [mA, mB] = saved.design.bodies.map((b) => b.m) as [number, number];
      // 下がる側の運動方程式 m a = m g − T から張力を求める
      const heavy = Math.max(mA, mB);
      const T = heavy * (saved.params.g - a);
      // 加速度は 1e-8 程度まで一致する。張力は g − a の引き算で相対誤差が g/(g − a) 倍（最大 8 倍）になる
      expect(relativeError(value(ex), ex.given!.askTension ? T : a)).toBeLessThan(1e-5);
    }
  });

  it('机の上の物体と滑車: 0.3 秒間の A の変位から求めた加速度', () => {
    for (const ex of sampleExercises(template('table-pulley'), 20)) {
      const t = 0.3;
      const { world, s } = run(ex.sim.state!, t);
      const a = (2 * (s.x[0]! - world.x0[0]!)) / (t * t);
      expect(relativeError(value(ex), a)).toBeLessThan(1e-6);
    }
  });

  it('跳ね返ったあとの最高点の高さ（最高点は 0.5 ms ごとの標本なので誤差 1e-5 m 程度）', () => {
    for (const ex of sampleExercises(template('bounce'), 20)) {
      let prevVy = 0;
      let bounced = false;
      let peak = NaN;
      run(ex.sim.state!, 3, (s) => {
        if (s.vy[0]! > 0) bounced = true;
        if (bounced && Number.isNaN(peak) && prevVy > 0 && s.vy[0]! <= 0) peak = s.y[0]! - 0.12;
        prevVy = s.vy[0]!;
      });
      expect(Math.abs(value(ex) - peak)).toBeLessThan(1e-4);
    }
  });

  it('スライダーの値と配置に保存したパラメータが一致する', () => {
    for (const t of EXERCISES) {
      for (const ex of sampleExercises(t, 5)) {
        expect(parseSandbox(ex.sim.state!).params).toEqual(ex.sim.params);
      }
    }
  });
});
