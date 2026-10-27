/**
 * 気体分子運動論の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 一辺 L の立方体容器の 1 つの頂点を原点とし、辺に沿って x, y, z 軸をとる（0 ≤ x, y, z ≤ L）。
 *       画面には x-y 面への投影を描く（x は右向き正、y は上向き正）。
 * 仮定: 分子は大きさのない質点（単原子分子）で、分子どうしの衝突は無視する（理想気体）。
 *       壁との衝突は弾性衝突（壁に垂直な速度成分だけが逆向きになる）。
 *
 * 壁との間の運動は等速直線運動なので数値積分は使わず、「折り返し」で厳密に計算する。
 * 1 ステップの間に何回壁に当たっても、衝突回数と力積を正しく数える。
 */
import { AVOGADRO, BOLTZMANN, GAS_CONSTANT } from '@/core/physics/constants';
import type { ParamSpec, ParamValues } from '@/core/params';

export type KineticParamKey = 'N' | 'T' | 'M' | 'L';
export type KineticParams = ParamValues<KineticParamKey>;

export const PARAMS: readonly ParamSpec<KineticParamKey>[] = [
  { key: 'N', label: '分子数', symbol: 'N', unit: '個', min: 10, max: 300, step: 10, default: 100 },
  { key: 'T', label: '温度', symbol: 'T', unit: 'K', min: 100, max: 1000, step: 10, default: 300 },
  {
    key: 'M',
    label: 'モル質量',
    symbol: 'M',
    unit: 'g/mol',
    min: 2,
    max: 40,
    step: 1,
    default: 4,
    hint: 'H₂: 2, He: 4, Ne: 20, Ar: 40（分子は質点として扱う）',
  },
  {
    key: 'L',
    label: '容器の一辺',
    symbol: 'L',
    unit: 'm',
    min: 0.05,
    max: 0.2,
    step: 0.01,
    default: 0.1,
  },
];

/**
 * 物理ステップの刻み幅 [s]。衝突は刻み幅によらず厳密に扱うので、精度ではなく描画のなめらかさで決める
 * （パラメータ範囲全体で、1 ステップに分子が進む距離が容器の一辺の 5% 以下）。
 */
export const DT = 2e-7;

/** 表示の時間の縮尺（実時間 1 秒でシミュレーション内の 1×10⁻⁴ 秒進める） */
export const TIME_SCALE = 1e-4;

/** 色付けして追いかける分子の番号 */
export const TRACKED = 0;

export interface GasState {
  /** 経過時間 [s] */
  t: number;
  /** 位置 [m]。分子 i の (x, y, z) が pos[3i], pos[3i+1], pos[3i+2] */
  pos: Float64Array;
  /** 速度 [m/s]。並びは pos と同じ */
  vel: Float64Array;
  /** 6 つの壁が受けた力積の大きさの合計 [N·s] */
  impulse: number;
  /** x = L の壁（右の壁）が受けた力積 [N·s] */
  impulseRight: number;
  /** 壁への衝突回数の合計 */
  hits: number;
  /** 注目する分子が x = L の壁に衝突した回数 */
  trackedHitsRight: number;
}

/** 分子 1 個の質量 m = M / N_A [kg]（M は g/mol で与える） */
export function moleculeMass(p: KineticParams): number {
  return (p.M * 1e-3) / AVOGADRO;
}

/** 容器の体積 V = L³ [m³] */
export function volume(p: KineticParams): number {
  return p.L ** 3;
}

/** 二乗平均速度 √⟨v²⟩ = √(3RT/M) = √(3kT/m) [m/s] */
export function rmsSpeed(p: KineticParams): number {
  return Math.sqrt((3 * GAS_CONSTANT * p.T) / (p.M * 1e-3));
}

/** 分子 1 個の平均運動エネルギー ⟨½mv²⟩ = (3/2)kT [J] */
export function meanKineticEnergy(p: KineticParams): number {
  return 1.5 * BOLTZMANN * p.T;
}

/** 状態方程式から決まる圧力 p = NkT / V [Pa]（pV = nRT と同じ。n = N/N_A） */
export function idealGasPressure(p: KineticParams): number {
  return (p.N * BOLTZMANN * p.T) / volume(p);
}

