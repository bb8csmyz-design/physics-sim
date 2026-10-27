/**
 * 粗い斜面上の物体の運動（斜面に沿った 1 次元運動）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 物体を打ち出す位置を原点とし、斜面に沿って上向きを正とする s 軸。
 *       斜面の下端は s = −FOOT_DISTANCE にある。位置エネルギーの基準は斜面の下端の高さ。
 * 力: 重力 mg、垂直抗力 N = mg cos θ、摩擦力（動摩擦 μ'N は運動と逆向き、静止摩擦は最大 μN）。
 * 運動方程式（斜面方向）:
 *   上昇中  m a = −mg sin θ − μ'mg cos θ
 *   下降中  m a = −mg sin θ + μ'mg cos θ
 *   静止中  tan θ ≤ μ なら静止摩擦力 mg sin θ でつりあって静止し続ける。tan θ > μ なら滑り出す。
 *
 * 各区間は等加速度運動なので、数値積分せずに解析解で進める（速度が 0 になる瞬間・斜面の端に達する
 * 瞬間でステップを区切るので、刻み幅によらず厳密）。
 */
import { G_ACCEL } from '@/core/physics/constants';
import type { ParamSpec, ParamValues } from '@/core/params';

export type InclineParamKey = 'theta' | 'mu' | 'muk' | 'v0' | 'm';
export type InclineParams = ParamValues<InclineParamKey>;

export const PARAMS: readonly ParamSpec<InclineParamKey>[] = [
  {
    key: 'theta',
    label: '斜面の傾斜角',
    symbol: 'θ',
    unit: '°',
    min: 0,
    max: 60,
    step: 1,
    default: 30,
  },
  {
    key: 'mu',
    label: '静止摩擦係数',
    symbol: 'μ',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    hint: '止まっている物体が滑り出すかどうかを決める',
  },
  {
    key: 'muk',
    label: '動摩擦係数',
    symbol: "μ'",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    hint: '滑っている物体の摩擦力 μ′N を決める（μ′ ≤ μ）',
  },
  {
    key: 'v0',
    label: '初速度',
    symbol: 'v_0',
    unit: 'm/s',
    min: 0,
    max: 10,
    step: 0.1,
    default: 5,
    hint: '斜面に沿って上向き',
  },
  { key: 'm', label: '質量', symbol: 'm', unit: 'kg', min: 0.5, max: 5, step: 0.1, default: 1 },
];

/**
 * 物理ステップの刻み幅 [s]。運動は区間ごとに解析解で進めるので精度には影響しない
 * （グラフの記録と描画の間隔を決めるだけ）。
 */
export const DT = 1e-3;

/** 打ち出す位置から斜面の下端までの距離 [m] */
export const FOOT_DISTANCE = 2;
/** 斜面の上端までの距離の上限 [m]（摩擦がなく止まらない場合など） */
const MAX_TOP = 12;

