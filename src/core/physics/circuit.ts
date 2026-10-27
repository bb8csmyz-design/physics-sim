/**
 * 線形回路の過渡解析（修正節点解析 MNA + 陰的な時間積分）。UI に依存しない純粋な計算のみ。
 *
 * 回路は「節点」と、2 つの節点を結ぶ「枝」（素子）で表す。枝の向きは n1 → n2。
 * - 電流 I: 枝の中を n1 → n2 へ流れる向きを正
 * - 電圧 V = φ(n1) − φ(n2)（電流の向きに測った電位の下がり）。抵抗なら V = RI、
 *   コンデンサーなら V = q/C（q は n1 側の極板の電気量、I = dq/dt）、コイルなら V = L dI/dt。
 *   電源（起電力 e(t)、内部抵抗なし）は n2 側が正極で φ(n2) − φ(n1) = e(t)、すなわち V = −e(t)。
 * - 状態変数 x: コンデンサーは電圧 V_C、コイルは電流 I_L（ほかの枝は 0）。
 *
 * 時間積分: 2 段の SDIRK 法（γ = 1 − 1/√2。2 次精度・L 安定・stiffly accurate）。
 *   各段は、コンデンサーを「コンダクタンス C/(γΔt) と電流源」、コイルを「コンダクタンス γΔt/L と電流源」
 *   に置き換えた抵抗回路（コンパニオンモデル）を解くことに等しい。行列は回路が変わらない限り同じなので、
 *   LU 分解を使い回す。
 *   素子の値によっては時定数が Δt よりずっと短くなる（硬い方程式）。L 安定な陰的法なので発散しない。
 * 理想素子だけの閉回路（コンデンサーと電源・コンデンサーだけのループ）や、コイルの電流の行き場がない
 *   切断（コイルと開いたスイッチの直列など）があると、スイッチを切り替えた瞬間に電流・電圧が跳ぶ
 *   （インパルス）。そのような回路では切り替え直後の 1 ステップを後退オイラー法で進める
 *   （跳びを 1 ステップに収め、振動させない）。
 * 導線（抵抗 0）は両端の節点を 1 つにまとめて解き、導線の電流は後から求める。並列の導線への電流の
 *   分かれ方は、各導線に同じ微小な抵抗があるとみなして決める（実際の導線の極限）。
 */

/** 回路の枝（素子）。値は SI 単位 */
export type Branch =
  | { readonly kind: 'resistor'; readonly n1: number; readonly n2: number; readonly R: number }
  | { readonly kind: 'capacitor'; readonly n1: number; readonly n2: number; readonly C: number }
  | { readonly kind: 'inductor'; readonly n1: number; readonly n2: number; readonly L: number }
  | {
      readonly kind: 'source';
      readonly n1: number;
      readonly n2: number;
      /** 起電力 e(t) [V]（n2 側が正極） */
      readonly emf: (t: number) => number;
    }
  /** 抵抗 0 の枝（導線・閉じたスイッチ・理想的な電流計） */
  | { readonly kind: 'short'; readonly n1: number; readonly n2: number }
  /** 電流が流れない枝（開いたスイッチ・理想的な電圧計）。両端の電圧だけを測る */
  | { readonly kind: 'open'; readonly n1: number; readonly n2: number };

export interface Netlist {
  /** 節点の数（節点の番号は 0 〜 nodeCount − 1） */
  readonly nodeCount: number;
  readonly branches: readonly Branch[];
}

export interface BranchValues {
  /** 各枝の電流 [A]（n1 → n2 の向きが正） */
  readonly I: readonly number[];
  /** 各枝の電圧 V = φ(n1) − φ(n2) [V]。両端がつながっていない別々の回路にあるときは NaN */
  readonly V: readonly number[];
}

export interface StepResult extends BranchValues {
  /** 進めた後の状態変数（コンデンサーは V_C [V]、コイルは I_L [A]、それ以外は 0） */
  readonly x: readonly number[];
}

