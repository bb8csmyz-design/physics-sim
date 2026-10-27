/**
 * 回路エディタの物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 回路図: 縦横 COLS × ROWS の格子点を節点とし、となり合う格子点を結ぶ辺に部品を 1 つずつ置く。
 *   格子点の座標は (x, y)。x は右向き、y は下向き（画面と同じ）に 0, 1, 2, … と数える。
 * 部品の向き: 端子 1（p1）→ 端子 2（p2）を正の向きとする。
 *   - 電流 I: 部品の中を p1 → p2 へ流れる向きを正
 *   - 抵抗・コンデンサー・コイル・スイッチの電圧 V = φ(p1) − φ(p2)（電流の向きに測った電位の下がり）。
 *     V_R = RI、V_C = q/C（q は p1 側の極板の電気量）、V_L = L dI/dt
 *   - 電源は p2 側が正極。電圧 V は起電力 φ(p2) − φ(p1)（直流 E、交流 √2 V_e sin 2πft）で、
 *     電流 I は電源の中を負極 → 正極（p1 → p2）へ流れる向きが正（電源が仕事をする向き）
 *   - 電流計・電圧計は p1 が + 端子。電流計は + 端子から流れ込む電流、電圧計は φ(+) − φ(−) を示す
 * 電流計・電圧計は理想的なもの（電流計の抵抗 0、電圧計の抵抗 ∞）。電源の内部抵抗は 0。
 *
 * 回路の方程式は core/physics/circuit.ts（修正節点解析 + L 安定な SDIRK 法）で解く。
 * 状態変数（コンデンサーの電圧・コイルの電流）はスイッチを切り替えても連続に変化する。
 */
import {
  analyzeCircuit,
  type Branch,
  type CircuitIssue,
  type CircuitSolver,
  type Netlist,
} from '@/core/physics/circuit';
import type { ParamSpec } from '@/core/params';

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

/** 格子の大きさ（格子点の数） */
export const COLS = 7;
export const ROWS = 5;

export type PartKind =
  'wire' | 'resistor' | 'capacitor' | 'coil' | 'dc' | 'ac' | 'switch' | 'ammeter' | 'voltmeter';

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface Part {
  /** 回路の中で一意な番号（名前 R₁ などとは別） */
  readonly id: number;
  readonly kind: PartKind;
  /** 端子 1（向きの基準。電源では負極、電流計・電圧計では + 端子） */
  readonly p1: GridPoint;
  /** 端子 2（電源では正極） */
  readonly p2: GridPoint;
  /** 部品の値（PART_INFO[kind].params のキー → 値。単位はスライダーと同じ） */
  readonly values: Readonly<Record<string, number>>;
  /** グラフに表示するか */
  readonly plot: boolean;
}

export interface Circuit {
  readonly parts: readonly Part[];
}

export interface PartInfo {
  /** 部品の名前（例: '抵抗'） */
  label: string;
  /** 回路図での記号の頭文字（例: 'R'）。導線は空 */
  prefix: string;
  /** 部品の値（スライダー） */
  params: readonly ParamSpec[];
  /** 置いたときにグラフに表示するか */
  plotByDefault: boolean;
}

export const PART_INFO: Readonly<Record<PartKind, PartInfo>> = {
  wire: { label: '導線', prefix: '', params: [], plotByDefault: false },
  resistor: {
    label: '抵抗',
    prefix: 'R',
    params: [
      {
        key: 'R',
        label: '抵抗',
        symbol: 'R',
        unit: 'Ω',
        min: 10,
        max: 1000,
        step: 10,
        default: 100,
      },
    ],
    plotByDefault: true,
  },
  capacitor: {
    label: 'コンデンサー',
    prefix: 'C',
    params: [
      {
        key: 'C',
        label: '電気容量',
        symbol: 'C',
        unit: 'μF',
        min: 10,
        max: 1000,
        step: 10,
        default: 100,
      },
      {
        key: 'V0',
        label: 'はじめの電圧',
        symbol: 'V_0',
        unit: 'V',
        min: 0,
        max: 12,
        step: 0.5,
        default: 0,
        hint: 't = 0 での端子 1 側の極板の電位 − 端子 2 側の極板の電位（はじめに充電しておく）',
      },
    ],
    plotByDefault: true,
  },
  coil: {
    label: 'コイル',
    prefix: 'L',
    params: [
      {
        key: 'L',
        label: '自己インダクタンス',
        symbol: 'L',
        unit: 'mH',
        min: 100,
        max: 1000,
        step: 10,
        default: 100,
      },
    ],
    plotByDefault: true,
  },
  dc: {
    label: '直流電源',
    prefix: 'E',
    params: [
      {
        key: 'E',
        label: '起電力',
        symbol: 'E',
        unit: 'V',
        min: 1,
        max: 12,
        step: 0.5,
        default: 6,
      },
    ],
    plotByDefault: false,
  },
  ac: {
    label: '交流電源',
    prefix: 'E',
    params: [
      {
        key: 'Ve',
        label: '電圧の実効値',
        symbol: 'V_e',
        unit: 'V',
        min: 1,
        max: 100,
        step: 1,
        default: 10,
      },
      {
        key: 'f',
        label: '周波数',
        symbol: 'f',
        unit: 'Hz',
        min: 10,
        max: 1000,
        step: 10,
        default: 50,
      },
    ],
    plotByDefault: false,
  },
  switch: { label: 'スイッチ', prefix: 'S', params: [], plotByDefault: false },
  ammeter: { label: '電流計', prefix: 'A', params: [], plotByDefault: true },
  voltmeter: { label: '電圧計', prefix: 'V', params: [], plotByDefault: true },
};

