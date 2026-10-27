/**
 * 2 物体の直線上の衝突（なめらかな床の上）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 床の中央を原点、右向きを正とする x 軸。物体 A は左（x = −START_DISTANCE）、
 *       物体 B は右（x = +START_DISTANCE）から出発する。位置は物体の中心。
 * 衝突していない間は外力の合力が 0 なので等速直線運動（解析解で進める）。
 * 衝突は瞬間的とし、運動量保存と反発係数の式
 *   mA vA + mB vB = mA vA′ + mB vB′,   vB′ − vA′ = −e (vB − vA)
 * から衝突後の速度を決める。接触する時刻はステップの途中でも厳密に求める。
 */
import type { ParamSpec, ParamValues } from '@/core/params';

export type CollisionParamKey = 'mA' | 'mB' | 'vA' | 'vB' | 'e';
export type CollisionParams = ParamValues<CollisionParamKey>;

export const PARAMS: readonly ParamSpec<CollisionParamKey>[] = [
  {
    key: 'mA',
    label: '物体 A の質量',
    symbol: 'm_A',
    unit: 'kg',
    min: 0.5,
    max: 5,
    step: 0.1,
    default: 1,
  },
  {
    key: 'mB',
    label: '物体 B の質量',
    symbol: 'm_B',
    unit: 'kg',
    min: 0.5,
    max: 5,
    step: 0.1,
    default: 2,
  },
  {
    key: 'vA',
    label: '物体 A の初速度',
    symbol: 'v_A',
    unit: 'm/s',
    min: -5,
    max: 5,
    step: 0.1,
    default: 3,
    hint: '右向きが正',
  },
  {
    key: 'vB',
    label: '物体 B の初速度',
    symbol: 'v_B',
    unit: 'm/s',
    min: -5,
    max: 5,
    step: 0.1,
    default: -1,
    hint: '右向きが正',
  },
  {
    key: 'e',
    label: '反発係数',
    symbol: 'e',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.8,
    hint: '1 で弾性衝突、0 で完全非弾性衝突（一体になる）',
  },
];

/**
 * 物理ステップの刻み幅 [s]。等速運動と衝突を解析的に扱うので精度には影響しない
 * （グラフの記録と描画の間隔を決めるだけ）。
 */
export const DT = 1e-3;

/** 出発点の中心の位置 |x| [m] */
export const START_DISTANCE = 1.2;
/** 床の表示範囲 |x| [m]。どちらかの物体の中心がこれを越えたら終える */
export const FLOOR_HALF_WIDTH = 3.5;

/** 物体（立方体）の一辺 [m]。密度が同じとみなして質量の立方根に比例させる（描画と接触判定に使う） */
export function blockSize(m: number): number {
  return 0.3 * Math.cbrt(m);
}

export interface CollisionState {
  /** 物体の中心の位置 [m] */
  xA: number;
  xB: number;
  /** 速度（右向き正）[m/s] */
  vA: number;
  vB: number;
  /** 衝突した時刻 [s]（まだなら null） */
  collidedAt: number | null;
  /** 経過時間 [s] */
  t: number;
}

export function initialState(p: CollisionParams): CollisionState {
  return { xA: -START_DISTANCE, xB: START_DISTANCE, vA: p.vA, vB: p.vB, collidedAt: null, t: 0 };
}

/** 接触している（または重なっている）ときの中心間の距離 (a + b)/2 [m] */
export function contactDistance(p: CollisionParams): number {
  return (blockSize(p.mA) + blockSize(p.mB)) / 2;
}

/** 衝突する時刻 [s]。A が B に近づかない（vA ≤ vB）なら Infinity */
export function collisionTime(p: CollisionParams): number {
  const closing = p.vA - p.vB;
  if (closing <= 0) return Infinity;
  return (2 * START_DISTANCE - contactDistance(p)) / closing;
}

/**
 * 衝突後の速度。運動量保存と反発係数の式を連立して
 *   vA′ = (mA vA + mB vB − e mB (vA − vB)) / (mA + mB)
 *   vB′ = (mA vA + mB vB + e mA (vA − vB)) / (mA + mB)
 */
