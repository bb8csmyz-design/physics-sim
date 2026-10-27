/**
 * 光電効果（平行平板の光電管）の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 陰極 K の表面を原点とし、陰極から陽極 P へ向かう向きを x 軸の正、極板に沿って上向きを y 軸の正。
 * 極板間隔は d。陽極の電位は陰極を基準に V（V > 0 で光電子を加速、V < 0 で押し返す）。
 * 極板間の電場は一様で、電子（電荷 −e）の加速度は a = eV/(md)（+x 向きを正）。
 *
 * 光電子の放出（高校物理の理想化）:
 * - 光子 1 個のエネルギーは E = hν = hc/λ。hν > W（仕事関数）のときだけ光電子が飛び出す
 * - 入射した光子 1 個につき光電子 1 個が飛び出す（量子効率 1 とする）
 * - 飛び出した直後の運動エネルギー K は 0 〜 K_max = hν − W の間に一様に分布する
 *   （金属内部の電子は、表面に出るまでに失うエネルギーがまちまちなため）
 * - 飛び出す向きは余弦則（ランバート分布）。このとき cos²θ（θ は極板の法線となす角）は 0〜1 に一様に分布する
 */
import {
  ELECTRON_MASS,
  ELECTRON_VOLT,
  ELEMENTARY_CHARGE,
  PLANCK,
  SPEED_OF_LIGHT,
} from '@/core/physics/constants';
import type { ParamSpec, ParamValues } from '@/core/params';
import { Rng, seedRng, type RngState } from '@/core/random';

export type PhotoParamKey = 'lambda' | 'P' | 'W' | 'V';
export type PhotoParams = ParamValues<PhotoParamKey>;

export const PARAMS: readonly ParamSpec<PhotoParamKey>[] = [
  {
    key: 'lambda',
    label: '光の波長',
    symbol: 'λ',
    unit: 'nm',
    min: 200,
    max: 700,
    step: 5,
    default: 400,
    hint: '可視光は約 380〜770 nm。それより短いと紫外線',
  },
  {
    key: 'P',
    label: '光の強さ（仕事率）',
    symbol: 'P',
    unit: 'μW',
    min: 10,
    max: 200,
    step: 10,
    default: 100,
    hint: '陰極に毎秒当たる光のエネルギー。波長が同じなら光子の数に比例する',
  },
  {
    key: 'W',
    label: '仕事関数',
    symbol: 'W',
    unit: 'eV',
    min: 1.8,
    max: 5,
    step: 0.1,
    default: 2.3,
    hint: '陰極の金属で決まる（およその値: Cs 2.1, Na 2.3, Ca 2.9, Zn 4.3, Cu 4.7 eV）',
  },
  {
    key: 'V',
    label: '陽極の電位',
    symbol: 'V',
    unit: 'V',
    min: -5,
    max: 5,
    step: 0.05,
    default: 1,
    hint: '陰極を基準にした陽極の電位。負にすると光電子を押し返す',
  },
];

/** 極板間隔 d [m] */
export const GAP = 0.01;
/** 陰極で光が当たっている範囲 |y| ≤ EMIT_HALF [m] */
export const EMIT_HALF = 0.004;
/**
 * 画面の点 1 個が表す電子の数。実際の光電子は毎秒 10¹⁴ 個程度と多すぎるので、
 * 一定の割合で間引いて表示・計数する（測定する電流はこの数を掛けて元に戻す）。
 */
export const ELECTRONS_PER_DOT = 2e5;
/** 光電流の測定: 直近この時間 [s] に陽極へ達した電子を数える */
export const MEASURE_WINDOW = 100e-9;
/**
 * 物理ステップの刻み幅 [s]。電子の運動は等加速度運動の式で厳密に進めるので、刻み幅は
 * 「陽極への到達・陰極への帰還を判定する時間分解能」を決めるだけ（1 ステップの移動は d/50 以下）。
 */
export const DT = 1e-10;
/** 実時間 1 秒あたりに進むシミュレーション時間 [s]（電子が極板間を進む時間は数 ns〜数十 ns） */
export const TIME_SCALE = 2e-8;

