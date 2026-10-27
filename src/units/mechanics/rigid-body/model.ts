/**
 * なめらかな鉛直の壁に立てかけたはしご（一様な棒）と、はしごに乗った人の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 壁と床の交線を原点とし、壁から離れる向き（水平右向き）を x 軸の正、鉛直上向きを y 軸の正とする。
 *       θ ははしごと床のなす角。はしごの下端は (L cos θ, 0)、上端は (0, L sin θ)。
 *       人は下端からはしごに沿って距離 d の位置にいる（はしごに固定された質点とみなす）。
 * 力: 重力 mg（はしごの中点）, Mg（人）、床の垂直抗力 N₁ と摩擦力 f（下端）、壁の垂直抗力 N₂（上端、壁はなめらか）。
 * つりあい: 水平 f = N₂、鉛直 N₁ = (m + M)g、下端のまわりのモーメント N₂ L sin θ = (mL/2 + Md) g cos θ。
 *   f ≤ μN₁ ならつりあう。そうでなければ下端が壁から離れる向きに滑り出す。
 * 滑っている間（動摩擦係数も μ とする）: 壁と床に接したまま θ だけで決まる 1 自由度の運動。
 *   速度に依存する力（N₁ が角速度によって変わる）を含むので RK4 で解く。
 */
