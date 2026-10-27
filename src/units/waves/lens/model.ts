/**
 * 薄いレンズによる像の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 光軸を x 軸（右向き正、光は左から右へ進む）、レンズの中心を原点、上向きを y 軸の正とする。
 *   物体は光軸上の x = −a（a > 0、レンズの左側）に、高さ h の矢印として立てる。
 * 焦点距離 f は凸レンズで正、凹レンズで負（高校教科書の符号の約束）。
 * レンズの式: 1/a + 1/b = 1/f。b > 0 ならレンズの右側に実像（倒立）、b < 0 なら左側に虚像（正立）。
 * 倍率 m = |b|/a、像の高さ（上向き正）は y′ = −(b/a)h。
 *
 * 時間発展: 物体は一定の速さ v でレンズに近づく（v < 0 なら遠ざかる）: a(t) = a₀ − v t。
 * 等速運動なので解析解をそのまま使い、可動範囲の端に着いたら止まる。
 */
import type { ParamSpec, ParamValues } from '@/core/params';

export type LensKind = 'convex' | 'concave';
export type LensParamKey = 'F' | 'a0' | 'h' | 'v';
export type LensParams = ParamValues<LensParamKey>;

export const PARAMS: readonly ParamSpec<LensParamKey>[] = [
  {
    key: 'F',
    label: '焦点距離（大きさ）',
    symbol: '|f|',
    unit: 'm',
    min: 0.05,
    max: 0.2,
    step: 0.01,
    default: 0.1,
    hint: '凹レンズでは f = −|f| として式に入れる',
  },
  {
    key: 'a0',
    label: '物体の位置（初め）',
    symbol: 'a_0',
    unit: 'm',
    min: 0.02,
    max: 0.5,
    step: 0.01,
    default: 0.4,
    hint: 'レンズから物体までの距離',
  },
  {
    key: 'h',
    label: '物体の高さ',
    symbol: 'h',
    unit: 'm',
    min: 0.02,
    max: 0.08,
    step: 0.01,
    default: 0.05,
  },
  {
    key: 'v',
    label: '物体の速さ',
    symbol: 'v',
    unit: 'm/s',
    min: -0.05,
    max: 0.05,
    step: 0.005,
    default: 0.04,
    digits: 3,
    hint: '正ならレンズに近づき、負なら遠ざかる。0 なら止まったまま',
  },
];

/** 物体が動ける範囲 [m]（レンズに接する直前と、画面の左端） */
export const A_MIN = 0.02;
export const A_MAX = 0.55;
/** 物理ステップの刻み幅 [s]（運動は解析解なので精度には影響しない。グラフの細かさ） */
export const DT = 0.01;

export interface LensState {
  t: number;
  /** レンズから物体までの距離 a [m] */
  a: number;
}

export function focalLength(kind: LensKind, p: LensParams): number {
  return kind === 'convex' ? p.F : -p.F;
}

export function initialState(p: LensParams): LensState {
  return { t: 0, a: p.a0 };
}

/** 物体の位置の解析解 a(t) = a₀ − v t（可動範囲で止まる） */
export function objectDistance(p: LensParams, t: number): number {
  return Math.min(A_MAX, Math.max(A_MIN, p.a0 - p.v * t));
}

export function step(p: LensParams, s: LensState, dt: number): LensState {
  const t = s.t + dt;
  return { t, a: objectDistance(p, t) };
}

/** 端に着いて止まったか */
export function hasStopped(p: LensParams, s: LensState): boolean {
  return (p.v > 0 && s.a <= A_MIN) || (p.v < 0 && s.a >= A_MAX);
}

/**
 * 像の位置 b = af/(a − f) [m]（1/a + 1/b = 1/f）。正なら実像（レンズの右側）、負なら虚像（左側）。
 * 物体が焦点の上にある（a = f）と光は平行に出て像ができないので ±Infinity。
 */
export function imageDistance(kind: LensKind, a: number, p: LensParams): number {
  const f = focalLength(kind, p);
  if (a === f) return Infinity;
  return (a * f) / (a - f);
}

/** 倍率 m = |b|/a */
export function magnification(kind: LensKind, a: number, p: LensParams): number {
  return Math.abs(imageDistance(kind, a, p)) / a;
}

/** 像の高さ y′ = −(b/a)h [m]（上向き正。負なら倒立） */
export function imageHeight(kind: LensKind, a: number, p: LensParams): number {
  return (-imageDistance(kind, a, p) / a) * p.h;
}

export type ImageKind = 'real' | 'virtual' | 'none';

export function imageKind(kind: LensKind, a: number, p: LensParams): ImageKind {
  const b = imageDistance(kind, a, p);
  if (!Number.isFinite(b)) return 'none';
  return b > 0 ? 'real' : 'virtual';
}

/**
 * 薄いレンズを通る光線の規則（近軸光線）: レンズを通るときの高さ y で、傾きが y/f だけ減る。
 * 物体の先端 (−a, h) からレンズの高さ yL に向かう光線について、レンズを出た後の傾きを返す。
 */
export function outgoingSlope(kind: LensKind, a: number, p: LensParams, yL: number): number {
  const slopeIn = (yL - p.h) / a;
  return slopeIn - yL / focalLength(kind, p);
}

/**
 * 作図に使う 3 本の光線がレンズを通る高さ。
 *   ① 光軸に平行に入る光線（高さ h）
 *   ② レンズの中心を通る光線（高さ 0、直進）
 *   ③ 手前側の焦点（凹レンズでは向こう側の焦点）に向かう光線（出た後は光軸に平行）
 * 物体が焦点の上にあると ③ は作れないので省く。
 */
export function principalRayHeights(kind: LensKind, a: number, p: LensParams): number[] {
  const f = focalLength(kind, p);
  const heights = [p.h, 0];
  if (Math.abs(f - a) > 1e-9) heights.push((p.h * f) / (f - a));
  return heights;
}

/** 物体の像が移動する速さ db/dt = −(b/a)² da/dt [m/s]（縦倍率は横倍率の 2 乗） */
export function imageVelocity(kind: LensKind, a: number, p: LensParams, dadt: number): number {
  const b = imageDistance(kind, a, p);
  return -((b / a) ** 2) * dadt;
}
