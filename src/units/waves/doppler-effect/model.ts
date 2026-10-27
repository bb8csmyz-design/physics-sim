/**
 * ドップラー効果（音源・観測者・風が一直線上にある場合）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 音源と観測者を結ぶ直線を x 軸とし、右向きを正とする。原点は画面中央。
 *   t = 0 で音源は x = XS0（左）、観測者は x = XO0（右）にいて、それぞれ等速 v_S, v_O で動く。
 *   風（空気の流れ）は右向きに w。音は空気に対して音速 V で球面状に広がる。
 *
 * 時間発展: 音源は時刻 t_k = k / f₀（k = 0, 1, 2, …）に波面（音波の山）を 1 枚ずつ出す。
 *   波面の中心は放出した位置から風で流され、半径は V(t − t_k) で広がる。
 *   観測者が波面に追いつかれた（波面の内側に入った）時刻を記録し、その間隔から観測振動数を測る。
 *   運動はすべて等速なので位置は解析的に求まり、到達時刻も 1 ステップ内で厳密に求められる。
 *
 * 公式（音源 → 観測者の向きを正として）: f = (V + w − v_O) / (V + w − v_S) · f₀
 */
import { SPEED_OF_SOUND } from '@/core/physics/constants';
import type { ParamSpec, ParamValues } from '@/core/params';

export type DopplerParamKey = 'f0' | 'vs' | 'vo' | 'w';
export type DopplerParams = ParamValues<DopplerParamKey>;

export const PARAMS: readonly ParamSpec<DopplerParamKey>[] = [
  {
    key: 'f0',
    label: '音源の振動数',
    symbol: 'f_0',
    unit: 'Hz',
    min: 200,
    max: 1000,
    step: 10,
    default: 500,
  },
  {
    key: 'vs',
    label: '音源の速度',
    symbol: 'v_S',
    unit: 'm/s',
    min: -80,
    max: 80,
    step: 1,
    default: 34,
    hint: '右向きが正（はじめは観測者に近づく向き）',
  },
  {
    key: 'vo',
    label: '観測者の速度',
    symbol: 'v_O',
    unit: 'm/s',
    min: -80,
    max: 80,
    step: 1,
    default: 0,
    hint: '右向きが正（はじめは音源から遠ざかる向き）',
  },
  {
    key: 'w',
    label: '風速',
    symbol: 'w',
    unit: 'm/s',
    min: -20,
    max: 20,
    step: 1,
    default: 0,
    hint: '右向きが正',
  },
];

/** 音速 V [m/s]（空気に対する速さ） */
export const V = SPEED_OF_SOUND;
/** t = 0 での音源の位置 [m] */
export const XS0 = -5;
/** t = 0 での観測者の位置 [m] */
export const XO0 = 1;
/** シミュレーションする時間 [s]（既定の条件で、すれ違った後まで見られる長さ） */
export const DURATION = 0.3;
/**
 * 物理ステップの刻み幅 [s]。到達時刻は刻み幅によらず厳密に求まるので、
 * 波形グラフが滑らかに描ける細かさ（最大振動数でも 1 周期 25 点以上）で決めている。
 */
export const DT = 2e-5;
/** これより大きくなった波面は画面の外なので捨てる [m] */
const MAX_RADIUS = 40;

export interface Wavefront {
  /** 放出した時刻 t_k [s] */
  te: number;
  /** 放出した位置 [m] */
  xe: number;
}

export interface DopplerState {
  t: number;
  /** 音源の位置 [m] */
  xs: number;
  /** 観測者の位置 [m] */
  xo: number;
  /** 空気中に残っている波面（古い順） */
  fronts: readonly Wavefront[];
  /** これまでに放出した波面の数（次に放出する波面の番号） */
  emitted: number;
  /** 観測者に届いた波面の数 */
  received: number;
  /** 直近 2 回の到達時刻 [s]（古い順、最大 2 個） */
  arrivals: readonly number[];
}

export function sourcePosition(p: DopplerParams, t: number): number {
  return XS0 + p.vs * t;
}

export function observerPosition(p: DopplerParams, t: number): number {
  return XO0 + p.vo * t;
}

/** 時刻 t での波面の中心 [m]（放出位置から風で流される） */
export function frontCenter(p: DopplerParams, f: Wavefront, t: number): number {
  return f.xe + p.w * (t - f.te);
}

/** 時刻 t での波面の半径 [m] */
export function frontRadius(f: Wavefront, t: number): number {
  return V * (t - f.te);
}

export function initialState(p: DopplerParams): DopplerState {
  return {
    t: 0,
    xs: sourcePosition(p, 0),
    xo: observerPosition(p, 0),
    fronts: [],
    emitted: 0,
    received: 0,
    arrivals: [],
  };
}

/** 観測者が波面の内側にどれだけ入っているか [m]（負なら外側）。等速運動なので τ について区分的に 1 次式 */
function inside(p: DopplerParams, f: Wavefront, tau: number): number {
  return frontRadius(f, tau) - Math.abs(observerPosition(p, tau) - frontCenter(p, f, tau));
}

