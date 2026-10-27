/**
 * 鉛直面内の円運動の演習問題のテスト。正解が、問題の条件で動かしたシミュレーションと一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  DT,
  PARAMS,
  height,
  initialState,
  step,
  tension,
  type CircleParams,
  type CircleState,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 運動の結果: 1 回転した / 糸がたるんだ / 往復した。それぞれの瞬間の状態も返す */
function run(p: CircleParams) {
  let s: CircleState = initialState(p);
  let prev: CircleState;
  for (let i = 0; i < 20_000; i++) {
    prev = s;
    s = step(p, s, DT);
    if (s.mode === 'free') return { kind: 'slack' as const, prev, s };
    if (s.theta >= Math.PI && prev.theta < Math.PI) return { kind: 'loop' as const, prev, s };
    if (s.omega < 0) return { kind: 'swing' as const, prev, s };
  }
  throw new Error('判定できない');
}

describe('正解がシミュレーションと一致する', () => {
  it('1 回転するための最小の初速: その少し上なら 1 回転し、0.2 m/s 下げると糸がたるむ', () => {
    for (const ex of sampleExercises(template('loop-speed'), 20)) {
      const p = ex.sim.params as CircleParams;
      expect(p.v0).toBeGreaterThanOrEqual(value(ex));
      expect(p.v0 - value(ex)).toBeLessThan(0.1 + 1e-9);
      expect(run(p).kind).toBe('loop');
      expect(run({ ...p, v0: p.v0 - 0.2 }).kind).toBe('slack');
    }
  });

  it('最高点での張力（最高点をはさむステップで補間。誤差は 1e-4 程度）', () => {
    for (const ex of sampleExercises(template('top-tension'), 20)) {
      const p = ex.sim.params as CircleParams;
      const { kind, prev, s } = run(p);
      expect(kind).toBe('loop');
      const r = (Math.PI - prev.theta) / (s.theta - prev.theta);
      const T = tension(p, prev) + r * (tension(p, s) - tension(p, prev));
      expect(Math.abs(value(ex) - T)).toBeLessThan(1e-3 * (1 + Math.abs(T)));
    }
  });

  it('糸がたるむ高さ: 張力が 0 になって放物運動に変わった瞬間の高さ', () => {
    for (const ex of sampleExercises(template('slack-height'), 20)) {
      const p = ex.sim.params as CircleParams;
      const { kind, s } = run(p);
      expect(kind).toBe('slack');
      // たるんだ瞬間から最大 Δt だけ放物運動で進んでいる（高さの変化は |v|Δt 以下）
      expect(Math.abs(value(ex) - height(p, s))).toBeLessThan(p.v0 * DT);
      expect(relativeError(value(ex), height(p, { ...s, tau: 0 }))).toBeLessThan(1e-6);
    }
  });

  it('運動のようすの判定', () => {
    for (const ex of sampleExercises(template('motion-kind'))) {
      const { kind } = run(ex.sim.params as CircleParams);
      expect(['loop', 'swing', 'slack'].indexOf(kind)).toBe(ex.given!.kind);
    }
  });
});
