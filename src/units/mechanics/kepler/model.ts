/**
 * 地球のまわりを回る人工衛星の運動（万有引力による中心力運動）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 地球の中心を原点とする xy 平面。衛星は (r₀, 0) から y 軸の正の向き（反時計回り）に、
 *       動径と垂直な速さ v₀ で打ち出す。地球は動かないとする（地球の質量 ≫ 衛星の質量）。
 * 運動方程式: m a⃗ = −GMm r⃗ / r³。GM は入試の慣例どおり地表の重力加速度から GM = gR² とする。
 * 単位: 計算はすべて SI。打ち出す位置は地球半径 R の倍数、打ち出す速さは km/s でパラメータを与える。
 */
import { EARTH_RADIUS, G_ACCEL } from '@/core/physics/constants';
import { yoshida4Step, type PhaseState } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type KeplerParamKey = 'r0' | 'v0' | 'm';
export type KeplerParams = ParamValues<KeplerParamKey>;

export const PARAMS: readonly ParamSpec<KeplerParamKey>[] = [
  {
    key: 'r0',
    label: '打ち出す位置（地球の中心から）',
    symbol: 'r_0',
    unit: '× R',
    min: 1.1,
    max: 6,
    step: 0.1,
    default: 2,
    hint: '地球半径 R = 6.4×10⁶ m の何倍か',
  },
  {
    key: 'v0',
    label: '打ち出す速さ',
    symbol: 'v_0',
    unit: 'km/s',
    min: 1,
    max: 12,
    step: 0.1,
    default: 6.2,
    hint: '動径と垂直に打ち出す。地表付近の円軌道の速さは約 7.9 km/s',
  },
  {
    key: 'm',
    label: '衛星の質量',
    symbol: 'm',
    unit: 'kg',
    min: 100,
    max: 2000,
    step: 100,
    default: 500,
  },
];

/** 地球の重力定数 GM = gR² [m³/s²]（入試の慣例。≈ 4.0×10¹⁴） */
export const GM = G_ACCEL * EARTH_RADIUS * EARTH_RADIUS;

/**
 * 物理ステップの刻み幅 [s]。1 ステップで動径が回る角度は最大でも
 * v/r ≤ 12 km/s / R ≈ 1.9×10⁻³ rad で、吉田の 4 次法の誤差は十分小さい。
 */
export const DT = 1;

/** 脱出する軌道（力学的エネルギー ≥ 0）で、打ち出した位置の何倍まで離れたら終えるか */
const ESCAPE_FACTOR = 5;

export interface KeplerState {
  /** 位置 [m] */
  x: number;
  y: number;
  /** 速度 [m/s] */
  vx: number;
  vy: number;
  /** 地表に落下したか */
  crashed: boolean;
  /** 遠くまで飛び去ったか（脱出） */
  escaped: boolean;
}

/** 打ち出す位置 [m] */
export function launchRadius(p: KeplerParams): number {
  return p.r0 * EARTH_RADIUS;
}

/** 打ち出す速さ [m/s] */
export function launchSpeed(p: KeplerParams): number {
  return p.v0 * 1000;
}

export function initialState(p: KeplerParams): KeplerState {
  return { x: launchRadius(p), y: 0, vx: 0, vy: launchSpeed(p), crashed: false, escaped: false };
}

/** 万有引力による加速度 −GM r⃗/r³ */
function gravity(_t: number, x: readonly number[]): number[] {
  const r3 = Math.hypot(x[0]!, x[1]!) ** 3;
  return [(-GM * x[0]!) / r3, (-GM * x[1]!) / r3];
}

function advance(s: KeplerState, dt: number): KeplerState {
  const ps: PhaseState = { x: [s.x, s.y], v: [s.vx, s.vy] };
  const n = yoshida4Step(gravity, 0, ps, dt);
  return { ...s, x: n.x[0]!, y: n.x[1]!, vx: n.v[0]!, vy: n.v[1]! };
}

export function distance(s: { x: number; y: number }): number {
  return Math.hypot(s.x, s.y);
}

export function speed(s: { vx: number; vy: number }): number {
  return Math.hypot(s.vx, s.vy);
}

/**
 * 保存力（万有引力）だけなので、シンプレクティック法（吉田の 4 次法）で 1 ステップ進める。
 * 地表（r = R）に達したら二分法でその瞬間を求めて止める。脱出する軌道は十分遠くで止める。
 */
export function step(p: KeplerParams, s: KeplerState, dt: number): KeplerState {
  if (s.crashed || s.escaped) return s;
  const next = advance(s, dt);
  if (distance(next) < EARTH_RADIUS) {
    let lo = 0;
    let hi = dt;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (distance(advance(s, mid)) < EARTH_RADIUS) hi = mid;
      else lo = mid;
    }
    return { ...advance(s, hi), crashed: true };
  }
  // 遠地点が遠い楕円軌道（力学的エネルギー < 0）は戻ってくるので止めない。ちょうど脱出速度で
  // 打ち出した放物線軌道（ε = 0）を丸め誤差で楕円と取り違えないよう、|ε| の小さな負の値は脱出とみなす
  const r0 = launchRadius(p);
  if (distance(next) > ESCAPE_FACTOR * r0 && specificEnergyOf(next) >= (-1e-6 * GM) / r0) {
    return { ...next, escaped: true };
  }
  return next;
}

/** 状態から求めた単位質量あたりの力学的エネルギー v²/2 − GM/r [J/kg] */
function specificEnergyOf(s: KeplerState): number {
  return 0.5 * (s.vx * s.vx + s.vy * s.vy) - GM / distance(s);
}

