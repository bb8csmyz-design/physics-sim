/**
 * 鉛直面内の円運動（糸につけた小球）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 円の中心（糸の固定点）を原点、水平右向きを x 軸の正、鉛直上向きを y 軸の正とする。
 *       角 θ は最下点から反時計回りに測る（小球の位置は (r sin θ, −r cos θ)）。
 * 糸が張っている間（張力 T ≥ 0）: 半径 r の円運動。接線方向の運動方程式 r θ̈ = −g sin θ、
 *   中心方向の運動方程式 T − mg cos θ = m v²/r から張力 T = m(v²/r + g cos θ)。
 * 張力が 0 になると糸がたるみ、小球は重力だけを受けて放物運動をする。
 * 再び糸が張った（中心からの距離が r に戻った）時点でシミュレーションを終える
 * （そこでは糸から撃力を受け、力学的エネルギーが保存されないため）。
 */
import { G_ACCEL } from '@/core/physics/constants';
import { yoshida4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type CircleParamKey = 'r' | 'v0' | 'm';
export type CircleParams = ParamValues<CircleParamKey>;

export const PARAMS: readonly ParamSpec<CircleParamKey>[] = [
  {
    key: 'r',
    label: '糸の長さ（半径）',
    symbol: 'r',
    unit: 'm',
    min: 0.3,
    max: 2,
    step: 0.1,
    default: 1,
  },
  {
    key: 'v0',
    label: '最下点での初速度',
    symbol: 'v_0',
    unit: 'm/s',
    min: 0,
    max: 10,
    step: 0.1,
    default: 6,
    hint: '最下点で水平右向きに打ち出す',
  },
  { key: 'm', label: '質量', symbol: 'm', unit: 'kg', min: 0.1, max: 2, step: 0.1, default: 0.5 },
];

/**
 * 物理ステップの刻み幅 [s]。円運動の角速度は最大 v₀/r = 10/0.3 ≈ 33 rad/s で、
 * ωΔt ≤ 0.04 を満たす（吉田の 4 次法の位相誤差は (ωΔt)⁴ 程度）。
 */
export const DT = 1e-3;

export interface CircleState {
  /** 'circle': 糸が張って円運動中 / 'free': 糸がたるんで放物運動中 */
  mode: 'circle' | 'free';
  /** 角 θ [rad]（最下点から反時計回り。1 周すると 2π 増える） */
  theta: number;
  /** 角速度 dθ/dt [rad/s] */
  omega: number;
  /** 糸がたるんだ瞬間の位置・速度（mode = 'free' のとき） */
  release: { x: number; y: number; vx: number; vy: number } | null;
  /** 糸がたるんでからの経過時間 [s] */
  tau: number;
  /** 再び糸が張ってシミュレーションを終えたか */
  done: boolean;
}

export function initialState(p: CircleParams): CircleState {
  return { mode: 'circle', theta: 0, omega: p.v0 / p.r, release: null, tau: 0, done: false };
}

/** 位置 (x, y) [m] */
export function position(p: CircleParams, s: CircleState): { x: number; y: number } {
  if (s.mode === 'circle') return { x: p.r * Math.sin(s.theta), y: -p.r * Math.cos(s.theta) };
  const q = s.release!;
  return { x: q.x + q.vx * s.tau, y: q.y + q.vy * s.tau - 0.5 * G_ACCEL * s.tau * s.tau };
}

/** 速度 (vx, vy) [m/s] */
export function velocity(p: CircleParams, s: CircleState): { vx: number; vy: number } {
  if (s.mode === 'circle') {
    const v = p.r * s.omega;
    return { vx: v * Math.cos(s.theta), vy: v * Math.sin(s.theta) };
  }
  const q = s.release!;
  return { vx: q.vx, vy: q.vy - G_ACCEL * s.tau };
}

export function speed(p: CircleParams, s: CircleState): number {
  const { vx, vy } = velocity(p, s);
  return Math.hypot(vx, vy);
}

/** 最下点から測った高さ h = y + r [m] */
export function height(p: CircleParams, s: CircleState): number {
  return position(p, s).y + p.r;
}

/** 糸の張力 T = m(rω² + g cos θ) [N]（糸がたるんでいれば 0） */
export function tension(p: CircleParams, s: CircleState): number {
  if (s.mode !== 'circle') return 0;
  return p.m * (p.r * s.omega * s.omega + G_ACCEL * Math.cos(s.theta));
}

function circleStep(p: CircleParams, s: CircleState, dt: number): CircleState {
  const next = yoshida4Step(
    (_t, x) => [(-G_ACCEL / p.r) * Math.sin(x[0]!)],
    0,
    { x: [s.theta], v: [s.omega] },
    dt,
  );
  return { ...s, theta: next.x[0]!, omega: next.v[0]! };
}

function freeStep(s: CircleState, dt: number): CircleState {
  return { ...s, tau: s.tau + dt };
}

/** 中心からの距離の 2 乗 − r²（糸がたるんでいる間は負） */
function slackMeasure(p: CircleParams, s: CircleState): number {
  const { x, y } = position(p, s);
  return x * x + y * y - p.r * p.r;
}

/** 二分法で、条件 f(h) が初めて真になる h ∈ (0, dt] を求める */
function bisect(dt: number, f: (h: number) => boolean): number {
  let lo = 0;
  let hi = dt;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * dt だけ進める。円運動は保存力だけの系なのでシンプレクティック法（吉田の 4 次法）、
 * 放物運動は解析解で進める。張力が 0 になる瞬間・糸が再び張る瞬間は二分法で求めて区切る。
 */
export function step(p: CircleParams, s: CircleState, dt: number): CircleState {
  if (s.done) return s;
  if (s.mode === 'circle') {
    const next = circleStep(p, s, dt);
    if (tension(p, next) >= 0) return next;
    // ステップの途中で張力が 0 になった: その瞬間から放物運動に切りかえる
    const h = bisect(dt, (x) => tension(p, circleStep(p, s, x)) < 0);
    const atRelease = circleStep(p, s, h);
    const released: CircleState = {
      ...atRelease,
      mode: 'free',
      release: { ...position(p, atRelease), ...velocity(p, atRelease) },
      tau: 0,
    };
    return freeStep(released, dt - h);
  }
  const next = freeStep(s, dt);
  // 糸がたるんだ直後は中心からの距離が r とほぼ等しい（(Δt)³ 程度しか離れない）ので、
  // 一度はっきり内側に入ってから r に戻ったときを「糸が再び張った」とする
  const tol = 1e-9 * p.r * p.r;
  if (slackMeasure(p, s) < -tol && slackMeasure(p, next) >= 0) {
    const h = bisect(dt, (x) => slackMeasure(p, freeStep(s, x)) >= 0);
    return { ...freeStep(s, h), done: true };
  }
  return next;
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 重力による位置エネルギー mgh [J]（最下点を基準） */
  potential: number;
  /** 力学的エネルギー [J] */
  total: number;
}

export function energies(p: CircleParams, s: CircleState): Energies {
  const v = speed(p, s);
  const kinetic = 0.5 * p.m * v * v;
  const potential = p.m * G_ACCEL * height(p, s);
  return { kinetic, potential, total: kinetic + potential };
}

/** 最下点での張力 T₀ = m(v₀²/r + g) [N] */
export function bottomTension(p: CircleParams): number {
  return p.m * ((p.v0 * p.v0) / p.r + G_ACCEL);
}

/** 1 周するのに必要な最下点での速さ √(5gr) [m/s]（最高点で T ≥ 0 となる条件） */
export function loopSpeed(p: CircleParams): number {
  return Math.sqrt(5 * G_ACCEL * p.r);
}

/** 糸がたるまずに往復運動をする最下点での速さの上限 √(2gr) [m/s]（中心の高さまでしか上がらない） */
export function swingSpeed(p: CircleParams): number {
  return Math.sqrt(2 * G_ACCEL * p.r);
}

export type MotionKind = 'loop' | 'swing' | 'slack' | 'rest';

/** 運動の種類: 1 周する / 往復運動（振り子）/ 途中で糸がたるむ / 静止 */
export function motionKind(p: CircleParams): MotionKind {
  if (p.v0 === 0) return 'rest';
  if (p.v0 >= loopSpeed(p)) return 'loop';
  if (p.v0 <= swingSpeed(p)) return 'swing';
  return 'slack';
}

/**
 * 糸がたるむ点（√(2gr) < v₀ < √(5gr) のとき）。張力 0 の条件 v² = −gr cos θ と
 * エネルギー保存 v² = v₀² − 2gr(1 − cos θ) から cos θ* = −(v₀² − 2gr)/(3gr)。
 * 返す値: 最下点からの高さ h* = r(1 − cos θ*) と、そのときの速さ v* = √(−gr cos θ*)。
 */
export function slackPoint(
  p: CircleParams,
): { height: number; speed: number; theta: number } | null {
  if (motionKind(p) !== 'slack') return null;
  const g = G_ACCEL;
  const cos = -(p.v0 * p.v0 - 2 * g * p.r) / (3 * g * p.r);
  return { height: p.r * (1 - cos), speed: Math.sqrt(-g * p.r * cos), theta: Math.acos(cos) };
}

/** 最高点（θ = π）での速さ √(v₀² − 4gr) [m/s]（1 周する場合のみ。そうでなければ NaN） */
export function topSpeed(p: CircleParams): number {
  return motionKind(p) === 'loop' ? Math.sqrt(p.v0 * p.v0 - 4 * G_ACCEL * p.r) : NaN;
}

/** 最高点での張力 m(v₀²/r − 5g) [N]（1 周する場合のみ） */
export function topTension(p: CircleParams): number {
  return motionKind(p) === 'loop' ? p.m * ((p.v0 * p.v0) / p.r - 5 * G_ACCEL) : NaN;
}

/**
 * 到達する最高点の高さ [m]（最下点から）。
 * - 1 周: 2r
 * - 往復: v₀²/(2g)（そこで速さ 0）
 * - 糸がたるむ: たるんだ点から放物運動で上がる最高点 h* + (v* sin θ*)²/(2g)
 */
export function maxHeight(p: CircleParams): number {
  const kind = motionKind(p);
  if (kind === 'loop') return 2 * p.r;
  if (kind !== 'slack') return (p.v0 * p.v0) / (2 * G_ACCEL);
  const q = slackPoint(p)!;
  const vy = q.speed * Math.sin(q.theta);
  return q.height + (vy * vy) / (2 * G_ACCEL);
}