/** 内部エネルギー U = (3/2)NkT = (3/2)nRT [J]（単原子分子） */
export function internalEnergy(p: KineticParams): number {
  return 1.5 * p.N * BOLTZMANN * p.T;
}

/** 分子が容器を横切る時間の目安 L / √⟨v²⟩ [s]（グラフの時間幅・圧力の平均時間に使う） */
export function crossingTime(p: KineticParams): number {
  return p.L / rmsSpeed(p);
}

/** 速さの分布（マクスウェル分布）の確率密度 f(v) [s/m]。∫f dv = 1 */
export function maxwellSpeedPdf(p: KineticParams, v: number): number {
  const a = moleculeMass(p) / (2 * BOLTZMANN * p.T);
  return 4 * Math.PI * (a / Math.PI) ** 1.5 * v * v * Math.exp(-a * v * v);
}

// ---------------------------------------------------------------------------
// 初期状態
// ---------------------------------------------------------------------------

/** 再現性のある擬似乱数（mulberry32）。[0, 1) の一様乱数を返す関数を作る */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 標準正規分布の乱数（ボックス＝ミュラー法） */
function gaussian(rand: () => number): number {
  const u = 1 - rand(); // (0, 1]
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const SEED = 20241;

/**
 * 初期状態。位置は容器内に一様に、速度の各成分は正規分布（マクスウェル分布）から選ぶ。
 * 有限個の標本では平均運動エネルギーが (3/2)kT から少しずれるので、ちょうど (3/2)kT になるよう
 * 速度をそろえて拡大・縮小する（温度 T は分子の平均運動エネルギーで定まる量だから）。
 * 乱数の種は固定なので、N が同じなら T・M・L を変えても分子の配置と速度の向きは同じになる。
 */
export function initialState(p: KineticParams, seed = SEED): GasState {
  const n = p.N;
  const rand = createRandom(seed);
  const pos = new Float64Array(3 * n);
  const vel = new Float64Array(3 * n);
  let sumV2 = 0;
  for (let i = 0; i < 3 * n; i++) {
    pos[i] = rand() * p.L;
    const v = gaussian(rand);
    vel[i] = v;
    sumV2 += v * v;
  }
  const m = moleculeMass(p);
  const scale = Math.sqrt((3 * n * BOLTZMANN * p.T) / (m * sumV2));
  for (let i = 0; i < 3 * n; i++) vel[i] = vel[i]! * scale;
  return { t: 0, pos, vel, impulse: 0, impulseRight: 0, hits: 0, trackedHitsRight: 0 };
}

// ---------------------------------------------------------------------------
// 時間発展
// ---------------------------------------------------------------------------

export interface WallFlight {
  /** 進んだ後の座標 */
  x: number;
  /** 進んだ後の速度成分 */
  v: number;
  /** 座標 0 の壁に当たった回数 */
  hitsLow: number;
  /** 座標 L の壁に当たった回数 */
  hitsHigh: number;
}

/**
 * 区間 [0, L] の中を速度 v で dt だけ進み、両端で弾性的にはね返る 1 次元の運動（厳密解）。
 * 壁を鏡とみなして「折り返さずに」進めた位置 u から、実際の位置と衝突回数を求める。
 */
export function flyBetweenWalls(x0: number, v: number, dt: number, L: number): WallFlight {
  if (v === 0) return { x: x0, v, hitsLow: 0, hitsHigh: 0 };
  // v < 0 のときは座標を反転して v > 0 の場合に帰着させる
  const forward = v > 0;
  const s0 = forward ? x0 : L - x0;
  const u = s0 + Math.abs(v) * dt;
  const k = Math.floor(u / L); // 壁に当たった回数（最初は遠い側の壁）
  const s = k % 2 === 0 ? u - k * L : (k + 1) * L - u;
  const far = Math.ceil(k / 2);
  const near = Math.floor(k / 2);
  const flipped = k % 2 === 1;
  return {
    x: forward ? s : L - s,
    v: flipped ? -v : v,
    hitsLow: forward ? near : far,
    hitsHigh: forward ? far : near,
  };
}

/** dt だけ進める（壁との衝突を含めて厳密） */
export function step(p: KineticParams, s: GasState, dt: number): GasState {
  const m = moleculeMass(p);
  const pos = new Float64Array(s.pos.length);
  const vel = new Float64Array(s.vel.length);
  let impulse = s.impulse;
  let impulseRight = s.impulseRight;
  let hits = s.hits;
  let trackedHitsRight = s.trackedHitsRight;
  for (let i = 0; i < s.pos.length; i++) {
    const f = flyBetweenWalls(s.pos[i]!, s.vel[i]!, dt, p.L);
    pos[i] = f.x;
    vel[i] = f.v;
    const n = f.hitsLow + f.hitsHigh;
    if (n === 0) continue;
    // 1 回の衝突で壁が受ける力積は 2m|v|（壁に垂直な成分）
    const j = 2 * m * Math.abs(f.v);
    impulse += n * j;
    hits += n;
    if (i % 3 === 0) {
      impulseRight += f.hitsHigh * j;
      if (i === 3 * TRACKED) trackedHitsRight += f.hitsHigh;
    }
  }
  return { t: s.t + dt, pos, vel, impulse, impulseRight, hits, trackedHitsRight };
}

// ---------------------------------------------------------------------------
// 測定値と理論値
// ---------------------------------------------------------------------------

/** 標本の二乗平均 ⟨v²⟩ [m²/s²] */
export function meanSquareSpeed(s: GasState): number {
  let sum = 0;
  for (let i = 0; i < s.vel.length; i++) sum += s.vel[i]! ** 2;
  return sum / (s.vel.length / 3);
}

/** 標本の x 成分の二乗平均 ⟨v_x²⟩ [m²/s²] */
export function meanSquareVx(s: GasState): number {
  let sum = 0;
  for (let i = 0; i < s.vel.length; i += 3) sum += s.vel[i]! ** 2;
  return sum / (s.vel.length / 3);
}

/** 分子運動論による圧力 p = Nm⟨v²⟩ / (3V) [Pa]（標本の ⟨v²⟩ を使う） */
export function kineticPressure(p: KineticParams, s: GasState): number {
  return (p.N * moleculeMass(p) * meanSquareSpeed(s)) / (3 * volume(p));
}

/** 標本の平均運動エネルギーから決まる温度 T = m⟨v²⟩ / (3k) [K] */
export function sampleTemperature(p: KineticParams, s: GasState): number {
  return (moleculeMass(p) * meanSquareSpeed(s)) / (3 * BOLTZMANN);
}

/** 力積から測った圧力（6 つの壁の平均、t = 0 からの時間平均）[Pa]。t = 0 では NaN */
export function measuredPressure(p: KineticParams, s: GasState): number {
  return s.t > 0 ? s.impulse / (s.t * 6 * p.L * p.L) : NaN;
}

/** x = L の壁が受ける力の時間平均 [N]。t = 0 では NaN */
export function measuredRightWallForce(s: GasState): number {
  return s.t > 0 ? s.impulseRight / s.t : NaN;
}

/** x = L の壁が受ける力の理論値 F = Nm⟨v_x²⟩ / L [N] */
export function rightWallForce(p: KineticParams, s: GasState): number {
  return (p.N * moleculeMass(p) * meanSquareVx(s)) / p.L;
}

/** 時刻と、それまでに壁が受けた力積の合計の組 */
export type ImpulseRecord = Pick<GasState, 't' | 'impulse'>;

/** 2 つの時刻の力積の差から、その間の平均の圧力を求める [Pa] */
export function pressureBetween(p: KineticParams, from: ImpulseRecord, to: ImpulseRecord): number {
  const dt = to.t - from.t;
  return dt > 0 ? (to.impulse - from.impulse) / (dt * 6 * p.L * p.L) : NaN;
}

/** 各分子の速さ [m/s] */
export function speeds(s: GasState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.vel.length; i += 3) {
    out.push(Math.hypot(s.vel[i]!, s.vel[i + 1]!, s.vel[i + 2]!));
  }
  return out;
}
