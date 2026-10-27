import { describe, expect, it } from 'vitest';
import { integrateOde } from './integrators';
import { ellipticK } from './special';

describe('ellipticK', () => {
  it('K(0) = π/2', () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 15);
  });

  it('既知の値 K(1/√2) = Γ(1/4)² / (4√π) = 1.854074677301372…', () => {
    expect(ellipticK(Math.SQRT1_2)).toBeCloseTo(1.854_074_677_301_372, 13);
  });

  it('定義の積分を数値積分（RK4）した値と一致する', () => {
    for (const k of [0.1, 0.5, 0.9, 0.99]) {
      const integral = integrateOde((phi) => [1 / Math.sqrt(1 - k * k * Math.sin(phi) ** 2)], [0], {
        t1: Math.PI / 2,
        dt: 1e-4,
      })[0]!;
      expect(ellipticK(k)).toBeCloseTo(integral, 9);
    }
  });

  it('範囲外の母数は例外', () => {
    expect(() => ellipticK(1)).toThrow(RangeError);
    expect(() => ellipticK(-0.1)).toThrow(RangeError);
  });
});
