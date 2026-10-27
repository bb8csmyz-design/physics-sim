import { describe, expect, it } from 'vitest';
import {
  choice,
  formatAnswerValue,
  generateExercise,
  grade,
  isNumericCorrect,
  num,
  numeric,
  parseAnswer,
  pickInt,
  pickOne,
  pickStep,
  roundTo,
  shuffle,
  sig,
  type ExerciseTemplate,
} from './exercise';
import { Rng, seedRng } from './random';

describe('解答の読み取り', () => {
  it.each([
    ['1.5', 1.5],
    ['-0.25', -0.25],
    ['−0.25', -0.25],
    ['１．５', 1.5],
    ['－２', -2],
    ['.5', 0.5],
    ['1.2e-3', 1.2e-3],
    ['1.2E3', 1200],
    ['1.2×10^-3', 1.2e-3],
    ['1.2x10^3', 1200],
    ['1.2*10^(-3)', 1.2e-3],
    ['1.2×10⁻³', 1.2e-3],
    ['6.0×10¹⁴', 6e14],
    ['3/4', 0.75],
    ['1,200', 1200],
    ['  0.95 m/s ', 0.95],
    ['9.8m/s²', 9.8],
    ['2.0 Ω', 2],
    ['30°', 30],
  ])('%s → %f', (input, expected) => {
    expect(parseAnswer(input)).toBeCloseTo(expected, 12);
  });

  it.each(['', 'abc', '1,5', '2-3', '1/0', '--1', 'e5'])('読めない: "%s"', (input) => {
    expect(parseAnswer(input)).toBeNull();
  });
});

describe('数値の採点', () => {
  it('相対誤差 2% 以内なら正解', () => {
    const a = numeric(0.947, 'm/s');
    expect(isNumericCorrect(a, 0.95)).toBe(true);
    expect(isNumericCorrect(a, 0.93)).toBe(true);
    expect(isNumericCorrect(a, 0.92)).toBe(false);
    expect(isNumericCorrect(a, -0.95)).toBe(false);
  });

  it('有効数字の桁で丸めた値は、丸め誤差が 2% を超えても正解（1.149 → 1.1 は 4.3% ずれる）', () => {
    expect(isNumericCorrect(numeric(1.149), 1.1)).toBe(true);
    expect(isNumericCorrect(numeric(1.149, undefined, { sig: 3 }), 1.1)).toBe(false);
    expect(isNumericCorrect(numeric(1.149, undefined, { sig: 3 }), 1.15)).toBe(true);
  });

  it('正解が 0 のときは 0 だけが正解', () => {
    expect(isNumericCorrect(numeric(0), 0)).toBe(true);
    expect(isNumericCorrect(numeric(0), 0.01)).toBe(false);
  });

  it('grade: 読めない入力は invalid、選択問題は番号で採点', () => {
    expect(grade(numeric(2), '2.0')).toEqual({ status: 'correct' });
    expect(grade(numeric(2), '3')).toEqual({ status: 'wrong' });
    expect(grade(numeric(2), 'にー')).toEqual({ status: 'invalid' });
    const c = { kind: 'choice' as const, options: ['a', 'b'], correct: 1 };
    expect(grade(c, 1)).toEqual({ status: 'correct' });
    expect(grade(c, 0)).toEqual({ status: 'wrong' });
    expect(grade(c, 'b')).toEqual({ status: 'invalid' });
  });

  it('整数の問題はちょうど一致したときだけ正解', () => {
    const a = numeric(3, '本', { integer: true });
    expect(grade(a, '3').status).toBe('correct');
    expect(grade(a, '3.0').status).toBe('correct');
    expect(grade(a, '2.9').status).toBe('wrong');
    expect(formatAnswerValue(a)).toBe('3');
  });

  it('正解の表示は有効数字の桁数で、負号は −', () => {
    expect(formatAnswerValue(numeric(0.947))).toBe('0.95');
    expect(formatAnswerValue(numeric(-12.34, undefined, { sig: 3 }))).toBe('−12.3');
    expect(formatAnswerValue(numeric(6.02e14))).toBe('6.0×10¹⁴');
    expect(formatAnswerValue(numeric(9.96e-7))).toBe('1.0×10⁻⁶');
    expect(formatAnswerValue(numeric(150))).toBe('150');
  });

  it('表示した正解を入力すると必ず正解になる', () => {
    const rng = new Rng(seedRng(3));
    for (let i = 0; i < 2000; i++) {
      const v = (rng.uniform() - 0.5) * 10 ** (rng.uniform() * 30 - 15);
      for (const sig of [2, 3]) {
        const a = numeric(v, undefined, { sig });
        expect(grade(a, formatAnswerValue(a)).status, `${v}`).toBe('correct');
      }
    }
  });
});

