/**
 * 鉛直ばね振り子の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: つりあいの位置を原点とし、鉛直上向きを正とする x 軸。
 *       ばねが自然長になる位置は x = d（d = mg/k はつりあいの位置でのばねの伸び）。
 *       ばねの伸びは d − x（負なら縮み）。
 * 運動方程式: m a = k(d − x) − mg = −kx  →  a = −ω² x,  ω = √(k/m)
 *   重力は振動の中心をずらすだけで、周期は水平ばねと同じ T = 2π√(m/k)。
 */
import { G_ACCEL } from '@/core/physics/constants';
import { velocityVerletStep } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type VSpringParamKey = 'm' | 'k' | 'x0' | 'v0';
export type VSpringParams = ParamValues<VSpringParamKey>;

export const PARAMS: readonly ParamSpec<VSpringParamKey>[] = [
  { key: 'm', label: '質量', symbol: 'm', unit: 'kg', min: 0.1, max: 1, step: 0.05, default: 0.5 },
  {
    key: 'k',
    label: 'ばね定数',
    symbol: 'k',
    unit: 'N/m',
    min: 10,
    max: 100,
    step: 1,
    default: 20,
  },
  {
    key: 'x0',
    label: '初期変位',
    symbol: 'x_0',
    unit: 'm',
    min: -0.3,
    max: 0.3,
    step: 0.01,
    default: -0.15,
    hint: 'つりあいの位置からのずれ（上向きが正）',
  },
  {
    key: 'v0',
    label: '初速度',
    symbol: 'v_0',
    unit: 'm/s',
    min: -2,
    max: 2,
    step: 0.1,
    default: 0,
    hint: '上向きが正',
  },
];

/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で ωΔt ≤ √(100/0.1) × 10⁻³ ≈ 0.032 */
export const DT = 1e-3;

/** ばねの自然長 [m]（描画用。運動には影響しない） */
export const NATURAL_LENGTH = 0.5;

export interface VSpringState {
  /** つりあいの位置からの変位（上向き正）[m] */
  x: number;
  /** 速度（上向き正）[m/s] */
  v: number;
}

export function initialState(p: VSpringParams): VSpringState {
  return { x: p.x0, v: p.v0 };
}

/** つりあいの位置でのばねの伸び d = mg/k [m]（kd = mg のつりあいから） */
export function equilibriumStretch(p: VSpringParams): number {
  return (p.m * G_ACCEL) / p.k;
}

/** ばねの伸び d − x [m]（負なら縮み） */
export function stretch(p: VSpringParams, x: number): number {
  return equilibriumStretch(p) - x;
}

/** 弾性力（上向き正）k × 伸び [N] */
export function springForce(p: VSpringParams, x: number): number {
  return p.k * stretch(p, x);
}

/** 合力（上向き正）= 弾性力 − 重力 = −kx [N] */
export function netForce(p: VSpringParams, x: number): number {
  return springForce(p, x) - p.m * G_ACCEL;
}

/** 加速度 a = (k(d − x) − mg)/m = −(k/m)x [m/s²] */
export function acceleration(p: VSpringParams, x: number): number {
  return netForce(p, x) / p.m;
}

export function angularFrequency(p: VSpringParams): number {
  return Math.sqrt(p.k / p.m);
}

/** 周期 T = 2π√(m/k) [s]（水平ばねと同じ。重力によらない） */
export function period(p: VSpringParams): number {
  return 2 * Math.PI * Math.sqrt(p.m / p.k);
}

/** 振幅 A = √(x₀² + (v₀/ω)²) [m] */
export function amplitude(p: VSpringParams): number {
  return Math.hypot(p.x0, p.v0 / angularFrequency(p));
}

/** 保存力（弾性力 + 重力）のみなので、シンプレクティック法（速度ベルレ法）で 1 ステップ進める */
export function step(p: VSpringParams, s: VSpringState, dt: number): VSpringState {
  const next = velocityVerletStep(
    (_t, x) => [acceleration(p, x[0]!)],
    0,
    { x: [s.x], v: [s.v] },
    dt,
  );
  return { x: next.x[0]!, v: next.v[0]! };
}

/** 解析解 x(t) = x₀ cos ωt + (v₀/ω) sin ωt */
export function analyticState(p: VSpringParams, t: number): VSpringState {
  const w = angularFrequency(p);
  return {
    x: p.x0 * Math.cos(w * t) + (p.v0 / w) * Math.sin(w * t),
    v: -p.x0 * w * Math.sin(w * t) + p.v0 * Math.cos(w * t),
  };
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 弾性エネルギー ½k(伸び)² [J] */
  elastic: number;
  /** 重力による位置エネルギー mgx [J]（つりあいの位置を基準） */
  gravity: number;
  /** 力学的エネルギー K + U弾 + U重 [J] */
  total: number;
  /**
   * つりあいの位置を基準とした「復元力の位置エネルギー」½kx² [J]。
   * 弾性エネルギーと重力の位置エネルギーの和から定数 ½kd² を引いたものに等しい。
   */
  restoring: number;
}

export function energies(p: VSpringParams, s: VSpringState): Energies {
  const kinetic = 0.5 * p.m * s.v * s.v;
  const elastic = 0.5 * p.k * stretch(p, s.x) ** 2;
  const gravity = p.m * G_ACCEL * s.x;
  return {
    kinetic,
    elastic,
    gravity,
    total: kinetic + elastic + gravity,
    restoring: 0.5 * p.k * s.x * s.x,
  };
}
