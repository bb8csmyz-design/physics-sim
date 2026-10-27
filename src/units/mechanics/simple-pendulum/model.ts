/**
 * 単振り子の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 糸の固定点を原点、水平右向きを x 軸の正、鉛直上向きを y 軸の正とする。
 *       振れ角 θ は鉛直下向きから反時計回り（右に振れる向き）を正とする。おもりの位置は (L sin θ, −L cos θ)。
 * 運動方程式（接線方向）: m L θ̈ = −mg sin θ  →  θ̈ = −(g/L) sin θ
 *   振れ角が小さければ sin θ ≈ θ で、角振動数 ω = √(g/L) の単振動になる（近似）。
 * 中心方向: T − mg cos θ = m L θ̇²  →  張力 T = m(L θ̇² + g cos θ)
 */
import { G_ACCEL } from '@/core/physics/constants';
import { yoshida4Step } from '@/core/physics/integrators';
import { ellipticK } from '@/core/physics/special';
import type { ParamSpec, ParamValues } from '@/core/params';

export type PendulumParamKey = 'L' | 'theta0' | 'm';
export type PendulumParams = ParamValues<PendulumParamKey>;

export const PARAMS: readonly ParamSpec<PendulumParamKey>[] = [
  { key: 'L', label: '糸の長さ', symbol: 'L', unit: 'm', min: 0.2, max: 2, step: 0.1, default: 1 },
  {
    key: 'theta0',
    label: '初めの振れ角',
    symbol: 'θ_0',
    unit: '°',
    min: 0,
    max: 90,
    step: 1,
    default: 20,
    hint: '静かに放す角度。大きくすると周期が公式からずれる',
  },
  { key: 'm', label: '質量', symbol: 'm', unit: 'kg', min: 0.1, max: 2, step: 0.1, default: 0.5 },
];

/** 物理ステップの刻み幅 [s]。ω = √(g/L) ≤ 7 rad/s なので ωΔt ≤ 0.007 */
export const DT = 1e-3;

export interface PendulumState {
  /** 振れ角 [rad] */
  theta: number;
  /** 角速度 [rad/s] */
  omega: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function initialState(p: PendulumParams): PendulumState {
  return { theta: rad(p.theta0), omega: 0 };
}

/** 小振幅の角振動数 ω = √(g/L) [rad/s] */
export function angularFrequency(p: PendulumParams): number {
  return Math.sqrt(G_ACCEL / p.L);
}

/** 単振り子の周期の公式（振れ角が小さいときの近似）T₀ = 2π√(L/g) [s] */
export function smallAnglePeriod(p: PendulumParams): number {
  return 2 * Math.PI * Math.sqrt(p.L / G_ACCEL);
}

/**
 * 振れ角 θ₀ での厳密な周期 T = 4√(L/g) K(sin(θ₀/2)) [s]（K は第 1 種完全楕円積分）。
 * θ₀ → 0 で T₀ に一致し、θ₀ が大きいほど長くなる（θ₀ = 90° で約 1.18 倍）。
 */
export function exactPeriod(p: PendulumParams): number {
  return 4 * Math.sqrt(p.L / G_ACCEL) * ellipticK(Math.sin(rad(p.theta0) / 2));
}

/** 保存力（重力）と仕事をしない張力だけなので、シンプレクティック法（吉田の 4 次法）で進める */
export function step(p: PendulumParams, s: PendulumState, dt: number): PendulumState {
  const g = G_ACCEL / p.L;
  const next = yoshida4Step(
    (_t, x) => [-g * Math.sin(x[0]!)],
    0,
    { x: [s.theta], v: [s.omega] },
    dt,
  );
  return { theta: next.x[0]!, omega: next.v[0]! };
}

/** 振れ角が小さいとき（sin θ ≈ θ）の近似解 θ = θ₀ cos ωt [rad] */
export function smallAngleTheta(p: PendulumParams, t: number): number {
  return rad(p.theta0) * Math.cos(angularFrequency(p) * t);
}

/** おもりの位置 (x, y) [m] */
export function position(p: PendulumParams, s: PendulumState): { x: number; y: number } {
  return { x: p.L * Math.sin(s.theta), y: -p.L * Math.cos(s.theta) };
}

/** 速度（接線方向、θ が増える向きを正）v = L θ̇ [m/s] */
export function tangentialVelocity(p: PendulumParams, s: PendulumState): number {
  return p.L * s.omega;
}

/** 糸の張力 T = m(L θ̇² + g cos θ) [N] */
export function tension(p: PendulumParams, s: PendulumState): number {
  return p.m * (p.L * s.omega * s.omega + G_ACCEL * Math.cos(s.theta));
}

/** 接線方向の力（復元力）−mg sin θ [N] */
export function restoringForce(p: PendulumParams, s: PendulumState): number {
  return -p.m * G_ACCEL * Math.sin(s.theta);
}

/** 最下点を基準にした高さ h = L(1 − cos θ) [m] */
export function height(p: PendulumParams, theta: number): number {
  return p.L * (1 - Math.cos(theta));
}

/** 最下点での速さ √(2gL(1 − cos θ₀)) [m/s]（エネルギー保存から） */
export function bottomSpeed(p: PendulumParams): number {
  return Math.sqrt(2 * G_ACCEL * height(p, rad(p.theta0)));
}

/** 最下点での張力 mg(3 − 2 cos θ₀) [N] */
export function bottomTension(p: PendulumParams): number {
  return p.m * G_ACCEL * (3 - 2 * Math.cos(rad(p.theta0)));
}

/** 振れの端（速さ 0）での張力 mg cos θ₀ [N] */
export function endTension(p: PendulumParams): number {
  return p.m * G_ACCEL * Math.cos(rad(p.theta0));
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 重力による位置エネルギー mgh [J]（最下点を基準） */
  potential: number;
  /** 力学的エネルギー [J] */
  total: number;
}

export function energies(p: PendulumParams, s: PendulumState): Energies {
  const v = tangentialVelocity(p, s);
  const kinetic = 0.5 * p.m * v * v;
  const potential = p.m * G_ACCEL * height(p, s.theta);
  return { kinetic, potential, total: kinetic + potential };
}