export interface InclineState {
  /** 斜面に沿った位置（上向き正）[m] */
  s: number;
  /** 斜面に沿った速度（上向き正）[m/s] */
  v: number;
  /** 動摩擦による発熱 [J] */
  heat: number;
  /** 斜面の端（上端・下端）に達して運動を終えたか */
  exited: boolean;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 実際に使う動摩擦係数。動摩擦係数は静止摩擦係数を超えない（μ′ ≤ μ）ので、
 * スライダーで μ′ > μ を選んだ場合は μ′ = μ として扱う。
 */
export function kineticCoefficient(p: InclineParams): number {
  return Math.min(p.muk, p.mu);
}

/** 垂直抗力 N = mg cos θ [N] */
export function normalForce(p: InclineParams): number {
  return p.m * G_ACCEL * Math.cos(rad(p.theta));
}

/** 上昇中の加速度 −g(sin θ + μ′ cos θ) [m/s²]（≤ 0） */
export function accelerationUp(p: InclineParams): number {
  const th = rad(p.theta);
  return -G_ACCEL * (Math.sin(th) + kineticCoefficient(p) * Math.cos(th));
}

/** 下降中の加速度 −g(sin θ − μ′ cos θ) [m/s²]（負なら下向きに加速、正なら減速） */
export function accelerationDown(p: InclineParams): number {
  const th = rad(p.theta);
  return -G_ACCEL * (Math.sin(th) - kineticCoefficient(p) * Math.cos(th));
}

/** 静止している物体が滑り出す条件 tan θ > μ（重力の斜面成分 > 最大静止摩擦力） */
export function slidesFromRest(p: InclineParams): boolean {
  const th = rad(p.theta);
  return Math.sin(th) > p.mu * Math.cos(th);
}

/** 摩擦角（物体が滑り出す傾斜角）tan θ₀ = μ [°] */
export function frictionAngle(p: InclineParams): number {
  return (Math.atan(p.mu) * 180) / Math.PI;
}

/** 斜面の上端の位置 [m]（止まるまでに上る距離より少し先。止まらなければ MAX_TOP） */
export function topPosition(p: InclineParams): number {
  const d = stopDistance(p);
  return Math.min(MAX_TOP, Math.max(1.5, 1.2 * d + 0.3));
}

/** 最高到達距離（斜面に沿って）L = v₀² / (2g(sin θ + μ′ cos θ)) [m]。止まらなければ Infinity */
export function stopDistance(p: InclineParams): number {
  const a = accelerationUp(p);
  return a < 0 ? (p.v0 * p.v0) / (-2 * a) : p.v0 > 0 ? Infinity : 0;
}

/** 最高点に達する時刻 t₁ = v₀ / (g(sin θ + μ′ cos θ)) [s]。止まらなければ Infinity */
export function stopTime(p: InclineParams): number {
  const a = accelerationUp(p);
  return a < 0 ? p.v0 / -a : p.v0 > 0 ? Infinity : 0;
}

/**
 * 最高点から滑り降りて出発点に戻ったときの速さ
 *   v = v₀ √((sin θ − μ′ cos θ) / (sin θ + μ′ cos θ)) [m/s]
 * 滑り降りない（tan θ ≤ μ）または最高点に達しない場合は NaN。
 */
export function returnSpeed(p: InclineParams): number {
  if (!slidesFromRest(p) || !Number.isFinite(stopDistance(p))) return NaN;
  return p.v0 * Math.sqrt(accelerationDown(p) / accelerationUp(p));
}

export function initialState(p: InclineParams): InclineState {
  return { s: 0, v: p.v0, heat: 0, exited: false };
}

/**
 * 変位 d に達するまでの時間（v t + ½ a t² = d の最小の正の解）。到達しなければ Infinity。
 * 区間内で速度の向きが変わらないこと（d と運動の向きが同じ）を前提とする。
 */
function timeToReach(d: number, v: number, a: number): number {
  if (d === 0) return 0;
  const disc = v * v + 2 * a * d;
  if (disc < 0) return Infinity;
  const den = v + Math.sign(d) * Math.sqrt(disc);
  return den === 0 ? Infinity : (2 * d) / den;
}

/**
 * dt だけ進める。速度が 0 になる瞬間と斜面の端に達する瞬間で区間を区切り、各区間を等加速度運動の
 * 解析解で進める。
 */
export function step(p: InclineParams, state: InclineState, dt: number): InclineState {
  let { s, v, heat } = state;
  if (state.exited) return state;
  const friction = kineticCoefficient(p) * normalForce(p);
  const top = topPosition(p);
  let rest = dt;
  // 1 ステップ内の区間は「上昇 → 停止 → 下降 → 停止」程度なので、数回で必ず終わる
  for (let guard = 0; guard < 8 && rest > 0; guard++) {
    let a: number;
    if (v > 0) a = accelerationUp(p);
    else if (v < 0 || slidesFromRest(p)) a = accelerationDown(p);
    else break; // 静止摩擦で止まったまま
    const dir = v > 0 ? 1 : -1;
    // 速度が 0 になる時刻（区間の終わり）。下降中に減速する場合（a > 0）もある
    const tStop = dir * a < 0 ? -v / a : Infinity;
    // 斜面の端に達する時刻
    const tEdge = timeToReach(dir > 0 ? top - s : -FOOT_DISTANCE - s, v, a);
    const h = Math.min(rest, tStop, tEdge);
    const ds = v * h + 0.5 * a * h * h;
    s += ds;
    v = h === tStop ? 0 : v + a * h;
    heat += friction * Math.abs(ds);
    rest -= h;
    if (h === tEdge) {
      s = dir > 0 ? top : -FOOT_DISTANCE;
      return { s, v, heat, exited: true };
    }
  }
  return { s, v, heat, exited: false };
}

/** 現在の加速度 [m/s²]（斜面に沿って上向き正） */
export function acceleration(p: InclineParams, st: InclineState): number {
  if (st.exited) return 0;
  if (st.v > 0) return accelerationUp(p);
  if (st.v < 0 || slidesFromRest(p)) return accelerationDown(p);
  return 0;
}

/**
 * 摩擦力 [N]（斜面に沿って上向き正）。
 * 滑っているときは動摩擦力 μ′N（運動と逆向き）、静止しているときは静止摩擦力 mg sin θ。
 */
export function frictionForce(p: InclineParams, st: InclineState): number {
  if (st.exited) return 0;
  const fk = kineticCoefficient(p) * normalForce(p);
  if (st.v > 0) return -fk;
  if (st.v < 0 || slidesFromRest(p)) return fk;
  return p.m * G_ACCEL * Math.sin(rad(p.theta));
}

/** 最大静止摩擦力 μN [N] */
export function maxStaticFriction(p: InclineParams): number {
  return p.mu * normalForce(p);
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 重力による位置エネルギー mgh [J]（斜面の下端の高さを基準） */
  potential: number;
  /** 力学的エネルギー K + U [J] */
  total: number;
  /** 摩擦による発熱 [J] */
  heat: number;
}

/** 斜面の下端から測った高さ h = (s + FOOT_DISTANCE) sin θ [m] */
export function height(p: InclineParams, s: number): number {
  return (s + FOOT_DISTANCE) * Math.sin(rad(p.theta));
}

export function energies(p: InclineParams, st: InclineState): Energies {
  const kinetic = 0.5 * p.m * st.v * st.v;
  const potential = p.m * G_ACCEL * height(p, st.s);
  return { kinetic, potential, total: kinetic + potential, heat: st.heat };
}
