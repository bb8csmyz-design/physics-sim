/**
 * 理想気体の状態変化と熱サイクルのモデルの物理的な正しさのテスト。
 * 状態方程式 pV = nRT、各変化の条件（定積・定圧・等温・断熱 pV^γ = 一定）、
 * 熱力学第一法則 Q = ΔU + W、仕事 = ∫p dV（p-V 図の面積）、熱効率の公式、熱力学第二法則（カルノー効率が上限）を、
 * すべてのサイクル・気体の種類・パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { GAS_CONSTANT as R } from '@/core/physics/constants';
import {
  CYCLES,
  DT,
  P_A,
  PROCESS_DURATION,
  buildCycle,
  currentState,
  heatCapacityRatio,
  initialProgress,
  internalEnergy,
  lapEnergy,
  molarCp,
  molarCv,
  processDirections,
  processEnergy,
  processLabel,
  processPoint,
  step,
  summarize,
  type Cycle,
  type CycleId,
  type GasKind,
  type Process,
} from './model';

const GASES: readonly GasKind[] = ['monatomic', 'diatomic'];
const CYCLE_IDS = Object.keys(CYCLES) as CycleId[];

/** すべてのサイクル × 気体 × パラメータの全隅 */
const ALL: { id: CycleId; gas: GasKind; cycle: Cycle; label: string }[] = CYCLE_IDS.flatMap((id) =>
  GASES.flatMap((gas) =>
    paramCorners(CYCLES[id].params).map((p) => ({
      id,
      gas,
      cycle: buildCycle(id, gas, p),
      label: `${id} ${gas} ${JSON.stringify(p)}`,
    })),
  ),
);

function defaultCycle(id: CycleId, gas: GasKind): Cycle {
  return buildCycle(id, gas, defaultParams(CYCLES[id].params));
}

/** エネルギーの目安 nRT（許容誤差の基準に使う） */
function energyScale(c: Cycle, proc: Process): number {
  return c.n * R * Math.max(proc.start.T, proc.end.T);
}

/** 過程に沿った ∫p dV をシンプソン則で数値積分する（解析的な仕事の式とは独立に計算） */
function numericalWork(c: Cycle, proc: Process, s1 = 1, intervals = 2000): number {
  const pts = Array.from({ length: intervals + 1 }, (_, i) =>
    processPoint(c.gas, c.n, proc, (i / intervals) * s1),
  );
  // 体積は s に比例する（定積なら一定）ので、V について等間隔のシンプソン則が使える
  const h = (pts[intervals]!.V - pts[0]!.V) / intervals;
  let sum = pts[0]!.p + pts[intervals]!.p;
  for (let i = 1; i < intervals; i++) sum += (i % 2 === 1 ? 4 : 2) * pts[i]!.p;
  return (h / 3) * sum;
}

describe('モル比熱', () => {
  it('マイヤーの関係 C_p − C_V = R、比熱比 γ は単原子 5/3・二原子 7/5', () => {
    for (const gas of GASES) expect(molarCp(gas) - molarCv(gas)).toBeCloseTo(R, 12);
    expect(heatCapacityRatio('monatomic')).toBeCloseTo(5 / 3, 12);
    expect(heatCapacityRatio('diatomic')).toBeCloseTo(7 / 5, 12);
  });
});

