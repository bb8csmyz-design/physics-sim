/**
 * ばねの単振動（水平・なめらかな床）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: つりあいの位置を原点、右向きを正とする x 軸。
 * 運動方程式: m a = -k x  →  a = -ω² x,  ω = √(k/m)
 */
import { velocityVerletStep } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type SpringParamKey = 'm' | 'k' | 'x0' | 'v0';
export type SpringParams = ParamValues<SpringParamKey>;

export const PARAMS: readonly ParamSpec<SpringParamKey>[] = [
  { key: 'm', label: '質量', symbol: 'm', unit: 'kg', min: 0.1, max: 5, step: 0.1, default: 1 },
  { key: 'k', label: 'ばね定数', symbol: 'k', unit: 'N/m', min: 1, max: 100, step: 1, default: 10 },
  {
    key: 'x0',
    label: '初期変位',
    symbol: 'x_0',
    unit: 'm',
    min: -0.5,
    max: 0.5,
    step: 0.01,
    default: 0.3,
    hint: 'つりあいの位置からのずれ（右向きが正）',
  },
  {
    key: 'v0',
    label: '初速度',
    symbol: 'v_0',
    unit: 'm/s',
    min: -3,
    max: 3,
    step: 0.1,
    default: 0,
  },
];

/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で ωΔt ≤ 0.04 となるように選んでいる */
export const DT = 1e-3;

export interface SpringState {
  /** 変位 [m] */
  x: number;
  /** 速度 [m/s] */
  v: number;
}

export function initialState(p: SpringParams): SpringState {
  return { x: p.x0, v: p.v0 };
}

/** 角振動数 ω = √(k/m) [rad/s] */
export function angularFrequency(p: SpringParams): number {
  return Math.sqrt(p.k / p.m);
}

/** 周期 T = 2π√(m/k) [s]（振幅によらない＝等時性） */
export function period(p: SpringParams): number {
  return 2 * Math.PI * Math.sqrt(p.m / p.k);
}

/** 振幅 A = √(x₀² + (v₀/ω)²) [m] */
export function amplitude(p: SpringParams): number {
  return Math.hypot(p.x0, p.v0 / angularFrequency(p));
}

/** 加速度 a = -(k/m) x [m/s²] */
export function acceleration(p: SpringParams, x: number): number {
  return (-p.k / p.m) * x;
}

/** 弾性力 F = -kx [N] */
export function springForce(p: SpringParams, x: number): number {
  return -p.k * x;
}

/** 保存力のみなので、シンプレクティック法（速度ベルレ法）で 1 ステップ進める */
export function step(p: SpringParams, s: SpringState, dt: number): SpringState {
  const next = velocityVerletStep(
    (_t, x) => [acceleration(p, x[0]!)],
    0,
    { x: [s.x], v: [s.v] },
    dt,
  );
  return { x: next.x[0]!, v: next.v[0]! };
}

/** 解析解 x(t) = x₀ cos ωt + (v₀/ω) sin ωt */
export function analyticState(p: SpringParams, t: number): SpringState {
  const w = angularFrequency(p);
  return {
    x: p.x0 * Math.cos(w * t) + (p.v0 / w) * Math.sin(w * t),
    v: -p.x0 * w * Math.sin(w * t) + p.v0 * Math.cos(w * t),
  };
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 弾性エネルギー ½kx² [J] */
  potential: number;
  /** 力学的エネルギー [J] */
  total: number;
}

export function energies(p: SpringParams, s: SpringState): Energies {
  const kinetic = 0.5 * p.m * s.v * s.v;
  const potential = 0.5 * p.k * s.x * s.x;
  return { kinetic, potential, total: kinetic + potential };
}

/**
 * 等速円運動との対応（参照円）。半径 A の円周上を角速度 ω で反時計回りに回る点の
 * x 座標が単振動の変位に一致する。点の y 座標は -v/ω（y 上向き）。
 */
export function referenceCirclePoint(p: SpringParams, s: SpringState): { x: number; y: number } {
  return { x: s.x, y: -s.v / angularFrequency(p) };
}
