/**
 * ボーアの水素原子模型の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 対象: 原子核（電荷 +Ze）のまわりを電子 1 個が回る水素様原子（Z = 1 で水素原子 H、2 で He⁺、3 で Li²⁺）。
 * 座標: 原子核を原点とし、電子は原子核を中心とする半径 r の円軌道を反時計回りに等速円運動する。
 * 原子核は電子よりはるかに重いので静止しているとみなす（高校物理と同じく、換算質量の補正はしない）。
 *
 * ボーアの仮説:
 *   (1) 量子条件  m v r = n h / (2π)  （n = 1, 2, 3, …）。電子波の定常波の条件 2πr = nλ と同じ
 *   (2) 振動数条件  hν = E_n − E_n'   （準位の間を移るときに光子を放出・吸収する）
 * 円運動の運動方程式 m v²/r = k Ze²/r² と (1) から、軌道半径 r_n・速さ v_n・エネルギー E_n が決まる。
 *
 * アニメーションの時間は模式的なもの（実際の周期は 10⁻¹⁶ s 程度で、見える速さではない）。
 * ただし内側と外側の軌道の回る速さの比（角速度 ∝ 1/n³）は実際と同じにしている。
 */
import {
  COULOMB_CONSTANT,
  ELECTRON_MASS,
  ELECTRON_VOLT,
  ELEMENTARY_CHARGE,
  PLANCK,
  SPEED_OF_LIGHT,
  VACUUM_PERMITTIVITY,
} from '@/core/physics/constants';
import type { ParamSpec, ParamValues } from '@/core/params';

export type BohrParamKey = 'Z' | 'n' | 'nf';
export type BohrParams = ParamValues<BohrParamKey>;

/** 表示する準位の上限 */
export const N_MAX = 7;

export const PARAMS: readonly ParamSpec<BohrParamKey>[] = [
  {
    key: 'n',
    label: '初めの準位（量子数）',
    symbol: 'n',
    min: 1,
    max: N_MAX,
    step: 1,
    default: 3,
  },
  {
    key: 'nf',
    label: '移った後の準位（量子数）',
    symbol: "n'",
    min: 1,
    max: N_MAX,
    step: 1,
    default: 2,
    hint: "n' < n なら光子を放出、n' > n なら光子を吸収する",
  },
  {
    key: 'Z',
    label: '原子番号',
    symbol: 'Z',
    min: 1,
    max: 3,
    step: 1,
    default: 1,
    hint: '1: 水素原子 H、2: ヘリウムイオン He⁺、3: リチウムイオン Li²⁺（いずれも電子 1 個）',
  },
];

// ---------------------------------------------------------------------------
// 公式（量子条件 + 円運動の運動方程式）
// ---------------------------------------------------------------------------

/** 軌道半径 r_n = ε₀h²n² / (πme²Z) [m] */
export function orbitRadius(Z: number, n: number): number {
  return (
    (VACUUM_PERMITTIVITY * PLANCK ** 2 * n * n) /
    (Math.PI * ELECTRON_MASS * ELEMENTARY_CHARGE ** 2 * Z)
  );
}

/** 軌道上の速さ v_n = Ze² / (2ε₀hn) [m/s] */
export function orbitSpeed(Z: number, n: number): number {
  return (Z * ELEMENTARY_CHARGE ** 2) / (2 * VACUUM_PERMITTIVITY * PLANCK * n);
}

/** エネルギー準位 E_n = −mZ²e⁴ / (8ε₀²h²n²) [J] */
export function energyLevel(Z: number, n: number): number {
  return (
    -(ELECTRON_MASS * Z * Z * ELEMENTARY_CHARGE ** 4) /
    (8 * VACUUM_PERMITTIVITY ** 2 * PLANCK ** 2 * n * n)
  );
}

/** エネルギー準位 [eV]（水素原子で E_n ≈ −13.6/n² eV） */
export function energyLevelEV(Z: number, n: number): number {
  return energyLevel(Z, n) / ELECTRON_VOLT;
}

/** 運動エネルギー ½mv² [J] */
export function kineticEnergy(Z: number, n: number): number {
  return 0.5 * ELECTRON_MASS * orbitSpeed(Z, n) ** 2;
}

/** 静電気力による位置エネルギー −kZe²/r [J]（無限遠を基準） */
export function potentialEnergy(Z: number, n: number): number {
  return (-COULOMB_CONSTANT * Z * ELEMENTARY_CHARGE ** 2) / orbitRadius(Z, n);
}

/** 1 周の時間 T_n = 2πr_n / v_n [s] */
export function orbitalPeriod(Z: number, n: number): number {
  return (2 * Math.PI * orbitRadius(Z, n)) / orbitSpeed(Z, n);
}

/** 電子のド・ブロイ波長 λ = h/(mv) [m] */
export function deBroglieWavelength(Z: number, n: number): number {
  return PLANCK / (ELECTRON_MASS * orbitSpeed(Z, n));
}

/** イオン化エネルギー（n = 1 の電子を無限遠に引き離すのに必要なエネルギー）[eV] */
export function ionizationEnergyEV(Z: number): number {
  return -energyLevelEV(Z, 1);
}

/** ボーア半径 a₀ = r₁（水素原子の n = 1 の軌道半径）[m] */
export const BOHR_RADIUS = orbitRadius(1, 1);

/** リュードベリ定数 R = me⁴ / (8ε₀²h³c) [1/m]（ボーア模型から導かれる値） */
export const RYDBERG =
  (ELECTRON_MASS * ELEMENTARY_CHARGE ** 4) /
  (8 * VACUUM_PERMITTIVITY ** 2 * PLANCK ** 3 * SPEED_OF_LIGHT);

