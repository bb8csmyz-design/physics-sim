/**
 * RC 回路の過渡現象（コンデンサーの充電・放電）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 回路: 電池（起電力 E, 内部抵抗なし）・抵抗 R・コンデンサー C と、切り替えスイッチ S。
 *   S を a 側に入れると電池・R・C の直列回路（充電）、b 側に入れると電池を外した R と C だけの
 *   回路（放電）になる。
 * 符号: q はコンデンサーの上側の極板（抵抗側）の電気量。電流 I は抵抗を通ってその極板へ向かう
 *   向き（充電の向き）を正とする。I = dq/dt。
 *
 * キルヒホッフの第 2 法則: E_S = RI + q/C（E_S は a 側なら E、b 側なら 0）
 *   → dq/dt = (E_S − q/C)/R,  q(t) = q∞ + (q₀ − q∞)e^{−t/τ},  τ = RC,  q∞ = C E_S
 * 一般の微分方程式なので RK4 で解く（ジュール熱・電池の仕事も同時に積算する）。
 */
import { rk4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type RcParamKey = 'E' | 'R' | 'C';
export type RcParams = ParamValues<RcParamKey>;

export const PARAMS: readonly ParamSpec<RcParamKey>[] = [
  {
    key: 'E',
    label: '電池の起電力',
    symbol: 'E',
    unit: 'V',
    min: 1.5,
    max: 12,
    step: 0.5,
    default: 6,
  },
  { key: 'R', label: '抵抗', symbol: 'R', unit: 'kΩ', min: 1, max: 10, step: 0.5, default: 5 },
  {
    key: 'C',
    label: '電気容量',
    symbol: 'C',
    unit: 'μF',
    min: 100,
    max: 1000,
    step: 10,
    default: 200,
  },
];

/** スイッチの位置: a = 電池側（充電）、b = 電池を外す側（放電） */
export type SwitchPosition = 'a' | 'b';

/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で Δt ≤ τ/100 */
export const DT = 1e-3;

export interface RcState {
  /** コンデンサーの電気量 [C] */
  q: number;
  /** 抵抗で発生したジュール熱の累計 [J] */
  heat: number;
  /** 電池がした仕事の累計 [J] */
  work: number;
}

export function initialState(): RcState {
  return { q: 0, heat: 0, work: 0 };
}

/** SI 単位の抵抗 [Ω] と電気容量 [F] */
export function ohms(p: RcParams): number {
  return p.R * 1e3;
}
export function farads(p: RcParams): number {
  return p.C * 1e-6;
}

/** 時定数 τ = RC [s] */
export function timeConstant(p: RcParams): number {
  return ohms(p) * farads(p);
}

/** 回路に入っている起電力（a 側なら E、b 側なら 0） */
export function sourceEmf(p: RcParams, sw: SwitchPosition): number {
  return sw === 'a' ? p.E : 0;
}

/** 電流 I = (E_S − q/C)/R [A]（充電の向きが正） */
export function current(p: RcParams, q: number, sw: SwitchPosition): number {
  return (sourceEmf(p, sw) - q / farads(p)) / ohms(p);
}

/** コンデンサーの電圧 V_C = q/C [V] */
export function capacitorVoltage(p: RcParams, q: number): number {
  return q / farads(p);
}

/** 静電エネルギー U = q²/2C [J] */
export function capacitorEnergy(p: RcParams, q: number): number {
  return (q * q) / (2 * farads(p));
}

export function step(p: RcParams, s: RcState, dt: number, sw: SwitchPosition): RcState {
  const R = ohms(p);
  const C = farads(p);
  const E = sourceEmf(p, sw);
  // 状態ベクトル [q, ジュール熱, 電池の仕事]
  const y = rk4Step(
    (_t, u) => {
      const I = (E - u[0]! / C) / R;
      return [I, I * I * R, E * I];
    },
    0,
    [s.q, s.heat, s.work],
    dt,
  );
  return { q: y[0]!, heat: y[1]!, work: y[2]! };
}

/**
 * 解析解（スイッチの位置を変えずに t だけたったとき）。
 * q = q∞ + (q₀ − q∞)e^{−t/τ},  ジュール熱 = (q∞ − q₀)²/(2C)·(1 − e^{−2t/τ}),  電池の仕事 = E_S(q − q₀)
 */
export function analyticState(p: RcParams, s0: RcState, t: number, sw: SwitchPosition): RcState {
  const C = farads(p);
  const qInf = C * sourceEmf(p, sw);
  const e = Math.exp(-t / timeConstant(p));
  const q = qInf + (s0.q - qInf) * e;
  return {
    q,
    heat: s0.heat + ((qInf - s0.q) ** 2 / (2 * C)) * (1 - e * e),
    work: s0.work + sourceEmf(p, sw) * (q - s0.q),
  };
}