/** 円軌道の速さ √(GM/r₀) [m/s]（r₀ = R で第一宇宙速度 √(gR) ≈ 7.9 km/s） */
export function circularSpeed(p: KeplerParams): number {
  return Math.sqrt(GM / launchRadius(p));
}

/** 脱出速度 √(2GM/r₀) [m/s]（r₀ = R で第二宇宙速度 √(2gR) ≈ 11.2 km/s） */
export function escapeSpeed(p: KeplerParams): number {
  return Math.sqrt((2 * GM) / launchRadius(p));
}

export interface Orbit {
  /** 単位質量あたりの力学的エネルギー v²/2 − GM/r [J/kg] */
  specificEnergy: number;
  /** 単位質量あたりの角運動量 h = r v（打ち出しは動径と垂直）[m²/s] */
  h: number;
  /** 面積速度 h/2 [m²/s] */
  arealVelocity: number;
  /** 離心率 */
  e: number;
  /** 半通径 p = h²/GM [m] */
  semiLatus: number;
  /** 長半径 a = −GM/(2ε) [m]（ε ≥ 0 なら Infinity） */
  a: number;
  /** 近地点・遠地点の距離 [m]（遠地点は脱出軌道なら Infinity） */
  perigee: number;
  apogee: number;
  /** 近地点の向き（極角）[rad]: 打ち出した点が近地点なら 0、遠地点なら π */
  perigeeAngle: number;
  /** 周期 T = 2π√(a³/GM) [s]（脱出軌道なら Infinity） */
  period: number;
}

/**
 * 初期条件から軌道要素を求める（ケプラーの第 1 法則: 地球の中心を焦点とする 2 次曲線）。
 *   r = p / (1 + e cos(φ − φ_p)),  p = h²/GM,  e = √(1 + 2εh²/(GM)²)
 */
export function orbit(p: KeplerParams): Orbit {
  const r0 = launchRadius(p);
  const v0 = launchSpeed(p);
  const specificEnergy = (v0 * v0) / 2 - GM / r0;
  const h = r0 * v0;
  const semiLatus = (h * h) / GM;
  const e = Math.sqrt(Math.max(0, 1 + (2 * specificEnergy * h * h) / (GM * GM)));
  // 動径と垂直に打ち出した点は近地点か遠地点。円軌道の速さより速ければ近地点
  const atPerigee = v0 >= circularSpeed(p);
  const bound = specificEnergy < 0;
  const a = bound ? -GM / (2 * specificEnergy) : Infinity;
  return {
    specificEnergy,
    h,
    arealVelocity: h / 2,
    e,
    semiLatus,
    a,
    perigee: semiLatus / (1 + e),
    apogee: bound ? semiLatus / (1 - e) : Infinity,
    perigeeAngle: atPerigee ? 0 : Math.PI,
    period: bound ? 2 * Math.PI * Math.sqrt((a * a * a) / GM) : Infinity,
  };
}

export type OrbitKind = 'circle' | 'ellipse' | 'escape' | 'crash';

/** 軌道の種類。近地点が地球の内側なら落下する */
export function orbitKind(p: KeplerParams): OrbitKind {
  const o = orbit(p);
  if (o.perigee < EARTH_RADIUS) return 'crash';
  if (o.specificEnergy >= 0) return 'escape';
  return o.e < 1e-3 ? 'circle' : 'ellipse';
}

/**
 * 楕円軌道の解析解（ケプラー方程式 E − e sin E = M をニュートン法で解く）。
 * 打ち出した時刻を t = 0 とする。打ち出した点が遠地点なら、近地点の通過は t = T/2。
 */
export function analyticPosition(p: KeplerParams, t: number): { x: number; y: number } {
  const o = orbit(p);
  if (!(o.specificEnergy < 0)) throw new RangeError('楕円軌道のときだけ使える');
  const tPerigee = o.perigeeAngle === 0 ? 0 : o.period / 2;
  const M = (2 * Math.PI * (t - tPerigee)) / o.period;
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-15) break;
  }
  // 近地点を x' 軸の正の向きにとった座標で求めて、近地点の向きだけ回転する
  const xp = o.a * (Math.cos(E) - o.e);
  const yp = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const c = Math.cos(o.perigeeAngle);
  const s = Math.sin(o.perigeeAngle);
  return { x: c * xp - s * yp, y: s * xp + c * yp };
}

/** ケプラーの第 3 法則の比 T²/a³ = 4π²/GM [s²/m³]（軌道によらない） */
export function keplerThirdRatio(): number {
  return (4 * Math.PI * Math.PI) / GM;
}

/** 面積速度 ½|r⃗ × v⃗| [m²/s] */
export function arealVelocity(s: KeplerState): number {
  return 0.5 * (s.x * s.vy - s.y * s.vx);
}

/** 万有引力の大きさ GMm/r² [N] */
export function gravityForce(p: KeplerParams, s: KeplerState): number {
  const r = distance(s);
  return (GM * p.m) / (r * r);
}

/** 脱出する軌道で、ここまで離れたら終える距離 [m] */
export function escapeRadius(p: KeplerParams): number {
  return ESCAPE_FACTOR * launchRadius(p);
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 万有引力による位置エネルギー −GMm/r [J]（無限遠を基準） */
  potential: number;
  /** 力学的エネルギー [J] */
  total: number;
}

export function energies(p: KeplerParams, s: KeplerState): Energies {
  const kinetic = 0.5 * p.m * (s.vx * s.vx + s.vy * s.vy);
  const potential = (-GM * p.m) / distance(s);
  return { kinetic, potential, total: kinetic + potential };
}