// ---------------------------------------------------------------------------
// 準位の間の移り変わり（遷移）と光子
// ---------------------------------------------------------------------------

export type TransitionKind = '放出' | '吸収' | 'なし';

export interface Transition {
  kind: TransitionKind;
  /** 下の準位・上の準位の量子数 */
  lower: number;
  upper: number;
  /** 光子のエネルギー hν = E_上 − E_下 [eV]（遷移がなければ 0） */
  energyEV: number;
  /** 光子の振動数 [Hz] */
  frequency: number;
  /** 光子の波長 [nm]（遷移がなければ NaN） */
  wavelengthNm: number;
}

/** 準位 n → n' の遷移で放出・吸収される光子（振動数条件 hν = E_上 − E_下） */
export function transition(p: BohrParams): Transition {
  const lower = Math.min(p.n, p.nf);
  const upper = Math.max(p.n, p.nf);
  const kind: TransitionKind = p.nf < p.n ? '放出' : p.nf > p.n ? '吸収' : 'なし';
  const energy = energyLevel(p.Z, upper) - energyLevel(p.Z, lower);
  const frequency = energy / PLANCK;
  return {
    kind,
    lower,
    upper,
    energyEV: energy / ELECTRON_VOLT,
    frequency,
    wavelengthNm: kind === 'なし' ? NaN : (SPEED_OF_LIGHT / frequency) * 1e9,
  };
}

/** 準位 upper → lower の遷移で出る光の波長 [nm] */
export function lineWavelengthNm(Z: number, upper: number, lower: number): number {
  const energy = energyLevel(Z, upper) - energyLevel(Z, lower);
  return ((PLANCK * SPEED_OF_LIGHT) / energy) * 1e9;
}

/** 系列の極限（upper → ∞）の波長 [nm] = 1 / (RZ²/lower²) */
export function seriesLimitNm(Z: number, lower: number): number {
  return ((lower * lower) / (RYDBERG * Z * Z)) * 1e9;
}

/** 水素原子のスペクトル系列の名前（下の準位で決まる） */
export function seriesName(lower: number): string {
  return (
    [
      'ライマン系列',
      'バルマー系列',
      'パッシェン系列',
      'ブラケット系列',
      'プント系列',
      'ハンフリーズ系列',
    ][lower - 1] ?? ''
  );
}

// ---------------------------------------------------------------------------
// アニメーション（模式的な時間）
// ---------------------------------------------------------------------------

/** 準位が移る時刻 [s]（模式的な時間） */
export const JUMP_TIME = 2;
/** 内側の軌道（2 つの準位のうち小さい方）を 1 周する時間 [s]（模式的な時間） */
export const BASE_PERIOD = 1.6;
/** 光子が電子の位置と画面の端の間を進む時間 [s]（模式的な時間） */
export const PHOTON_TRAVEL = 1.4;
/** 物理ステップの刻み幅 [s]。1 ステップで回る角は 0.05 rad 以下 */
export const DT = 1 / 120;

export interface BohrState {
  /** 経過時間 [s]（模式的な時間） */
  t: number;
}

export function initialState(): BohrState {
  return { t: 0 };
}

/** 表示上の角速度 [rad/s]。実際の角速度 ω_n = v_n/r_n ∝ Z²/n³ と同じ比で、内側の軌道の周期を BASE_PERIOD にそろえる */
export function displayAngularSpeed(p: BohrParams, n: number): number {
  const inner = Math.min(p.n, p.nf);
  const ratio =
    orbitSpeed(p.Z, n) / orbitRadius(p.Z, n) / (orbitSpeed(p.Z, inner) / orbitRadius(p.Z, inner));
  return ((2 * Math.PI) / BASE_PERIOD) * ratio;
}

/** 時刻 t の電子の準位 */
export function levelAt(p: BohrParams, t: number): number {
  return t < JUMP_TIME ? p.n : p.nf;
}

/** 時刻 t の電子の位置（準位・軌道半径 [m]・角 [rad]）。準位が移っても角は連続 */
export function electronAt(p: BohrParams, t: number): { n: number; r: number; theta: number } {
  const n = levelAt(p, t);
  const theta =
    t < JUMP_TIME
      ? displayAngularSpeed(p, p.n) * t
      : displayAngularSpeed(p, p.n) * JUMP_TIME + displayAngularSpeed(p, p.nf) * (t - JUMP_TIME);
  return { n, r: orbitRadius(p.Z, n), theta };
}

/**
 * 光子の位置。電子が準位を移る位置（角 theta）を通る半直線上にあり、
 * progress = 0 で電子の位置、1 で画面の端。放出なら外へ、吸収なら内へ進む。光子がいなければ null。
 */
export function photonAt(p: BohrParams, t: number): { progress: number; theta: number } | null {
  const kind = transition(p).kind;
  const theta = displayAngularSpeed(p, p.n) * JUMP_TIME;
  if (kind === '放出' && t >= JUMP_TIME && t <= JUMP_TIME + PHOTON_TRAVEL) {
    return { progress: (t - JUMP_TIME) / PHOTON_TRAVEL, theta };
  }
  if (kind === '吸収' && t >= JUMP_TIME - PHOTON_TRAVEL && t < JUMP_TIME) {
    return { progress: (JUMP_TIME - t) / PHOTON_TRAVEL, theta };
  }
  return null;
}

/** 電子の運動は等速円運動の式で解析的に求まるので、時間を進めるだけ */
export function step(_p: BohrParams, s: BohrState, dt: number): BohrState {
  return { t: s.t + dt };
}
