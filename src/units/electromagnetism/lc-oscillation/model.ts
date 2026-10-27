/**
 * 電気振動（LC 回路）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 回路: 電圧 V₀ に充電したコンデンサー C を、t = 0 にスイッチを閉じてコイル L（抵抗なし）につなぐ。
 * 符号: q はコンデンサーの上側の極板の電気量（t = 0 で Q₀ = CV₀ > 0）。電流 i は上側の極板から
 *   コイルへ流れ出す向きを正とする（i = −dq/dt）。
 *
 * キルヒホッフの第 2 法則: q/C = L di/dt  →  d²q/dt² = −q/(LC)
 *   ばねの単振動と同じ形（q ↔ x, L ↔ m, 1/C ↔ k）。ω = 1/√(LC), T = 2π√(LC)
 * エネルギーが保存される系なので、シンプレクティック法（速度ベルレ法）で解く。
 */
import { velocityVerletStep } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type LcParamKey = 'L' | 'C' | 'V0';
export type LcParams = ParamValues<LcParamKey>;

export const PARAMS: readonly ParamSpec<LcParamKey>[] = [
  {
    key: 'L',
    label: '自己インダクタンス',
    symbol: 'L',
    unit: 'mH',
    min: 10,
    max: 100,
    step: 1,
    default: 50,
  },
  { key: 'C', label: '電気容量', symbol: 'C', unit: 'μF', min: 10, max: 100, step: 1, default: 20 },
  {
    key: 'V0',
    label: 'はじめの電圧',
    symbol: 'V_0',
    unit: 'V',
    min: 1,
    max: 12,
    step: 0.5,
    default: 10,
    hint: 'スイッチを閉じる前にコンデンサーを充電しておいた電圧',
  },
];

/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で ωΔt ≤ 0.04 */
export const DT = 1e-5;
/** 再生速度（実時間 1 s でシミュレーション時間 1/500 s 進む）。周期 2〜20 ms の振動を目で追えるようにする */
export const TIME_SCALE = 1 / 500;

export interface LcState {
  /** コンデンサーの電気量 [C] */
  q: number;
  /** 電流 [A]（上側の極板からコイルへ流れ出す向きが正） */
  i: number;
}

export function henries(p: LcParams): number {
  return p.L * 1e-3;
}
export function farads(p: LcParams): number {
  return p.C * 1e-6;
}

/** はじめの電気量 Q₀ = CV₀ [C] */
export function initialCharge(p: LcParams): number {
  return farads(p) * p.V0;
}

export function initialState(p: LcParams): LcState {
  return { q: initialCharge(p), i: 0 };
}

/** 角周波数 ω = 1/√(LC) [rad/s] */
export function angularFrequency(p: LcParams): number {
  return 1 / Math.sqrt(henries(p) * farads(p));
}

/** 周期 T = 2π√(LC) [s] */
export function period(p: LcParams): number {
  return 2 * Math.PI * Math.sqrt(henries(p) * farads(p));
}

/** 固有周波数 f = 1/(2π√(LC)) [Hz] */
export function frequency(p: LcParams): number {
  return 1 / period(p);
}

/** 電流の最大値 I₀ = Q₀ω = V₀√(C/L) [A] */
export function maxCurrent(p: LcParams): number {
  return p.V0 * Math.sqrt(farads(p) / henries(p));
}

/** 速度ベルレ法で 1 ステップ進める（x = q, v = dq/dt = −i, 加速度 = −q/(LC)） */
export function step(p: LcParams, s: LcState, dt: number): LcState {
  const w2 = 1 / (henries(p) * farads(p));
  const next = velocityVerletStep((_t, x) => [-w2 * x[0]!], 0, { x: [s.q], v: [-s.i] }, dt);
  return { q: next.x[0]!, i: -next.v[0]! };
}

/** 解析解 q = Q₀ cos ωt,  i = Q₀ω sin ωt */
export function analyticState(p: LcParams, t: number): LcState {
  const w = angularFrequency(p);
  const Q0 = initialCharge(p);
  return { q: Q0 * Math.cos(w * t), i: Q0 * w * Math.sin(w * t) };
}

export interface Energies {
  /** 静電エネルギー q²/2C [J] */
  electric: number;
  /** コイルの（磁場の）エネルギー ½Li² [J] */
  magnetic: number;
  total: number;
}

export function energies(p: LcParams, s: LcState): Energies {
  const electric = (s.q * s.q) / (2 * farads(p));
  const magnetic = 0.5 * henries(p) * s.i * s.i;
  return { electric, magnetic, total: electric + magnetic };
}

/** コンデンサーの電圧 V = q/C（= コイルの電圧 L di/dt）[V] */
export function capacitorVoltage(p: LcParams, q: number): number {
  return q / farads(p);
}
