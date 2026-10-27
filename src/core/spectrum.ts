/**
 * 光の波長と色の対応（UI に依存しない）。
 *
 * スペクトル線や光線の色は「物理量の色」ではなく、波長そのものが決める色なので、
 * テーマのトークンではなくこの関数で求める（可視光の範囲外は null）。
 */

/** 可視光の波長の範囲 [nm]（教科書の「約 380 nm 〜 約 770 nm」） */
export const VISIBLE_MIN_NM = 380;
export const VISIBLE_MAX_NM = 770;

export type LightBand = '紫外線' | '可視光' | '赤外線';

export function lightBand(nm: number): LightBand {
  if (nm < VISIBLE_MIN_NM) return '紫外線';
  if (nm > VISIBLE_MAX_NM) return '赤外線';
  return '可視光';
}

/**
 * 波長 [nm] の光の見た目の色（sRGB 0〜255）。可視光でなければ null。
 * 区分線形の近似（Bruton による）で、可視域の両端は暗くなる。
 */
export function wavelengthToRgb(nm: number): { r: number; g: number; b: number } | null {
  if (!(nm >= VISIBLE_MIN_NM && nm <= VISIBLE_MAX_NM)) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) {
    r = (440 - nm) / (440 - 380);
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = (510 - nm) / (510 - 490);
  } else if (nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = (645 - nm) / (645 - 580);
  } else {
    r = 1;
  }
  // 目の感度が落ちる両端を暗くする
  const edge =
    nm < 420 ? 0.4 + (0.6 * (nm - 380)) / 40 : nm > 700 ? 0.4 + (0.6 * (770 - nm)) / 70 : 1;
  const to255 = (c: number) => Math.round(255 * (c * edge) ** 0.8);
  return { r: to255(r), g: to255(g), b: to255(b) };
}

/** 可視光なら CSS の色文字列（'rgb(…)'）、そうでなければ null */
export function wavelengthCss(nm: number, alpha = 1): string | null {
  const c = wavelengthToRgb(nm);
  if (!c) return null;
  return alpha >= 1 ? `rgb(${c.r} ${c.g} ${c.b})` : `rgb(${c.r} ${c.g} ${c.b} / ${alpha})`;
}
