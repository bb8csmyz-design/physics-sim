/**
 * レンズの演習問題のテスト。正解を、物体の先端から出た 2 本の光線を薄いレンズの規則
 * （outgoingSlope）で曲げて交点を求める「作図」の結果と比べる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { PARAMS, outgoingSlope, type LensKind, type LensParams } from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/**
 * 作図による像の位置と高さ。レンズを出た光線 y = yL + s x のうち、光軸に平行に入る光線（yL = h）と
 * レンズの中心を通る光線（yL = 0）の交点（虚像なら延長線の交点）
 */
function traceImage(kind: LensKind, p: LensParams): { b: number; y: number } {
  const s1 = outgoingSlope(kind, p.a0, p, p.h);
  const s2 = outgoingSlope(kind, p.a0, p, 0);
  const b = (0 - p.h) / (s1 - s2);
  return { b, y: s2 * b };
}

const kindOf = (ex: { sim: { choices?: Readonly<Record<string, string>> } }) =>
  ex.sim.choices!.kind as LensKind;

describe('正解が光線の作図と一致する', () => {
  for (const id of ['convex-real-image', 'concave-image']) {
    it(`${id}: 像の位置 [cm]`, () => {
      for (const ex of sampleExercises(template(id))) {
        const { b } = traceImage(kindOf(ex), ex.sim.params as LensParams);
        expect(relativeError(value(ex), b * 100)).toBeLessThan(1e-9);
      }
    });
  }

  it('倍率 = 像の高さ / 物体の高さ', () => {
    for (const ex of sampleExercises(template('magnification'))) {
      const p = ex.sim.params as LensParams;
      const { y } = traceImage(kindOf(ex), p);
      expect(relativeError(value(ex), Math.abs(y) / p.h)).toBeLessThan(1e-9);
    }
  });

  it('像の種類: 実像（b > 0）なら倒立、虚像なら正立。拡大か縮小かも作図と一致', () => {
    for (const ex of sampleExercises(template('image-type'))) {
      const p = ex.sim.params as LensParams;
      const { b, y } = traceImage(kindOf(ex), p);
      expect(b > 0 ? 1 : 0).toBe(ex.given!.real);
      expect(b > 0).toBe(y < 0); // 実像は倒立
      const a = ex.answer;
      if (a.kind !== 'choice') throw new Error('選択問題のはず');
      const text = a.options[a.correct]!;
      expect(text.startsWith(b > 0 ? '倒立の実像' : '正立の虚像')).toBe(true);
      expect(text.includes(Math.abs(y) > p.h ? '拡大' : '縮小')).toBe(true);
    }
  });
});
