/**
 * 数値積分ライブラリ。
 *
 * - 1階の常微分方程式 dy/dt = f(t, y) 用: オイラー法, 中点法(RK2), 古典的ルンゲ＝クッタ法(RK4)
 * - 2階の運動方程式 d²x/dt² = a(t, x) 用（シンプレクティック法）:
 *   シンプレクティック・オイラー法(1次), 速度ベルレ法(2次), 吉田の4次法
 *
 * 使い分けの原則（CLAUDE.md 参照）:
 * - 保存力だけが働く力学系（ばね・重力・単振り子・惑星運動など）→ シンプレクティック法
 *   （長時間回してもエネルギーが単調に増減しない）
 * - 速度に依存する力（空気抵抗・ローレンツ力・減衰）や一般の微分方程式（RC 回路など）→ RK4
 *
 * どの関数も入力配列を書き換えず、新しい配列を返す（純粋関数）。
 */

export type Vector = readonly number[];

/** dy/dt = f(t, y) の右辺 */
export type OdeFunction = (t: number, y: Vector) => number[];

/** d²x/dt² = a(t, x)。速度に依存しない加速度（シンプレクティック法の前提） */
export type AccelerationFunction = (t: number, x: Vector) => number[];

/** 位置と速度の組（多次元・多粒子は成分を並べる） */
export interface PhaseState {
  readonly x: Vector;
  readonly v: Vector;
}

export type OdeStepper = (f: OdeFunction, t: number, y: Vector, dt: number) => number[];
export type SymplecticStepper = (
  a: AccelerationFunction,
  t: number,
  s: PhaseState,
  dt: number,
) => PhaseState;

/** y + c·k */
function axpy(y: Vector, c: number, k: Vector): number[] {
  const out = new Array<number>(y.length);
  for (let i = 0; i < y.length; i++) out[i] = y[i]! + c * k[i]!;
  return out;
}

// ---------------------------------------------------------------------------
// 1階 ODE 用
// ---------------------------------------------------------------------------

/** 前進オイラー法（1次精度）。比較・教育用。実用には使わない。 */
export const eulerStep: OdeStepper = (f, t, y, dt) => axpy(y, dt, f(t, y));

/** 中点法（2次精度のルンゲ＝クッタ法） */
export const midpointStep: OdeStepper = (f, t, y, dt) => {
  const k1 = f(t, y);
  const k2 = f(t + dt / 2, axpy(y, dt / 2, k1));
  return axpy(y, dt, k2);
};

/** 古典的 4 次ルンゲ＝クッタ法（4次精度） */
export const rk4Step: OdeStepper = (f, t, y, dt) => {
  const k1 = f(t, y);
  const k2 = f(t + dt / 2, axpy(y, dt / 2, k1));
  const k3 = f(t + dt / 2, axpy(y, dt / 2, k2));
  const k4 = f(t + dt, axpy(y, dt, k3));
  const out = new Array<number>(y.length);
  for (let i = 0; i < y.length; i++) {
    out[i] = y[i]! + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
  }
  return out;
};

// ---------------------------------------------------------------------------
// 2階の運動方程式用（シンプレクティック法）
// ---------------------------------------------------------------------------

/** シンプレクティック・オイラー法（1次精度）: v を先に更新し、新しい v で x を進める */
export const symplecticEulerStep: SymplecticStepper = (a, t, s, dt) => {
  const v = axpy(s.v, dt, a(t, s.x));
  const x = axpy(s.x, dt, v);
  return { x, v };
};

/** 速度ベルレ法（2次精度, キック・ドリフト・キック。リープフロッグ法と等価） */
export const velocityVerletStep: SymplecticStepper = (a, t, s, dt) => {
  const vHalf = axpy(s.v, dt / 2, a(t, s.x));
  const x = axpy(s.x, dt, vHalf);
  const v = axpy(vHalf, dt / 2, a(t + dt, x));
  return { x, v };
};

const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2);
const W0 = -CBRT2 / (2 - CBRT2);
const YOSHIDA_C = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2] as const;
const YOSHIDA_D = [W1, W0, W1] as const;

/** 吉田の 4 次シンプレクティック法（4次精度）。高精度が必要な長時間計算向け。 */
export const yoshida4Step: SymplecticStepper = (a, t, s, dt) => {
  let x: number[] = [...s.x];
  let v: number[] = [...s.v];
  let tc = t;
  for (let i = 0; i < 3; i++) {
    x = axpy(x, YOSHIDA_C[i]! * dt, v);
    tc += YOSHIDA_C[i]! * dt;
    v = axpy(v, YOSHIDA_D[i]! * dt, a(tc, x));
  }
  x = axpy(x, YOSHIDA_C[3] * dt, v);
  return { x, v };
};

// ---------------------------------------------------------------------------
// まとめて積分するヘルパー
// ---------------------------------------------------------------------------

export interface IntegrateOptions {
  t0?: number;
  /** 終了時刻。(t1 - t0) / dt が整数でなければ最後の 1 ステップを短くして t1 にそろえる */
  t1: number;
  dt: number;
}

function stepSizes(t0: number, t1: number, dt: number): number[] {
  if (!(dt > 0)) throw new RangeError('dt は正の数であること');
  const n = Math.floor((t1 - t0) / dt + 1e-9);
  const sizes = new Array<number>(n).fill(dt);
  const rest = t1 - (t0 + n * dt);
  if (rest > 1e-12 * dt) sizes.push(rest);
  return sizes;
}

/** dy/dt = f(t, y) を t0 から t1 まで積分し、t1 での y を返す */
export function integrateOde(
  f: OdeFunction,
  y0: Vector,
  { t0 = 0, t1, dt }: IntegrateOptions,
  step: OdeStepper = rk4Step,
): number[] {
  let y: number[] = [...y0];
  let t = t0;
  for (const h of stepSizes(t0, t1, dt)) {
    y = step(f, t, y, h);
    t += h;
  }
  return y;
}

/** d²x/dt² = a(t, x) を t0 から t1 まで積分し、t1 での状態を返す */
export function integrateMotion(
  a: AccelerationFunction,
  s0: PhaseState,
  { t0 = 0, t1, dt }: IntegrateOptions,
  step: SymplecticStepper = velocityVerletStep,
): PhaseState {
  let s = s0;
  let t = t0;
  for (const h of stepSizes(t0, t1, dt)) {
    s = step(a, t, s, h);
    t += h;
  }
  return s;
}