describe('状態方程式と各変化の条件', () => {
  it('状態 A は p = 1.0×10⁵ Pa、温度 T_A で pV = nRT', () => {
    for (const { cycle, label } of ALL) {
      const A = cycle.processes[0]!.start;
      expect(A.p, label).toBe(P_A);
      expect(relativeError(A.p * A.V, cycle.n * R * A.T), label).toBeLessThan(1e-12);
    }
  });

  it('過程の途中のどの点でも pV = nRT が成り立つ', () => {
    for (const { cycle, label } of ALL) {
      for (const proc of cycle.processes) {
        for (let i = 0; i <= 20; i++) {
          const x = processPoint(cycle.gas, cycle.n, proc, i / 20);
          expect(relativeError(x.p * x.V, cycle.n * R * x.T), label).toBeLessThan(1e-12);
        }
      }
    }
  });

  it('各過程が始めと終わりの状態を正しく結ぶ（s = 0, 1 で端点に一致）', () => {
    for (const { cycle, label } of ALL) {
      for (const proc of cycle.processes) {
        for (const [s, target] of [
          [0, proc.start],
          [1, proc.end],
        ] as const) {
          const x = processPoint(cycle.gas, cycle.n, proc, s);
          expect(relativeError(x.p, target.p), label).toBeLessThan(1e-12);
          expect(relativeError(x.V, target.V), label).toBeLessThan(1e-12);
          expect(relativeError(x.T, target.T), label).toBeLessThan(1e-12);
        }
      }
    }
  });

  it('定積は V、定圧は p、等温は T が一定。断熱は pV^γ と TV^(γ−1) が一定', () => {
    for (const { cycle, label } of ALL) {
      const g = heatCapacityRatio(cycle.gas);
      for (const proc of cycle.processes) {
        const a = proc.start;
        for (let i = 1; i <= 10; i++) {
          const x = processPoint(cycle.gas, cycle.n, proc, i / 10);
          if (proc.kind === 'isochoric') expect(x.V, label).toBe(a.V);
          if (proc.kind === 'isobaric') expect(x.p, label).toBe(a.p);
          if (proc.kind === 'isothermal') expect(x.T, label).toBe(a.T);
          if (proc.kind === 'adiabatic') {
            expect(relativeError(x.p * x.V ** g, a.p * a.V ** g), label).toBeLessThan(1e-12);
            expect(relativeError(x.T * x.V ** (g - 1), a.T * a.V ** (g - 1)), label).toBeLessThan(
              1e-12,
            );
          }
        }
      }
    }
  });

  it('サイクルは閉じている（最後の過程が状態 A に戻る）', () => {
    for (const { cycle, label } of ALL) {
      const ps = cycle.processes;
      for (let i = 0; i < ps.length; i++) {
        const next = ps[(i + 1) % ps.length]!.start;
        expect(relativeError(ps[i]!.end.V, next.V), label).toBeLessThan(1e-12);
        expect(relativeError(ps[i]!.end.T, next.T), label).toBeLessThan(1e-12);
        expect(relativeError(ps[i]!.end.p, next.p), label).toBeLessThan(1e-12);
      }
    }
  });
});

