/**
 * 弦と気柱の固有振動（定常波）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 弦（管）の左端を原点とし、右向きを正とする x 軸（0 ≤ x ≤ L）。
 *   - 弦（両端固定）: x = 0, L が固定端（変位の節）
 *   - 開管（両端が開いている）: 両端の外側 Δx の位置 x = −Δx, L + Δx が変位の腹（開口端補正）
 *   - 閉管（左端が閉じている）: x = 0 が閉口端（変位の節）、x = L + Δx が変位の腹
 * 気柱の空気の変位（縦波）は、教科書と同じく横波のように縦軸にとって表す（右向きの変位を上向きに描く）。
 *
 * 定常波は「右へ進む波（入射波）」と「左へ進む波（反射波）」の重ね合わせで、
 *   y(x, t) = Y(x) cos ωt,  Y(x) = sin kx（節が x = 0）または cos k(x + Δx)（腹が x = −Δx）
 * 振幅は腹で 1 とした相対値。端の条件（節・腹）を満たす k だけが許され、固有振動数が決まる。
 * 時間発展は解析解そのもの（状態は時刻だけ）。
 */
import type { ParamSpec, ParamValues } from '@/core/params';

export type ResonatorKind = 'string' | 'open' | 'closed';
export type ResonatorParamKey = 'L' | 'v' | 'n' | 'dx' | 'xr';
export type ResonatorParams = ParamValues<ResonatorParamKey>;

export const KINDS: readonly ResonatorKind[] = ['string', 'open', 'closed'];

export const PARAMS: readonly ParamSpec<ResonatorParamKey>[] = [
  {
    key: 'L',
    label: '弦・気柱の長さ',
    symbol: 'L',
    unit: 'm',
    min: 0.3,
    max: 1,
    step: 0.01,
    default: 0.6,
  },
  {
    key: 'v',
    label: '波の速さ',
    symbol: 'v',
    unit: 'm/s',
    min: 100,
    max: 400,
    step: 10,
    default: 340,
    hint: '気柱では音速。弦では張力 S と線密度 ρ から v = √(S/ρ)',
  },
  {
    key: 'n',
    label: '振動の番号',
    symbol: 'n',
    min: 1,
    max: 5,
    step: 1,
    default: 1,
    hint: 'n = 1 が基本振動。閉管では n 番目の固有振動（基本振動の 2n − 1 倍）',
  },
  {
    key: 'dx',
    label: '開口端補正',
    symbol: 'Δx',
    unit: 'm',
    min: 0,
    max: 0.03,
    step: 0.001,
    default: 0,
    hint: '気柱の腹は管口より Δx だけ外側にできる（弦では使わない）',
  },
  {
    key: 'xr',
    label: '観測点の位置',
    symbol: 'x/L',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.25,
    hint: '左端からの距離を長さ L に対する割合で表す',
  },
];

/**
 * 物理ステップの刻み幅 [s]。最大の振動数（約 3300 Hz）でも 1 周期を 150 ステップ以上で進める。
 * 画面はスロー再生にする（index.ts で振動数に合わせて timeScale を変える）。
 */
export const DT = 2e-6;

export interface ResonatorState {
  t: number;
}

export function initialState(): ResonatorState {
  return { t: 0 };
}

export function step(s: ResonatorState, dt: number): ResonatorState {
  return { t: s.t + dt };
}

/** 端の補正 Δx（弦では 0） */
function endCorrection(kind: ResonatorKind, p: ResonatorParams): number {
  return kind === 'string' ? 0 : p.dx;
}

/** 定常波の範囲 [左端の位置, 右端の位置]（気柱の開口端は管口から Δx 外側） */
export function effectiveSpan(kind: ResonatorKind, p: ResonatorParams): [number, number] {
  const d = endCorrection(kind, p);
  if (kind === 'open') return [-d, p.L + d];
  if (kind === 'closed') return [0, p.L + d];
  return [0, p.L];
}

/** 基本振動の何倍の振動か（弦・開管は n、閉管は 2n − 1） */
export function harmonic(kind: ResonatorKind, p: ResonatorParams): number {
  return kind === 'closed' ? 2 * p.n - 1 : p.n;
}

/**
 * 固有振動の波長 λ [m]。
 *   弦: λ = 2L/n,  開管: λ = 2(L + 2Δx)/n,  閉管: λ = 4(L + Δx)/(2n − 1)
 */
