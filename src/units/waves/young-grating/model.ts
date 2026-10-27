/**
 * ヤングの実験（ダブルスリット）と回折格子の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: スリット面の中心を原点とし、光の進む向きにスクリーンまでの距離 L をとる。
 *   スクリーン上の位置 x は、スリットの中心から垂直に下ろした点（中央の明線）を原点、上向きを正とする。
 *   N 本のスリットは間隔 d で並び、j 番目（j = 0, …, N − 1）のスリットの位置は y_j = (j − (N − 1)/2) d。
 * 各スリットから同位相・同じ振幅の光が出るとして、スクリーン上で重ね合わせる（スリットの幅による
 * 回折の効果（単スリットの包絡線）は無視する）。装置全体を屈折率 n の媒質に入れると、波長は λ/n になる。
 *
 *   隣り合うスリットからの経路差 d sin θ = mλ/n で明線（m = 0, ±1, ±2, …）
 *   ヤングの実験（θ が小さい）: x_m = m L λ / (n d)、明線の間隔 Δx = L λ / (n d)
 *   回折格子: sin θ_m = m λ / d、x_m = L tan θ_m
 * 時刻は光の周期 T を単位とする（τ = t/T）。
 */
import type { ParamSpec, ParamValues } from '@/core/params';

export type SlitMode = 'double' | 'grating';

export type YoungParamKey = 'lambda' | 'd' | 'L' | 'n';
export type YoungParams = ParamValues<YoungParamKey>;
export type GratingParamKey = 'lambda' | 'lines' | 'L' | 'N';
export type GratingParams = ParamValues<GratingParamKey>;

const LAMBDA_SPEC: ParamSpec<'lambda'> = {
  key: 'lambda',
  label: '光の波長（真空中）',
  symbol: 'λ',
  unit: 'nm',
  min: 380,
  max: 780,
  step: 10,
  default: 600,
  hint: '可視光（紫 380 nm 〜 赤 780 nm）',
};

export const YOUNG_PARAMS: readonly ParamSpec<YoungParamKey>[] = [
  LAMBDA_SPEC,
  {
    key: 'd',
    label: 'スリットの間隔',
    symbol: 'd',
    unit: 'mm',
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.5,
  },
  {
    key: 'L',
    label: 'スクリーンまでの距離',
    symbol: 'L',
    unit: 'm',
    min: 0.5,
    max: 3,
    step: 0.1,
    default: 2,
  },
  {
    key: 'n',
    label: '装置を満たす媒質の屈折率',
    symbol: 'n',
    min: 1,
    max: 1.5,
    step: 0.01,
    default: 1,
    hint: '空気 1.00、水 1.33。媒質中では波長が λ/n になる',
  },
];

export const GRATING_PARAMS: readonly ParamSpec<GratingParamKey>[] = [
  LAMBDA_SPEC,
  {
    key: 'lines',
    label: '1 mm あたりの格子の本数',
    unit: '本/mm',
    min: 100,
    max: 1000,
    step: 50,
    default: 500,
    hint: '格子定数（スリットの間隔）d = 1/本数',
  },
  {
    key: 'L',
    label: 'スクリーンまでの距離',
    symbol: 'L',
    unit: 'm',
    min: 0.5,
    max: 2,
    step: 0.1,
    default: 1,
  },
  {
    key: 'N',
    label: '光が当たるスリットの数',
    symbol: 'N',
    min: 2,
    max: 30,
    step: 1,
    default: 10,
    hint: '実際の回折格子では数千本。増やすと明線が鋭くなる（位置は変わらない）',
  },
];

/** 計算に使う装置の値（SI 単位） */
export interface SlitConfig {
  /** 真空中の波長 [m] */
  lambda: number;
  /** スリットの間隔（格子定数）[m] */
  d: number;
  /** スクリーンまでの距離 [m] */
  L: number;
  /** 媒質の屈折率 */
  n: number;
  /** スリットの数 */
  N: number;
}

export function youngConfig(p: YoungParams): SlitConfig {
  return { lambda: p.lambda * 1e-9, d: p.d * 1e-3, L: p.L, n: p.n, N: 2 };
}

export function gratingConfig(p: GratingParams): SlitConfig {
  return { lambda: p.lambda * 1e-9, d: 1e-3 / p.lines, L: p.L, n: 1, N: p.N };
}

/** 時間の刻み幅（周期 T を単位とする） */
export const DT = 0.01;