/** 部品の種類の一覧（ツールの並び順） */
export const PART_KINDS: readonly PartKind[] = [
  'wire',
  'resistor',
  'capacitor',
  'coil',
  'dc',
  'ac',
  'switch',
  'ammeter',
  'voltmeter',
];

/** 電源（p2 が正極。電圧を起電力の向きに測る） */
export function isSource(kind: PartKind): boolean {
  return kind === 'dc' || kind === 'ac';
}

/** 電流が流れない部品（電圧計）／電圧がかからない部品（導線・電流計）。グラフに描いても 0 のまま */
export function measuresCurrent(kind: PartKind): boolean {
  return kind !== 'voltmeter';
}
export function measuresVoltage(kind: PartKind): boolean {
  return kind !== 'wire' && kind !== 'ammeter';
}

export function defaultValues(kind: PartKind): Record<string, number> {
  return Object.fromEntries(PART_INFO[kind].params.map((s) => [s.key, s.default]));
}

/** 部品の値（未設定なら既定値） */
export function partValue(part: Part, key: string): number {
  const v = part.values[key];
  if (v !== undefined) return v;
  const spec = PART_INFO[part.kind].params.find((s) => s.key === key);
  if (!spec) throw new Error(`${part.kind} に値 ${key} はない`);
  return spec.default;
}

/**
 * 部品の名前（'R_1', 'C_2' など。'_' 以降は添字）。種類ごとに回路の中の順に番号を付ける。
 * 直流電源と交流電源は通し番号の E。導線は ''。
 */
export function partNames(circuit: Circuit): string[] {
  const count = new Map<string, number>();
  return circuit.parts.map((p) => {
    const prefix = PART_INFO[p.kind].prefix;
    if (!prefix) return '';
    const n = (count.get(prefix) ?? 0) + 1;
    count.set(prefix, n);
    return `${prefix}_${n}`;
  });
}

// ---------------------------------------------------------------------------
// 編集（すべて新しい Circuit を返す）
// ---------------------------------------------------------------------------

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

