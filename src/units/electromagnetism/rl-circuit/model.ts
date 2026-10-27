/**
 * RL 回路の過渡現象（コイルの自己誘導）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 回路: 電池（起電力 E, 内部抵抗なし）・抵抗 R・コイル（自己インダクタンス L, 抵抗なし）と、
 *   切り替えスイッチ S。a 側で電池・R・L の直列回路、b 側で電池を外した R と L だけの回路になる
 *   （切り替えの瞬間も回路は切れないものとする）。
 * 符号: 電流 I は電池の正極から抵抗を通ってコイルへ流れる向きを正とする。
 *   コイルの電圧 V_L = L dI/dt（電流の向きに測った電位の下がり。自己誘導起電力の大きさ）。
 *
 * キルヒホッフの第 2 法則: E_S = RI + L dI/dt（E_S は a 側なら E、b 側なら 0）
 *   → I(t) = I∞ + (I₀ − I∞)e^{−t/τ},  τ = L/R,  I∞ = E_S/R
 * 一般の微分方程式なので RK4 で解く（ジュール熱・電池の仕事・流れた電気量も同時に積算する）。
 */
import { rk4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type RlParamKey = 'E' | 'R' | 'L';
export type RlParams = ParamValues<RlParamKey>;

export const PARAMS: readonly ParamSpec<RlParamKey>[] = [
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
  { key: 'R', label: '抵抗', symbol: 'R', unit: 'Ω', min: 10, max: 100, step: 1, default: 20 },
  {
    key: 'L',
    label: '自己インダクタンス',
    symbol: 'L',
    unit: 'mH',
    min: 100,
    max: 1000,
    step: 10,
    default: 400,
  },
];

export type SwitchPosition = 'a' | 'b';

/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で Δt ≤ τ/50 */
export const DT = 2e-5;
/** 再生速度（実時間 1 s でシミュレーション時間 1/50 s 進む）。τ = 1〜100 ms の変化を目で追えるようにする */
export const TIME_SCALE = 1 / 50;

export interface RlState {
  /** 電流 [A] */
  I: number;
  /** 抵抗で発生したジュール熱の累計 [J] */
  heat: number;
  /** 電池がした仕事の累計 [J] */
  work: number;
  /** 流れた電気量の累計 ∫I dt [C]（電流の流れの表示に使う） */
  charge: number;
}

export function initialState(): RlState {
  return { I: 0, heat: 0, work: 0, charge: 0 };
}

/** SI 単位の自己インダクタンス [H] */
export function henries(p: RlParams): number {
  return p.L * 1e-3;
}

/** 時定数 τ = L/R [s] */
export function timeConstant(p: RlParams): number {
  return henries(p) / p.R;
}

export function sourceEmf(p: RlParams, sw: SwitchPosition): number {
  return sw === 'a' ? p.E : 0;
}

/** コイルの電圧 V_L = L dI/dt = E_S − RI [V]（自己誘導起電力の大きさ。電流を妨げる向き） */
export function coilVoltage(p: RlParams, I: number, sw: SwitchPosition): number {
  return sourceEmf(p, sw) - p.R * I;
}

/** コイルに蓄えられたエネルギー U = ½LI² [J] */
export function coilEnergy(p: RlParams, I: number): number {
  return 0.5 * henries(p) * I * I;
}

export function step(p: RlParams, s: RlState, dt: number, sw: SwitchPosition): RlState {
  const L = henries(p);
  const { R } = p;
  const E = sourceEmf(p, sw);
  // 状態ベクトル [I, ジュール熱, 電池の仕事, 流れた電気量]
  const y = rk4Step(
    (_t, u) => {
      const I = u[0]!;
      return [(E - R * I) / L, I * I * R, E * I, I];
    },
    0,
    [s.I, s.heat, s.work, s.charge],
    dt,
  );
  return { I: y[0]!, heat: y[1]!, work: y[2]!, charge: y[3]! };
}

/**
 * 解析解（スイッチの位置を変えずに t だけたったとき）。d = I₀ − I∞ として
 *   I = I∞ + d e^{−t/τ},  ∫I dt = I∞t + dτ(1 − e^{−t/τ}),
 *   ジュール熱 = R∫I²dt = R[I∞²t + 2I∞dτ(1 − e^{−t/τ}) + d²(τ/2)(1 − e^{−2t/τ})]
 */
export function analyticState(p: RlParams, s0: RlState, t: number, sw: SwitchPosition): RlState {
  const tau = timeConstant(p);
  const iInf = sourceEmf(p, sw) / p.R;
  const d = s0.I - iInf;
  const e = Math.exp(-t / tau);
  const q = iInf * t + d * tau * (1 - e);
  const intI2 = iInf * iInf * t + 2 * iInf * d * tau * (1 - e) + ((d * d * tau) / 2) * (1 - e * e);
  return {
    I: iInf + d * e,
    heat: s0.heat + p.R * intI2,
    work: s0.work + sourceEmf(p, sw) * q,
    charge: s0.charge + q,
  };
}
