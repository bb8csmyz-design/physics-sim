/**
 * 2 波源の干渉の演習問題のテスト。正解を、2 つの波を重ね合わせた変位（displacements）の
 * 時間変化から測った振幅と比べる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import {
  FREQUENCY,
  PARAMS,
  displacements,
  type InterferenceParams,
  type SourcePhase,
} from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;
const phaseOf = (ex: { sim: { choices?: Readonly<Record<string, string>> } }) =>
  ex.sim.choices!.phase as SourcePhase;

/** 1 周期の間の合成波の変位の最大値（= 振動の振幅）。200 点で標本化 */
function amplitudeAt(p: InterferenceParams, phase: SourcePhase, x: number, y: number): number {
  let max = 0;
  for (let i = 0; i < 200; i++) {
    const t = i / 200 / FREQUENCY;
    max = Math.max(max, Math.abs(displacements(p, phase, x, y, t).total));
  }
  return max;
}

/** 線分 S₁S₂ 上で振幅が 2（強め合い）または 0（弱め合い）になる点の数 */
function countOnSegment(p: InterferenceParams, phase: SourcePhase, constructive: boolean): number {
  const N = 20_000;
  // 振幅 2A|cos θ| の極値を、|cos θ| の符号の変わり目・極大の数え上げで探す
  let count = 0;
  let prev = NaN;
  let prev2 = NaN;
  for (let i = 1; i < N; i++) {
    const x = -p.d / 2 + (p.d * i) / N;
    const r1 = x + p.d / 2;
    const r2 = p.d / 2 - x;
    const c = Math.cos((Math.PI * (r1 - r2)) / p.lambda - (phase === 'same' ? 0 : Math.PI / 2));
    const a = Math.abs(c);
    if (i >= 3) {
      if (constructive && prev > prev2 && prev >= a && prev > 0.999) count++;
      if (!constructive && prev < prev2 && prev <= a && prev < 0.01) count++;
    }
    prev2 = prev;
    prev = a;
  }
  return count;
}

describe('正解が波の重ね合わせと一致する', () => {
  it('点 P の判定: 重ね合わせた変位の振幅が 2（強め合い）か 0（弱め合い）か', () => {
    for (const ex of sampleExercises(template('point-judge'))) {
      const p = ex.sim.params as InterferenceParams;
      const amp = amplitudeAt(p, phaseOf(ex), p.xP, p.yP);
      if (ex.given!.constructive) expect(amp).toBeCloseTo(2, 3);
      else expect(amp).toBeLessThan(1e-9);
    }
  });

  it('線の本数: 線分 S₁S₂ 上で振幅が最大・0 になる点の数', () => {
    for (const ex of sampleExercises(template('line-count'))) {
      const p = ex.sim.params as InterferenceParams;
      const constructive = ex.statement.includes('強め合う点を連ねた線');
      expect(countOnSegment(p, phaseOf(ex), constructive)).toBe(value(ex));
    }
  });

  it('波の速さ: 線分 S₁S₂ 上で隣り合う腹の間隔 × 2 × 振動数', () => {
    for (const ex of sampleExercises(template('wave-speed'), 20)) {
      const p = ex.sim.params as InterferenceParams;
      // 中点付近の腹を探し、隣の腹までの距離を測る（0.1 mm 刻みで探す）
      const peaks: number[] = [];
      for (let x = -p.d / 2 + 1e-4; x < p.d / 2 && peaks.length < 2; x += 1e-4) {
        const a0 = amplitudeAt(p, phaseOf(ex), x - 1e-4, 0);
        const a1 = amplitudeAt(p, phaseOf(ex), x, 0);
        const a2 = amplitudeAt(p, phaseOf(ex), x + 1e-4, 0);
        if (a1 >= a0 && a1 > a2 && a1 > 1.99) peaks.push(x);
      }
      const spacing = peaks[1]! - peaks[0]!;
      // 0.1 mm 刻みで探したので、間隔の誤差は 0.2 mm 以下
      expect(Math.abs(spacing - value(ex) / FREQUENCY / 2)).toBeLessThan(2.1e-4);
      expect(relativeError(value(ex), FREQUENCY * p.lambda)).toBeLessThan(1e-12);
    }
  });
});