/** hc/e [nm·eV]（光子のエネルギー [eV] = 1240 / 波長 [nm] の係数） */
export const HC_EV_NM = ((PLANCK * SPEED_OF_LIGHT) / ELECTRON_VOLT) * 1e9;

// ---------------------------------------------------------------------------
// 公式（光子・アインシュタインの光電方程式）
// ---------------------------------------------------------------------------

/** 光の振動数 ν = c/λ [Hz] */
export function frequency(p: PhotoParams): number {
  return SPEED_OF_LIGHT / (p.lambda * 1e-9);
}

/** 光子 1 個のエネルギー E = hν = hc/λ [eV] */
export function photonEnergyEV(p: PhotoParams): number {
  return (PLANCK * frequency(p)) / ELECTRON_VOLT;
}

/** 限界振動数 ν₀ = W/h [Hz]（これより振動数が小さい光では光電子が出ない） */
export function thresholdFrequency(p: PhotoParams): number {
  return (p.W * ELECTRON_VOLT) / PLANCK;
}

/** 限界波長 λ₀ = hc/W [nm] */
export function thresholdWavelength(p: PhotoParams): number {
  return HC_EV_NM / p.W;
}

/** 光電子が飛び出すか（hν > W） */
export function emits(p: PhotoParams): boolean {
  return photonEnergyEV(p) > p.W;
}

/** アインシュタインの光電方程式の直線 K = hν − W [eV]（ν [Hz] の関数。負の部分も含む） */
export function einsteinLine(W: number, nu: number): number {
  return (PLANCK * nu) / ELECTRON_VOLT - W;
}

/** 光電子の運動エネルギーの最大値 K_max = hν − W [eV]（光電子が出なければ 0） */
export function maxKineticEnergy(p: PhotoParams): number {
  return Math.max(0, photonEnergyEV(p) - p.W);
}

/** 光電子の速さの最大値 v_max = √(2K_max/m) [m/s] */
export function maxSpeed(p: PhotoParams): number {
  return Math.sqrt((2 * maxKineticEnergy(p) * ELECTRON_VOLT) / ELECTRON_MASS);
}

/** 阻止電圧 V₀ [V]（eV₀ = K_max） */
export function stoppingVoltage(p: PhotoParams): number {
  return maxKineticEnergy(p);
}

/** 陰極に毎秒当たる光子の数 N = P/(hν) [1/s] */
export function photonRate(p: PhotoParams): number {
  return (p.P * 1e-6) / (photonEnergyEV(p) * ELECTRON_VOLT);
}

/** 飽和電流 I₀ = eN [A]（光子 1 個につき光電子 1 個。光電子が出なければ 0） */
export function saturationCurrent(p: PhotoParams): number {
  return emits(p) ? ELEMENTARY_CHARGE * photonRate(p) : 0;
}

/**
 * 飛び出した光電子のうち陽極に達する割合。
 * 極板に垂直な向きの運動エネルギー K cos²θ が eU（U = −V > 0）を超えた電子だけが達する。
 * K/K_max と cos²θ がともに 0〜1 の一様分布なので、x = e|V|/K_max として
 *   P(K cos²θ > e|V|) = 1 − x + x ln x   （0 < x < 1）
 * V ≥ 0 なら全員が達し（飽和）、V ≤ −V₀ なら誰も達しない。
 */
export function reachFraction(p: PhotoParams, V: number = p.V): number {
  if (!emits(p)) return 0;
  if (V >= 0) return 1;
  const x = -V / stoppingVoltage(p);
  if (x >= 1) return 0;
  return 1 - x + x * Math.log(x);
}

/** 光電流の理論値 I = I₀ × (陽極に達する割合) [A] */
export function current(p: PhotoParams, V: number = p.V): number {
  return saturationCurrent(p) * reachFraction(p, V);
}

// ---------------------------------------------------------------------------
// 光電子の運動のシミュレーション
// ---------------------------------------------------------------------------

export interface Electron {
  /** 位置 [m] */
  x: number;
  y: number;
  /** 速度 [m/s]（vz は紙面に垂直な成分。極板に平行なので運動には影響しないが、運動エネルギーに含める） */
  vx: number;
  vy: number;
  vz: number;
}

