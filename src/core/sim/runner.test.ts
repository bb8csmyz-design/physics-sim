import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationRunner } from './runner';

/** requestAnimationFrame を手動で進められるようにする */
let frames: ((t: number) => void)[] = [];
let now = 0;
beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('performance', { now: () => now });
});
afterEach(() => vi.unstubAllGlobals());

function tick(ms: number) {
  now += ms;
  const fs = frames.splice(0);
  for (const f of fs) f(now);
}

/** 等速運動 x = v t（状態は x のみ） */
function makeRunner(opts: { endTime?: number; timeScale?: number } = {}) {
  const render = vi.fn();
  const runner = new SimulationRunner<number>({
    dt: 0.01,
    init: () => 0,
    step: (x, _t, dt) => x + 2 * dt,
    render,
    ...opts,
  });
  return { runner, render };
}

describe('SimulationRunner', () => {
  it('実時間に合わせて固定刻みでステップを進める', () => {
    const { runner } = makeRunner();
    runner.play();
    for (let i = 0; i < 50; i++) tick(20); // 1 秒
    expect(runner.time).toBeCloseTo(1, 6);
    expect(runner.state).toBeCloseTo(2, 6);
  });

  it('speed と timeScale がシミュレーション時間の進み方に掛かる', () => {
    const { runner } = makeRunner({ timeScale: 0.5 });
    runner.setSpeed(2);
    runner.play();
    for (let i = 0; i < 50; i++) tick(20);
    expect(runner.time).toBeCloseTo(1, 6);
  });

  it('setTimeScale で再生中にシミュレーション時間の進み方を変えられる', () => {
    const { runner } = makeRunner();
    runner.play();
    for (let i = 0; i < 25; i++) tick(20); // 0.5 秒（等倍）
    runner.setTimeScale(0.1);
    for (let i = 0; i < 50; i++) tick(20); // 1 秒（×0.1）
    expect(runner.timeScale).toBe(0.1);
    expect(runner.time).toBeCloseTo(0.6, 6);
    expect(() => runner.setTimeScale(0)).toThrow(RangeError);
  });

  it('一時停止中は進まず、リセットで初期状態に戻る', () => {
    const { runner } = makeRunner();
    runner.play();
    tick(16);
    tick(100);
    runner.pause();
    const t = runner.time;
    tick(500);
    expect(runner.time).toBe(t);
    runner.reset();
    expect(runner.time).toBe(0);
    expect(runner.state).toBe(0);
  });

  it('advance はコマ送りし、停止状態を保つ', () => {
    const { runner } = makeRunner();
    runner.advance(0.1);
    expect(runner.time).toBeCloseTo(0.1, 9);
    expect(runner.playing).toBe(false);
  });

  it('endTime に達したら自動で止まる', () => {
    const { runner } = makeRunner({ endTime: 0.5 });
    runner.play();
    for (let i = 0; i < 100; i++) tick(20);
    expect(runner.playing).toBe(false);
    expect(runner.time).toBeCloseTo(0.5, 6);
  });

  it('タブが長時間非表示だった後でも一度に進む時間は上限で抑えられる', () => {
    const { runner } = makeRunner();
    runner.play();
    tick(16);
    tick(60_000);
    expect(runner.time).toBeLessThanOrEqual(0.1 + 1e-9 + 0.016);
  });
});