export function wavelength(kind: ResonatorKind, p: ResonatorParams): number {
  const [a, b] = effectiveSpan(kind, p);
  const len = b - a;
  return kind === 'closed' ? (4 * len) / harmonic(kind, p) : (2 * len) / harmonic(kind, p);
}

/** 固有振動数 f = v/λ [Hz] */
export function frequency(kind: ResonatorKind, p: ResonatorParams): number {
  return p.v / wavelength(kind, p);
}

/** 基本振動数 f₁ [Hz] */
export function fundamentalFrequency(kind: ResonatorKind, p: ResonatorParams): number {
  return frequency(kind, { ...p, n: 1 });
}

/** 波数 k = 2π/λ [rad/m] */
export function waveNumber(kind: ResonatorKind, p: ResonatorParams): number {
  return (2 * Math.PI) / wavelength(kind, p);
}

/** 定常波の形 Y(x)（腹で ±1）。弦・閉管は左端が節、開管は左の腹（x = −Δx）から測る */
export function modeShape(kind: ResonatorKind, p: ResonatorParams, x: number): number {
  const k = waveNumber(kind, p);
  if (kind === 'open') return Math.cos(k * (x + endCorrection(kind, p)));
  return Math.sin(k * x);
}

/** dY/dx / k（気柱では、空気の密度変化（圧力変化）が −dY/dx に比例する） */
function modeSlope(kind: ResonatorKind, p: ResonatorParams, x: number): number {
  const k = waveNumber(kind, p);
  if (kind === 'open') return -Math.sin(k * (x + endCorrection(kind, p)));
  return Math.cos(k * x);
}

/** 変位 y(x, t) = Y(x) cos ωt（腹の振幅を 1 とした相対値） */
export function displacement(
  kind: ResonatorKind,
  p: ResonatorParams,
  x: number,
  t: number,
): number {
  return modeShape(kind, p, x) * Math.cos(2 * Math.PI * frequency(kind, p) * t);
}

/**
 * 空気の密度変化（相対値、最大 ±1）。縦波では、変位の傾きが負のところで空気が押し縮められて密になる:
 *   Δρ/ρ ∝ −∂y/∂x。変位の節で密度変化が最大、変位の腹で 0。
 */
export function densityChange(
  kind: ResonatorKind,
  p: ResonatorParams,
  x: number,
  t: number,
): number {
  return -modeSlope(kind, p, x) * Math.cos(2 * Math.PI * frequency(kind, p) * t);
}

/**
 * 定常波をつくる 2 つの進行波（右向き・左向き）。和が displacement に一致する。
 *   sin kx cos ωt = ½ sin(kx − ωt) + ½ sin(kx + ωt)
 */
export function travelingWaves(
  kind: ResonatorKind,
  p: ResonatorParams,
  x: number,
  t: number,
): { right: number; left: number } {
  const k = waveNumber(kind, p);
  const w = 2 * Math.PI * frequency(kind, p);
  const phase = kind === 'open' ? k * (x + endCorrection(kind, p)) + Math.PI / 2 : k * x;
  return { right: 0.5 * Math.sin(phase - w * t), left: 0.5 * Math.sin(phase + w * t) };
}

/** 変位の節の位置（定常波の範囲内、両端を含む、左から順） */
export function nodePositions(kind: ResonatorKind, p: ResonatorParams): number[] {
  return extremaPositions(kind, p, 'node');
}

/** 変位の腹の位置（定常波の範囲内、両端を含む、左から順） */
export function antinodePositions(kind: ResonatorKind, p: ResonatorParams): number[] {
  return extremaPositions(kind, p, 'antinode');
}

function extremaPositions(
  kind: ResonatorKind,
  p: ResonatorParams,
  which: 'node' | 'antinode',
): number[] {
  const [a, b] = effectiveSpan(kind, p);
  const quarter = wavelength(kind, p) / 4;
  // 左端が節（弦・閉管）なら節は左端から λ/2 おき、腹は λ/4 ずれる。開管は左端が腹
  const leftIsNode = kind !== 'open';
  const offset = (which === 'node') === leftIsNode ? 0 : quarter;
  const out: number[] = [];
  for (let x = a + offset; x <= b + 1e-9 * (b - a); x += 2 * quarter) out.push(Math.min(x, b));
  return out;
}

/** 観測点の位置 x [m] */
export function probePosition(p: ResonatorParams): number {
  return p.xr * p.L;
}
