/**
 * 光の屈折と全反射の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 境界面を x 軸（右向き正）、法線を y 軸（上向き正）とし、光が境界面に当たる点を原点とする。
 *   y > 0 が媒質 1（屈折率 n₁、光が来る側）、y < 0 が媒質 2（屈折率 n₂）。
 *   光は左上から入射し、入射角 θ₁ は法線（y 軸）から測る。
 *
 * 光を平面波として扱う（電場は紙面に垂直な s 偏光、入射波の振幅を 1 とする）:
 *   入射波  E = cos(k₁·r − ωt)、反射波 E = Re[r e^{i(k₁′·r − ωt)}]、屈折波 E = Re[t e^{i(k₂·r − ωt)}]
 * 境界面で電場とその法線方向の傾きが連続になる条件から、屈折の法則 n₁ sin θ₁ = n₂ sin θ₂ と
 * フレネルの式（反射・透過の振幅 r, t）が決まる。sin θ₁ > n₂/n₁ では全反射になり、
 * 媒質 2 側の波は境界面から離れると指数関数的に弱まる（エバネッセント波）。
 * 時刻は光の周期 T を単位とする（τ = t/T）。
 */
import { SPEED_OF_LIGHT } from '@/core/physics/constants';
import type { ParamSpec, ParamValues } from '@/core/params';

export type RefractionParamKey = 'n1' | 'n2' | 'theta1' | 'lambda0';
export type RefractionParams = ParamValues<RefractionParamKey>;

export const PARAMS: readonly ParamSpec<RefractionParamKey>[] = [
  {
    key: 'n1',
    label: '媒質 1 の屈折率',
    symbol: 'n_1',
    min: 1,
    max: 2,
    step: 0.01,
    default: 1,
    hint: '空気 1.00、水 1.33、ガラス 1.5 程度、サファイア 1.77（ダイヤモンド 2.42 はこの範囲の外）',
  },
  { key: 'n2', label: '媒質 2 の屈折率', symbol: 'n_2', min: 1, max: 2, step: 0.01, default: 1.5 },
  {
    key: 'theta1',
    label: '入射角',
    symbol: 'θ_1',
    unit: '°',
    min: 0,
    max: 89,
    step: 1,
    default: 40,
  },
  {
    key: 'lambda0',
    label: '真空中の波長',
    symbol: 'λ_0',
    unit: 'nm',
    min: 400,
    max: 700,
    step: 10,
    default: 600,
  },
];

/** 時間の刻み幅（周期 T を単位とする）。1 周期を 100 ステップで進める */
export const DT = 0.01;

export interface RefractionState {
  /** 時刻（周期 T を単位とする） */
  tau: number;
}

export function initialState(): RefractionState {
  return { tau: 0 };
}

export function step(s: RefractionState, dt: number): RefractionState {
  return { tau: s.tau + dt };
}

const DEG = Math.PI / 180;

export function incidenceAngle(p: RefractionParams): number {
  return p.theta1 * DEG;
}

/** 真空中の波長 [m] */
export function vacuumWavelength(p: RefractionParams): number {
  return p.lambda0 * 1e-9;
}

/** 媒質中の波長 λ = λ₀/n [m] */
export function wavelengthIn(p: RefractionParams, medium: 1 | 2): number {
  return vacuumWavelength(p) / (medium === 1 ? p.n1 : p.n2);
}

/** 媒質中の光の速さ v = c/n [m/s] */
export function speedIn(p: RefractionParams, medium: 1 | 2): number {
  return SPEED_OF_LIGHT / (medium === 1 ? p.n1 : p.n2);
}

/** 光の振動数 f = c/λ₀ [Hz]（媒質によらない） */
export function lightFrequency(p: RefractionParams): number {
  return SPEED_OF_LIGHT / vacuumWavelength(p);
}

/** 媒質 1 に対する媒質 2 の屈折率 n₁₂ = n₂/n₁ */
export function relativeIndex(p: RefractionParams): number {
  return p.n2 / p.n1;
}

/** 臨界角 sin θc = n₂/n₁ [rad]。n₁ ≤ n₂ なら全反射は起こらないので NaN */
export function criticalAngle(p: RefractionParams): number {
  return p.n1 > p.n2 ? Math.asin(p.n2 / p.n1) : NaN;
}

export function isTotalReflection(p: RefractionParams): boolean {
  return p.n1 * Math.sin(incidenceAngle(p)) > p.n2;
}

