import { describe, expect, it } from 'vitest';
import { mixRgb, parseColor } from './color';

describe('color', () => {
  it('parseColor: 16 進と rgb() を解析する', () => {
    expect(parseColor('#2563eb')).toEqual([0x25, 0x63, 0xeb]);
    expect(parseColor(' #fff ')).toEqual([255, 255, 255]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColor('rgb(10 20 30)')).toEqual([10, 20, 30]);
    expect(() => parseColor('blue')).toThrow();
  });

  it('mixRgb: 端点と中点', () => {
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0)).toEqual([0, 0, 0]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 1)).toEqual([200, 100, 50]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0.5)).toEqual([100, 50, 25]);
  });
});
