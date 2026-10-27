/**
 * 理想気体の状態変化（定積・定圧・等温・断熱）と熱サイクルの物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 状態量: 圧力 p [Pa]、体積 V [m³]、絶対温度 T [K]。物質量 n [mol] の理想気体で pV = nRT。
 * 符号: Q = 気体が吸収した熱量、W = 気体が外部にした仕事、ΔU = 内部エネルギーの変化
 *       （熱力学第一法則 Q = ΔU + W）。変化はすべて準静的に起こるとする。
 * p-V 図: 横軸 V（右向き正）、縦軸 p（上向き正）。サイクルが時計回りなら正味の仕事は正（熱機関）。
 *
 * Q・W・ΔU はそれぞれ別の公式（モル比熱・∫p dV・U = nC_VT）から求め、第一法則が成り立つことを
 * テストで確かめる。
 */
import { GAS_CONSTANT } from '@/core/physics/constants';
import type { ParamSpec } from '@/core/params';

const R = GAS_CONSTANT;

// ---------------------------------------------------------------------------
// 気体
// ---------------------------------------------------------------------------

export type GasKind = 'monatomic' | 'diatomic';

export const GAS_OPTIONS: readonly { value: GasKind; label: string }[] = [
  { value: 'monatomic', label: '単原子分子（He, Ar など）' },
  { value: 'diatomic', label: '二原子分子（N₂, O₂ など）' },
];

/** 定積モル比熱 C_V [J/(mol·K)]（単原子 3R/2、二原子 5R/2） */
export function molarCv(gas: GasKind): number {
  return gas === 'monatomic' ? 1.5 * R : 2.5 * R;
}

/** 定圧モル比熱 C_p = C_V + R [J/(mol·K)]（マイヤーの関係） */
export function molarCp(gas: GasKind): number {
  return molarCv(gas) + R;
}

/** 比熱比 γ = C_p / C_V */
export function heatCapacityRatio(gas: GasKind): number {
  return molarCp(gas) / molarCv(gas);
}

// ---------------------------------------------------------------------------
// 状態変化
// ---------------------------------------------------------------------------

export type ProcessKind = 'isochoric' | 'isobaric' | 'isothermal' | 'adiabatic';

export const PROCESS_NAMES: Record<ProcessKind, string> = {
  isochoric: '定積変化',
  isobaric: '定圧変化',
  isothermal: '等温変化',
  adiabatic: '断熱変化',
};

export interface StateVars {
  /** 圧力 [Pa] */
  p: number;
  /** 体積 [m³] */
  V: number;
  /** 絶対温度 [K] */
  T: number;
}

export interface Process {
  kind: ProcessKind;
  /** 始めの状態の名前（'A' など） */
  from: string;
  /** 終わりの状態の名前 */
  to: string;
  start: StateVars;
  end: StateVars;
}

/** 等温線 p = nRT/V [Pa] */
export function isothermPressure(n: number, T: number, V: number): number {
  return (n * R * T) / V;
}

/** 状態 → 内部エネルギー U = nC_VT [J] */
export function internalEnergy(gas: GasKind, n: number, T: number): number {
  return n * molarCv(gas) * T;
}

/**
 * 過程の途中の状態。s = 0 で始め、s = 1 で終わり。
 * 定積変化は温度を、それ以外は体積を s に比例して変える（ピストンが一定の速さで動く）。
 */
export function processPoint(gas: GasKind, n: number, proc: Process, s: number): StateVars {
  const { start: a, end: b } = proc;
  switch (proc.kind) {
    case 'isochoric': {
      const T = a.T + (b.T - a.T) * s;
      return { p: (n * R * T) / a.V, V: a.V, T };
    }
    case 'isobaric': {
      const V = a.V + (b.V - a.V) * s;
      return { p: a.p, V, T: (a.p * V) / (n * R) };
    }
    case 'isothermal': {
      const V = a.V + (b.V - a.V) * s;
      return { p: (n * R * a.T) / V, V, T: a.T };
    }
    case 'adiabatic': {
      // TV^(γ-1) = 一定
      const V = a.V + (b.V - a.V) * s;
      const T = a.T * (a.V / V) ** (heatCapacityRatio(gas) - 1);
      return { p: (n * R * T) / V, V, T };
    }
  }
}

export interface EnergyBalance {
  /** 気体が吸収した熱量 [J] */
  Q: number;
  /** 気体が外部にした仕事 [J] */
  W: number;
  /** 内部エネルギーの変化 [J] */
  dU: number;
}

