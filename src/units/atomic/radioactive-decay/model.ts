/**
 * 放射性崩壊と半減期の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 対象: 半減期 T の放射性原子核（親核）が N₀ 個。崩壊してできた原子核（娘核）は安定とする。
 * 時刻: 観測を始めた瞬間を t = 0 とする。
 *
 * 各原子核は、ほかの原子核とは無関係に、まだ崩壊していなければ単位時間あたり一定の確率 λ（崩壊定数）で崩壊する。
 * このとき残っている数の期待値は
 *   N(t) = N₀ e^{−λt} = N₀ (1/2)^{t/T},   λ = ln2 / T
 *
 * シミュレーション: 各原子核が崩壊する時刻（寿命）を、平均 τ = 1/λ の指数分布に従う乱数で決めておく。
 * 指数分布は「無記憶性」をもつので、これは「残っている原子核が次の dt の間に確率 λdt で崩壊する」ことと同じである。
 */
import type { ParamSpec, ParamValues } from '@/core/params';
import { Rng, seedRng } from '@/core/random';

export type DecayParamKey = 'T' | 'N0';
export type DecayParams = ParamValues<DecayParamKey>;

export const PARAMS: readonly ParamSpec<DecayParamKey>[] = [
  {
    key: 'T',
    label: '半減期',
    symbol: 'T',
    unit: 's',
    min: 1,
    max: 20,
    step: 0.5,
    default: 5,
    hint: '原子核の数が半分になるまでの時間。核種で決まり、温度や圧力では変わらない',
  },
  {
    key: 'N0',
    label: '初めの原子核の数',
    symbol: 'N_0',
    unit: '個',
    min: 100,
    max: 2000,
    step: 100,
    default: 400,
  },
];

/** 物理ステップの刻み幅 [s]。崩壊の時刻は乱数で決めてあるので、刻み幅は表示と計数の時間分解能だけを決める */
export const DT = 0.01;
/** 放射能の測定: 直近 T × この割合の時間に崩壊した数を数える */
export const ACTIVITY_WINDOW_RATIO = 0.1;

export interface DecayState {
  /** 経過時間 [s] */
  t: number;
  /** i 番目の原子核が崩壊する時刻 [s] */
  decayTimes: readonly number[];
  /** decayTimes を小さい順に並べたもの（数を数えるのに使う） */
  sorted: readonly number[];
}

/** 崩壊定数 λ = ln2 / T [1/s] */
export function decayConstant(p: DecayParams): number {
  return Math.LN2 / p.T;
}

/** 平均寿命 τ = 1/λ = T / ln2 [s] */
export function meanLife(p: DecayParams): number {
  return p.T / Math.LN2;
}

/** 残っている原子核の数の理論値 N(t) = N₀ (1/2)^{t/T} */
export function expectedRemaining(p: DecayParams, t: number): number {
  return p.N0 * 0.5 ** (t / p.T);
}

/** 放射能（単位時間あたりの崩壊数）の理論値 A = λN [Bq] */
export function expectedActivity(p: DecayParams, t: number): number {
  return decayConstant(p) * expectedRemaining(p, t);
}

export function initialState(p: DecayParams, seed = 1): DecayState {
  const rng = new Rng(seedRng(seed));
  const tau = meanLife(p);
  const decayTimes = Array.from({ length: Math.round(p.N0) }, () => rng.exponential(tau));
  return { t: 0, decayTimes, sorted: [...decayTimes].sort((a, b) => a - b) };
}

/** 崩壊の時刻は決めてあるので、時間を進めるだけ */
export function step(_p: DecayParams, s: DecayState, dt: number): DecayState {
  return { ...s, t: s.t + dt };
}

/** 時刻 t までに崩壊した原子核の数（二分探索） */
export function decayedBy(s: DecayState, t: number): number {
  let lo = 0;
  let hi = s.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.sorted[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 残っている（まだ崩壊していない）原子核の数 */
export function remaining(s: DecayState): number {
  return s.sorted.length - decayedBy(s, s.t);
}

/** 放射能を測る時間の幅 [s] */
export function activityWindow(p: DecayParams): number {
  return p.T * ACTIVITY_WINDOW_RATIO;
}

/** 直近の時間幅 w に崩壊した数 ÷ w [Bq]（測定開始直後は経過時間で割る） */
export function measuredActivity(p: DecayParams, s: DecayState): number {
  if (s.t <= 0) return 0;
  const w = Math.min(activityWindow(p), s.t);
  return (decayedBy(s, s.t) - decayedBy(s, s.t - w)) / w;
}

/** measuredActivity の期待値 [Bq]（幅 w の間の平均の放射能） */
export function expectedMeasuredActivity(p: DecayParams, t: number): number {
  if (t <= 0) return expectedActivity(p, 0);
  const w = Math.min(activityWindow(p), t);
  return (expectedRemaining(p, t - w) - expectedRemaining(p, t)) / w;
}
