/**
 * 数値の表示用フォーマット。負号は U+2212（−）を使い、桁ぞろえは CSS の tabular-nums で行う。
 */

const MINUS = '−';

/** 小数点以下 digits 桁で表示。-0 は 0 にする */
export function formatFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  const s = value.toFixed(digits);
  if (/^-0(\.0*)?$/.test(s)) return s.slice(1);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/**
 * 大きさに応じて固定小数点か指数表記を選ぶ（有効数字 sig 桁）。
 * 1e-3 ≤ |v| < 1e5 は固定小数点、それ以外は「1.23×10⁻⁴」形式。
 */
export function formatSig(value: number, sig = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e5) {
    const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(abs)));
    return formatFixed(value, digits);
  }
  const exp = Math.floor(Math.log10(abs));
  const mantissa = value / 10 ** exp;
  return `${formatFixed(mantissa, sig - 1)}×10${toSuperscript(exp)}`;
}

/** 10 のべき乗の表記（例: -16 → '10⁻¹⁶'）。グラフの軸の単位「×10⁻¹⁶ Pa」などに使う */
export function powerOfTen(exp: number): string {
  return `10${toSuperscript(exp)}`;
}

const SUPERSCRIPTS: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function toSuperscript(n: number): string {
  return [...String(n)].map((c) => SUPERSCRIPTS[c] ?? c).join('');
}

/** スライダーの刻み幅から表示桁数を決める（0.01 → 2, 0.5 → 1, 1 → 0） */
export function digitsForStep(step: number): number {
  if (step >= 1) return 0;
  return Math.min(6, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
}
