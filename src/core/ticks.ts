/** グラフ軸の「きりのよい」目盛りを計算する（1, 2, 5 × 10ⁿ 刻み）。 */

export function niceStep(range: number, targetCount: number): number {
  if (!(range > 0)) return 1;
  const raw = range / Math.max(1, targetCount);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** [min, max] を含む目盛り値の列 */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
  const step = niceStep(max - min, targetCount);
  const k0 = Math.ceil(min / step - 1e-9);
  const k1 = Math.floor(max / step + 1e-9);
  const ticks: number[] = [];
  for (let k = k0; k <= k1; k++) ticks.push(clean(k * step, step));
  return ticks;
}

/** 浮動小数点の端数（0.6000000000000001 など）を目盛り刻みに合わせて丸める */
function clean(v: number, step: number): number {
  const d = tickDigits(step) + 2;
  const r = Number(v.toFixed(Math.min(d, 20)));
  return r === 0 ? 0 : r;
}

/** [min, max] をきりのよい値まで外側に広げる */
export function niceBounds(min: number, max: number, targetCount = 5): [number, number] {
  if (min === max) {
    const d = min === 0 ? 1 : Math.abs(min) * 0.5;
    return niceBounds(min - d, max + d, targetCount);
  }
  const step = niceStep(max - min, targetCount);
  return [
    clean(Math.floor(min / step + 1e-9) * step, step),
    clean(Math.ceil(max / step - 1e-9) * step, step),
  ];
}

/** 目盛り刻みに見合う小数桁数 */
export function tickDigits(step: number): number {
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}
