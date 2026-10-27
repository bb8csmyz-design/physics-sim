import { describe, expect, it } from 'vitest';
import { digitsForStep, formatFixed, formatSig, powerOfTen } from './format';

describe('format', () => {
  it('formatFixed: 負号は U+2212、-0 は 0', () => {
    expect(formatFixed(-1.234, 2)).toBe('−1.23');
    expect(formatFixed(-0.0001, 2)).toBe('0.00');
    expect(formatFixed(3, 1)).toBe('3.0');
  });

  it('formatSig: 大きさに応じて表記を切り替える', () => {
    expect(formatSig(1.2345)).toBe('1.23');
    expect(formatSig(123.45)).toBe('123');
    expect(formatSig(0.012345)).toBe('0.0123');
    expect(formatSig(1.602e-19)).toBe('1.60×10⁻¹⁹');
    expect(formatSig(0)).toBe('0');
  });

  it('formatSig: 丸めで桁が上がっても有効数字の桁数を保つ', () => {
    expect(formatSig(9.996)).toBe('10.0');
    expect(formatSig(-99.96)).toBe('−100');
    expect(formatSig(0.0009996)).toBe('0.00100');
    expect(formatSig(99999.6)).toBe('1.00×10⁵');
    expect(formatSig(9.9996e-5)).toBe('1.00×10⁻⁴');
  });

  it('digitsForStep', () => {
    expect(digitsForStep(1)).toBe(0);
    expect(digitsForStep(0.5)).toBe(1);
    expect(digitsForStep(0.1)).toBe(1);
    expect(digitsForStep(0.01)).toBe(2);
    expect(digitsForStep(0.05)).toBe(2);
  });
});

describe('powerOfTen', () => {
  it('指数を上付き文字にする', () => {
    expect(powerOfTen(-16)).toBe('10⁻¹⁶');
    expect(powerOfTen(5)).toBe('10⁵');
  });
});