/**
 * 過程の始めから途中の点 s までの Q・W・ΔU。
 * 3 つは別々の公式で求める（第一法則 Q = ΔU + W はテストで確かめる）。
 *   W: 定積 0 / 定圧 pΔV / 等温 nRT ln(V/V₀) / 断熱 (p₀V₀ − pV)/(γ − 1)
 *   Q: 定積 nC_VΔT / 定圧 nC_pΔT / 等温 nRT ln(V/V₀) / 断熱 0
 *   ΔU: nC_VΔT（どの変化でも温度だけで決まる）
 */
export function processEnergy(gas: GasKind, n: number, proc: Process, s = 1): EnergyBalance {
  const a = proc.start;
  const x = processPoint(gas, n, proc, s);
  const dT = x.T - a.T;
  const dU = n * molarCv(gas) * dT;
  switch (proc.kind) {
    case 'isochoric':
      return { Q: n * molarCv(gas) * dT, W: 0, dU };
    case 'isobaric':
      return { Q: n * molarCp(gas) * dT, W: a.p * (x.V - a.V), dU };
    case 'isothermal': {
      const w = n * R * a.T * Math.log(x.V / a.V);
      return { Q: w, W: w, dU };
    }
    case 'adiabatic':
      return { Q: 0, W: (a.p * a.V - x.p * x.V) / (heatCapacityRatio(gas) - 1), dU };
  }
}

/** 表などに使う短い名前（例: 'A→B 定圧'） */
export function processShortLabel(proc: Process): string {
  return `${proc.from}→${proc.to} ${PROCESS_NAMES[proc.kind].replace('変化', '')}`;
}

/** 状況が分かる過程の名前（例: 'A→B 定圧膨張（吸熱）'） */
export function processLabel(gas: GasKind, n: number, proc: Process): string {
  const { Q } = processEnergy(gas, n, proc);
  const expanding = proc.end.V > proc.start.V;
  const name =
    proc.kind === 'isochoric'
      ? '定積変化'
      : `${PROCESS_NAMES[proc.kind].replace('変化', '')}${expanding ? '膨張' : '圧縮'}`;
  const heat = proc.kind === 'adiabatic' ? '' : Q > 0 ? '（吸熱）' : '（放熱）';
  return `${proc.from}→${proc.to} ${name}${heat}`;
}

// ---------------------------------------------------------------------------
// 熱サイクル
// ---------------------------------------------------------------------------

/** 状態 A の圧力 [Pa]（1.0×10⁵ Pa に固定。Q・W・ΔU・効率は n, T と比だけで決まり、p_A によらない） */
export const P_A = 1.0e5;

export type CycleId = 'rectangle' | 'isothermal' | 'otto' | 'carnot';
export type CycleParamKey = 'n' | 'TA' | 'k' | 'r' | 'eps' | 'tau';
export type CycleParams = Readonly<Partial<Record<CycleParamKey, number>>>;

const N_SPEC: ParamSpec<CycleParamKey> = {
  key: 'n',
  label: '物質量',
  symbol: 'n',
  unit: 'mol',
  min: 0.5,
  max: 2,
  step: 0.1,
  default: 1,
};

const TA_SPEC: ParamSpec<CycleParamKey> = {
  key: 'TA',
  label: '状態 A の温度',
  symbol: 'T_A',
  unit: 'K',
  min: 200,
  max: 500,
  step: 10,
  default: 300,
  hint: '状態 A の圧力は 1.0×10⁵ Pa',
};

export interface CycleDef {
  id: CycleId;
  name: string;
  params: readonly ParamSpec<CycleParamKey>[];
  /** 状態 A から出発するサイクルの過程の列（最後の過程は A に戻る） */
  build(gas: GasKind, p: CycleParams): Process[];
}

function need(p: CycleParams, key: CycleParamKey): number {
  const v = p[key];
  if (v === undefined || !Number.isFinite(v)) throw new RangeError(`パラメータ ${key} がない`);
  return v;
}

function stateA(p: CycleParams): StateVars {
  const n = need(p, 'n');
  const T = need(p, 'TA');
  return { p: P_A, V: (n * R * T) / P_A, T };
}

/** n, T と体積・温度から状態量をそろえる（p = nRT/V） */
function stateVT(n: number, V: number, T: number): StateVars {
  return { p: (n * R * T) / V, V, T };
}

function chain(kinds: readonly ProcessKind[], states: readonly StateVars[]): Process[] {
  const names = ['A', 'B', 'C', 'D', 'E'];
  return kinds.map((kind, i) => ({
    kind,
    from: names[i]!,
    to: names[(i + 1) % kinds.length]!,
    start: states[i]!,
    end: states[(i + 1) % kinds.length]!,
  }));
}

