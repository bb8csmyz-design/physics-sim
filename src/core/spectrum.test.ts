import { describe, expect, it } from 'vitest';
import { lightBand, wavelengthCss, wavelengthToRgb } from './spectrum';

describe('波長と色', () => {
  it('可視光の範囲外は色なし', () => {
    expect(wavelengthToRgb(300)).toBeNull();
    expect(wavelengthToRgb(900)).toBeNull();
    expect(wavelengthCss(250)).toBeNull();
    expect(lightBand(300)).toBe('紫外線');
    expect(lightBand(550)).toBe('可視光');
    expect(lightBand(1000)).toBe('赤外線');
  });

  it('赤・緑・青の代表的な波長で、その成分が最も強い', () => {
    const red = wavelengthToRgb(656)!;
    const green = wavelengthToRgb(530)!;
    const blue = wavelengthToRgb(460)!;
    expect(red.r).toBeGreaterThan(red.g);
    expect(red.r).toBeGreaterThan(red.b);
    expect(green.g).toBeGreaterThan(green.b);
    expect(blue.b).toBeGreaterThan(blue.r);
    expect(blue.b).toBeGreaterThan(blue.g);
  });

  it('成分は 0〜255 の整数', () => {
    for (let nm = 380; nm <= 770; nm += 5) {
      const c = wavelengthToRgb(nm)!;
      for (const v of [c.r, c.g, c.b]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v >= 0 && v <= 255).toBe(true);
      }
    }
  });
});
