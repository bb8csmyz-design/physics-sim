import { describe, expect, it } from 'vitest';
import { analyzeCircuit, type Branch, type CircuitSolver, type Netlist } from './circuit';

function solverOf(net: Netlist): CircuitSolver {
  const a = analyzeCircuit(net);
  if (!a.ok) throw new Error(a.issue.kind);
  return a.solver;
}

const dc =
  (E: number) =>
  (_t: number): number =>
    E;

describe('抵抗回路', () => {
  it('分圧: 直列の抵抗には抵抗に比例した電圧がかかる', () => {
    // 節点 0 → 電源 → 1 → R₁ → 2 → R₂ → 0
    const branches: Branch[] = [
      { kind: 'source', n1: 0, n2: 1, emf: dc(9) },
      { kind: 'resistor', n1: 1, n2: 2, R: 100 },
      { kind: 'resistor', n1: 2, n2: 0, R: 200 },
    ];
    const r = solverOf({ nodeCount: 3, branches }).outputs([0, 0, 0], 0);
    expect(r.V[1]!).toBeCloseTo(3, 12);
    expect(r.V[2]!).toBeCloseTo(6, 12);
    expect(r.I[1]!).toBeCloseTo(0.03, 14);
    // 電源の電流（負極 → 正極の向き）も同じ
    expect(r.I[0]!).toBeCloseTo(0.03, 14);
    expect(r.V[0]!).toBeCloseTo(-9, 12);
  });

  it('ホイートストンブリッジ: R₁R₄ = R₂R₃ なら検流計に電流が流れない', () => {
    // 0: 電源の負極, 1: 正極, 2, 3: ブリッジの中点。検流計は 2–3 の導線（電流計）
    const branches: Branch[] = [
      { kind: 'source', n1: 0, n2: 1, emf: dc(10) },
      { kind: 'resistor', n1: 1, n2: 2, R: 100 },
      { kind: 'resistor', n1: 1, n2: 3, R: 300 },
      { kind: 'resistor', n1: 2, n2: 0, R: 200 },
      { kind: 'resistor', n1: 3, n2: 0, R: 600 },
      { kind: 'short', n1: 2, n2: 3 },
    ];
    const r = solverOf({ nodeCount: 4, branches }).outputs([0, 0, 0, 0, 0, 0], 0);
    expect(Math.abs(r.I[5]!)).toBeLessThan(1e-15);
    // 釣り合っていなければ流れる
    const unbalanced = branches.map((b, i) => (i === 4 ? { ...b, R: 300 } : b)) as Branch[];
    const u = solverOf({ nodeCount: 4, branches: unbalanced }).outputs([0, 0, 0, 0, 0, 0], 0);
    expect(Math.abs(u.I[5]!)).toBeGreaterThan(1e-3);
  });
});

describe('時間積分', () => {
  // RL 直列回路: 0 → 電源 → 1 → R → 2 → L → 0。I = (E/R)(1 − e^{−Rt/L})
  const net: Netlist = {
    nodeCount: 3,
    branches: [
      { kind: 'source', n1: 0, n2: 1, emf: dc(5) },
      { kind: 'resistor', n1: 1, n2: 2, R: 10 },
      { kind: 'inductor', n1: 2, n2: 0, L: 0.1 },
    ],
  };
  const exact = (t: number) => 0.5 * (1 - Math.exp(-100 * t));
  const errorAt = (dt: number, method: 'sdirk2' | 'backward-euler') => {
    const s = solverOf(net);
    let x: readonly number[] = [0, 0, 0];
    const n = Math.round(0.01 / dt);
    for (let i = 0; i < n; i++) x = s.step(x, i * dt, dt, method).x;
    return Math.abs(x[2]! - exact(0.01));
  };

  it('収束次数: SDIRK 法は 2 次、後退オイラー法は 1 次', () => {
    for (const [method, order] of [
      ['sdirk2', 2],
      ['backward-euler', 1],
    ] as const) {
      const e1 = errorAt(1e-4, method);
      const e2 = errorAt(5e-5, method);
      expect(Math.log2(e1 / e2), method).toBeCloseTo(order, 1);
    }
  });

  it('時定数より大きな刻み幅でも発散しない（L 安定）', () => {
    // Δt = 100τ: 増幅率 R(z) = (1 + (1 − 2γ)z)/(1 − γz)² は z = −100 で −0.044（z → −∞ で 0）なので、
    // 1 ステップで定常値 0.5 の 4.4% 以内に達する
    const s = solverOf(net);
    const r = s.step([0, 0, 0], 0, 1, 'sdirk2');
    expect(Math.abs(r.x[2]! - 0.5)).toBeLessThan(0.5 * 0.045);
    expect(Math.abs(s.step(r.x, 1, 1, 'sdirk2').x[2]! - 0.5)).toBeLessThan(0.5 * 0.045 ** 2);
  });
});

describe('回路の構造', () => {
  it('電源の短絡・電源どうしの閉回路を検出する', () => {
    const shorted = analyzeCircuit({
      nodeCount: 2,
      branches: [
        { kind: 'source', n1: 0, n2: 1, emf: dc(1) },
        { kind: 'short', n1: 1, n2: 0 },
      ],
    });
    expect(shorted.ok ? null : shorted.issue).toEqual({ kind: 'shorted-source', branch: 0 });
    const loop = analyzeCircuit({
      nodeCount: 2,
      branches: [
        { kind: 'source', n1: 0, n2: 1, emf: dc(1) },
        { kind: 'source', n1: 0, n2: 1, emf: dc(1) },
      ],
    });
    expect(loop.ok ? null : loop.issue).toEqual({ kind: 'source-loop', branch: 1 });
  });

  it('コンデンサーと電源だけの閉回路、行き場のないコイルを「切り替えで跳びうる回路」と判定する', () => {
    const rc = solverOf({
      nodeCount: 3,
      branches: [
        { kind: 'source', n1: 0, n2: 1, emf: dc(1) },
        { kind: 'resistor', n1: 1, n2: 2, R: 1 },
        { kind: 'capacitor', n1: 2, n2: 0, C: 1 },
      ],
    });
    expect(rc.impulsive).toBe(false);
    const cv = solverOf({
      nodeCount: 2,
      branches: [
        { kind: 'source', n1: 0, n2: 1, emf: dc(1) },
        { kind: 'capacitor', n1: 1, n2: 0, C: 1 },
      ],
    });
    expect(cv.impulsive).toBe(true);
    const openCoil = solverOf({
      nodeCount: 3,
      branches: [
        { kind: 'source', n1: 0, n2: 1, emf: dc(1) },
        { kind: 'inductor', n1: 1, n2: 2, L: 1 },
        { kind: 'open', n1: 2, n2: 0 },
      ],
    });
    expect(openCoil.impulsive).toBe(true);
  });
});
