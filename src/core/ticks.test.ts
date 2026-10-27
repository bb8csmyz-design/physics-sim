import { describe, expect, it } from 'vitest';
import { niceBounds, niceStep, niceTicks } from './ticks';

describe('ticks', () => {
  it('niceStep は 1, 2, 5 × 10ⁿ を返す', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(1, 5)).toBeCloseTo(0.2);
    expect(niceStep(7, 5)).toBe(2);
    expect(niceStep(30, 5)).toBe(10);
    expect(niceStep(0.03, 5)).toBeCloseTo(0.01);
  });

  it('niceTicks は範囲内の目盛りを返し、0 は正確に 0', () => {
    expect(niceTicks(-1, 1, 4)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('niceBounds は外側に広げる', () => {
    expect(niceBounds(-0.37, 0.41)).toEqual([-0.4, 0.6]);
    expect(niceTicks(0, 0.6, 3)).toEqual([0, 0.2, 0.4, 0.6]);
    const [lo, hi] = niceBounds(3, 3);
    expect(lo).toBeLessThan(3);
    expect(hi).toBeGreaterThan(3);
  });
});