/** 屈折角 θ₂ [rad]（n₁ sin θ₁ = n₂ sin θ₂）。全反射なら NaN */
export function refractionAngle(p: RefractionParams): number {
  if (isTotalReflection(p)) return NaN;
  return Math.asin((p.n1 * Math.sin(incidenceAngle(p))) / p.n2);
}

// --- 複素数（フレネルの式・エバネッセント波に使う） ---
export interface Complex {
  re: number;
  im: number;
}
const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cabs2 = (a: Complex) => a.re * a.re + a.im * a.im;

/**
 * 媒質 2 での n₂ cos θ₂（複素数）。屈折するときは実数、全反射のときは純虚数 i√(n₁² sin²θ₁ − n₂²)
 * （媒質 2 の奥へ向かって減衰する向きを選ぶ）。
 */
function n2cos2(p: RefractionParams): Complex {
  const s = p.n1 * Math.sin(incidenceAngle(p));
  const q = p.n2 * p.n2 - s * s;
  return q >= 0 ? { re: Math.sqrt(q), im: 0 } : { re: 0, im: Math.sqrt(-q) };
}

/** フレネルの式（s 偏光）: 反射の振幅 r と透過の振幅 t（入射波の振幅を 1 とする） */
export function fresnel(p: RefractionParams): { r: Complex; t: Complex } {
  const a: Complex = { re: p.n1 * Math.cos(incidenceAngle(p)), im: 0 };
  const b = n2cos2(p);
  const den = { re: a.re + b.re, im: a.im + b.im };
  return {
    r: cdiv({ re: a.re - b.re, im: a.im - b.im }, den),
    t: cdiv({ re: 2 * a.re, im: 0 }, den),
  };
}

/** 反射率 R = |r|²（入射光のエネルギーのうち反射される割合） */
export function reflectance(p: RefractionParams): number {
  return cabs2(fresnel(p).r);
}

/** 透過率 T = (n₂ cos θ₂)/(n₁ cos θ₁)·|t|²（全反射のときは 0） */
export function transmittance(p: RefractionParams): number {
  const b = n2cos2(p);
  return (b.re / (p.n1 * Math.cos(incidenceAngle(p)))) * cabs2(fresnel(p).t);
}

/**
 * 点 (x, y) [m]、時刻 τ（周期単位）での電場（入射波の振幅を 1 とする）。
 * parts で入射波・反射波だけを取り出せる。
 */
export function electricField(
  p: RefractionParams,
  x: number,
  y: number,
  tau: number,
  parts: 'all' | 'incident' | 'reflected' = 'all',
): number {
  const k0 = (2 * Math.PI) / vacuumWavelength(p);
  const wt = 2 * Math.PI * tau;
  const th = incidenceAngle(p);
  const kx = p.n1 * k0 * Math.sin(th);
  const ky1 = p.n1 * k0 * Math.cos(th);
  const { r, t } = fresnel(p);
  if (y >= 0) {
    // 入射波は下向き（k_y = −k₁ cos θ₁）、反射波は上向き
    const inc = Math.cos(kx * x - ky1 * y - wt);
    if (parts === 'incident') return inc;
    const ph = kx * x + ky1 * y - wt;
    const ref = r.re * Math.cos(ph) - r.im * Math.sin(ph);
    return parts === 'reflected' ? ref : inc + ref;
  }
  if (parts !== 'all') return 0;
  // 媒質 2: e^{i(kx x − k₀ n₂cosθ₂ y − ωt)}。全反射では n₂cosθ₂ = iκ/k₀ → e^{κy}（y < 0 で減衰）
  const b = n2cos2(p);
  const amp = Math.exp(k0 * b.im * y);
  const ph = kx * x - k0 * b.re * y - wt;
  const c = cmul(t, { re: Math.cos(ph), im: Math.sin(ph) });
  return amp * c.re;
}

/**
 * フェルマーの原理（検証用）: 点 A(媒質 1) から点 B(媒質 2) へ行く光の道すじのうち、
 * 光学距離 n₁·AP + n₂·PB が最小になる境界面上の点 P の x 座標を黄金分割探索で求める。
 */
export function fermatCrossing(
  p: Pick<RefractionParams, 'n1' | 'n2'>,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const opl = (x: number) => p.n1 * Math.hypot(x - a.x, a.y) + p.n2 * Math.hypot(b.x - x, b.y);
  let lo = Math.min(a.x, b.x);
  let hi = Math.max(a.x, b.x);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 200; i++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (opl(m1) < opl(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}
