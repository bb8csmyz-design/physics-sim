/**
 * ヤングの実験と回折格子のモデルの物理的な正しさのテスト。
 * 各スリットからの光を（遠方の近似をせずに）重ね合わせて時間平均した強さを数値的に求め、
 * その明線の位置が x = mLλ/(nd)（ヤング）や d sin θ = mλ（回折格子）と一致することを、
 * パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  DT,
  GRATING_PARAMS,
  YOUNG_PARAMS,
  brightFringePosition,
  diffractionAngle,
  fringeSpacing,
  gratingConfig,
  initialState,
  intensity,
  maxOrder,
  mediumWavelength,
  pathDifference,
  step,
  superposedIntensity,
  youngBrightPosition,
  youngConfig,
  youngDarkPosition,
  type SlitConfig,
} from './model';

const YOUNG_DEFAULT = youngConfig(defaultParams(YOUNG_PARAMS));
const GRATING_DEFAULT = gratingConfig(defaultParams(GRATING_PARAMS));
const YOUNG_CORNERS = paramCorners(YOUNG_PARAMS).map(youngConfig);
const GRATING_CORNERS = paramCorners(GRATING_PARAMS).map(gratingConfig);

/** [lo, hi] で f が最大になる x を黄金分割探索で求める */
function argmax(f: (x: number) => number, lo: number, hi: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 100; i++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (f(m1) > f(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

describe('ヤングの実験', () => {
  it('入試の典型例: λ = 600 nm, d = 0.50 mm, L = 2.0 m → Δx = 2.4 mm', () => {
    expect(fringeSpacing(YOUNG_DEFAULT) * 1e3).toBeCloseTo(2.4, 12);
    expect(youngBrightPosition(YOUNG_DEFAULT, 1) * 1e3).toBeCloseTo(2.4, 12);
    expect(youngDarkPosition(YOUNG_DEFAULT, 0) * 1e3).toBeCloseTo(1.2, 12);
  });

  it('水中（n = 1.33）に入れると、明線の間隔は 1/1.33 倍になる', () => {
    const water = { ...YOUNG_DEFAULT, n: 1.33 };
    expect(fringeSpacing(water) / fringeSpacing(YOUNG_DEFAULT)).toBeCloseTo(1 / 1.33, 12);
    expect(mediumWavelength(water)).toBeCloseTo(600e-9 / 1.33, 20);
  });

  it('重ね合わせで数値的に求めた明線の位置が x_m = mLλ/(nd) と一致する（全隅、m = 1〜3）', () => {
    for (const c of YOUNG_CORNERS) {
      const dx = fringeSpacing(c);
      for (const m of [1, 2, 3]) {
        const xm = youngBrightPosition(c, m);
        const found = argmax((x) => superposedIntensity(c, x), xm - dx / 4, xm + dx / 4);
        // 近似式は θ が小さく、L ≫ d のときの式。実際の明線（2 点からの距離の差が一定の双曲線上）とは
        // 相対的に (x/L)²/2 と (d/L)²/8 程度ずれる（θ ≤ 0.03 rad、d/L ≤ 2e-3 で 1e-3 以下）
        const tol = 2 * (xm / c.L) ** 2 + (c.d / c.L) ** 2 / 4 + 1e-9;
        expect(relativeError(found, xm), JSON.stringify(c)).toBeLessThan(tol);
        expect(superposedIntensity(c, found)).toBeCloseTo(1, 6);
      }
    }
  });

  it('暗線（経路差が半波長の奇数倍）では光の強さがほぼ 0、中央（経路差 0）では最大', () => {
    for (const c of YOUNG_CORNERS) {
      expect(superposedIntensity(c, 0)).toBeCloseTo(1, 12);
      for (const m of [0, 1, 2]) {
        const xd = youngDarkPosition(c, m);
        // 近似式の位置で評価するので、位置のずれ (x/L)²·x に応じてわずかに 0 からずれる
        expect(superposedIntensity(c, xd), JSON.stringify(c)).toBeLessThan(1e-4);
      }
    }
  });

  it('2 本のスリットの重ね合わせは公式 cos²(πd sinθ/λ′) と一致する', () => {
    for (const c of YOUNG_CORNERS.filter((_, i) => i % 5 === 0)) {
      for (const x of [0.1, 0.37, 1.6, 2.9].map((k) => k * fringeSpacing(c))) {
        const formula = Math.cos((Math.PI * pathDifference(c, x)) / mediumWavelength(c)) ** 2;
        expect(intensity(c, x)).toBeCloseTo(formula, 12);
        // 遠方の近似（d sin θ）をしない数値計算との差は (d/L)·(x/L) 程度の位相のずれによる
        expect(Math.abs(superposedIntensity(c, x) - formula)).toBeLessThan(2e-3);
      }
    }
  });
});

describe('回折格子', () => {
  it('入試の典型例: 500 本/mm, λ = 600 nm → d = 2 μm, sin θ₁ = 0.3, 最大 3 次まで', () => {
    const c = { ...GRATING_DEFAULT, lambda: 600e-9 };
    expect(c.d).toBeCloseTo(2e-6, 18);
    expect(Math.sin(diffractionAngle(c, 1))).toBeCloseTo(0.3, 12);
    expect(maxOrder(c)).toBe(3);
    expect(diffractionAngle(c, 4)).toBeNaN();
  });

  it('d/λ がちょうど整数でも、θ = 90° の次数は数えない', () => {
    const c = { ...GRATING_DEFAULT, lambda: 500e-9, d: 2e-6 };
    expect(maxOrder(c)).toBe(3);
  });

  it('重ね合わせで数値的に求めた明線の位置が L tan θ_m（d sin θ_m = mλ）と一致する（全隅、全次数）', () => {
    for (const c of GRATING_CORNERS) {
      for (let m = 1; m <= Math.min(maxOrder(c), 4); m++) {
        const xm = brightFringePosition(c, m);
        // 主極大の幅は L·λ/(N d cos²θ) 程度。その 1/3 の範囲で探す
        const th = diffractionAngle(c, m);
        const half = (c.L * c.lambda) / (3 * c.N * c.d * Math.cos(th) ** 2);
        const found = argmax((x) => superposedIntensity(c, x), xm - half, xm + half);
        // 格子の幅 (N d) は L に比べて十分小さく、遠方の近似による位置のずれは無視できる
        expect(relativeError(found, xm), JSON.stringify({ c, m })).toBeLessThan(1e-6);
        // 公式は遠方（フラウンホーファー）の極限。格子の幅 Nd が L に比べて大きいと、スリットごとの
        // 位相に 2 次のずれ α = π(Nd/2)²/(λL) が残り、明線の強さが最大で (4/45)α² ほど下がる
        const alpha = (Math.PI * (c.N * c.d) ** 2) / (4 * mediumWavelength(c) * c.L);
        expect(superposedIntensity(c, found)).toBeGreaterThan(1 - (4 / 45) * alpha ** 2 - 1e-9);
      }
    }
  });

  it('主極大の間には N − 1 個の暗点と N − 2 個の副極大がある（明線は N が大きいほど鋭い）', () => {
    for (const N of [2, 3, 5, 10, 30]) {
      const c = { ...GRATING_DEFAULT, N };
      // 0 次と 1 次の主極大の間を細かく調べる
      const x1 = brightFringePosition(c, 1);
      const K = 20000;
      const I = Array.from({ length: K + 1 }, (_, i) => intensity(c, (x1 * i) / K));
      let minima = 0;
      let maxima = 0;
      for (let i = 1; i < K; i++) {
        if (I[i]! < I[i - 1]! && I[i]! <= I[i + 1]!) minima++;
        if (I[i]! > I[i - 1]! && I[i]! >= I[i + 1]!) maxima++;
      }
      expect(minima, `N = ${N}`).toBe(N - 1);
      expect(maxima, `N = ${N}`).toBe(N - 2);
    }
  });

  it('エネルギー: 位相 φ について 1 周期平均した強さは 1/N（光は明線に集まるだけで、総量は変わらない）', () => {
    for (const N of [2, 4, 10, 30]) {
      const c = { ...GRATING_DEFAULT, N };
      const K = 100000;
      let sum = 0;
      // φ = 2π d sinθ / λ を 0〜2π で一様に動かすため、sinθ を 0〜λ/d で動かす
      for (let i = 0; i < K; i++) {
        const s = ((i + 0.5) / K) * (c.lambda / c.d);
        const x = c.L * Math.tan(Math.asin(s));
        sum += intensity(c, x);
      }
      expect(sum / K).toBeCloseTo(1 / N, 6);
    }
  });

  /** フレネル数 F = (Nd)²/(λL)。0 に近いほど遠方の公式がよく成り立つ */
  const fresnelNumber = (c: SlitConfig) => (c.N * c.d) ** 2 / (mediumWavelength(c) * c.L);
  const maxDiff = (c: SlitConfig) =>
    Math.max(
      ...[0.013, 0.071, 0.2, 0.33].map((k) =>
        Math.abs(superposedIntensity(c, k * c.L) - intensity(c, k * c.L)),
      ),
    );

  it('全隅で、公式による強さと重ね合わせの数値計算が一致する（差はフレネル数の 1% 以下）', () => {
    for (const c of GRATING_CORNERS) {
      expect(maxDiff(c), JSON.stringify(c)).toBeLessThan(0.01 * fresnelNumber(c) + 1e-9);
    }
  });

  it('スクリーンを遠ざけるほど、重ね合わせの結果は遠方の公式に近づく', () => {
    const c = { ...GRATING_DEFAULT, N: 30, d: 1e-5, lambda: 780e-9, L: 0.5 };
    const diffs = [0.5, 5, 50].map((L) => maxDiff({ ...c, L }));
    expect(diffs[1]!).toBeLessThan(diffs[0]! / 5);
    expect(diffs[2]!).toBeLessThan(diffs[1]! / 5);
  });
});

describe('時間発展と数値計算の設定', () => {
  it('1 周期を 100 ステップで進め、1 周期後に同じ状態（位相）に戻る', () => {
    let s = initialState();
    for (let i = 0; i < Math.round(1 / DT); i++) s = step(s, DT);
    expect(s.tau).toBeCloseTo(1, 12);
  });

  it('時間平均の標本数 16 は、2 乗の時間平均を厳密に求めるのに十分（3 以上で厳密）', () => {
    const c: SlitConfig = { ...GRATING_DEFAULT, N: 7 };
    for (const x of [0.05, 0.4]) {
      expect(superposedIntensity(c, x, 16)).toBeCloseTo(superposedIntensity(c, x, 1000), 12);
    }
  });

  it('パラメータ範囲で、ヤングの実験の明線は目で見分けられる間隔（0.1 mm 以上）、回折格子は 1 次以上が現れる', () => {
    for (const c of YOUNG_CORNERS) expect(fringeSpacing(c)).toBeGreaterThan(0.1e-3);
    for (const c of GRATING_CORNERS) expect(maxOrder(c)).toBeGreaterThanOrEqual(1);
  });
});