/** となり合う格子点か（部品を置ける辺か） */
export function isGridEdge(a: GridPoint, b: GridPoint): boolean {
  const inside = (p: GridPoint) =>
    Number.isInteger(p.x) &&
    Number.isInteger(p.y) &&
    p.x >= 0 &&
    p.x < COLS &&
    p.y >= 0 &&
    p.y < ROWS;
  return inside(a) && inside(b) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** 辺 a–b に置かれた部品（なければ undefined） */
export function partAt(circuit: Circuit, a: GridPoint, b: GridPoint): Part | undefined {
  return circuit.parts.find(
    (p) => (samePoint(p.p1, a) && samePoint(p.p2, b)) || (samePoint(p.p1, b) && samePoint(p.p2, a)),
  );
}

/**
 * 辺 a–b に置くときの既定の向き（端子 1, 端子 2）。
 * 横の辺は左 → 右、縦の辺は上 → 下。ただし電源は正極（端子 2）が右・上になるようにする。
 */
export function defaultOrientation(
  kind: PartKind,
  a: GridPoint,
  b: GridPoint,
): [GridPoint, GridPoint] {
  const [first, second] = a.x < b.x || a.y < b.y ? [a, b] : [b, a];
  if (!isSource(kind)) return [first, second];
  return first.x === second.x ? [second, first] : [first, second];
}

/**
 * 辺 a–b に部品を置く。すでに別の種類の部品があれば置き換える（同じ種類なら何もしない）。
 * 戻り値の id は置いた（またはすでにあった）部品の id。
 */
export function placePart(
  circuit: Circuit,
  kind: PartKind,
  a: GridPoint,
  b: GridPoint,
): { circuit: Circuit; id: number } {
  if (!isGridEdge(a, b)) throw new RangeError('となり合う格子点を指定すること');
  const existing = partAt(circuit, a, b);
  if (existing?.kind === kind) return { circuit, id: existing.id };
  const id = circuit.parts.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const [p1, p2] = defaultOrientation(kind, a, b);
  const part: Part = {
    id,
    kind,
    p1,
    p2,
    values: defaultValues(kind),
    plot: PART_INFO[kind].plotByDefault,
  };
  const parts = existing
    ? circuit.parts.map((p) => (p === existing ? part : p))
    : [...circuit.parts, part];
  return { circuit: { parts }, id };
}

export function removePart(circuit: Circuit, id: number): Circuit {
  return { parts: circuit.parts.filter((p) => p.id !== id) };
}

function updatePart(circuit: Circuit, id: number, fn: (p: Part) => Part): Circuit {
  return { parts: circuit.parts.map((p) => (p.id === id ? fn(p) : p)) };
}

/** 部品の向きを反転する（端子 1 と 2 を入れかえる） */
export function flipPart(circuit: Circuit, id: number): Circuit {
  return updatePart(circuit, id, (p) => ({ ...p, p1: p.p2, p2: p.p1 }));
}

export function setPartValue(circuit: Circuit, id: number, key: string, value: number): Circuit {
  return updatePart(circuit, id, (p) => ({ ...p, values: { ...p.values, [key]: value } }));
}

export function setPartPlot(circuit: Circuit, id: number, plot: boolean): Circuit {
  return updatePart(circuit, id, (p) => ({ ...p, plot }));
}

// ---------------------------------------------------------------------------
// 回路の方程式
// ---------------------------------------------------------------------------

/** 物理ステップの刻み幅 [s]。部品の値の範囲で、1 つのループの時定数 RC・L/R は 10Δt 以上、ω₀Δt ≤ 0.01 */
export const DT = 1e-5;

export function nodeIndex(p: GridPoint): number {
  return p.y * COLS + p.x;
}

/** 交流電源の起電力の最大値 V₀ = √2 V_e [V] */
export function acPeak(part: Part): number {
  return Math.SQRT2 * partValue(part, 'Ve');
}

/** 電源の起電力 [V]（p2 側が正極） */
export function sourceEmf(part: Part, t: number): number {
  if (part.kind === 'dc') return partValue(part, 'E');
  if (part.kind === 'ac') return acPeak(part) * Math.sin(2 * Math.PI * partValue(part, 'f') * t);
  return 0;
}

/** 部品 → 回路の枝（SI 単位）。closed はスイッチが閉じているか */
function toBranch(part: Part, closed: boolean): Branch {
  const n1 = nodeIndex(part.p1);
  const n2 = nodeIndex(part.p2);
  switch (part.kind) {
    case 'resistor':
      return { kind: 'resistor', n1, n2, R: partValue(part, 'R') };
    case 'capacitor':
      return { kind: 'capacitor', n1, n2, C: partValue(part, 'C') * 1e-6 };
    case 'coil':
      return { kind: 'inductor', n1, n2, L: partValue(part, 'L') * 1e-3 };
    case 'dc':
    case 'ac':
      return { kind: 'source', n1, n2, emf: (t) => sourceEmf(part, t) };
    case 'switch':
      return closed ? { kind: 'short', n1, n2 } : { kind: 'open', n1, n2 };
    case 'wire':
    case 'ammeter':
      return { kind: 'short', n1, n2 };
    case 'voltmeter':
      return { kind: 'open', n1, n2 };
  }
}

/** 回路と各スイッチの開閉（部品と同じ並び。スイッチ以外は無視）から枝の一覧を作る */
export function toNetlist(circuit: Circuit, closed: readonly boolean[]): Netlist {
  return {
    nodeCount: COLS * ROWS,
    branches: circuit.parts.map((p, i) => toBranch(p, closed[i] ?? false)),
  };
}

/** 解く準備ができた回路（スイッチの開閉ごとに作り直す） */
export interface CircuitSystem {
  readonly ok: true;
  readonly circuit: Circuit;
  readonly solver: CircuitSolver;
  /** スイッチの開閉を表す文字列（切り替えの検出に使う） */
  readonly key: string;
}

/** 解けない回路（電源の短絡など）。part は原因の部品の番号（parts の添字） */
export interface CircuitProblem {
  readonly ok: false;
  readonly issue: CircuitIssue;
  readonly part: number;
  readonly message: string;
}

export function switchKey(circuit: Circuit, closed: readonly boolean[]): string {
  return circuit.parts.map((p, i) => (p.kind === 'switch' && closed[i] ? '1' : '0')).join('');
}

export function buildSystem(
  circuit: Circuit,
  closed: readonly boolean[],
): CircuitSystem | CircuitProblem {
  const analysis = analyzeCircuit(toNetlist(circuit, closed));
  if (analysis.ok) {
    return { ok: true, circuit, solver: analysis.solver, key: switchKey(circuit, closed) };
  }
  const { issue } = analysis;
  const message =
    issue.kind === 'shorted-source'
      ? '電源の両極が導線だけでつながっています（短絡）。抵抗などをはさんでください。'
      : '電源どうしが抵抗をはさまずにつながっています。電源と直列に抵抗を入れてください。';
  return { ok: false, issue, part: issue.branch, message };
}

// ---------------------------------------------------------------------------
// 時間発展
// ---------------------------------------------------------------------------

export interface SimState {
  /** 状態変数（部品ごと。コンデンサーは V_C [V]、コイルは I_L [A]、それ以外は 0） */
  readonly x: readonly number[];
  /** 各部品の電流 I [A]（表示の向き。ファイル先頭のコメント参照） */
  readonly I: readonly number[];
  /** 各部品の電圧 V [V]（表示の向き。電源は起電力の向き。測れないときは NaN） */
  readonly V: readonly number[];
  /** 各部品を流れた電気量 ∫I dt [C]（電流の流れの表示用） */
  readonly flowed: readonly number[];
  /** 直前のステップの回路（スイッチの開閉）。変わったら切り替え直後とみなす */
  readonly key: string;
}

/** 回路の枝の値 → 表示の向き（電源は電圧を起電力の向きに測る） */
function displayValues(
  circuit: Circuit,
  I: readonly number[],
  V: readonly number[],
): { I: number[]; V: number[] } {
  return {
    I: [...I],
    V: circuit.parts.map((p, i) => (isSource(p.kind) ? -V[i]! : V[i]!)),
  };
}

/** t = 0 の状態（コンデンサーは「はじめの電圧」、コイルの電流は 0） */
export function initialState(sys: CircuitSystem | CircuitProblem, circuit: Circuit): SimState {
  const x = circuit.parts.map((p) => (p.kind === 'capacitor' ? partValue(p, 'V0') : 0));
  const zeros = circuit.parts.map(() => 0);
  if (!sys.ok) return { x, I: zeros, V: zeros.map(() => NaN), flowed: zeros, key: '' };
  const out = displayValues(circuit, ...outputsOf(sys, x, 0));
  return { x, ...out, flowed: zeros, key: '' };
}

function outputsOf(sys: CircuitSystem, x: readonly number[], t: number) {
  const r = sys.solver.outputs(x, t);
  return [r.I, r.V] as const;
}

/**
 * 状態 s のまま時刻 t での各部品の電流・電圧（スイッチを切り替えた直後の値の表示など）。
 * 理想素子だけの閉回路でインパルスが起きる瞬間は、非常に大きな値になる。
 */
export function instantValues(
  sys: CircuitSystem,
  s: SimState,
  t: number,
): { I: number[]; V: number[] } {
  return displayValues(sys.circuit, ...outputsOf(sys, s.x, t));
}

/**
 * dt だけ進める。通常は SDIRK 法。インパルスが起きうる回路では、スイッチを切り替えた直後
 * （と t = 0）の 1 ステップだけ後退オイラー法を使う。
 */
export function step(sys: CircuitSystem, s: SimState, t: number, dt: number): SimState {
  const method = sys.solver.impulsive && s.key !== sys.key ? 'backward-euler' : 'sdirk2';
  const r = sys.solver.step(s.x, t, dt, method);
  const out = displayValues(sys.circuit, r.I, r.V);
  return {
    x: r.x,
    ...out,
    flowed: s.flowed.map((q, i) => q + out.I[i]! * dt),
    key: sys.key,
  };
}

// ---------------------------------------------------------------------------
// 解析解・エネルギー（テストと解説の数値に使う）
// ---------------------------------------------------------------------------

/** RC 直列回路の充電: コンデンサーの電圧 V_C = E(1 − e^{−t/RC}) */
export function rcChargingVoltage(E: number, R: number, C: number, t: number): number {
  return E * (1 - Math.exp(-t / (R * C)));
}

/** RL 直列回路で電流が増えるとき: I = (E/R)(1 − e^{−Rt/L}) */
export function rlGrowthCurrent(E: number, R: number, L: number, t: number): number {
  return (E / R) * (1 - Math.exp((-R * t) / L));
}

/** LC 回路（はじめ V_C = V₀, I = 0）: V_C = V₀ cos ωt, ω = 1/√(LC) */
export function lcCapacitorVoltage(V0: number, L: number, C: number, t: number): number {
  return V0 * Math.cos(t / Math.sqrt(L * C));
}

/** RLC 直列回路の定常状態の電流の最大値 I₀ = V₀/Z, Z = √(R² + (ωL − 1/ωC)²) */
export function rlcSteadyAmplitude(V0: number, omega: number, R: number, L: number, C: number) {
  return V0 / Math.hypot(R, omega * L - 1 / (omega * C));
}

/** 静電エネルギー ½CV² [J]（C [F]） */
export function capacitorEnergy(C: number, V: number): number {
  return 0.5 * C * V * V;
}

/** コイルのエネルギー ½LI² [J]（L [H]） */
export function coilEnergy(L: number, I: number): number {
  return 0.5 * L * I * I;
}

// ---------------------------------------------------------------------------
// 回路の例
// ---------------------------------------------------------------------------

export type PresetId = 'rc' | 'rl' | 'lc' | 'ac' | 'dc' | 'empty';

export interface Preset {
  id: PresetId;
  label: string;
  /** 再生の時間尺度（実時間 1 s で進むシミュレーション時間 [s]） */
  timeScale: number;
  circuit: Circuit;
}

/** 回路の例を書くための部品の指定: [種類, 端子 1, 端子 2, 値] */
export type PartSpec = [PartKind, [number, number], [number, number], Record<string, number>?];

/** [種類, 端子 1, 端子 2, 値] の並びから回路を作る（向きは指定どおり） */
export function circuitFrom(specs: readonly PartSpec[]): Circuit {
  return {
    parts: specs.map(([kind, [x1, y1], [x2, y2], values], i) => {
      const p1 = { x: x1, y: y1 };
      const p2 = { x: x2, y: y2 };
      if (!isGridEdge(p1, p2)) throw new RangeError(`部品 ${i} の端子がとなり合っていない`);
      return {
        id: i + 1,
        kind,
        p1,
        p2,
        values: { ...defaultValues(kind), ...values },
        plot: PART_INFO[kind].plotByDefault,
      };
    }),
  };
}

/**
 * 充電・放電の回路（素子 X はコンデンサーまたはコイル）。
 *   S₁ を閉じると 電源 → S₁ → R₁ → X の直列回路。S₂ を閉じると R₂ が X に並列につながり、
 *   S₁ を開くと電源が外れて X と R₂ だけの回路になる（どの順にスイッチを操作しても電源は短絡しない）。
 *   電流計 A₁ は X を流れる電流、電圧計 V₁ は X の電圧を測る。
 *       (0,1)─S₁─(1,1)─R₁─(2,1)──(3,1)──(4,1)──(5,1)
 *         E                       X       R₂      V₁
 *       (0,2)                   (3,2)   (4,2)   (5,2)
 *         │                       A₁      S₂      │
 *       (0,3)──────────────────(3,3)──(4,3)──(5,3)
 */
function chargeDischarge(
  element: PartSpec,
  values: { E: number; R1: number; R2: number },
): Circuit {
  return circuitFrom([
    ['dc', [0, 2], [0, 1], { E: values.E }],
    ['wire', [0, 2], [0, 3]],
    ['switch', [0, 1], [1, 1]],
    ['resistor', [1, 1], [2, 1], { R: values.R1 }],
    ['wire', [2, 1], [3, 1]],
    element,
    ['ammeter', [3, 2], [3, 3]],
    ['wire', [3, 1], [4, 1]],
    ['resistor', [4, 1], [4, 2], { R: values.R2 }],
    ['switch', [4, 2], [4, 3]],
    ['wire', [0, 3], [1, 3]],
    ['wire', [1, 3], [2, 3]],
    ['wire', [2, 3], [3, 3]],
    ['wire', [3, 3], [4, 3]],
    ['wire', [4, 1], [5, 1]],
    ['voltmeter', [5, 1], [5, 2]],
    ['wire', [5, 2], [5, 3]],
    ['wire', [4, 3], [5, 3]],
  ]);
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'rc',
    label: 'RC 回路',
    timeScale: 1 / 10,
    circuit: chargeDischarge(['capacitor', [3, 1], [3, 2], { C: 200, V0: 0 }], {
      E: 6,
      R1: 500,
      R2: 500,
    }),
  },
  {
    id: 'rl',
    label: 'RL 回路',
    timeScale: 1 / 100,
    circuit: chargeDischarge(['coil', [3, 1], [3, 2], { L: 400 }], { E: 6, R1: 20, R2: 60 }),
  },
  {
    id: 'lc',
    label: 'LC 回路',
    timeScale: 1 / 100,
    // 充電したコンデンサー C を、S₁ を閉じてコイル L につなぐ（電気振動）。
    // 電流計 A₁ はコイルを流れる電流（C の上の極板 → S₁ → L → A₁ の向きが正）、電圧計 V₁ は C の電圧
    circuit: circuitFrom([
      ['coil', [1, 1], [1, 2], { L: 100 }],
      ['wire', [2, 1], [1, 1]],
      ['switch', [2, 1], [3, 1]],
      ['capacitor', [3, 1], [3, 2], { C: 100, V0: 10 }],
      ['wire', [1, 2], [1, 3]],
      ['ammeter', [1, 3], [2, 3]],
      ['wire', [2, 3], [3, 3]],
      ['wire', [3, 2], [3, 3]],
      ['wire', [3, 1], [4, 1]],
      ['voltmeter', [4, 1], [4, 2]],
      ['wire', [4, 2], [4, 3]],
      ['wire', [3, 3], [4, 3]],
    ]),
  },
  {
    id: 'ac',
    label: '交流 RLC',
    timeScale: 1 / 100,
    // 交流電源に R・L・C を直列につなぐ。S₁ を閉じると過渡現象のあと定常状態になる
    circuit: circuitFrom([
      ['ac', [0, 2], [0, 1], { Ve: 10, f: 50 }],
      ['wire', [0, 2], [0, 3]],
      ['switch', [0, 1], [1, 1]],
      ['resistor', [1, 1], [2, 1], { R: 20 }],
      ['coil', [2, 1], [3, 1], { L: 100 }],
      ['capacitor', [3, 1], [3, 2], { C: 100 }],
      ['ammeter', [3, 2], [3, 3]],
      ['wire', [0, 3], [1, 3]],
      ['wire', [1, 3], [2, 3]],
      ['wire', [2, 3], [3, 3]],
    ]),
  },
  {
    id: 'dc',
    label: '直流回路',
    timeScale: 1 / 10,
    // 2 つの電池と 3 つの抵抗（キルヒホッフの法則）。コンデンサー・コイルがないので変化しない
    circuit: circuitFrom([
      ['dc', [0, 2], [0, 1], { E: 6 }],
      ['wire', [0, 2], [0, 3]],
      ['resistor', [0, 1], [1, 1], { R: 100 }],
      ['wire', [1, 1], [2, 1]],
      ['resistor', [3, 1], [2, 1], { R: 200 }],
      ['wire', [3, 1], [4, 1]],
      ['dc', [4, 2], [4, 1], { E: 3 }],
      ['wire', [4, 2], [4, 3]],
      ['resistor', [2, 1], [2, 2], { R: 300 }],
      ['ammeter', [2, 2], [2, 3]],
      ['wire', [0, 3], [1, 3]],
      ['wire', [1, 3], [2, 3]],
      ['wire', [2, 3], [3, 3]],
      ['wire', [3, 3], [4, 3]],
    ]),
  },
  { id: 'empty', label: '白紙', timeScale: 1 / 100, circuit: { parts: [] } },
];

export function preset(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`未知の回路の例: ${id}`);
  return p;
}

/** 部品の添字（名前で探す。テスト・解説用） */
export function indexOfName(circuit: Circuit, name: string): number {
  const i = partNames(circuit).indexOf(name);
  if (i < 0) throw new Error(`部品 ${name} がない`);
  return i;
}

/** スイッチの開閉の配列を作る（名前で閉じるスイッチを指定） */
export function closedSwitches(circuit: Circuit, ...names: string[]): boolean[] {
  const all = partNames(circuit);
  return circuit.parts.map((p, i) => p.kind === 'switch' && names.includes(all[i]!));
}