/** 時間積分の方法（通常は 'sdirk2'。'backward-euler' は切り替え直後と比較用） */
export type StepMethod = 'sdirk2' | 'backward-euler';

/** 解けない回路（理想電源の短絡） */
export type CircuitIssue =
  /** 電源の両端が導線（抵抗 0 の枝）だけでつながっている */
  | { readonly kind: 'shorted-source'; readonly branch: number }
  /** 電源どうしが抵抗をはさまずに閉回路を作っている（並列につないだ電池など） */
  | { readonly kind: 'source-loop'; readonly branch: number };

export interface CircuitSolver {
  readonly netlist: Netlist;
  /**
   * 理想素子だけの閉回路・切断を含み、切り替えた瞬間に電流・電圧が跳びうる回路か。
   * true なら、回路を切り替えた直後の 1 ステップは後退オイラー法で進めること。
   */
  readonly impulsive: boolean;
  /** 状態 x（時刻 t）を dt だけ進める */
  step(x: readonly number[], t: number, dt: number, method?: StepMethod): StepResult;
  /**
   * 状態 x、時刻 t のときの各枝の電流・電圧（スイッチを入れた直後の値など）。
   * コンデンサーの電圧とコイルの電流を固定して抵抗回路を解くことに等しい
   * （微小な時間 OUTPUT_DT の後退オイラー法の 1 ステップとして求める）。
   */
  outputs(x: readonly number[], t: number): BranchValues;
}

export type CircuitAnalysis =
  | { readonly ok: true; readonly solver: CircuitSolver }
  | { readonly ok: false; readonly issue: CircuitIssue };

/** SDIRK 法の係数 γ = 1 − 1/√2（L 安定な 2 次の方法になる値） */
export const SDIRK_GAMMA = 1 - Math.SQRT1_2;

/** outputs() で使う微小な時間 [s]。状態の変化 O(OUTPUT_DT/τ) は表示に影響しない */
const OUTPUT_DT = 1e-9;

// ---------------------------------------------------------------------------
// 線形代数の小道具（密行列の LU 分解。回路は小さいので十分）
// ---------------------------------------------------------------------------

class UnionFind {
  private readonly parent: Int32Array;
  constructor(n: number) {
    this.parent = Int32Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r]!;
    while (this.parent[i] !== r) {
      const next = this.parent[i]!;
      this.parent[i] = r;
      i = next;
    }
    return r;
  }
  /** 別々の集合だったら結合して true。すでに同じ集合なら false */
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

/** a[i] += v（型付き配列の要素への加算） */
function addAt(a: Float64Array, i: number, v: number): void {
  a[i] = a[i]! + v;
}

interface LU {
  readonly n: number;
  /** L（対角は 1）と U を詰めた行列（行優先） */
  readonly a: Float64Array;
  readonly piv: Int32Array;
}

/** 部分ピボット選択付きの LU 分解。a は書き換える。特異なら例外 */
function luFactor(a: Float64Array, n: number): LU {
  const piv = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(a[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k]!);
      if (v > max) {
        max = v;
        p = i;
      }
    }
    if (!(max > 0) || !Number.isFinite(max)) throw new Error('回路の方程式が特異です');
    piv[k] = p;
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = a[k * n + j]!;
        a[k * n + j] = a[p * n + j]!;
        a[p * n + j] = tmp;
      }
    }
    const d = a[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const f = a[i * n + k]! / d;
      if (f === 0) continue;
      a[i * n + k] = f;
      for (let j = k + 1; j < n; j++) a[i * n + j] = a[i * n + j]! - f * a[k * n + j]!;
    }
  }
  return { n, a, piv };
}