export function step(p: DopplerParams, s: DopplerState, dt: number): DopplerState {
  const t1 = s.t + dt;
  let fronts = s.fronts;
  let emitted = s.emitted;
  let received = s.received;
  let arrivals = s.arrivals;

  // 1) この刻みの間に放出される波面（t_k = k / f₀ ≤ t1）
  const added: Wavefront[] = [];
  while (emitted / p.f0 <= t1 + 1e-15) {
    const te = emitted / p.f0;
    added.push({ te, xe: sourcePosition(p, te) });
    emitted++;
  }
  if (added.length) fronts = [...fronts, ...added];

  // 2) 観測者に届いた波面（音源が音速より遅いので、波面は放出順に 1 回ずつ届く）
  const firstIndex = s.emitted - s.fronts.length; // fronts[0] の番号
  const newArrivals: number[] = [];
  for (;;) {
    const f = fronts[received - firstIndex];
    if (!f) break;
    if (inside(p, f, t1) < 0) break;
    // 刻みの始め（またはその後の放出時刻）と終わりの間で 1 次補間すると、到達時刻が厳密に求まる
    const a = Math.max(s.t, f.te);
    const ga = inside(p, f, a);
    const gb = inside(p, f, t1);
    newArrivals.push(gb === ga ? a : a + ((t1 - a) * -ga) / (gb - ga));
    received++;
  }
  if (newArrivals.length) arrivals = [...arrivals, ...newArrivals].slice(-2);

  // 3) 十分に広がった（画面外の）波面を捨てる。まだ観測者に届いていないものは残す
  let drop = 0;
  while (
    drop < fronts.length &&
    firstIndex + drop < received &&
    frontRadius(fronts[drop]!, t1) > MAX_RADIUS
  ) {
    drop++;
  }
  if (drop) fronts = fronts.slice(drop);

  return {
    t: t1,
    xs: sourcePosition(p, t1),
    xo: observerPosition(p, t1),
    fronts,
    emitted,
    received,
    arrivals,
  };
}

/** 直近 2 回の到達間隔から測った観測振動数 [Hz]。まだ 2 回届いていなければ NaN */
export function measuredFrequency(s: DopplerState): number {
  if (s.arrivals.length < 2) return NaN;
  return 1 / (s.arrivals[1]! - s.arrivals[0]!);
}

/**
 * 音が伝わる向き（音源から見た観測者の側）。+1 = 右向き（観測者が右側）、-1 = 左向き。
 * 公式では「音源 → 観測者の向き」を正にとるので、この向きに速度を射影して使う。
 */
export type Side = 1 | -1;

/** 向き side に進む音の、地面に対する速さ V ± w [m/s] */
export function soundSpeed(p: DopplerParams, side: Side): number {
  return V + side * p.w;
}

/** 音源の side 側に出ていく音の波長 λ = (V ± w ∓ v_S) / f₀ [m] */
export function wavelength(p: DopplerParams, side: Side): number {
  return (soundSpeed(p, side) - side * p.vs) / p.f0;
}

/** 観測者が音源の side 側にいるときの観測振動数 f = (V + w − v_O)/(V + w − v_S) · f₀（向きは side を正） */
export function observedFrequency(p: DopplerParams, side: Side): number {
  return (p.f0 * (soundSpeed(p, side) - side * p.vo)) / (soundSpeed(p, side) - side * p.vs);
}

/**
 * 時刻 t に観測者へ届いている音が、音源から出た時刻 t_e（解析解）。まだ音が届いていなければ NaN。
 * side 側へ進む音について  x_S(t_e) + (V ± w)(t − t_e)·side = x_O(t)  を t_e について解く。
 */
export function emissionTime(p: DopplerParams, t: number): number {
  for (const side of [1, -1] as const) {
    const c = soundSpeed(p, side);
    const te = (side * (observerPosition(p, t) - XS0) - c * t) / (side * p.vs - c);
    // 0 ≤ t_e ≤ t なら、その向きの音が実際に届いている（音源が音速より遅いので解はどちらか一方）
    // （t_e = 0 ちょうどの最初の波面が丸め誤差で負にならないよう、わずかな幅をもたせる）
    if (te >= -1e-12 && te <= t + 1e-12) return Math.min(t, Math.max(0, te));
  }
  return NaN;
}

/** 時刻 t に観測者が受け取る音の振動数（解析解）[Hz]。まだ届いていなければ NaN */
export function instantaneousFrequency(p: DopplerParams, t: number): number {
  const te = emissionTime(p, t);
  if (Number.isNaN(te)) return NaN;
  const side: Side = observerPosition(p, t) - sourcePosition(p, te) >= 0 ? 1 : -1;
  return observedFrequency(p, side);
}

/** 観測者の位置での空気の振動（相対値 -1〜1）。音源が sin(2πf₀t) で振動するとして、届いた音の位相から求める */
export function receivedSignal(p: DopplerParams, t: number): number {
  const te = emissionTime(p, t);
  return Number.isNaN(te) ? 0 : Math.sin(2 * Math.PI * p.f0 * te);
}

/** 音源そのものの振動（比較用） */
export function sourceSignal(p: DopplerParams, t: number): number {
  return Math.sin(2 * Math.PI * p.f0 * t);
}

/** 最初の音が観測者に届く時刻 [s]（音源が t = 0 に出した波面） */
export function firstArrivalTime(p: DopplerParams): number {
  return (XO0 - XS0) / (soundSpeed(p, 1) - p.vo);
}