describe('熱力学第一法則 Q = ΔU + W', () => {
  it('各過程の途中のどの点でも Q = ΔU + W（Q・W・ΔU は別々の公式から求めている）', () => {
    for (const { cycle, label } of ALL) {
      for (const proc of cycle.processes) {
        for (let i = 1; i <= 10; i++) {
          const e = processEnergy(cycle.gas, cycle.n, proc, i / 10);
          // 丸め誤差のみ（対数・べき乗の計算で 1e-15 程度の相対誤差）
          expect(Math.abs(e.Q - (e.dU + e.W)), `${label} ${proc.kind}`).toBeLessThan(
            1e-10 * energyScale(cycle, proc),
          );
        }
      }
    }
  });

  it('気体がした仕事 W が p-V 図の面積 ∫p dV（数値積分）に一致する', () => {
    for (const { cycle, label } of ALL) {
      for (const proc of cycle.processes) {
        for (const s of [0.37, 1]) {
          const W = processEnergy(cycle.gas, cycle.n, proc, s).W;
          // シンプソン則の誤差は区間幅の 4 乗に比例する。最も急な断熱圧縮（ε = 8）でも
          // 2000 区間なら nRT に対して 1e-10 程度（400 区間では 1e-8 程度になり不十分）
          expect(Math.abs(W - numericalWork(cycle, proc, s)), `${label} ${proc.kind}`).toBeLessThan(
            1e-9 * energyScale(cycle, proc),
          );
        }
      }
    }
  });

  it('ΔU は温度だけで決まり、U = nC_VT の差に等しい', () => {
    for (const { cycle, label } of ALL) {
      for (const proc of cycle.processes) {
        const e = processEnergy(cycle.gas, cycle.n, proc);
        const expected =
          internalEnergy(cycle.gas, cycle.n, proc.end.T) -
          internalEnergy(cycle.gas, cycle.n, proc.start.T);
        expect(Math.abs(e.dU - expected), label).toBeLessThan(1e-10 * energyScale(cycle, proc));
      }
    }
  });

  it('定積: W = 0、等温: ΔU = 0 で Q = W、断熱: Q = 0 で W = −ΔU', () => {
    for (const { cycle, label } of ALL) {
      for (const proc of cycle.processes) {
        const e = processEnergy(cycle.gas, cycle.n, proc);
        const tol = 1e-10 * energyScale(cycle, proc);
        if (proc.kind === 'isochoric') expect(e.W, label).toBe(0);
        if (proc.kind === 'isothermal') {
          expect(e.dU, label).toBe(0);
          expect(e.Q, label).toBe(e.W);
        }
        if (proc.kind === 'adiabatic') {
          expect(e.Q, label).toBe(0);
          expect(Math.abs(e.W + e.dU), label).toBeLessThan(tol);
        }
      }
    }
  });

  it('断熱変化では、各微小区間で nC_V dT + p dV ≈ 0（熱の出入りがない）', () => {
    const c = defaultCycle('otto', 'diatomic');
    const proc = c.processes[0]!;
    const steps = 2000;
    let maxRatio = 0;
    for (let i = 0; i < steps; i++) {
      const a = processPoint(c.gas, c.n, proc, i / steps);
      const b = processPoint(c.gas, c.n, proc, (i + 1) / steps);
      const dQ = c.n * molarCv(c.gas) * (b.T - a.T) + ((a.p + b.p) / 2) * (b.V - a.V);
      maxRatio = Math.max(maxRatio, Math.abs(dQ) / Math.abs(a.p * (b.V - a.V)));
    }
    // 台形則の誤差は区間幅の 2 乗に比例: (1/2000)² の桁
    expect(maxRatio).toBeLessThan(1e-5);
  });

  it('各過程で熱の出入りの向きは途中で変わらない（Q_in・Q_out の計算の前提）', () => {
    for (const { cycle, label } of ALL) {
      for (const proc of cycle.processes) {
        let prev = 0;
        const sign = Math.sign(processEnergy(cycle.gas, cycle.n, proc).Q);
        for (let i = 1; i <= 20; i++) {
          const q = processEnergy(cycle.gas, cycle.n, proc, i / 20).Q;
          expect(Math.sign(q - prev) * sign, label).toBeGreaterThanOrEqual(0);
          prev = q;
        }
      }
    }
  });
});

