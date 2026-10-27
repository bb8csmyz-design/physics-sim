import { describe, expect, it } from 'vitest';
import { convergenceOrder, estimatePeriod, relativeError, upwardZeroCrossings } from './analysis';

describe('analysis', () => {
  it('relativeError', () => {
    expect(relativeError(1.01, 1)).toBeCloseTo(0.01, 12);
    expect(relativeError(0.5, 0)).toBe(0.5);
  });

  it('convergenceOrder: e = C h^3 から 3 を推定する', () => {
    const hs = [0.1, 0.05, 0.025];
    expect(
      convergenceOrder(
        hs,
        hs.map((h) => 7 * h ** 3),
      ),
    ).toBeCloseTo(3, 10);
  });

  it('upwardZeroCrossings / estimatePeriod: sin(2πt/T) の周期を求める', () => {
    const T = 1.7;
    const ts = Array.from({ length: 2001 }, (_, i) => i * 0.005);
    const ys = ts.map((t) => Math.sin((2 * Math.PI * t) / T - 0.3));
    expect(upwardZeroCrossings(ts, ys).length).toBeGreaterThanOrEqual(5);
    expect(estimatePeriod(ts, ys)).toBeCloseTo(T, 4);
  });
});