export function velocitiesAfter(
  mA: number,
  mB: number,
  vA: number,
  vB: number,
  e: number,
): { vA: number; vB: number } {
  const P = mA * vA + mB * vB;
  const M = mA + mB;
  return { vA: (P - e * mB * (vA - vB)) / M, vB: (P + e * mA * (vA - vB)) / M };
}

/** この条件での衝突後の速度 */
export function afterCollision(p: CollisionParams): { vA: number; vB: number } {
  return velocitiesAfter(p.mA, p.mB, p.vA, p.vB, p.e);
}

/** 重心の速度 v_G = (mA vA + mB vB)/(mA + mB) [m/s]（外力がないので一定） */
export function centerOfMassVelocity(p: CollisionParams): number {
  return (p.mA * p.vA + p.mB * p.vB) / (p.mA + p.mB);
}

/** 重心の位置 [m] */
export function centerOfMass(p: CollisionParams, s: CollisionState): number {
  return (p.mA * s.xA + p.mB * s.xB) / (p.mA + p.mB);
}

/**
 * 衝突で失われる運動エネルギー ΔK = ½ μ (1 − e²)(vA − vB)²,  μ = mA mB/(mA + mB)（換算質量）。
 * 衝突しない場合は 0。
 */
export function energyLoss(p: CollisionParams): number {
  if (!Number.isFinite(collisionTime(p))) return 0;
  const mu = (p.mA * p.mB) / (p.mA + p.mB);
  return 0.5 * mu * (1 - p.e * p.e) * (p.vA - p.vB) ** 2;
}

/** A が B から受ける力積 I = mA(vA′ − vA) [N·s]（B が受ける力積は −I） */
export function impulseOnA(p: CollisionParams): number {
  if (!Number.isFinite(collisionTime(p))) return 0;
  return p.mA * (afterCollision(p).vA - p.vA);
}

/** 等速運動で h だけ進める */
function drift(s: CollisionState, h: number): CollisionState {
  return { ...s, xA: s.xA + s.vA * h, xB: s.xB + s.vB * h, t: s.t + h };
}

/**
 * dt だけ進める。まだ衝突しておらず、このステップ内で接触するなら、
 * 接触の瞬間まで進めて速度を衝突後の値に変え、残りの時間を進める。
 */
export function step(p: CollisionParams, s: CollisionState, dt: number): CollisionState {
  const closing = s.vA - s.vB;
  if (s.collidedAt === null && closing > 0) {
    const gap = s.xB - s.xA - contactDistance(p);
    if (gap <= closing * dt) {
      const h = Math.max(0, gap / closing);
      const at = drift(s, h);
      const v = velocitiesAfter(p.mA, p.mB, s.vA, s.vB, p.e);
      return drift({ ...at, vA: v.vA, vB: v.vB, collidedAt: at.t }, dt - h);
    }
  }
  return drift(s, dt);
}

/** どちらかの物体が床の表示範囲の外に出たか */
export function isOutOfFloor(s: CollisionState): boolean {
  return Math.abs(s.xA) > FLOOR_HALF_WIDTH || Math.abs(s.xB) > FLOOR_HALF_WIDTH;
}

export interface Momenta {
  /** 運動量 [kg·m/s] */
  pA: number;
  pB: number;
  total: number;
}

export function momenta(p: CollisionParams, s: CollisionState): Momenta {
  const pA = p.mA * s.vA;
  const pB = p.mB * s.vB;
  return { pA, pB, total: pA + pB };
}

export interface Energies {
  /** 運動エネルギー [J] */
  kineticA: number;
  kineticB: number;
  total: number;
  /** 衝突で失われた運動エネルギー（熱・音・変形）[J] */
  lost: number;
}

export function energies(p: CollisionParams, s: CollisionState): Energies {
  const kineticA = 0.5 * p.mA * s.vA * s.vA;
  const kineticB = 0.5 * p.mB * s.vB * s.vB;
  const total = kineticA + kineticB;
  const k0 = 0.5 * p.mA * p.vA * p.vA + 0.5 * p.mB * p.vB * p.vB;
  return { kineticA, kineticB, total, lost: Math.max(0, k0 - total) };
}
