import { describe, expect, it } from 'vitest';
import { Rng, nextUniform, seedRng } from './random';

const N = 200_000;

describe('シード付き乱数', () => {
  it('同じシードからは同じ列が得られる（再現性）', () => {
    const a = new Rng(seedRng(42));
    const b = new Rng(seedRng(42));
    for (let i = 0; i < 100; i++) expect(a.uniform()).toBe(b.uniform());
    expect(nextUniform(seedRng(1)).value).not.toBe(nextUniform(seedRng(2)).value);
  });

  it('一様乱数は [0, 1) にあり、平均 1/2・分散 1/12', () => {
    const rng = new Rng(seedRng(1));
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < N; i++) {
      const u = rng.uniform();
      expect(u >= 0 && u < 1).toBe(true);
      sum += u;
      sum2 += u * u;
    }
    const mean = sum / N;
    // 平均の標準誤差は √(1/12/N) ≈ 6.5e-4。5σ で判定する
    expect(Math.abs(mean - 0.5)).toBeLessThan(5 * Math.sqrt(1 / 12 / N));
    expect(Math.abs(sum2 / N - mean * mean - 1 / 12)).toBeLessThan(1e-3);
  });

  it('指数分布の平均が指定値に一致する', () => {
    const rng = new Rng(seedRng(7));
    let sum = 0;
    for (let i = 0; i < N; i++) sum += rng.exponential(3);
    // 指数分布の標準偏差は平均と同じなので、標本平均の標準誤差は 3/√N
    expect(Math.abs(sum / N - 3)).toBeLessThan((5 * 3) / Math.sqrt(N));
  });

  it('ポアソン分布の平均と分散がともに mean に一致する', () => {
    for (const mean of [0.05, 1.5, 12]) {
      const rng = new Rng(seedRng(3));
      let sum = 0;
      let sum2 = 0;
      for (let i = 0; i < N; i++) {
        const k = rng.poisson(mean);
        sum += k;
        sum2 += k * k;
      }
      const m = sum / N;
      expect(Math.abs(m - mean), `mean=${mean}`).toBeLessThan(5 * Math.sqrt(mean / N));
      expect(Math.abs(sum2 / N - m * m - mean) / mean, `mean=${mean}`).toBeLessThan(0.03);
    }
    expect(new Rng(seedRng(1)).poisson(0)).toBe(0);
  });
});
