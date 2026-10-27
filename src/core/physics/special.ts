/**
 * 特殊関数（解析解・公式の厳密値の計算用）。
 */

/**
 * 第 1 種完全楕円積分 K(k) = ∫₀^{π/2} dφ / √(1 − k² sin²φ)（k は母数, 0 ≤ k < 1）。
 * 算術幾何平均（AGM）による: K(k) = π / (2 AGM(1, √(1 − k²)))。
 * 単振り子の厳密な周期 T = 4√(L/g) K(sin(θ₀/2)) に使う。
 */
export function ellipticK(k: number): number {
  if (!(k >= 0 && k < 1)) throw new RangeError('ellipticK: 0 ≤ k < 1 であること');
  let a = 1;
  let b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 30 && Math.abs(a - b) > 1e-15 * a; i++) {
    [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  }
  return Math.PI / (2 * a);
}
