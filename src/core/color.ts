/**
 * 色文字列の解析（Canvas でピクセル単位の色を計算するときに使う）。
 * 色そのものは tokens.css / getPalette() から受け取り、ここでは RGB に分解するだけ。
 */

export type Rgb = readonly [number, number, number];

/** '#rgb' / '#rrggbb' / 'rgb(r, g, b)' / 'rgb(r g b)' を [r, g, b]（0〜255）にする */
export function parseColor(css: string): Rgb {
  const s = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const v = hex[1]!;
    const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`解析できない色: ${css}`);
}

/** a と b を t : (1 - t) で混ぜる（t = 0 で a、t = 1 で b） */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