export interface SlitState {
  tau: number;
}

export function initialState(): SlitState {
  return { tau: 0 };
}

export function step(s: SlitState, dt: number): SlitState {
  return { tau: s.tau + dt };
}

/** 媒質中の波長 λ/n [m] */
export function mediumWavelength(c: SlitConfig): number {
  return c.lambda / c.n;
}

/** j 番目のスリットの位置 y_j [m] */
export function slitPosition(c: SlitConfig, j: number): number {
  return (j - (c.N - 1) / 2) * c.d;
}

/** スクリーン上の点 x を見る角度 θ（tan θ = x/L） */
export function screenAngle(c: SlitConfig, x: number): number {
  return Math.atan2(x, c.L);
}

/** 隣り合うスリットからの経路差（遠方での近似）d sin θ [m] */
export function pathDifference(c: SlitConfig, x: number): number {
  return c.d * Math.sin(screenAngle(c, x));
}

/** m 次の明線の回折角 θ_m（sin θ_m = mλ/(nd)）。|sin| ≥ 1 なら現れないので NaN */
export function diffractionAngle(c: SlitConfig, m: number): number {
  const s = (m * mediumWavelength(c)) / c.d;
  return Math.abs(s) < 1 ? Math.asin(s) : NaN;
}

/** m 次の明線の位置 x_m = L tan θ_m [m]（角度が大きくても使える式） */
export function brightFringePosition(c: SlitConfig, m: number): number {
  return c.L * Math.tan(diffractionAngle(c, m));
}

/** ヤングの実験の近似式（θ が小さいとき）による m 次の明線の位置 x_m = mLλ/(nd) [m] */
export function youngBrightPosition(c: SlitConfig, m: number): number {
  return (m * c.L * mediumWavelength(c)) / c.d;
}

/** ヤングの実験の近似式による暗線の位置 x = (m + ½)Lλ/(nd) [m] */
export function youngDarkPosition(c: SlitConfig, m: number): number {
  return ((m + 0.5) * c.L * mediumWavelength(c)) / c.d;
}

/** 明線の間隔 Δx = Lλ/(nd) [m]（ヤングの実験の近似） */
export function fringeSpacing(c: SlitConfig): number {
  return (c.L * mediumWavelength(c)) / c.d;
}

/** 現れる明線の最大の次数（sin θ < 1 となる最大の m） */
export function maxOrder(c: SlitConfig): number {
  return Math.ceil(c.d / mediumWavelength(c)) - 1;
}

/**
 * スクリーン上の光の強さ（遠方での公式、中央の明線を 1 とする）
 *   I = [sin(Nφ/2) / (N sin(φ/2))]²,  φ = 2π d sin θ / (λ/n)
 * N = 2 では cos²(φ/2)。
 */
export function intensity(c: SlitConfig, x: number): number {
  const phi = (2 * Math.PI * pathDifference(c, x)) / mediumWavelength(c);
  const den = c.N * Math.sin(phi / 2);
  if (Math.abs(den) < 1e-12) return 1;
  return (Math.sin((c.N * phi) / 2) / den) ** 2;
}

/**
 * 重ね合わせによる光の強さ（検証用の数値計算）。各スリットからスクリーン上の点までの距離 r_j を
 * そのまま使い（遠方の近似をしない）、電場 E = Σ cos(k r_j − ωt) の 2 乗を 1 周期で時間平均する。
 * 中央の明線が 1 になるよう 2/N² 倍する。samples は 1 周期の標本数。
 */
export function superposedIntensity(c: SlitConfig, x: number, samples = 16): number {
  const k = (2 * Math.PI) / mediumWavelength(c);
  // 位相は大きな数（k r ≈ 10⁷ rad）になるので、中心からの距離との差で計算して桁落ちを防ぐ
  const r0 = Math.hypot(c.L, x);
  const phases: number[] = [];
  for (let j = 0; j < c.N; j++) {
    const y = slitPosition(c, j);
    // r_j − r₀ = (r_j² − r₀²)/(r_j + r₀) = (y² − 2xy)/(r_j + r₀)
    const rj = Math.hypot(c.L, x - y);
    phases.push((k * (y * y - 2 * x * y)) / (rj + r0));
  }
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const wt = (2 * Math.PI * i) / samples;
    let e = 0;
    for (const ph of phases) e += Math.cos(ph - wt);
    sum += e * e;
  }
  return ((2 / (c.N * c.N)) * sum) / samples;
}
