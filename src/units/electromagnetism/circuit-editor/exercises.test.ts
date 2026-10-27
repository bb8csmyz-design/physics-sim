/**
 * 回路エディタの演習問題のテスト。答え合わせ用の回路（文字列）を読み込み、回路のソルバー
 * （修正節点解析 + SDIRK 法）で解いた電流・電圧が正解と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  buildSystem,
  closedSwitches,
  decodeCircuit,
  encodeCircuit,
  indexOfName,
  initialState,
  partValue,
  step,
} from './model';

checkExercises(EXERCISES, []);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

function load(state: string) {
  const saved = decodeCircuit(state);
  expect(saved).not.toBeNull();
  return saved!.circuit;
}

describe('回路の文字列', () => {
  it('encodeCircuit → decodeCircuit で同じ回路に戻る', () => {
    for (const t of EXERCISES) {
      for (const ex of sampleExercises(t, 3)) {
        const c = load(ex.sim.state!);
        expect(decodeCircuit(encodeCircuit(c, 0.1))!.circuit).toEqual(c);
      }
    }
  });

  it('壊れた文字列は null', () => {
    expect(decodeCircuit('{')).toBeNull();
    expect(decodeCircuit('{"parts":[["laser",[0,0],[0,1]]]}')).toBeNull();
    expect(decodeCircuit('{"parts":[["wire",[0,0],[2,0]]]}')).toBeNull();
  });
});

describe('正解が回路のソルバーの結果と一致する', () => {
  for (const id of ['series-parallel', 'kirchhoff']) {
    it(`${id}: 電流計 A₁ の読み`, () => {
      for (const ex of sampleExercises(template(id))) {
        const circuit = load(ex.sim.state!);
        const sys = buildSystem(
          circuit,
          circuit.parts.map(() => false),
        );
        if (!sys.ok) throw new Error(sys.message);
        const s = initialState(sys, circuit);
        const I = s.I[indexOfName(circuit, 'A_1')]!;
        expect(relativeError(value(ex), Math.abs(I) * 1e3)).toBeLessThan(1e-9);
      }
    });
  }

  it('コンデンサーの電気量: S₁ を閉じて 20τ たったときの C·V_C', () => {
    for (const ex of sampleExercises(template('capacitor-charge'), 20)) {
      const circuit = load(ex.sim.state!);
      const sys = buildSystem(circuit, closedSwitches(circuit, 'S_1'));
      if (!sys.ok) throw new Error(sys.message);
      const ci = indexOfName(circuit, 'C_1');
      const C = partValue(circuit.parts[ci]!, 'C') * 1e-6;
      const R1 = partValue(circuit.parts[indexOfName(circuit, 'R_1')]!, 'R');
      const R2 = partValue(circuit.parts[indexOfName(circuit, 'R_2')]!, 'R');
      const tau = (C * R1 * R2) / (R1 + R2);
      // L 安定な SDIRK 法なので刻みは τ/50 で十分（誤差は (Δt/τ)² ≈ 4e-4 の減衰の速さのずれだけで、
      // 20τ 後の残りは e^{−20} 程度）
      const dt = tau / 50;
      let s = initialState(sys, circuit);
      for (let i = 0; i < 1000; i++) s = step(sys, s, i * dt, dt);
      expect(relativeError(value(ex), C * Math.abs(s.V[ci]!) * 1e6)).toBeLessThan(1e-6);
    }
  });
});