/** LU 分解を使って A z = b を解く（b は書き換えて解を返す） */
function luSolve({ n, a, piv }: LU, b: Float64Array): Float64Array {
  for (let k = 0; k < n; k++) {
    const p = piv[k]!;
    if (p !== k) {
      const tmp = b[k]!;
      b[k] = b[p]!;
      b[p] = tmp;
    }
  }
  for (let i = 1; i < n; i++) {
    let s = b[i]!;
    for (let j = 0; j < i; j++) s -= a[i * n + j]! * b[j]!;
    b[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let j = i + 1; j < n; j++) s -= a[i * n + j]! * b[j]!;
    b[i] = s / a[i * n + i]!;
  }
  return b;
}

// ---------------------------------------------------------------------------
// 回路の解析
// ---------------------------------------------------------------------------

/**
 * 回路の構造を調べ、解く準備をする。理想電源が短絡していて解けないときは issue を返す。
 */
export function analyzeCircuit(net: Netlist): CircuitAnalysis {
  const { nodeCount, branches } = net;

  // 1. 導線（抵抗 0 の枝）でつながった節点を 1 つのグループにまとめる
  const shorts = new UnionFind(nodeCount);
  for (const b of branches) if (b.kind === 'short') shorts.union(b.n1, b.n2);
  const groupOfRoot = new Map<number, number>();
  const group = new Int32Array(nodeCount);
  for (let n = 0; n < nodeCount; n++) {
    const r = shorts.find(n);
    if (!groupOfRoot.has(r)) groupOfRoot.set(r, groupOfRoot.size);
    group[n] = groupOfRoot.get(r)!;
  }
  const groupCount = groupOfRoot.size;

  // 2. 電源の短絡・電源だけのループ（解が存在しない／一意に決まらない）を検出する
  const sourceTree = new UnionFind(groupCount);
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]!;
    if (b.kind !== 'source') continue;
    const g1 = group[b.n1]!;
    const g2 = group[b.n2]!;
    if (g1 === g2) return { ok: false, issue: { kind: 'shorted-source', branch: i } };
    if (!sourceTree.union(g1, g2)) return { ok: false, issue: { kind: 'source-loop', branch: i } };
  }

  // 3. つながった回路（連結成分）ごとに 1 つのグループを電位の基準（φ = 0）にする
  const conducting = new UnionFind(groupCount);
  for (const b of branches) {
    if (b.kind !== 'short' && b.kind !== 'open') conducting.union(group[b.n1]!, group[b.n2]!);
  }
  const component = Int32Array.from({ length: groupCount }, (_, g) => conducting.find(g));
  const groundOf = new Map<number, number>();
  const unknownOfGroup = new Int32Array(groupCount).fill(-1);
  let nv = 0;
  for (let g = 0; g < groupCount; g++) {
    const c = component[g]!;
    if (!groundOf.has(c)) groundOf.set(c, g);
    else unknownOfGroup[g] = nv++;
  }
  // 電源の電流も未知数にする（MNA）
  const unknownOfSource = new Int32Array(branches.length).fill(-1);
  let size = nv;
  branches.forEach((b, i) => {
    if (b.kind === 'source') unknownOfSource[i] = size++;
  });

  // 4. 切り替えでインパルスが起きうる構造か
  //    - コンデンサーが電源・ほかのコンデンサーだけで閉回路を作る（電圧が拘束される）
  //    - コイルの両端が、コイル以外の素子（抵抗・コンデンサー・電源）ではつながらない（電流が拘束される）
  const capLoop = new UnionFind(groupCount);
  const nonInductor = new UnionFind(groupCount);
  let impulsive = false;
  for (const b of branches) {
    const g1 = group[b.n1]!;
    const g2 = group[b.n2]!;
    if (b.kind === 'source') capLoop.union(g1, g2);
    if (b.kind === 'resistor' || b.kind === 'capacitor' || b.kind === 'source') {
      nonInductor.union(g1, g2);
    }
  }
  for (const b of branches) {
    const g1 = group[b.n1]!;
    const g2 = group[b.n2]!;
    if (b.kind === 'capacitor' && !capLoop.union(g1, g2)) impulsive = true;
    if (b.kind === 'inductor' && nonInductor.find(g1) !== nonInductor.find(g2)) impulsive = true;
  }

  // 5. 導線の電流を求めるための、導線だけの回路（各導線のコンダクタンス 1）の準備
  const shortSolver = prepareShortCurrents(net, group);

  // --- 行列（コンパニオンモデル）。hs ごとに LU 分解を記憶する ---
  const luCache = new Map<number, LU>();
  function matrixFor(hs: number): LU {
    const cached = luCache.get(hs);
    if (cached) return cached;
    const a = new Float64Array(size * size);
    const stampG = (g1: number, g2: number, G: number) => {
      const u1 = unknownOfGroup[g1]!;
      const u2 = unknownOfGroup[g2]!;
      if (u1 >= 0) addAt(a, u1 * size + u1, G);
      if (u2 >= 0) addAt(a, u2 * size + u2, G);
      if (u1 >= 0 && u2 >= 0) {
        addAt(a, u1 * size + u2, -G);
        addAt(a, u2 * size + u1, -G);
      }
    };
    branches.forEach((b, i) => {
      const g1 = group[b.n1]!;
      const g2 = group[b.n2]!;
      switch (b.kind) {
        case 'resistor':
          if (g1 !== g2) stampG(g1, g2, 1 / b.R);
          break;
        case 'capacitor':
          if (g1 !== g2) stampG(g1, g2, b.C / hs);
          break;
        case 'inductor':
          if (g1 !== g2) stampG(g1, g2, hs / b.L);
          break;
        case 'source': {
          const k = unknownOfSource[i]!;
          const u1 = unknownOfGroup[g1]!;
          const u2 = unknownOfGroup[g2]!;
          // KCL: 電源の電流 I は n1 から出て n2 に入る。拘束条件: φ2 − φ1 = e(t)
          if (u1 >= 0) {
            addAt(a, u1 * size + k, 1);
            addAt(a, k * size + u1, -1);
          }
          if (u2 >= 0) {
            addAt(a, u2 * size + k, -1);
            addAt(a, k * size + u2, 1);
          }
          break;
        }
        default:
          break;
      }
    });
    const lu = luFactor(a, size);
    luCache.set(hs, lu);
    return lu;
  }

  /**
   * コンパニオンモデルの抵抗回路を 1 回解く。
   * base: コンデンサーは「電圧の基準値」、コイルは「電流の基準値」
   *   （コンデンサー I = (C/hs)(V − base)、コイル I = base + (hs/L)V）
   */
  function solveStage(hs: number, base: readonly number[], t: number): StepResult {
    const lu = matrixFor(hs);
    const rhs = new Float64Array(size);
    const inject = (g: number, current: number) => {
      const u = unknownOfGroup[g]!;
      if (u >= 0) addAt(rhs, u, current);
    };
    branches.forEach((b, i) => {
      const g1 = group[b.n1]!;
      const g2 = group[b.n2]!;
      if (b.kind === 'capacitor' && g1 !== g2) {
        const J = (b.C / hs) * base[i]!;
        inject(g1, J);
        inject(g2, -J);
      } else if (b.kind === 'inductor' && g1 !== g2) {
        inject(g1, -base[i]!);
        inject(g2, base[i]!);
      } else if (b.kind === 'source') {
        rhs[unknownOfSource[i]!] = b.emf(t);
      }
    });
    const sol = luSolve(lu, rhs);
    const phi = (g: number) => {
      const u = unknownOfGroup[g]!;
      return u >= 0 ? sol[u]! : 0;
    };

    const I = new Array<number>(branches.length).fill(0);
    const V = new Array<number>(branches.length).fill(0);
    const x = new Array<number>(branches.length).fill(0);
    branches.forEach((b, i) => {
      const g1 = group[b.n1]!;
      const g2 = group[b.n2]!;
      const v = component[g1] === component[g2] ? phi(g1) - phi(g2) : NaN;
      V[i] = v;
      switch (b.kind) {
        case 'resistor':
          I[i] = v / b.R;
          break;
        case 'capacitor':
          I[i] = (b.C / hs) * (v - base[i]!);
          x[i] = v;
          break;
        case 'inductor':
          I[i] = base[i]! + (hs / b.L) * v;
          x[i] = I[i]!;
          break;
        case 'source':
          I[i] = sol[unknownOfSource[i]!]!;
          break;
        default:
          break;
      }
    });
    shortSolver?.(I);
    return { I, V, x };
  }

  const solver: CircuitSolver = {
    netlist: net,
    impulsive,
    step(x0, t, dt, method = 'sdirk2') {
      if (method === 'backward-euler') return solveStage(dt, x0, t + dt);
      // SDIRK: X₁ = x + γΔt f(X₁),  x' = X₂ = x + (1 − γ)Δt f(X₁) + γΔt f(X₂)
      const hs = SDIRK_GAMMA * dt;
      const s1 = solveStage(hs, x0, t + hs);
      const c = (1 - SDIRK_GAMMA) / SDIRK_GAMMA;
      const base2 = x0.map((xi, i) => xi + c * (s1.x[i]! - xi));
      return solveStage(hs, base2, t + dt);
    },
    outputs(x0, t) {
      const r = solveStage(OUTPUT_DT, x0, t);
      return { I: r.I, V: r.V };
    },
  };
  return { ok: true, solver };
}