export const CYCLES: Record<CycleId, CycleDef> = {
  rectangle: {
    id: 'rectangle',
    name: '定積・定圧サイクル（長方形）',
    params: [
      N_SPEC,
      TA_SPEC,
      {
        key: 'k',
        label: '圧力比',
        symbol: 'p_B/p_A',
        min: 1.2,
        max: 3,
        step: 0.1,
        default: 2,
        hint: 'A→B の定積変化で圧力を何倍にするか',
      },
      {
        key: 'r',
        label: '体積比',
        symbol: 'V_C/V_B',
        min: 1.2,
        max: 3,
        step: 0.1,
        default: 2,
        hint: 'B→C の定圧変化で体積を何倍にするか',
      },
    ],
    build(_gas, p) {
      const n = need(p, 'n');
      const A = stateA(p);
      const k = need(p, 'k');
      const r = need(p, 'r');
      const B = stateVT(n, A.V, k * A.T);
      const C = stateVT(n, r * A.V, k * r * A.T);
      const D = stateVT(n, r * A.V, r * A.T);
      return chain(['isochoric', 'isobaric', 'isochoric', 'isobaric'], [A, B, C, D]);
    },
  },
  isothermal: {
    id: 'isothermal',
    name: '定積・等温・定圧サイクル',
    params: [
      N_SPEC,
      TA_SPEC,
      {
        key: 'k',
        label: '圧力比',
        symbol: 'p_B/p_A',
        min: 1.2,
        max: 4,
        step: 0.1,
        default: 2,
        hint: 'A→B の定積変化で圧力（温度）を何倍にするか。B→C は等温で圧力が p_A に戻るまで膨張',
      },
    ],
    build(_gas, p) {
      const n = need(p, 'n');
      const A = stateA(p);
      const k = need(p, 'k');
      const B = stateVT(n, A.V, k * A.T);
      const C = stateVT(n, k * A.V, k * A.T);
      return chain(['isochoric', 'isothermal', 'isobaric'], [A, B, C]);
    },
  },
  otto: {
    id: 'otto',
    name: 'オットーサイクル（断熱・定積）',
    params: [
      N_SPEC,
      TA_SPEC,
      {
        key: 'eps',
        label: '圧縮比',
        symbol: 'V_A/V_B',
        min: 2,
        max: 8,
        step: 0.5,
        default: 4,
        hint: 'A→B の断熱圧縮で体積を何分の 1 にするか（ガソリンエンジンのモデル）',
      },
      {
        key: 'k',
        label: '圧力比',
        symbol: 'p_C/p_B',
        min: 1.2,
        max: 3,
        step: 0.1,
        default: 2,
        hint: 'B→C の定積加熱で圧力（温度）を何倍にするか',
      },
    ],
    build(gas, p) {
      const n = need(p, 'n');
      const A = stateA(p);
      const eps = need(p, 'eps');
      const k = need(p, 'k');
      const g1 = heatCapacityRatio(gas) - 1;
      const B = stateVT(n, A.V / eps, A.T * eps ** g1);
      const C = stateVT(n, B.V, k * B.T);
      const D = stateVT(n, A.V, C.T / eps ** g1);
      return chain(['adiabatic', 'isochoric', 'adiabatic', 'isochoric'], [A, B, C, D]);
    },
  },
  carnot: {
    id: 'carnot',
    name: 'カルノーサイクル（等温・断熱）',
    params: [
      N_SPEC,
      { ...TA_SPEC, label: '高温側の温度（状態 A）' },
      {
        key: 'r',
        label: '体積比',
        symbol: 'V_B/V_A',
        min: 1.2,
        max: 3,
        step: 0.1,
        default: 2,
        hint: 'A→B の等温膨張で体積を何倍にするか',
      },
      {
        key: 'tau',
        label: '温度比',
        symbol: 'T_C/T_A',
        min: 0.5,
        max: 0.9,
        step: 0.05,
        default: 0.5,
        hint: 'B→C の断熱膨張で温度を何倍に下げるか（低温側の温度 / 高温側の温度）',
      },
    ],
    build(gas, p) {
      const n = need(p, 'n');
      const A = stateA(p);
      const r = need(p, 'r');
      const tau = need(p, 'tau');
      // 断熱変化 TV^(γ-1) = 一定 → V ∝ T^(-1/(γ-1))
      const f = tau ** (-1 / (heatCapacityRatio(gas) - 1));
      const B = stateVT(n, r * A.V, A.T);
      const C = stateVT(n, B.V * f, tau * A.T);
      const D = stateVT(n, A.V * f, tau * A.T);
      return chain(['isothermal', 'adiabatic', 'isothermal', 'adiabatic'], [A, B, C, D]);
    },
  },
};