import { G_ACCEL } from '@/core/physics/constants';
import { rk4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type LadderParamKey = 'theta' | 'mu' | 'm' | 'M' | 'd';
export type LadderParams = ParamValues<LadderParamKey>;

/** はしごの長さ L [m] */
export const LADDER_LENGTH = 4;

export const PARAMS: readonly ParamSpec<LadderParamKey>[] = [
  {
    key: 'theta',
    label: 'はしごと床のなす角',
    symbol: 'θ',
    unit: '°',
    min: 20,
    max: 80,
    step: 1,
    default: 60,
  },
  {
    key: 'mu',
    label: '床との静止摩擦係数',
    symbol: 'μ',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.4,
    hint: '壁はなめらか（摩擦なし）。滑り出した後の動摩擦係数も μ とする',
  },
  {
    key: 'm',
    label: 'はしごの質量',
    symbol: 'm',
    unit: 'kg',
    min: 5,
    max: 30,
    step: 1,
    default: 10,
  },
  { key: 'M', label: '人の質量', symbol: 'M', unit: 'kg', min: 0, max: 80, step: 1, default: 50 },
  {
    key: 'd',
    label: '人の位置（下端からの距離）',
    symbol: 'd',
    unit: 'm',
    min: 0,
    max: LADDER_LENGTH,
    step: 0.1,
    default: 2.5,
    hint: `はしごの長さは L = ${LADDER_LENGTH} m`,
  },
];

/**
 * 物理ステップの刻み幅 [s]。滑っているときの角速度は最大でも √(3g/L) × 数 rad/s 程度で、
 * RK4 の誤差は十分小さい（エネルギー収支のテストで確認）。
 */
export const DT = 1e-3;

export interface LadderState {
  /** はしごと床のなす角 [rad] */
  theta: number;
  /** 角速度 dθ/dt [rad/s]（滑っているときは負） */
  omega: number;
  /** 床との摩擦による発熱 [J] */
  heat: number;
  /** 滑っているか */
  sliding: boolean;
  /** 運動の終わり: 'wall' 上端が壁から離れた / 'floor' 床に倒れた */
  ended: 'wall' | 'floor' | null;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 全体の質量 m + M [kg] */
export function totalMass(p: LadderParams): number {
  return p.m + p.M;
}

/** はしごと人を合わせた重心の、下端からはしごに沿った距離 c = (mL/2 + Md)/(m + M) [m] */
export function centerOfMassDistance(p: LadderParams): number {
  return (p.m * (LADDER_LENGTH / 2) + p.M * p.d) / totalMass(p);
}

export interface StaticForces {
  /** 床からの垂直抗力 N₁ [N] */
  N1: number;
  /** 壁からの垂直抗力 N₂ [N] */
  N2: number;
  /** つりあうのに必要な静止摩擦力 f = N₂ [N]（壁に向かう向き） */
  f: number;
  /** 最大静止摩擦力 μN₁ [N] */
  fMax: number;
}

/** 角 θ（度）でつりあっているとしたときの力（つりあいの 3 式から） */
export function staticForces(p: LadderParams, thetaDeg = p.theta): StaticForces {
  const th = rad(thetaDeg);
  const N1 = totalMass(p) * G_ACCEL;
  const N2 =
    (G_ACCEL * Math.cos(th) * (p.m * (LADDER_LENGTH / 2) + p.M * p.d)) /
    (LADDER_LENGTH * Math.sin(th));
  return { N1, N2, f: N2, fMax: p.mu * N1 };
}

/** 必要な静止摩擦力が最大静止摩擦力以下か（f ≤ μN₁ ⇔ tan θ ≥ c/(μL)） */
export function inEquilibrium(p: LadderParams): boolean {
  const s = staticForces(p);
  return s.f <= s.fMax;
}

/** 滑り出す限界の角 θc [°]: tan θc = (mL/2 + Md)/(μ(m + M)L) = c/(μL)。μ = 0 なら 90° */
export function criticalAngle(p: LadderParams): number {
  if (p.mu === 0) return 90;
  return (Math.atan(centerOfMassDistance(p) / (p.mu * LADDER_LENGTH)) * 180) / Math.PI;
}

/**
 * この角度で、人が滑らずに上れる下端からの距離の上限 d_max [m]。
 * (mL/2 + Md) ≤ μ(m + M)L tan θ から。L 以上ならいちばん上まで上れる（L を返す）。
 * 人が乗らなくても滑る場合は NaN。
 */
export function maxClimbDistance(p: LadderParams): number {
  const lhs =
    p.mu * totalMass(p) * LADDER_LENGTH * Math.tan(rad(p.theta)) - (p.m * LADDER_LENGTH) / 2;
  if (p.M === 0) return lhs >= 0 ? LADDER_LENGTH : NaN;
  const d = lhs / p.M;
  if (d < 0) return NaN;
  return Math.min(d, LADDER_LENGTH);
}

export function initialState(p: LadderParams): LadderState {
  return { theta: rad(p.theta), omega: 0, heat: 0, sliding: !inEquilibrium(p), ended: null };
}

/** 重心のまわりの慣性モーメント I_c = mL²/12 + m(L/2 − c)² + M(d − c)² [kg·m²] */
export function momentOfInertia(p: LadderParams): number {
  const L = LADDER_LENGTH;
  const c = centerOfMassDistance(p);
  return (p.m * L * L) / 12 + p.m * (L / 2 - c) ** 2 + p.M * (p.d - c) ** 2;
}

/**
 * 滑っているときの角加速度 θ̈ と、そのときの床・壁からの垂直抗力。
 * 重心 (X, Y) = ((L − c) cos θ, c sin θ) の運動方程式
 *   (m+M) Ẍ = N₂ − μN₁,  (m+M) Ÿ = N₁ − (m+M) g
 * と重心のまわりの回転の運動方程式 −I_c θ̈ = c N₁(cos θ − μ sin θ) − (L − c) N₂ sin θ を連立して解く。
 */
export function slidingDynamics(
  p: LadderParams,
  theta: number,
  omega: number,
): { alpha: number; N1: number; N2: number } {
  const L = LADDER_LENGTH;
  const Mt = totalMass(p);
  const c = centerOfMassDistance(p);
  const Ic = momentOfInertia(p);
  const s = Math.sin(theta);
  const co = Math.cos(theta);
  const w2 = omega * omega;
  const q = c * co - p.mu * L * s; // 滑っている間は正（つりあいが破れている）
  const k = (L - c) ** 2;
  const alpha =
    -(Mt * q * (G_ACCEL - c * s * w2) + Mt * k * s * co * w2) /
    (Ic + Mt * q * c * co + Mt * k * s * s);
  const Yddot = c * (co * alpha - s * w2);
  const Xddot = -(L - c) * (s * alpha + co * w2);
  const N1 = Mt * (G_ACCEL + Yddot);
  const N2 = Mt * Xddot + p.mu * N1;
  return { alpha, N1, N2 };
}

/** RK4 の右辺。y = [θ, ω, 発熱] */
function derivative(p: LadderParams) {
  return (_t: number, y: readonly number[]): number[] => {
    const theta = y[0]!;
    const omega = y[1]!;
    const { alpha, N1 } = slidingDynamics(p, theta, omega);
    // 発熱率 = 動摩擦力 × 下端の速さ |d(L cos θ)/dt|
    return [omega, alpha, p.mu * N1 * LADDER_LENGTH * Math.abs(Math.sin(theta) * omega)];
  };
}

/**
 * dt だけ進める。つりあっていれば動かない。滑っている場合、上端が壁から離れる（N₂ < 0）か
 * 床に倒れる（θ ≤ 0）瞬間を二分法で求めて止める（その後は壁や床から離れた別の運動になるため）。
 */
export function step(p: LadderParams, s: LadderState, dt: number): LadderState {
  if (!s.sliding || s.ended) return s;
  const f = derivative(p);
  const y0 = [s.theta, s.omega, s.heat];
  const ended = (y: readonly number[]): LadderState['ended'] => {
    if (y[0]! <= 0) return 'floor';
    if (slidingDynamics(p, y[0]!, y[1]!).N2 < 0) return 'wall';
    return null;
  };
  let y = rk4Step(f, 0, y0, dt);
  let end = ended(y);
  if (end) {
    let lo = 0;
    let hi = dt;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (ended(rk4Step(f, 0, y0, mid))) hi = mid;
      else lo = mid;
    }
    y = rk4Step(f, 0, y0, hi);
    end = ended(y);
    if (end === 'floor') y[0] = 0;
  }
  return { theta: y[0]!, omega: y[1]!, heat: y[2]!, sliding: true, ended: end };
}

export interface Forces {
  N1: number;
  N2: number;
  /** 床の摩擦力の大きさ（壁に向かう向き）[N] */
  f: number;
}

/** 現在の状態での力（つりあっていれば静止摩擦力、滑っていれば動摩擦力） */
export function forces(p: LadderParams, s: LadderState): Forces {
  if (!s.sliding) {
    const st = staticForces(p, (s.theta * 180) / Math.PI);
    return { N1: st.N1, N2: st.N2, f: st.f };
  }
  const d = slidingDynamics(p, s.theta, s.omega);
  return { N1: d.N1, N2: d.N2, f: p.mu * d.N1 };
}

/** 下端のまわりの力のモーメント（反時計回り正）[N·m]。つりあっていれば和は 0 */
export function torquesAboutBottom(
  p: LadderParams,
  thetaDeg = p.theta,
): { ladder: number; person: number; wall: number } {
  const th = rad(thetaDeg);
  const L = LADDER_LENGTH;
  const { N2 } = staticForces(p, thetaDeg);
  // 下端から見た位置: はしごに沿って s の点は (−s cos θ, s sin θ)。重力 (0, −w) のモーメントは −(−s cos θ) w
  return {
    ladder: p.m * G_ACCEL * (L / 2) * Math.cos(th),
    person: p.M * G_ACCEL * p.d * Math.cos(th),
    // 上端 (−L cos θ, L sin θ) にはたらく N₂ (+x 向き): rₓFᵧ − rᵧFₓ = −L sin θ · N₂
    wall: -N2 * L * Math.sin(th),
  };
}

export interface Energies {
  /** 運動エネルギー（重心の並進 + 重心のまわりの回転）[J] */
  kinetic: number;
  /** 重力による位置エネルギー（床を基準）[J] */
  potential: number;
  /** 力学的エネルギー [J] */
  total: number;
  /** 摩擦による発熱 [J] */
  heat: number;
}

export function energies(p: LadderParams, s: LadderState): Energies {
  const L = LADDER_LENGTH;
  const Mt = totalMass(p);
  const c = centerOfMassDistance(p);
  const sn = Math.sin(s.theta);
  const co = Math.cos(s.theta);
  const Xdot = -(L - c) * sn * s.omega;
  const Ydot = c * co * s.omega;
  const kinetic =
    0.5 * Mt * (Xdot * Xdot + Ydot * Ydot) + 0.5 * momentOfInertia(p) * s.omega * s.omega;
  const potential = Mt * G_ACCEL * c * sn;
  return { kinetic, potential, total: kinetic + potential, heat: s.heat };
}