export interface PhotoState {
  /** 極板間を飛んでいる電子（画面の点） */
  electrons: readonly Electron[];
  /** 直近 MEASURE_WINDOW 秒の間に陽極へ達した時刻 [s] */
  arrivals: readonly number[];
  /** これまでに飛び出した点・陽極に達した点の数 */
  emitted: number;
  collected: number;
  /** 経過時間 [s] */
  t: number;
  rng: RngState;
}

export function initialState(seed = 1): PhotoState {
  return { electrons: [], arrivals: [], emitted: 0, collected: 0, t: 0, rng: seedRng(seed) };
}

/** 極板間での電子の加速度 a = eV/(md) [m/s²]（+x 向き＝陽極向きが正） */
export function accelerationX(p: PhotoParams): number {
  return (ELEMENTARY_CHARGE * p.V) / (ELECTRON_MASS * GAP);
}

/** 1 秒あたりに飛び出す点の数（実際の光電子の数 / ELECTRONS_PER_DOT） */
export function dotRate(p: PhotoParams): number {
  return emits(p) ? photonRate(p) / ELECTRONS_PER_DOT : 0;
}

/** 陰極から飛び出す直後の電子を 1 個つくる（上の分布に従う乱数） */
export function sampleEmission(p: PhotoParams, rng: Rng): Electron {
  const K = maxKineticEnergy(p) * rng.uniform() * ELECTRON_VOLT;
  const v = Math.sqrt((2 * K) / ELECTRON_MASS);
  const cos2 = rng.uniform();
  const phi = 2 * Math.PI * rng.uniform();
  return {
    x: 0,
    y: (2 * rng.uniform() - 1) * EMIT_HALF,
    vx: v * Math.sqrt(cos2),
    vy: v * Math.sqrt(1 - cos2) * Math.cos(phi),
    vz: v * Math.sqrt(1 - cos2) * Math.sin(phi),
  };
}

/** 一様な電場の中を時間 tau だけ進める（等加速度運動の式なので厳密） */
export function propagate(e: Electron, ax: number, tau: number): Electron {
  return {
    x: e.x + e.vx * tau + 0.5 * ax * tau * tau,
    y: e.y + e.vy * tau,
    vx: e.vx + ax * tau,
    vy: e.vy,
    vz: e.vz,
  };
}

/** 電子の力学的エネルギー ½mv² + (−e)φ(x) [J]。φ(x) = Vx/d は陰極を基準にした電位 */
export function electronEnergy(p: PhotoParams, e: Electron): number {
  const kinetic = 0.5 * ELECTRON_MASS * (e.vx * e.vx + e.vy * e.vy + e.vz * e.vz);
  return kinetic - (ELEMENTARY_CHARGE * p.V * e.x) / GAP;
}

export function step(p: PhotoParams, s: PhotoState, dt: number): PhotoState {
  const ax = accelerationX(p);
  const tEnd = s.t + dt;
  const rng = new Rng(s.rng);
  const electrons: Electron[] = [];
  const arrivals = s.arrivals.filter((ta) => ta > tEnd - MEASURE_WINDOW);
  let collected = s.collected;

  const advance = (e: Electron, tau: number) => {
    const next = propagate(e, ax, tau);
    if (next.x >= GAP) {
      arrivals.push(tEnd);
      collected++;
    } else if (next.x > 0) {
      electrons.push(next);
    }
    // x ≤ 0: 陰極に押し戻された（電流にならない）
  };

  for (const e of s.electrons) advance(e, dt);
  // この dt の間に飛び出す数はポアソン分布。飛び出した時刻から dt の終わりまで進める
  const n = rng.poisson(dotRate(p) * dt);
  for (let i = 0; i < n; i++) {
    const delay = rng.uniform() * dt;
    advance(sampleEmission(p, rng), dt - delay);
  }
  return { electrons, arrivals, emitted: s.emitted + n, collected, t: tEnd, rng: rng.state };
}

/** 陽極に達した電子を数えて求めた光電流 [A]（直近 MEASURE_WINDOW 秒の平均） */
export function measuredCurrent(s: PhotoState): number {
  return (s.arrivals.length * ELECTRONS_PER_DOT * ELEMENTARY_CHARGE) / MEASURE_WINDOW;
}
