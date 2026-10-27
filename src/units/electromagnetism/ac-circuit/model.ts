/**
 * 交流回路（RLC 直列回路）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 回路: 交流電源 v = V₀ sin ωt（V₀ = √2 V_e）に、抵抗 R・コイル L・コンデンサー C を直列につなぐ。
 * 符号: 電流 i は電源の正極側から R → L → C の順に流れる向きを正とし、q はその向きに電流が流れ込む
 *   コンデンサーの極板の電気量（i = dq/dt）。各素子の電圧は電流の向きに測った電位の下がり。
 *
 * キルヒホッフの第 2 法則: v = Ri + L di/dt + q/C
 * 定常状態（十分時間がたった後）: i = I₀ sin(ωt − φ),  I₀ = V₀/Z,
 *   Z = √(R² + (ωL − 1/ωC)²),  tan φ = (ωL − 1/ωC)/R（φ > 0 なら電流が電圧より遅れる）
 * 一般の微分方程式なので RK4 で解く（ジュール熱・電源の仕事も同時に積算する）。
 */
import { rk4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type AcParamKey = 'Ve' | 'f' | 'R' | 'L' | 'C';
export type AcParams = ParamValues<AcParamKey>;

export const PARAMS: readonly ParamSpec<AcParamKey>[] = [
  {
    key: 'Ve',
    label: '電源電圧の実効値',
    symbol: 'V_e',
    unit: 'V',
    min: 1,
    max: 100,
    step: 1,
    default: 100,
  },
  { key: 'f', label: '周波数', symbol: 'f', unit: 'Hz', min: 10, max: 200, step: 1, default: 50 },
  { key: 'R', label: '抵抗', symbol: 'R', unit: 'Ω', min: 5, max: 100, step: 1, default: 20 },
  {
    key: 'L',
    label: '自己インダクタンス',
    symbol: 'L',
    unit: 'mH',
    min: 50,
    max: 500,
    step: 10,
    default: 100,
  },
  {
    key: 'C',
    label: '電気容量',
    symbol: 'C',
    unit: 'μF',
    min: 20,
    max: 500,
    step: 10,
    default: 200,
  },
];

/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で ωΔt, ω₀Δt ≤ 0.04、RΔt/L ≤ 0.04 */
export const DT = 2e-5;
/** 再生速度（実時間 1 s でシミュレーション時間 1/100 s 進む）。50 Hz なら 1 周期 2 秒で見える */
export const TIME_SCALE = 1 / 100;

/** 始め方: 'steady' = 定常状態から, 'rest' = 電源を入れた瞬間（q = 0, i = 0）から */
export type StartMode = 'steady' | 'rest';

export interface AcState {
  /** コンデンサーの電気量 [C] */
  q: number;
  /** 電流 [A] */
  i: number;
  /** 抵抗で発生したジュール熱の累計 [J] */
  heat: number;
  /** 電源がした仕事の累計 [J] */
  work: number;
}

export function henries(p: AcParams): number {
  return p.L * 1e-3;
}
export function farads(p: AcParams): number {
  return p.C * 1e-6;
}

/** 電源電圧の最大値 V₀ = √2 V_e [V] */
export function peakVoltage(p: AcParams): number {
  return Math.SQRT2 * p.Ve;
}
/** 角周波数 ω = 2πf [rad/s] */
export function angularFrequency(p: AcParams): number {
  return 2 * Math.PI * p.f;
}
/** 誘導リアクタンス X_L = ωL [Ω] */
export function inductiveReactance(p: AcParams): number {
  return angularFrequency(p) * henries(p);
}
/** 容量リアクタンス X_C = 1/(ωC) [Ω] */
export function capacitiveReactance(p: AcParams): number {
  return 1 / (angularFrequency(p) * farads(p));
}
/** インピーダンス Z = √(R² + (X_L − X_C)²) [Ω] */
export function impedance(p: AcParams): number {
  return Math.hypot(p.R, inductiveReactance(p) - capacitiveReactance(p));
}
/** 電圧に対する電流の位相の遅れ φ [rad]（負なら電流が進む） */
export function phaseLag(p: AcParams): number {
  return Math.atan2(inductiveReactance(p) - capacitiveReactance(p), p.R);
}
/** 電流の最大値 I₀ = V₀/Z と実効値 I_e = V_e/Z [A] */
export function peakCurrent(p: AcParams): number {
  return peakVoltage(p) / impedance(p);
}
export function rmsCurrent(p: AcParams): number {
  return p.Ve / impedance(p);
}
/** 平均の消費電力 P = V_e I_e cos φ = I_e² R [W] */
export function averagePower(p: AcParams): number {
  return rmsCurrent(p) ** 2 * p.R;
}
/** 共振周波数 f₀ = 1/(2π√(LC)) [Hz] */
export function resonanceFrequency(p: AcParams): number {
  return 1 / (2 * Math.PI * Math.sqrt(henries(p) * farads(p)));
}

/** 電源電圧 v(t) = V₀ sin ωt [V] */
export function sourceVoltage(p: AcParams, t: number): number {
  return peakVoltage(p) * Math.sin(angularFrequency(p) * t);
}

/** 定常状態の解 i = I₀ sin(ωt − φ),  q = −(I₀/ω) cos(ωt − φ) */
export function steadyState(p: AcParams, t: number): { q: number; i: number } {
  const w = angularFrequency(p);
  const I0 = peakCurrent(p);
  const th = w * t - phaseLag(p);
  return { q: -(I0 / w) * Math.cos(th), i: I0 * Math.sin(th) };
}

export function initialState(p: AcParams, mode: StartMode): AcState {
  const s = mode === 'steady' ? steadyState(p, 0) : { q: 0, i: 0 };
  return { ...s, heat: 0, work: 0 };
}

export function step(p: AcParams, s: AcState, t: number, dt: number): AcState {
  const L = henries(p);
  const C = farads(p);
  const { R } = p;
  const V0 = peakVoltage(p);
  const w = angularFrequency(p);
  // 状態ベクトル [q, i, ジュール熱, 電源の仕事]
  const y = rk4Step(
    (tt, u) => {
      const v = V0 * Math.sin(w * tt);
      const i = u[1]!;
      return [i, (v - R * i - u[0]! / C) / L, i * i * R, v * i];
    },
    t,
    [s.q, s.i, s.heat, s.work],
    dt,
  );
  return { q: y[0]!, i: y[1]!, heat: y[2]!, work: y[3]! };
}

export interface ElementVoltages {
  /** 電源電圧 v */
  source: number;
  /** 抵抗の電圧 v_R = Ri */
  R: number;
  /** コイルの電圧 v_L = L di/dt */
  L: number;
  /** コンデンサーの電圧 v_C = q/C */
  C: number;
}

/** 各素子の電圧 [V]（v_L はキルヒホッフの法則 v = v_R + v_L + v_C から求める） */
export function elementVoltages(p: AcParams, s: AcState, t: number): ElementVoltages {
  const source = sourceVoltage(p, t);
  const vR = p.R * s.i;
  const vC = s.q / farads(p);
  return { source, R: vR, L: source - vR - vC, C: vC };
}

/** コイルとコンデンサーに蓄えられたエネルギー ½Li² + q²/2C [J] */
export function storedEnergy(p: AcParams, s: AcState): number {
  return 0.5 * henries(p) * s.i * s.i + (s.q * s.q) / (2 * farads(p));
}

/** 過渡現象が減衰する時定数 2L/R [s] */
export function decayTime(p: AcParams): number {
  return (2 * henries(p)) / p.R;
}
