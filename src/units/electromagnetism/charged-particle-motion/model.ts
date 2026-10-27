/**
 * 一様な電場・磁場の中の荷電粒子の運動の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 紙面内に x 軸（右向き正）と y 軸（上向き正）をとり、粒子は原点から x 軸正の向きに
 *       速さ v₀ で打ち出される。重力は考えない。
 * 磁場: 紙面に垂直（z 軸）。B > 0 は紙面の裏から表の向き（⊙）、B < 0 は表から裏の向き（⊗）。
 * 電場: y 軸正の向きに大きさ E（一様）。電位は V = −E y（原点を基準 0 V）。
 *
 * 運動方程式: m dv/dt = q(E + v × B)
 *   ax = (q/m) vy B,  ay = (q/m)(E − vx B)
 * 速度に依存する力（ローレンツ力）を含むので RK4 で解く。
 */
import { rk4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type ParticleParamKey = 'm' | 'q' | 'B' | 'E' | 'v0';
export type ParticleParams = ParamValues<ParticleParamKey>;

export const PARAMS: readonly ParamSpec<ParticleParamKey>[] = [
  { key: 'm', label: '質量', symbol: 'm', unit: 'g', min: 1, max: 10, step: 0.5, default: 2 },
  {
    key: 'q',
    label: '電荷',
    symbol: 'q',
    unit: 'mC',
    min: -4,
    max: 4,
    step: 0.5,
    default: 2,
    hint: '負の値は負電荷（電子と同じ符号）',
  },
  {
    key: 'B',
    label: '磁束密度',
    symbol: 'B',
    unit: 'T',
    min: -2,
    max: 2,
    step: 0.1,
    default: 1,
    hint: '正: 紙面の裏から表の向き（⊙）、負: 表から裏の向き（⊗）',
  },
  {
    key: 'E',
    label: '電場の強さ',
    symbol: 'E',
    unit: 'V/m',
    min: 0,
    max: 2,
    step: 0.1,
    default: 0,
    hint: '向きは y 軸正の向き（画面の上向き）',
  },
  { key: 'v0', label: '初速度', symbol: 'v_0', unit: 'm/s', min: 0, max: 2, step: 0.1, default: 1 },
];

/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で |ω|Δt ≤ 0.01 */
export const DT = 1e-3;

export interface ParticleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** 質量 [kg] と電荷 [C]（スライダーは g, mC） */
export function massKg(p: ParticleParams): number {
  return p.m * 1e-3;
}
export function chargeC(p: ParticleParams): number {
  return p.q * 1e-3;
}

export function initialState(p: ParticleParams): ParticleState {
  return { x: 0, y: 0, vx: p.v0, vy: 0 };
}

/** 符号付きの角速度 ω = qB/m [rad/s]。ω > 0 なら時計回り、ω < 0 なら反時計回りに回る */
export function omega(p: ParticleParams): number {
  return (chargeC(p) * p.B) / massKg(p);
}

/** 加速度 [m/s²] */
export function acceleration(p: ParticleParams, s: ParticleState): { x: number; y: number } {
  const k = chargeC(p) / massKg(p);
  return { x: k * s.vy * p.B, y: k * (p.E - s.vx * p.B) };
}

export function step(p: ParticleParams, s: ParticleState, dt: number): ParticleState {
  const k = chargeC(p) / massKg(p);
  const { B, E } = p;
  // 状態ベクトル u = [x, y, vx, vy]。右辺は acceleration() と同じ式（大量に呼ぶので展開して書く）
  const y = rk4Step(
    (_t, u) => [u[2]!, u[3]!, k * u[3]! * B, k * (E - u[2]! * B)],
    0,
    [s.x, s.y, s.vx, s.vy],
    dt,
  );
  return { x: y[0]!, y: y[1]!, vx: y[2]!, vy: y[3]! };
}

/** ローレンツ力 f = q v × B [N]（磁場から受ける力） */
export function lorentzForce(p: ParticleParams, s: ParticleState): { x: number; y: number } {
  const q = chargeC(p);
  return { x: q * s.vy * p.B, y: -q * s.vx * p.B };
}

/** 電場から受ける力 qE [N]（y 成分のみ） */
export function electricForce(p: ParticleParams): number {
  return chargeC(p) * p.E;
}

/** E × B ドリフトの速度 E/B [m/s]（x 軸の向き。電荷の符号によらない）。B = 0 なら NaN */
export function driftVelocity(p: ParticleParams): number {
  return p.B === 0 ? NaN : p.E / p.B;
}

/**
 * 回転半径 r = m|v₀ − E/B| / (|q||B|) [m]。E = 0 なら教科書の r = mv/(qB)。
 * ドリフトとともに動く座標系から見た円運動の半径。磁場か電荷が 0 なら Infinity
 */
export function radius(p: ParticleParams): number {
  const w = omega(p);
  if (w === 0) return Infinity;
  return Math.abs((p.v0 - p.E / p.B) / w);
}

/** 周期 T = 2πm / (|q||B|) [s]（速さによらない）。磁場か電荷が 0 なら Infinity */
export function period(p: ParticleParams): number {
  const w = omega(p);
  return w === 0 ? Infinity : (2 * Math.PI) / Math.abs(w);
}

/**
 * 解析解。ω = qB/m, u₀ = v₀ − E/B とすると
 *   x = (E/B) t + (u₀/ω) sin ωt,   y = (u₀/ω)(cos ωt − 1)
 * （ドリフト速度 E/B で動く座標系から見ると等速円運動）。
 * ω = 0（B = 0 か q = 0）のときは等加速度運動 x = v₀t, y = ½(qE/m)t²。
 */
export function analyticState(p: ParticleParams, t: number): ParticleState {
  const w = omega(p);
  if (w === 0) {
    const a = (chargeC(p) * p.E) / massKg(p);
    return { x: p.v0 * t, y: 0.5 * a * t * t, vx: p.v0, vy: a * t };
  }
  const vd = p.E / p.B;
  const u0 = p.v0 - vd;
  const c = Math.cos(w * t);
  const sn = Math.sin(w * t);
  return {
    x: vd * t + (u0 / w) * sn,
    y: (u0 / w) * (c - 1),
    vx: vd + u0 * c,
    vy: -u0 * sn,
  };
}

/** E = 0 のときの円軌道の中心 (0, −v₀/ω)。ω = 0 なら null */
export function orbitCenter(p: ParticleParams): { x: number; y: number } | null {
  const w = omega(p);
  if (w === 0) return null;
  return { x: 0, y: -(p.v0 - p.E / p.B) / w };
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 電場による位置エネルギー U = qV = −qEy [J] */
  potential: number;
  total: number;
}

export function energies(p: ParticleParams, s: ParticleState): Energies {
  const kinetic = 0.5 * massKg(p) * (s.vx * s.vx + s.vy * s.vy);
  const potential = -chargeC(p) * p.E * s.y;
  return { kinetic, potential, total: kinetic + potential };
}