describe('問題文の数値', () => {
  it('不要な 0 を省き、極端な値は指数表記', () => {
    expect(num(1.5)).toBe('1.5');
    expect(num(2)).toBe('2');
    expect(num(0.25)).toBe('0.25');
    expect(num(1.5, 2)).toBe('1.50');
    expect(num(6.0e14)).toBe('6 \\times 10^{14}');
    expect(num(1.6e-19, undefined, 2)).toBe('1.6 \\times 10^{-19}');
    expect(num(9.96e-7)).toBe('1 \\times 10^{-6}');
  });
});

describe('解説の計算結果の数値', () => {
  it('有効数字 3 桁（大きな値は指数表記）', () => {
    expect(sig(0.17241)).toBe('0.172');
    expect(sig(-4.1379)).toBe('-4.14');
    expect(sig(2)).toBe('2.00');
    expect(sig(1562.3)).toBe('1.56 \\times 10^{3}');
    expect(sig(6.21e-21)).toBe('6.21 \\times 10^{-21}');
    expect(sig(340.123, 4)).toBe('340.1');
  });
});

describe('出題用の乱数', () => {
  it('pickStep はスライダーの刻みに乗った範囲内の値を返し、両端も出る', () => {
    const rng = new Rng(seedRng(1));
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = pickStep(rng, 0.1, 0.5, 0.1);
      expect(v).toBeGreaterThanOrEqual(0.1);
      expect(v).toBeLessThanOrEqual(0.5);
      expect(v).toBe(roundTo(v, 0.1));
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('roundTo は浮動小数点の端数を消す', () => {
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundTo(3 * 0.05, 0.05)).toBe(0.15);
  });

  it('pickInt / pickOne / shuffle', () => {
    const rng = new Rng(seedRng(2));
    const ints = new Set<number>();
    for (let i = 0; i < 200; i++) ints.add(pickInt(rng, 1, 4));
    expect([...ints].sort()).toEqual([1, 2, 3, 4]);
    expect(['a', 'b']).toContain(pickOne(rng, ['a', 'b']));
    const s = shuffle(rng, [1, 2, 3, 4, 5]);
    expect([...s].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('choice は正解の位置を記録したまま並べ替える', () => {
    const rng = new Rng(seedRng(5));
    const positions = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const c = choice(rng, '正', '誤1', '誤2', '誤3');
      expect(c.options[c.correct]).toBe('正');
      positions.add(c.correct);
    }
    expect(positions.size).toBe(4);
  });

  it('同じシードからは同じ問題ができる', () => {
    const t: ExerciseTemplate = {
      id: 'x',
      title: 'x',
      generate: (rng) => ({
        statement: String(rng.uniform()),
        answer: numeric(1),
        solution: [],
        sim: { params: {}, hint: '' },
      }),
    };
    expect(generateExercise(t, 7).statement).toBe(generateExercise(t, 7).statement);
    expect(generateExercise(t, 7).statement).not.toBe(generateExercise(t, 8).statement);
  });
});