/**
 * 導線（抵抗 0 の枝）の電流を求める関数を作る。導線どうしのつながりの中で、ほかの枝から
 * 各節点に流れ込む電流をキルヒホッフの第 1 法則で配る（各導線に同じ微小な抵抗があるとみなす）。
 * 導線がなければ null。
 */
function prepareShortCurrents(net: Netlist, group: Int32Array): ((I: number[]) => void) | null {
  const { nodeCount, branches } = net;
  const shortIdx: number[] = [];
  branches.forEach((b, i) => {
    if (b.kind === 'short') shortIdx.push(i);
  });
  if (shortIdx.length === 0) return null;

  // 導線につながる節点のうち、グループごとに 1 つを基準（ψ = 0）にして残りを未知数にする
  const touched = new Set<number>();
  for (const i of shortIdx) {
    touched.add(branches[i]!.n1);
    touched.add(branches[i]!.n2);
  }
  const refOfGroup = new Map<number, number>();
  const unknown = new Int32Array(nodeCount).fill(-1);
  let n = 0;
  for (const node of [...touched].sort((a, b) => a - b)) {
    const g = group[node]!;
    if (!refOfGroup.has(g)) refOfGroup.set(g, node);
    else unknown[node] = n++;
  }
  const a = new Float64Array(n * n);
  for (const i of shortIdx) {
    const { n1, n2 } = branches[i]!;
    const u1 = unknown[n1]!;
    const u2 = unknown[n2]!;
    if (u1 >= 0) addAt(a, u1 * n + u1, 1);
    if (u2 >= 0) addAt(a, u2 * n + u2, 1);
    if (u1 >= 0 && u2 >= 0) {
      addAt(a, u1 * n + u2, -1);
      addAt(a, u2 * n + u1, -1);
    }
  }
  const lu = luFactor(a, n);

  return (I) => {
    // ほかの枝から各節点に流れ込む電流（枝の電流は n1 から出て n2 に入る）
    const inj = new Float64Array(n);
    branches.forEach((b, i) => {
      if (b.kind === 'short') return;
      const u1 = unknown[b.n1]!;
      const u2 = unknown[b.n2]!;
      if (u1 >= 0) addAt(inj, u1, -I[i]!);
      if (u2 >= 0) addAt(inj, u2, I[i]!);
    });
    const psi = luSolve(lu, inj);
    const at = (node: number) => (unknown[node]! >= 0 ? psi[unknown[node]!]! : 0);
    for (const i of shortIdx) {
      const { n1, n2 } = branches[i]!;
      I[i] = at(n1) - at(n2);
    }
  };
}
