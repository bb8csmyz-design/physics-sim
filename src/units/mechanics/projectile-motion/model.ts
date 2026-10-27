/**
 * 落下運動と放物運動（空気抵抗あり/なし）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 投射点の真下の地面を原点とし、水平右向きを x 軸の正、鉛直上向きを y 軸の正とする。
 * 空気抵抗: 速度に比例し逆向きの力 −k v⃗（高校で扱う「速さに比例する抵抗力」）。
 * 運動方程式: m dv⃗/dt = m g⃗ − k v⃗
 *   → 水平: dvx/dt = −(k/m) vx,  鉛直: dvy/dt = −g − (k/m) vy
 * 地面（y = 0）に達したら着地として止める。
 */
import { G_ACCEL } from '@/core/physics/constants';
import { rk4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type ProjectileParamKey = 'v0' | 'theta' | 'h0' | 'k' | 'm';
export type ProjectileParams = ParamValues<ProjectileParamKey>;

export const PARAMS: readonly ParamSpec<ProjectileParamKey>[] = [
  {
    key: 'v0',
    label: '初速度の大きさ',
    symbol: 'v_0',
    unit: 'm/s',
    min: 0,
    max: 30,
    step: 0.5,
    default: 15,
  },
  {
    key: 'theta',
    label: '投射角',
    symbol: 'θ',
    unit: '°',
    min: 0,
    max: 90,
    step: 1,
    default: 45,
    hint: '水平面となす角。0° で水平投射、90° で鉛直投げ上げ',
  },
  {
    key: 'h0',
    label: '投射点の高さ',
    symbol: 'h',
    unit: 'm',
    min: 0,
    max: 30,
    step: 0.5,
    default: 0,
  },
  {
    key: 'k',
    label: '空気抵抗の比例定数',
    symbol: 'k',
    unit: 'kg/s',
    min: 0,
    max: 1,
    step: 0.02,
    default: 0,
    hint: '抵抗力の大きさ kv。0 で空気抵抗なし',
  },
  { key: 'm', label: '質量', symbol: 'm', unit: 'kg', min: 0.1, max: 5, step: 0.1, default: 1 },
];

/**
 * 物理ステップの刻み幅 [s]。RK4 の誤差は (kΔt/m)⁵ 程度で、パラメータ範囲全体で
 * kΔt/m ≤ 0.01 なので十分小さい（空気抵抗なしの放物線は RK4 で厳密に再現される）。
 */
export const DT = 1e-3;

export interface ProjectileState {
  /** 位置 [m] */
  x: number;
  y: number;
  /** 速度 [m/s] */
  vx: number;
  vy: number;
  /** 空気抵抗による発熱（抵抗力がした負の仕事の大きさ）[J] */
  heat: number;
  /** 地面に着地したか */
  landed: boolean;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 初速度の成分 (v₀ cos θ, v₀ sin θ) */
export function initialVelocity(p: ProjectileParams): { vx: number; vy: number } {
  const th = rad(p.theta);
  // θ = 90° で cos が 6e-17 になるのを避ける（真上に投げたら x は厳密に 0 のまま）
  return { vx: p.theta === 90 ? 0 : p.v0 * Math.cos(th), vy: p.v0 * Math.sin(th) };
}

export function initialState(p: ProjectileParams): ProjectileState {
  const { vx, vy } = initialVelocity(p);
  // 地面から下向き・水平に投げた場合は、投げた瞬間に着地している
  return { x: 0, y: p.h0, vx, vy, heat: 0, landed: p.h0 <= 0 && vy <= 0 };
}

/** dy/dt の右辺。y = [x, y, vx, vy, heat] */
function derivative(p: ProjectileParams) {
  const c = p.k / p.m;
  return (_t: number, s: readonly number[]): number[] => {
    const vx = s[2]!;
    const vy = s[3]!;
    return [vx, vy, -c * vx, -G_ACCEL - c * vy, p.k * (vx * vx + vy * vy)];
  };
}

function toArray(s: ProjectileState): number[] {
  return [s.x, s.y, s.vx, s.vy, s.heat];
}

function fromArray(a: readonly number[], landed: boolean): ProjectileState {
  return { x: a[0]!, y: a[1]!, vx: a[2]!, vy: a[3]!, heat: a[4]!, landed };
}

/**
 * 速度に依存する力（空気抵抗）があるので RK4 で 1 ステップ進める。
 * ステップの途中で地面を通り過ぎたら、二分法で着地の瞬間を求めてそこで止める。
 */
export function step(p: ProjectileParams, s: ProjectileState, dt: number): ProjectileState {
  if (s.landed) return s;
  const f = derivative(p);
  const y0 = toArray(s);
  const next = rk4Step(f, 0, y0, dt);
  if (next[1]! > 0) return fromArray(next, false);
  // 着地: y(h) = 0 となる h ∈ (0, dt] を二分法で求める
  let lo = 0;
  let hi = dt;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (rk4Step(f, 0, y0, mid)[1]! > 0) lo = mid;
    else hi = mid;
  }
  const landed = rk4Step(f, 0, y0, hi);
  landed[1] = 0;
  return fromArray(landed, true);
}

/** 加速度 (ax, ay) [m/s²] */
export function acceleration(p: ProjectileParams, s: ProjectileState): { ax: number; ay: number } {
  if (s.landed) return { ax: 0, ay: 0 };
  const c = p.k / p.m;
  return { ax: -c * s.vx, ay: -G_ACCEL - c * s.vy };
}

export function speed(s: { vx: number; vy: number }): number {
  return Math.hypot(s.vx, s.vy);
}

/** 終端速度の大きさ v_T = mg/k [m/s]（k = 0 なら Infinity） */
export function terminalSpeed(p: ProjectileParams): number {
  return p.k > 0 ? (p.m * G_ACCEL) / p.k : Infinity;
}

/**
 * 地面がないとしたときの解析解。
 * - k = 0: x = v₀ₓ t,  y = h + v₀ᵧ t − ½ g t²
 * - k > 0: τ = m/k, v_T = gτ として
 *     x = v₀ₓ τ (1 − e^{−t/τ}),  y = h − v_T t + (v₀ᵧ + v_T) τ (1 − e^{−t/τ})
 */
export function analyticState(
  p: ProjectileParams,
  t: number,
): { x: number; y: number; vx: number; vy: number } {
  const { vx: vx0, vy: vy0 } = initialVelocity(p);
  if (p.k === 0) {
    return {
      x: vx0 * t,
      y: p.h0 + vy0 * t - 0.5 * G_ACCEL * t * t,
      vx: vx0,
      vy: vy0 - G_ACCEL * t,
    };
  }
  const tau = p.m / p.k;
  const vT = G_ACCEL * tau;
  const decay = Math.exp(-t / tau);
  const grow = -tau * Math.expm1(-t / tau); // τ(1 − e^{−t/τ})（k が小さくても桁落ちしない）
  return {
    x: vx0 * grow,
    y: p.h0 - vT * t + (vy0 + vT) * grow,
    vx: vx0 * decay,
    vy: -vT + (vy0 + vT) * decay,
  };
}

export interface FlightSummary {
  /** 最高点に達する時刻 [s]（上向きに投げなければ 0） */
  apexTime: number;
  /** 最高点の高さ（地面から）[m] */
  maxHeight: number;
  /** 着地までの時間（滞空時間）[s] */
  flightTime: number;
  /** 水平到達距離（投射点の真下から着地点まで）[m] */
  range: number;
  /** 着地の瞬間の速さ [m/s] */
  landingSpeed: number;
}

/**
 * 空気抵抗がない場合の公式（入試で使う形）。
 *   最高点: t₁ = v₀ sin θ / g,  H = h + v₀² sin²θ / (2g)
 *   着地:   h + v₀ sin θ · t − ½ g t² = 0 の正の解,  R = v₀ cos θ · t₂,  着地の速さ √(v₀² + 2gh)
 */
export function idealSummary(p: ProjectileParams): FlightSummary {
  const { vx, vy } = initialVelocity(p);
  const g = G_ACCEL;
  const apexTime = Math.max(vy, 0) / g;
  const maxHeight = p.h0 + Math.max(vy, 0) ** 2 / (2 * g);
  const flightTime = (vy + Math.sqrt(vy * vy + 2 * g * p.h0)) / g;
  return {
    apexTime,
    maxHeight,
    flightTime,
    range: vx * flightTime,
    landingSpeed: Math.sqrt(p.v0 * p.v0 + 2 * g * p.h0),
  };
}

/**
 * この条件（空気抵抗を含む）での値。最高点は解析解から求め（vy = 0 となる時刻 t₁ = τ ln(1 + v₀ᵧ/v_T)）、
 * 着地時刻は解析解 y(t) = 0 を二分法で解く（k > 0 では初等関数で書けない）。
 */
export function flightSummary(p: ProjectileParams): FlightSummary {
  if (p.k === 0) return idealSummary(p);
  const { vy } = initialVelocity(p);
  const tau = p.m / p.k;
  const vT = G_ACCEL * tau;
  const apexTime = vy > 0 ? tau * Math.log1p(vy / vT) : 0;
  const maxHeight = analyticState(p, apexTime).y;
  let flightTime = 0;
  if (!(p.h0 <= 0 && vy <= 0)) {
    // 最高点より後で y < 0 となる時刻まで区間を広げてから二分法（最高点の後 y は単調減少）
    let lo = apexTime;
    let hi = Math.max(apexTime, 0.1);
    while (analyticState(p, hi).y > 0) {
      lo = hi;
      hi *= 2;
    }
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (analyticState(p, mid).y > 0) lo = mid;
      else hi = mid;
    }
    flightTime = (lo + hi) / 2;
  }
  const end = analyticState(p, flightTime);
  return { apexTime, maxHeight, flightTime, range: end.x, landingSpeed: speed(end) };
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 重力による位置エネルギー mgy [J]（地面を基準） */
  potential: number;
  /** 力学的エネルギー K + U [J] */
  total: number;
  /** 空気抵抗による発熱 [J] */
  heat: number;
}

export function energies(p: ProjectileParams, s: ProjectileState): Energies {
  const kinetic = 0.5 * p.m * (s.vx * s.vx + s.vy * s.vy);
  const potential = p.m * G_ACCEL * s.y;
  return { kinetic, potential, total: kinetic + potential, heat: s.heat };
}
