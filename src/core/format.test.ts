import { describe, expect, it } from 'vitest';
import { digitsForStep, formatFixed, formatSig } from './format';

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

  it('digitsForStep', () => {
    expect(digitsForStep(1)).toBe(0);
    expect(digitsForStep(0.5)).toBe(1);
    expect(digitsForStep(0.1)).toBe(1);
    expect(digitsForStep(0.01)).toBe(2);
    expect(digitsForStep(0.05)).toBe(2);
  });
});
