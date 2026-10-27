import { describe, expect, it } from 'vitest';
import { contourSegments, sampleGrid } from './contour';

const BOUNDS = { xMin: -2, xMax: 2, yMin: -2, yMax: 2 };

describe('contour', () => {
  it('円 x² + y² = 1 の等値線: 線分の端点が円周上にあり、全長が 2π に近い', () => {
    const grid = sampleGrid((x, y) => x * x + y * y, BOUNDS, 80, 80);
    const segs = contourSegments(grid, 1);
    let length = 0;
    for (const s of segs) {
      // 格子間隔 h = 0.05 の線形補間なので、半径の誤差は h²/(8r) 程度
      expect(Math.abs(Math.hypot(s.x0, s.y0) - 1)).toBeLessThan(1e-3);
      expect(Math.abs(Math.hypot(s.x1, s.y1) - 1)).toBeLessThan(1e-3);
      length += Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    }
    // 内接多角形の周長は 2π より少しだけ短い
    expect(length).toBeLessThan(2 * Math.PI);
    expect(length).toBeGreaterThan(2 * Math.PI * 0.999);
  });

  it('1 次関数 f = x + 2y の等値線は直線 x + 2y = level 上にある（誤差なし）', () => {
    const grid = sampleGrid((x, y) => x + 2 * y, BOUNDS, 17, 13);
    const segs = contourSegments(grid, 0.37);
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) {
      expect(s.x0 + 2 * s.y0).toBeCloseTo(0.37, 12);
      expect(s.x1 + 2 * s.y1).toBeCloseTo(0.37, 12);
    }
  });

  it('範囲内に level の値がなければ線分は 0 本', () => {
    const grid = sampleGrid((x, y) => x * x + y * y, BOUNDS, 20, 20);
    expect(contourSegments(grid, -1)).toHaveLength(0);
  });

  it('値が無限大の格子点を含むセルは飛ばす（点電荷の位置など）', () => {
    const grid = sampleGrid((x, y) => 1 / Math.hypot(x, y), BOUNDS, 20, 20);
    const segs = contourSegments(grid, 2);
    for (const s of [...segs]) {
      expect(Number.isFinite(s.x0 + s.y0 + s.x1 + s.y1)).toBe(true);
    }
    expect(segs.length).toBeGreaterThan(0);
  });
});