export const CYCLE_OPTIONS: readonly { value: CycleId; label: string }[] = Object.values(
  CYCLES,
).map((c) => ({ value: c.id, label: c.name }));

export interface Cycle {
  gas: GasKind;
  n: number;
  processes: Process[];
}

export function buildCycle(id: CycleId, gas: GasKind, p: CycleParams): Cycle {
  return { gas, n: need(p, 'n'), processes: CYCLES[id].build(gas, p) };
}

export interface CycleSummary {
  /** 各過程の Q・W・ΔU */
  perProcess: EnergyBalance[];
  /** 1 サイクルの合計（ΔU = 0、Q = W = 正味の仕事） */
  total: EnergyBalance;
  /** 吸収した熱量の和 Q_in（正の Q の和）[J] */
  Qin: number;
  /** 放出した熱量の和 Q_out（負の Q の大きさの和）[J] */
  Qout: number;
  /** 熱効率 e = W / Q_in */
  efficiency: number;
  /** サイクル中の最高温度・最低温度 [K] */
  Tmax: number;
  Tmin: number;
  /** 同じ最高・最低温度の間ではたらくカルノーサイクルの効率 1 − T_min/T_max */
  carnotEfficiency: number;
}

export function summarize(c: Cycle): CycleSummary {
  const perProcess = c.processes.map((proc) => processEnergy(c.gas, c.n, proc));
  const total = perProcess.reduce((a, e) => ({ Q: a.Q + e.Q, W: a.W + e.W, dU: a.dU + e.dU }), {
    Q: 0,
    W: 0,
    dU: 0,
  });
  const Qin = perProcess.reduce((a, e) => a + Math.max(0, e.Q), 0);
  const Qout = perProcess.reduce((a, e) => a + Math.max(0, -e.Q), 0);
  // どの過程でも温度は単調に変わるので、最高・最低温度は頂点の状態のどれか
  const temps = c.processes.map((proc) => proc.start.T);
  const Tmax = Math.max(...temps);
  const Tmin = Math.min(...temps);
  return {
    perProcess,
    total,
    Qin,
    Qout,
    efficiency: total.W / Qin,
    Tmax,
    Tmin,
    carnotEfficiency: 1 - Tmin / Tmax,
  };
}

// ---------------------------------------------------------------------------
// アニメーション（サイクルを一定の速さでたどる）
// ---------------------------------------------------------------------------

/** 1 つの過程を表示する時間 [s]（準静的変化なので実際の時間とは関係ない） */
export const PROCESS_DURATION = 3;

/** ステップの刻み幅 [s]（1 つの過程を 180 ステップで描く） */
export const DT = 1 / 60;

export interface Progress {
  /** 進行中の過程の番号 */
  index: number;
  /** 過程の中の位置（0 〜 1） */
  s: number;
  /** 何周したか */
  laps: number;
}

export function initialProgress(): Progress {
  return { index: 0, s: 0, laps: 0 };
}

export function step(c: Cycle, pr: Progress, dt: number): Progress {
  let { index, s, laps } = pr;
  s += dt / PROCESS_DURATION;
  while (s >= 1 - 1e-9) {
    s = Math.max(0, s - 1);
    index++;
    if (index >= c.processes.length) {
      index = 0;
      laps++;
    }
  }
  return { index, s, laps };
}

export function currentState(c: Cycle, pr: Progress): StateVars {
  return processPoint(c.gas, c.n, c.processes[pr.index]!, pr.s);
}

/** このサイクル（直前に状態 A を出てから）の Q・W・ΔU の累計 */
export function lapEnergy(c: Cycle, pr: Progress): EnergyBalance {
  let Q = 0;
  let W = 0;
  let dU = 0;
  for (let i = 0; i <= pr.index; i++) {
    const e = processEnergy(c.gas, c.n, c.processes[i]!, i < pr.index ? 1 : pr.s);
    Q += e.Q;
    W += e.W;
    dU += e.dU;
  }
  return { Q, W, dU };
}

/**
 * 過程の向き: 熱の出入り（+1 吸熱 / −1 放熱 / 0 断熱）とピストンの動き（+1 膨張 / −1 圧縮 / 0 固定）。
 * 描画で矢印の向きを決めるのに使う。
 */
export function processDirections(c: Cycle, index: number): { heat: number; work: number } {
  const proc = c.processes[index]!;
  const { Q } = processEnergy(c.gas, c.n, proc);
  const dV = proc.end.V - proc.start.V;
  const tiny = 1e-12;
  return {
    heat: Math.abs(Q) < tiny * c.n * R * proc.start.T ? 0 : Math.sign(Q),
    work: Math.abs(dV) < tiny * proc.start.V ? 0 : Math.sign(dV),
  };
}
