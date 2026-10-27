/**
 * 磁場中のレール上を動く導体棒（電磁誘導）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 設定: 水平な 2 本の平行レール（間隔 l）の左端を抵抗 R でつなぎ、レールの上に質量 m の導体棒を
 *       垂直に置く。鉛直上向き（真上から見て紙面の裏から表 ⊙）に一様な磁場 B。
 *       棒に右向きの一定の力 F を加え続ける（初速度 v₀ も与えられる）。摩擦・棒とレールの抵抗・
 *       回路の自己インダクタンスは無視する。
 * 座標: 抵抗の位置を原点、レールに沿って右向きを x 軸正。棒の位置 x、速度 v。
 * 電流の向き: 真上から見て時計回り（棒の中を手前 → 奥、図では上 → 下）を正とする。
 *
 * 誘導起電力 V = vBl,  電流 I = V/R,  棒が磁場から受ける力 −IBl = −(B²l²/R)v
 * 運動方程式 m dv/dt = F − (B²l²/R) v  →  v = v_f + (v₀ − v_f) e^{−t/τ},
 *   終端速度 v_f = FR/(B²l²),  時定数 τ = mR/(B²l²)
 * 速度に比例する力を含むので RK4 で解く（解析解と比較してテストする）。
 */
import { rk4Step } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';

export type InductionParamKey = 'B' | 'l' | 'R' | 'm' | 'F' | 'v0';
export type InductionParams = ParamValues<InductionParamKey>;

export const PARAMS: readonly ParamSpec<InductionParamKey>[] = [
  {
    key: 'B',
    label: '磁束密度',
    symbol: 'B',
    unit: 'T',
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.5,
  },
  {
    key: 'l',
    label: 'レールの間隔',
    symbol: 'l',
    unit: 'm',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.5,
  },
  { key: 'R', label: '抵抗', symbol: 'R', unit: 'Ω', min: 0.5, max: 5, step: 0.1, default: 1 },
  {
    key: 'm',
    label: '棒の質量',
    symbol: 'm',
    unit: 'kg',
    min: 0.05,
    max: 0.5,
    step: 0.01,
    default: 0.1,
  },
  {
    key: 'F',
    label: '外力',
    symbol: 'F',
    unit: 'N',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.1,
    hint: '棒を右向きに引く一定の力',
  },
  { key: 'v0', label: '初速度', symbol: 'v_0', unit: 'm/s', min: 0, max: 3, step: 0.1, default: 0 },
];

/** 棒の最初の位置（抵抗からの距離）[m] */
export const X0 = 0.3;
/** 物理ステップの刻み幅 [s]。パラメータ範囲全体で Δt ≤ τ/25 */
export const DT = 1e-3;

export interface InductionState {
  /** 棒の位置 [m] */
  x: number;
  /** 棒の速度 [m/s] */
  v: number;
  /** 抵抗で発生したジュール熱の累計 [J] */
  heat: number;
  /** 外力がした仕事の累計 [J] */
  work: number;
}

export function initialState(p: InductionParams): InductionState {
  return { x: X0, v: p.v0, heat: 0, work: 0 };
}

/** 誘導起電力 V = vBl [V] */
export function emf(p: InductionParams, v: number): number {
  return v * p.B * p.l;
}

/** 誘導電流 I = vBl/R [A]（時計回りを正） */
export function current(p: InductionParams, v: number): number {
  return emf(p, v) / p.R;
}

/** 棒が磁場から受ける力（電流が磁場から受ける力）−IBl [N]（x 成分。常に速度と逆向き） */
export function magneticForce(p: InductionParams, v: number): number {
  return -current(p, v) * p.B * p.l;
}

/** 回路を貫く磁束 Φ = B l x [Wb] */
export function flux(p: InductionParams, x: number): number {
  return p.B * p.l * x;
}

/** 終端速度 v_f = FR/(Bl)² [m/s] */
export function terminalVelocity(p: InductionParams): number {
  return (p.F * p.R) / (p.B * p.l) ** 2;
}

/** 時定数 τ = mR/(Bl)² [s] */
export function timeConstant(p: InductionParams): number {
  return (p.m * p.R) / (p.B * p.l) ** 2;
}

export function step(p: InductionParams, s: InductionState, dt: number): InductionState {
  const k = (p.B * p.l) ** 2 / p.R; // 電磁力の比例係数 B²l²/R [N·s/m]
  const { F, m } = p;
  // 状態ベクトル [x, v, ジュール熱, 外力の仕事]
  const y = rk4Step(
    (_t, u) => [u[1]!, (F - k * u[1]!) / m, k * u[1]! * u[1]!, F * u[1]!],
    0,
    [s.x, s.v, s.heat, s.work],
    dt,
  );
  return { x: y[0]!, v: y[1]!, heat: y[2]!, work: y[3]! };
}

/**
 * 解析解。v = v_f + (v₀ − v_f)e^{−t/τ},  x = X0 + v_f t + (v₀ − v_f)τ(1 − e^{−t/τ})
 * ジュール熱 Q = ∫ I²R dt = (m/τ)∫ v² dt、外力の仕事 W = F(x − X0)
 */
export function analyticState(p: InductionParams, t: number): InductionState {
  const vf = terminalVelocity(p);
  const tau = timeConstant(p);
  const d = p.v0 - vf;
  const e1 = Math.exp(-t / tau);
  const x = X0 + vf * t + d * tau * (1 - e1);
  const intV2 = vf * vf * t + 2 * vf * d * tau * (1 - e1) + ((d * d * tau) / 2) * (1 - e1 * e1);
  return { x, v: vf + d * e1, heat: (p.m / tau) * intV2, work: p.F * (x - X0) };
}

/** 運動エネルギー ½mv² [J] */
export function kineticEnergy(p: InductionParams, s: InductionState): number {
  return 0.5 * p.m * s.v * s.v;
}

/** 回路を流れた電気量 q = ΔΦ/R [C]（時計回りを正） */
export function chargePassed(p: InductionParams, s: InductionState): number {
  return (flux(p, s.x) - flux(p, X0)) / p.R;
}