describe('サイクル全体', () => {
  it('1 サイクルで ΔU = 0、Q の和 = W の和 = 正味の仕事', () => {
    for (const { cycle, label } of ALL) {
      const sum = summarize(cycle);
      const scale = cycle.n * R * sum.Tmax;
      expect(Math.abs(sum.total.dU), label).toBeLessThan(1e-10 * scale);
      expect(Math.abs(sum.total.Q - sum.total.W), label).toBeLessThan(1e-10 * scale);
      expect(relativeError(sum.Qin - sum.Qout, sum.total.Q), label).toBeLessThan(1e-9);
    }
  });

  it('正味の仕事 = p-V 図でサイクルが囲む面積（時計回りで正）', () => {
    for (const { cycle, label } of ALL) {
      // 経路を細かい多角形で近似し、靴ひも公式で面積を求める
      const pts = cycle.processes.flatMap((proc) =>
        Array.from({ length: 2000 }, (_, i) => processPoint(cycle.gas, cycle.n, proc, i / 2000)),
      );
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        area += (b.V - a.V) * (a.p + b.p) * 0.5;
      }
      // 台形則（2000 区間/過程）の相対誤差は 1e-6 程度
      expect(relativeError(area, summarize(cycle).total.W), label).toBeLessThan(1e-5);
    }
  });

  it('熱機関として正の仕事をし、熱効率は 0 < e < 1 − T_min/T_max（熱力学第二法則）', () => {
    for (const { id, cycle, label } of ALL) {
      const s = summarize(cycle);
      expect(s.total.W, label).toBeGreaterThan(0);
      expect(s.efficiency, label).toBeGreaterThan(0);
      expect(relativeError(s.efficiency, s.total.W / s.Qin), label).toBeLessThan(1e-12);
      if (id === 'carnot') {
        expect(relativeError(s.efficiency, s.carnotEfficiency), label).toBeLessThan(1e-9);
      } else {
        expect(s.efficiency, label).toBeLessThan(s.carnotEfficiency);
      }
    }
  });

  it('カルノーサイクル: e = 1 − T_C/T_A、Q_out/Q_in = T_C/T_A', () => {
    for (const gas of GASES) {
      for (const p of paramCorners(CYCLES.carnot.params)) {
        const s = summarize(buildCycle('carnot', gas, p));
        const tau = p.tau!;
        expect(relativeError(s.efficiency, 1 - tau)).toBeLessThan(1e-9);
        expect(relativeError(s.Qout / s.Qin, tau)).toBeLessThan(1e-9);
        // 吸熱は高温の等温膨張 nRT_A ln r のみ
        expect(relativeError(s.Qin, p.n! * R * p.TA! * Math.log(p.r!))).toBeLessThan(1e-12);
      }
    }
  });

  it('オットーサイクル: e = 1 − ε^(1−γ)（圧縮比 ε だけで決まる）', () => {
    for (const gas of GASES) {
      for (const p of paramCorners(CYCLES.otto.params)) {
        const s = summarize(buildCycle('otto', gas, p));
        const expected = 1 - p.eps! ** (1 - heatCapacityRatio(gas));
        expect(relativeError(s.efficiency, expected)).toBeLessThan(1e-9);
      }
    }
  });

  it('教科書の例: 単原子分子 1 mol、300 K、圧力・体積を 2 倍にする長方形サイクルは e = 2/13', () => {
    const c = buildCycle('rectangle', 'monatomic', { n: 1, TA: 300, k: 2, r: 2 });
    const s = summarize(c);
    // W = (2p_A − p_A)(2V_A − V_A) = p_AV_A = nRT_A
    expect(relativeError(s.total.W, R * 300)).toBeLessThan(1e-12);
    // Q_in = Q_AB + Q_BC = (3/2)R(600 − 300) + (5/2)R(1200 − 600) = (13/2)RT_A
    expect(relativeError(s.Qin, 6.5 * R * 300)).toBeLessThan(1e-12);
    expect(s.efficiency).toBeCloseTo(2 / 13, 12);
    expect(s.Tmax).toBeCloseTo(1200, 9);
    expect(s.Tmin).toBeCloseTo(300, 9);
  });

  it('教科書の例: 定積・等温・定圧サイクル（単原子、圧力 2 倍）は e = (2ln2 − 1)/(3/2 + 2ln2)', () => {
    const s = summarize(buildCycle('isothermal', 'monatomic', { n: 1, TA: 300, k: 2 }));
    const ln2 = Math.log(2);
    expect(relativeError(s.perProcess[0]!.Q, 1.5 * R * 300)).toBeLessThan(1e-12);
    expect(relativeError(s.perProcess[1]!.Q, 2 * R * 300 * ln2)).toBeLessThan(1e-12);
    expect(relativeError(s.perProcess[2]!.Q, -2.5 * R * 300)).toBeLessThan(1e-12);
    expect(s.efficiency).toBeCloseTo((2 * ln2 - 1) / (1.5 + 2 * ln2), 12);
  });

  it('同じ条件なら、二原子分子の長方形サイクルは単原子分子より効率が低い（比熱が大きいため）', () => {
    const p = defaultParams(CYCLES.rectangle.params);
    const mono = summarize(buildCycle('rectangle', 'monatomic', p));
    const di = summarize(buildCycle('rectangle', 'diatomic', p));
    expect(relativeError(di.total.W, mono.total.W)).toBeLessThan(1e-12);
    expect(di.efficiency).toBeLessThan(mono.efficiency);
    // 二原子分子: Q_in = (5/2)R·300 + (7/2)R·600 = 2850R、W = 300R → e = 2/19
    expect(di.efficiency).toBeCloseTo(2 / 19, 12);
  });

  it('物質量を 2 倍にすると Q・W・ΔU は 2 倍、効率は変わらない（示量変数と示強変数）', () => {
    for (const id of CYCLE_IDS) {
      const p = defaultParams(CYCLES[id].params);
      const a = summarize(buildCycle(id, 'monatomic', p));
      const b = summarize(buildCycle(id, 'monatomic', { ...p, n: 2 * p.n! }));
      expect(relativeError(b.total.W, 2 * a.total.W)).toBeLessThan(1e-12);
      expect(relativeError(b.Qin, 2 * a.Qin)).toBeLessThan(1e-12);
      expect(relativeError(b.efficiency, a.efficiency)).toBeLessThan(1e-12);
    }
  });
});

