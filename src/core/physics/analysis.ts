/**
 * シミュレーション結果の検証・解析用ヘルパー。主にテストで使う。
 */

/** 相対誤差 |actual - expected| / |expected|（expected = 0 のときは絶対誤差） */
export function relativeError(actual: number, expected: number): number {
  const diff = Math.abs(actual - expected);
  return expected === 0 ? diff : diff / Math.abs(expected);
}

/**
 * 刻み幅 h と誤差 e の組から収束次数 p（e ∝ h^p）を最小二乗で推定する。
 * h を半分ずつにした列などを渡す。
 */
export function convergenceOrder(hs: readonly number[], errors: readonly number[]): number {
  if (hs.length !== errors.length || hs.length < 2) {
    throw new RangeError('hs と errors は同じ長さ（2 以上）であること');
  }
  const lx = hs.map(Math.log);
  const ly = errors.map(Math.log);
  const n = lx.length;
  const mx = lx.reduce((s, v) => s + v, 0) / n;
  const my = ly.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (lx[i]! - mx) * (ly[i]! - my);
    den += (lx[i]! - mx) ** 2;
  }
  return num / den;
}

/**
 * 時系列 (ts, ys) が負→正に横切る時刻を線形補間で求める（上向きゼロ交差）。
 */
export function upwardZeroCrossings(ts: readonly number[], ys: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < ys.length; i++) {
    const y0 = ys[i - 1]!;
    const y1 = ys[i]!;
    if (y0 < 0 && y1 >= 0) {
      const t0 = ts[i - 1]!;
      const t1 = ts[i]!;
      out.push(t0 + ((t1 - t0) * -y0) / (y1 - y0));
    }
  }
  return out;
}

/** 上向きゼロ交差の間隔の平均から周期を推定する。交差が 2 回未満なら NaN */
export function estimatePeriod(ts: readonly number[], ys: readonly number[]): number {
  const c = upwardZeroCrossings(ts, ys);
  if (c.length < 2) return NaN;
  return (c[c.length - 1]! - c[0]!) / (c.length - 1);
}
