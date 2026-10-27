/**
 * 弦と気柱の演習問題のテスト。正解の振動数から波長を求め、定常波の形が端の条件
 * （固定端・閉口端は節、開口端の Δx 外側は腹）を満たし、腹の数が問題の条件と合うことを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { PARAMS, frequency, type ResonatorKind, type ResonatorParams } from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/** 波数 k の定常波 sin(kx + φ) を、左端の条件で φ を決めて、右端の条件を満たすかを調べる */
function satisfiesEnds(kind: ResonatorKind, p: ResonatorParams, f: number): boolean {
  const k = (2 * Math.PI * f) / p.v;
  // 左端: 弦・閉管は x = 0 が節（φ = 0）、開管は x = −Δx が腹（φ = π/2 + kΔx）
  const phi = kind === 'open' ? Math.PI / 2 + k * p.dx : 0;
  const Y = (x: number) => Math.sin(k * x + phi);
  // 右端: 弦は x = L が節、気柱は x = L + Δx が腹
  return kind === 'string' ? Math.abs(Y(p.L)) < 1e-9 : Math.abs(Math.abs(Y(p.L + p.dx)) - 1) < 1e-9;
}

/** 区間内の腹（|Y| = 1）の数 */
function antinodes(kind: ResonatorKind, p: ResonatorParams, f: number): number {
  const lambda = p.v / f;
  const [a, b] = kind === 'open' ? [-p.dx, p.L + p.dx] : [0, p.L + (kind === 'closed' ? p.dx : 0)];
  // 腹の間隔は λ/2。弦は λ/4 から、気柱は端の腹から数える
  const first = kind === 'open' ? a : a + lambda / 4;
  return Math.floor((b - first) / (lambda / 2) + 1e-9) + 1;
}

const kindOf = (ex: { sim: { choices?: Readonly<Record<string, string>> } }) =>
  ex.sim.choices!.kind as ResonatorKind;

describe('正解の振動数の定常波が端の条件を満たす', () => {
  it('弦: 両端が節で、腹の数が n', () => {
    for (const ex of sampleExercises(template('string'))) {
      const p = ex.sim.params as ResonatorParams;
      expect(satisfiesEnds('string', p, value(ex))).toBe(true);
      expect(antinodes('string', p, value(ex))).toBe(p.n);
    }
  });

  it('閉管: 閉口端が節、開口端が腹で、n 番目に低い固有振動（腹の数 n）', () => {
    for (const ex of sampleExercises(template('closed-pipe'))) {
      const p = ex.sim.params as ResonatorParams;
      expect(satisfiesEnds('closed', p, value(ex))).toBe(true);
      expect(antinodes('closed', p, value(ex))).toBe(p.n);
    }
  });

  it('開管: 両端の Δx 外側が腹で、腹の数が n + 1', () => {
    for (const ex of sampleExercises(template('open-pipe'))) {
      const p = ex.sim.params as ResonatorParams;
      expect(satisfiesEnds('open', p, value(ex))).toBe(true);
      expect(antinodes('open', p, value(ex))).toBe(p.n + 1);
    }
  });

  it('気柱共鳴: 1 回目（長さ L₁、基本振動）と 2 回目（長さ L₂、3 倍振動）の固有振動数がおんさの振動数に一致', () => {
    for (const ex of sampleExercises(template('resonance-tube'))) {
      const p = ex.sim.params as ResonatorParams;
      const f = ex.given!.f!;
      // 問題文のおんさの振動数は有効数字 3 桁なので 0.5% 以内で一致
      expect(relativeError(frequency(kindOf(ex), p), f)).toBeLessThan(5e-3);
      expect(relativeError(frequency('closed', { ...p, L: ex.given!.L2!, n: 2 }), f)).toBeLessThan(
        5e-3,
      );
      // 正解の音速は、閉管の基本振動の式 V = 4(L₁ + Δx) f とも一致する
      expect(relativeError(value(ex), 4 * (p.L + p.dx) * f)).toBeLessThan(1e-9);
    }
  });
});