describe('アニメーション（サイクルをたどる）', () => {
  it('1 周すると状態 A に戻り、このサイクルの累計は Q = W = 正味の仕事、ΔU = 0', () => {
    for (const id of CYCLE_IDS) {
      for (const gas of GASES) {
        const c = defaultCycle(id, gas);
        const sum = summarize(c);
        const nSteps = Math.round((c.processes.length * PROCESS_DURATION) / DT);
        let pr = initialProgress();
        for (let i = 0; i < nSteps - 1; i++) {
          pr = step(c, pr, DT);
          const e = lapEnergy(c, pr);
          // 第一法則は途中のどの瞬間にも成り立つ
          expect(Math.abs(e.Q - e.dU - e.W)).toBeLessThan(1e-9 * sum.Qin);
        }
        expect(pr.index).toBe(c.processes.length - 1);
        pr = step(c, pr, DT);
        expect(pr).toEqual({ index: 0, s: 0, laps: 1 });
        const A = c.processes[0]!.start;
        const x = currentState(c, pr);
        expect(relativeError(x.V, A.V)).toBeLessThan(1e-12);
        expect(relativeError(x.T, A.T)).toBeLessThan(1e-12);
        // 最後の過程の終わり（A に戻る直前）で、累計は 1 サイクル分の合計にちょうど一致する
        const end = lapEnergy(c, { index: c.processes.length - 1, s: 1, laps: 0 });
        expect(Math.abs(end.W - sum.total.W)).toBeLessThan(1e-12 * sum.Qin);
        expect(Math.abs(end.Q - sum.total.Q)).toBeLessThan(1e-12 * sum.Qin);
        expect(Math.abs(end.dU)).toBeLessThan(1e-12 * sum.Qin);
      }
    }
  });

  it('累計の Q・W・ΔU は過程の切りかわりで飛ばない（連続）', () => {
    const d = 1e-9;
    for (const { cycle, label } of ALL) {
      const scale = summarize(cycle).Qin;
      for (let i = 0; i + 1 < cycle.processes.length; i++) {
        const before = lapEnergy(cycle, { index: i, s: 1 - d, laps: 0 });
        const after = lapEnergy(cycle, { index: i + 1, s: d, laps: 0 });
        // 両側とも境界から Δs = 1e-9 なので、差は 1 過程分の 1e-8 程度以下
        expect(Math.abs(after.Q - before.Q), label).toBeLessThan(1e-6 * scale);
        expect(Math.abs(after.W - before.W), label).toBeLessThan(1e-6 * scale);
        expect(Math.abs(after.dU - before.dU), label).toBeLessThan(1e-6 * scale);
      }
    }
  });

  it('過程の名前と熱・ピストンの向き', () => {
    const c = defaultCycle('rectangle', 'monatomic');
    expect(c.processes.map((p) => processLabel(c.gas, c.n, p))).toEqual([
      'A→B 定積変化（吸熱）',
      'B→C 定圧膨張（吸熱）',
      'C→D 定積変化（放熱）',
      'D→A 定圧圧縮（放熱）',
    ]);
    expect(processDirections(c, 0)).toEqual({ heat: 1, work: 0 });
    expect(processDirections(c, 3)).toEqual({ heat: -1, work: -1 });
    const otto = defaultCycle('otto', 'diatomic');
    expect(processLabel(otto.gas, otto.n, otto.processes[0]!)).toBe('A→B 断熱圧縮');
    expect(processDirections(otto, 0)).toEqual({ heat: 0, work: -1 });
    const carnot = defaultCycle('carnot', 'monatomic');
    expect(processLabel(carnot.gas, carnot.n, carnot.processes[0]!)).toBe('A→B 等温膨張（吸熱）');
  });
});

describe('数値計算の設定', () => {
  it('1 つの過程を 100 ステップ以上で描く', () => {
    expect(PROCESS_DURATION / DT).toBeGreaterThanOrEqual(100);
  });
});
