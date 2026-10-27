/**
 * 回路エディタの物理的な正しさのテスト。
 * 回路の例（プリセット）を使い、RC・RL・LC 回路の過渡現象と交流 RLC 回路の定常状態が解析解と一致すること、
 * キルヒホッフの法則・エネルギー収支、スイッチの切り替え、理想的な計器、部品の値の範囲の全隅を確かめる。
 */
import { describe, expect, it } from 'vitest';
import { paramCorners, type ParamSpec } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { SDIRK_GAMMA } from '@/core/physics/circuit';
import {
  COLS,
  DT,
  PART_INFO,
  ROWS,
  buildSystem,
  capacitorEnergy,
  circuitFrom,
  closedSwitches,
  coilEnergy,
  flipPart,
  indexOfName,
  initialState,
  instantValues,
  lcCapacitorVoltage,
  nodeIndex,
  partAt,
  partNames,
  partValue,
  placePart,
  preset,
  rcChargingVoltage,
  removePart,
  rlGrowthCurrent,
  rlcSteadyAmplitude,
  setPartValue,
  step,
  type Circuit,
  type CircuitSystem,
  type PartKind,
  type PartSpec,
  type SimState,
} from './model';

// ---------------------------------------------------------------------------
// 補助
// ---------------------------------------------------------------------------

function system(circuit: Circuit, ...closed: string[]): CircuitSystem {
  const sys = buildSystem(circuit, closedSwitches(circuit, ...closed));
  if (!sys.ok) throw new Error(sys.message);
  return sys;
}

interface Run {
  sys: CircuitSystem;
  /** states[i] は時刻 t0 + i·dt の状態 */
  states: SimState[];
  t0: number;
  dt: number;
}

/** スイッチ closed の状態で、s0（時刻 t0）から duration だけ進める */
function simulate(
  circuit: Circuit,
  closed: string[],
  duration: number,
  opts: { s0?: SimState; t0?: number; dt?: number } = {},
): Run {
  const sys = system(circuit, ...closed);
  const dt = opts.dt ?? DT;
  const t0 = opts.t0 ?? 0;
  let s = opts.s0 ?? initialState(sys, circuit);
  const states = [s];
  const n = Math.round(duration / dt);
  for (let i = 0; i < n; i++) {
    s = step(sys, s, t0 + i * dt, dt);
    states.push(s);
  }
  return { sys, states, t0, dt };
}

const last = (r: Run) => r.states[r.states.length - 1]!;

/** 名前で部品の値を変えた回路（例: { R_1: { R: 200 } }） */
function withValues(circuit: Circuit, values: Record<string, Record<string, number>>): Circuit {
  let c = circuit;
  for (const [name, kv] of Object.entries(values)) {
    const id = c.parts[indexOfName(c, name)]!.id;
    for (const [k, v] of Object.entries(kv)) c = setPartValue(c, id, k, v);
  }
  return c;
}

/** 部品の種類の値のスライダー定義（key を付け替えてまとめて paramCorners に渡す） */
function spec<K extends string>(kind: PartKind, key: K): ParamSpec<K> {
  const s = PART_INFO[kind].params.find((p) => p.key === key)!;
  return { ...s, key };
}

/**
 * SDIRK 法の 1 ステップの誤差。y' = −y/τ に対する増幅率は R(z) = (1 + (1 − 2γ)z)/(1 − γz)²
 * （z = −Δt/τ）で、e^z との差は |C₃||z|³（C₃ = 1/6 − (3γ² − 2γ³) ≈ −0.040）。
 * n ステップ後の大域誤差は n|C₃||z|³e^{−t/τ} = |C₃|z²(t/τ)e^{−t/τ} ≤ |C₃|z²/e。
 */
const C3 = Math.abs(1 / 6 - (3 * SDIRK_GAMMA ** 2 - 2 * SDIRK_GAMMA ** 3));
function sdirkBound(dtOverTau: number): number {
  return (C3 * dtOverTau ** 2) / Math.E;
}

/**
 * 丸め誤差の目安（相対）。コンデンサーの電流は (C/γΔt)(V − V_基準) と、ほぼ等しい 2 つの電圧の差から
 * 求めるので、電流の相対誤差は (τ/γΔt)·ε 程度になる（τ = 1 s で 10⁻¹⁰）。余裕を 10 倍とる。
 */
function roundoff(tau: number): number {
  return (10 * Number.EPSILON * tau) / (SDIRK_GAMMA * DT);
}

// ---------------------------------------------------------------------------
// RC 回路
// ---------------------------------------------------------------------------

const RC = preset('rc').circuit;
const RC_SPECS: ParamSpec<'E' | 'R' | 'C'>[] = [
  spec('dc', 'E'),
  spec('resistor', 'R'),
  spec('capacitor', 'C'),
];
const rcCircuit = (p: { E: number; R: number; C: number }) =>
  withValues(RC, { E_1: { E: p.E }, R_1: { R: p.R }, C_1: { C: p.C } });

describe('RC 回路（S₁ を閉じて充電、S₁ を開き S₂ を閉じて R₂ を通して放電）', () => {
  it('S₁ を閉じた直後: コンデンサーは導線と同じで、電流は E/R。電圧計は 0、電流計は E/R を示す', () => {
    const sys = system(RC, 'S_1');
    const s = initialState(sys, RC);
    const v = instantValues(sys, s, 0);
    const iR = indexOfName(RC, 'R_1');
    // outputs は Δt = 1 ns の後退オイラー法なので、相対誤差は Δt/τ = 10⁻⁸ 程度
    expect(relativeError(v.I[iR]!, 6 / 500)).toBeLessThan(1e-6);
    expect(relativeError(v.I[indexOfName(RC, 'A_1')]!, 6 / 500)).toBeLessThan(1e-6);
    expect(Math.abs(v.V[indexOfName(RC, 'V_1')]!)).toBeLessThan(1e-6);
    // S₂ は開いているので R₂ には流れない
    expect(Math.abs(v.I[indexOfName(RC, 'R_2')]!)).toBeLessThan(1e-15);
    // スイッチを入れる前は何も流れない
    const open = system(RC);
    const v0 = instantValues(open, initialState(open, RC), 0);
    // 丸め誤差（コンデンサーの電流 (C/1 ns)·ε·V ≈ 10⁻¹⁰ A 程度）を除いて 0
    for (const I of v0.I) expect(Math.abs(I)).toBeLessThan(1e-9);
  });

  it('充電: 全隅で V_C = E(1 − e^{−t/RC})、I = (E/R)e^{−t/RC} と一致する', () => {
    for (const p of paramCorners(RC_SPECS)) {
      const c = rcCircuit(p);
      const R = p.R;
      const C = p.C * 1e-6;
      const tau = R * C;
      // 遅い隅は最初の 2000 ステップ（最も変化の速い部分）を比べる（テスト時間のため）
      const run = simulate(c, ['S_1'], Math.min(3 * tau, 2000 * DT));
      const iC = indexOfName(c, 'C_1');
      const iV = indexOfName(c, 'V_1');
      const iA = indexOfName(c, 'A_1');
      let errV = 0;
      let errI = 0;
      run.states.forEach((s, i) => {
        if (i === 0) return;
        const t = i * DT;
        const VC = rcChargingVoltage(p.E, R, C, t);
        errV = Math.max(errV, Math.abs(s.V[iC]! - VC), Math.abs(s.V[iV]! - VC));
        errI = Math.max(errI, Math.abs(s.I[iA]! - (p.E / R) * Math.exp(-t / tau)));
      });
      // SDIRK 法の大域誤差の上限（sdirkBound）の 2 倍と、丸め誤差
      const tol = 2 * sdirkBound(DT / tau) + roundoff(tau);
      expect(errV / p.E, JSON.stringify(p)).toBeLessThan(tol);
      expect(errI / (p.E / R), JSON.stringify(p)).toBeLessThan(tol);
    }
  });

  it('放電: 途中で切り替えると V_C は連続で、電流は向きが逆の −V_C/R₂ から e^{−t/R₂C} で減る', () => {
    // R₁ = R₂ = 500 Ω なので充電と放電の時定数は同じ
    const tau = 500 * 200e-6;
    const charge = simulate(RC, ['S_1'], tau);
    const s1 = last(charge);
    const iC = indexOfName(RC, 'C_1');
    const V1 = s1.V[iC]!;
    expect(V1 / 6).toBeCloseTo(1 - Math.exp(-1), 6);
    const discharge = simulate(RC, ['S_2'], 3 * tau, { s0: s1, t0: tau });
    const iA = indexOfName(RC, 'A_1');
    // 切り替え直後の電流（状態はそのまま）
    const v = instantValues(discharge.sys, s1, tau);
    expect(v.I[iA]!).toBeCloseTo(-V1 / 500, 9);
    let err = 0;
    discharge.states.forEach((s, i) => {
      if (i === 0) return;
      const t = i * DT;
      err = Math.max(err, Math.abs(s.V[iC]! - V1 * Math.exp(-t / tau)));
      err = Math.max(err, Math.abs(s.I[iA]! * 500 + V1 * Math.exp(-t / tau)));
    });
    expect(err / 6).toBeLessThan(2 * sdirkBound(DT / tau) + roundoff(tau));
  });

  it('S₁ と S₂ を両方閉じると、十分時間がたって V_C は R₁ と R₂ の分圧 E·R₂/(R₁ + R₂) になる', () => {
    // 時定数は (R₁ ∥ R₂)C = 50 ms。0.5 s 後の残りは e⁻¹⁰
    const s = last(simulate(RC, ['S_1', 'S_2'], 0.5));
    expect(s.V[indexOfName(RC, 'C_1')]!).toBeCloseTo(3, 3);
    expect(s.I[indexOfName(RC, 'R_2')]!).toBeCloseTo(3 / 500, 6);
  });

  it('エネルギー収支: 電源の仕事 = 静電エネルギー + ジュール熱。充電しきると半分が熱になる', () => {
    const p = { E: 6, R: 100, C: 100 };
    const c = rcCircuit(p);
    const tau = p.R * p.C * 1e-6;
    // 25τ 後の残りは e⁻²⁵ ≈ 10⁻¹¹ なので充電しきったとみなせる
    const run = simulate(c, ['S_1'], 25 * tau);
    const iE = indexOfName(c, 'E_1');
    const iR = indexOfName(c, 'R_1');
    const iC = indexOfName(c, 'C_1');
    // 台形公式で積分（誤差は (Δt/τ)²/12 程度）
    let W = 0;
    let Q = 0;
    for (let i = 1; i < run.states.length; i++) {
      const a = run.states[i - 1]!;
      const b = run.states[i]!;
      W += ((a.V[iE]! * a.I[iE]! + b.V[iE]! * b.I[iE]!) / 2) * DT;
      Q += ((a.I[iR]! ** 2 + b.I[iR]! ** 2) / 2) * p.R * DT;
    }
    const U = capacitorEnergy(p.C * 1e-6, last(run).V[iC]!);
    const CE2 = p.C * 1e-6 * p.E ** 2;
    // 最初の区間は t = 0 の値が「スイッチを入れる前」（電流 0）のため、台形公式の誤差が (Δt/τ)/2 程度残る
    expect(Math.abs(W - U - Q) / CE2).toBeLessThan(DT / tau);
    expect(relativeError(W, CE2)).toBeLessThan(DT / tau);
    expect(relativeError(U, CE2 / 2)).toBeLessThan(1e-9);
    expect(relativeError(Q, CE2 / 2)).toBeLessThan(DT / tau);
  });
});

// ---------------------------------------------------------------------------
// RL 回路
// ---------------------------------------------------------------------------

const RL = preset('rl').circuit;
const RL_SPECS: ParamSpec<'E' | 'R' | 'L'>[] = [
  spec('dc', 'E'),
  spec('resistor', 'R'),
  spec('coil', 'L'),
];
const rlCircuit = (p: { E: number; R: number; L: number }) =>
  withValues(RL, { E_1: { E: p.E }, R_1: { R: p.R }, L_1: { L: p.L } });

describe('RL 回路', () => {
  it('S₁ を閉じた直後: コイルは断線と同じで、電流は 0、コイルの電圧は E', () => {
    const sys = system(RL, 'S_1');
    const v = instantValues(sys, initialState(sys, RL), 0);
    // outputs は Δt = 1 ns の後退オイラー法なので、電流は (1 ns/τ)(E/R) = 5×10⁻⁸ (E/R) だけ増える
    expect(Math.abs(v.I[indexOfName(RL, 'L_1')]!)).toBeLessThan(1e-6 * (6 / 20));
    expect(v.V[indexOfName(RL, 'L_1')]!).toBeCloseTo(6, 6);
  });

  it('電流の増加: 全隅で I = (E/R)(1 − e^{−Rt/L})、V_L = E e^{−Rt/L} と一致する', () => {
    for (const p of paramCorners(RL_SPECS)) {
      const c = rlCircuit(p);
      const L = p.L * 1e-3;
      const tau = L / p.R;
      const run = simulate(c, ['S_1'], Math.min(3 * tau, 2000 * DT));
      const iL = indexOfName(c, 'L_1');
      let errI = 0;
      let errV = 0;
      run.states.forEach((s, i) => {
        if (i === 0) return;
        const t = i * DT;
        errI = Math.max(errI, Math.abs(s.I[iL]! - rlGrowthCurrent(p.E, p.R, L, t)));
        errV = Math.max(errV, Math.abs(s.V[iL]! - p.E * Math.exp(-t / tau)));
      });
      const tol = 2 * sdirkBound(DT / tau) + roundoff(tau);
      expect(errI / (p.E / p.R), JSON.stringify(p)).toBeLessThan(tol);
      expect(errV / p.E, JSON.stringify(p)).toBeLessThan(tol);
    }
  });

  it('S₂ を閉じてから S₁ を開くと、電流は向きを変えずに e^{−R₂t/L} で減り、コイルのエネルギーはすべて R₂ の熱になる', () => {
    // S₂ も閉じているので、コイルから見た抵抗は R₁ と R₂ の並列 15 Ω（時定数 L/15 Ω ≈ 27 ms）。
    // 十分時間がたてばコイルは導線と同じなので R₂ には電流が流れない
    const tau1 = 0.4 / 15;
    const grow = simulate(RL, ['S_1', 'S_2'], 12 * tau1);
    const s1 = last(grow);
    const iL = indexOfName(RL, 'L_1');
    const iR = indexOfName(RL, 'R_2');
    const I1 = s1.I[iL]!;
    expect(relativeError(I1, 6 / 20)).toBeLessThan(1e-4); // e⁻¹² ≈ 6×10⁻⁶
    expect(Math.abs(s1.I[iR]!)).toBeLessThan(1e-4 * I1);
    const tau = 0.4 / 60;
    const decay = simulate(RL, ['S_2'], 20 * tau, { s0: s1, t0: 12 * tau1 });
    // 切り替えた直後、コイルには電流を保とうとする誘導起電力 V_L = −R₂I（電源の E より大きい）
    const v = instantValues(decay.sys, s1, 12 * tau1);
    // outputs（Δt = 1 ns の後退オイラー法）の誤差は 1 ns/τ ≈ 1.5×10⁻⁷
    expect(relativeError(v.V[iL]!, -60 * I1)).toBeLessThan(1e-6);
    let err = 0;
    let heat = 0;
    decay.states.forEach((s, i) => {
      if (i > 0) {
        // 最初の区間の左端は、切り替え前の値ではなく切り替え直後の値 v を使う
        const prev = i === 1 ? v.I[iR]! : decay.states[i - 1]!.I[iR]!;
        heat += ((prev ** 2 + s.I[iR]! ** 2) / 2) * 60 * DT;
      }
      err = Math.max(err, Math.abs(s.I[iL]! - I1 * Math.exp(-(i * DT) / tau)));
    });
    expect(err / I1).toBeLessThan(2 * sdirkBound(DT / tau) + roundoff(tau));
    // 台形公式の誤差 (Δt/τ)²/12 程度（ここでは 2×10⁻⁸）
    expect(relativeError(heat, coilEnergy(0.4, I1))).toBeLessThan(1e-6);
  });

  it('逃げ道のないままコイルの電流を切ると、電流は 1 ステップで 0 になり、大きな誘導起電力 ≈ LI/Δt が生じる', () => {
    const grow = simulate(RL, ['S_1'], 0.1);
    const s1 = last(grow);
    const iL = indexOfName(RL, 'L_1');
    const I1 = s1.I[iL]!;
    const cut = simulate(RL, [], 10 * DT, { s0: s1, t0: 0.1 });
    expect(cut.sys.solver.impulsive).toBe(true);
    const spark = cut.states[1]!;
    // 後退オイラー法の 1 ステップ: I' = I + (Δt/L)V かつ I' ≈ 0（開いたスイッチ）
    expect(Math.abs(spark.I[iL]!)).toBeLessThan(1e-9 * I1);
    expect(relativeError(spark.V[iL]!, (-0.4 * I1) / DT)).toBeLessThan(1e-9);
    for (const s of cut.states.slice(2)) {
      expect(Math.abs(s.I[iL]!)).toBeLessThan(1e-9 * I1);
      expect(Number.isFinite(s.V[iL]!)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// LC 回路
// ---------------------------------------------------------------------------

const LC = preset('lc').circuit;
const LC_SPECS: ParamSpec<'L' | 'C' | 'V0'>[] = [
  spec('coil', 'L'),
  spec('capacitor', 'C'),
  spec('capacitor', 'V0'),
];
const lcCircuit = (p: { L: number; C: number; V0: number }) =>
  withValues(LC, { L_1: { L: p.L }, C_1: { C: p.C, V0: p.V0 } });

describe('LC 回路（電気振動）', () => {
  it('全隅で V_C = V₀ cos ωt と一致し、エネルギー ½CV_C² + ½LI² が保存される', () => {
    for (const p of paramCorners(LC_SPECS)) {
      const c = lcCircuit(p);
      const L = p.L * 1e-3;
      const C = p.C * 1e-6;
      const omega = 1 / Math.sqrt(L * C);
      const T = (2 * Math.PI) / omega;
      const run = simulate(c, ['S_1'], Math.min(2 * T, 4000 * DT));
      const iC = indexOfName(c, 'C_1');
      const iL = indexOfName(c, 'L_1');
      const U0 = capacitorEnergy(C, p.V0);
      let errV = 0;
      let errU = 0;
      run.states.forEach((s, i) => {
        errV = Math.max(errV, Math.abs(s.V[iC]! - lcCapacitorVoltage(p.V0, L, C, i * DT)));
        errU = Math.max(
          errU,
          Math.abs(capacitorEnergy(C, s.V[iC]!) + coilEnergy(L, s.I[iL]!) - U0),
        );
      });
      const y = omega * DT;
      const n = run.states.length;
      // 位相の誤差: 1 ステップあたり |C₃|(ωΔt)³ 程度で、n ステップで振幅 V₀ に対して n|C₃|y³
      expect(errV, JSON.stringify(p)).toBeLessThanOrEqual(2 * n * C3 * y ** 3 * p.V0 + 1e-12);
      // エネルギーの減衰: |R(iy)|² ≈ 1 − γ⁴y⁴ なので n ステップで nγ⁴y⁴（2 次の項は打ち消し合う）
      expect(errU, JSON.stringify(p)).toBeLessThanOrEqual(
        2 * n * SDIRK_GAMMA ** 4 * y ** 4 * U0 + 1e-15,
      );
    }
  });

  it('周期が T = 2π√(LC) になる（estimatePeriod で測る）', () => {
    const L = 0.1;
    const C = 100e-6;
    const T = 2 * Math.PI * Math.sqrt(L * C);
    const run = simulate(LC, ['S_1'], 5 * T);
    const iC = indexOfName(LC, 'C_1');
    const measured = estimatePeriod(
      run.states.map((_, i) => i * DT),
      run.states.map((s) => s.V[iC]!),
    );
    expect(relativeError(measured!, T)).toBeLessThan(1e-4);
  });

  it('電圧計は V_C を、電流計はコイルを流れる電流を示す。スイッチを閉じるまで何も変化しない', () => {
    const run = simulate(LC, ['S_1'], 0.01);
    const iC = indexOfName(LC, 'C_1');
    for (const s of run.states.slice(1)) {
      expect(s.V[indexOfName(LC, 'V_1')]!).toBeCloseTo(s.V[iC]!, 12);
      expect(s.I[indexOfName(LC, 'A_1')]!).toBeCloseTo(s.I[indexOfName(LC, 'L_1')]!, 12);
      expect(s.I[indexOfName(LC, 'V_1')]!).toBe(0);
    }
    const idle = simulate(LC, [], 0.01);
    for (const s of idle.states) expect(s.V[iC]!).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 交流 RLC 直列回路
// ---------------------------------------------------------------------------

describe('交流 RLC 直列回路', () => {
  it('過渡現象が収まると、電流の最大値は V₀/Z、位相のずれは tan φ = (ωL − 1/ωC)/R になる', () => {
    const c = preset('ac').circuit;
    const R = 20;
    const L = 0.1;
    const C = 100e-6;
    const f = 50;
    const omega = 2 * Math.PI * f;
    const V0 = Math.SQRT2 * 10;
    // 過渡項は e^{−Rt/2L} で減る（時定数 2L/R = 10 ms）。0.3 s 後の残りは e⁻³⁰
    const run = simulate(c, ['S_1'], 0.34);
    const iA = indexOfName(c, 'A_1');
    const amp = rlcSteadyAmplitude(V0, omega, R, L, C);
    const phi = Math.atan2(omega * L - 1 / (omega * C), R);
    let err = 0;
    run.states.forEach((s, i) => {
      const t = i * DT;
      if (t < 0.3) return;
      err = Math.max(err, Math.abs(s.I[iA]! - amp * Math.sin(omega * t - phi)));
    });
    // ωΔt ≈ 3.1×10⁻³ なので、位相の誤差は 10⁻⁶ 程度
    expect(err / amp).toBeLessThan(1e-5);
  });

  it('全隅（周波数・実効値）で発散せず、定常状態の電流の最大値が V₀/Z になる', () => {
    const specs: ParamSpec<'Ve' | 'f'>[] = [spec('ac', 'Ve'), spec('ac', 'f')];
    for (const p of paramCorners(specs)) {
      const c = withValues(preset('ac').circuit, { E_1: p });
      const omega = 2 * Math.PI * p.f;
      // 過渡項の残りは e^{−Rt/2L}: 0.15 s 後で e⁻¹⁵ ≈ 3×10⁻⁷
      const run = simulate(c, ['S_1'], 0.15 + 1 / p.f);
      const iA = indexOfName(c, 'A_1');
      const tail = run.states.filter((_, i) => i * DT >= 0.15).map((s) => Math.abs(s.I[iA]!));
      const amp = rlcSteadyAmplitude(Math.SQRT2 * p.Ve, omega, 20, 0.1, 100e-6);
      // 1 周期を Δt で区切って測る最大値の誤差は (ωΔt)²/8 程度（f = 1000 Hz で 5×10⁻⁴）
      expect(relativeError(Math.max(...tail), amp), JSON.stringify(p)).toBeLessThan(
        (omega * DT) ** 2 / 4 + 1e-5,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 直流回路とキルヒホッフの法則
// ---------------------------------------------------------------------------

describe('キルヒホッフの法則', () => {
  it('直流回路の例: 各抵抗の電流が節点の方程式の解と一致する', () => {
    const c = preset('dc').circuit;
    const run = simulate(c, [], 10 * DT);
    const s = last(run);
    // 上の中央の節点の電位 φ は (E₁/R₁ + E₂/R₂)/(1/R₁ + 1/R₂ + 1/R₃)
    const phi = (6 / 100 + 3 / 200) / (1 / 100 + 1 / 200 + 1 / 300);
    expect(s.I[indexOfName(c, 'R_1')]!).toBeCloseTo((6 - phi) / 100, 12);
    expect(s.I[indexOfName(c, 'R_2')]!).toBeCloseTo((3 - phi) / 200, 12);
    expect(s.I[indexOfName(c, 'R_3')]!).toBeCloseTo(phi / 300, 12);
    expect(s.I[indexOfName(c, 'A_1')]!).toBeCloseTo(phi / 300, 12);
    // 電流が負の電池は充電されている（電流が正極から流れ込む）
    expect(s.I[indexOfName(c, 'E_2')]!).toBeLessThan(0);
  });

  it('すべての回路の例・時刻で、各格子点に出入りする電流の和は 0（第 1 法則）', () => {
    const cases: [Circuit, string[]][] = [
      [preset('rc').circuit, ['S_1']],
      [preset('rl').circuit, ['S_1', 'S_2']],
      [preset('lc').circuit, ['S_1']],
      [preset('ac').circuit, ['S_1']],
      [preset('dc').circuit, []],
    ];
    for (const [c, closed] of cases) {
      const run = simulate(c, closed, 200 * DT);
      for (const s of run.states.filter((_, i) => i % 20 === 1)) {
        const net = new Array<number>(COLS * ROWS).fill(0);
        let scale = 0;
        c.parts.forEach((p, i) => {
          net[nodeIndex(p.p1)] = net[nodeIndex(p.p1)]! - s.I[i]!;
          net[nodeIndex(p.p2)] = net[nodeIndex(p.p2)]! + s.I[i]!;
          scale = Math.max(scale, Math.abs(s.I[i]!));
        });
        // 丸め誤差（roundoff の説明と同じく (τ/γΔt)·ε 程度。τ ≤ 0.1 s で 10⁻¹¹）
        for (const v of net) expect(Math.abs(v)).toBeLessThanOrEqual(1e-10 * scale + 1e-15);
      }
    }
  });

  it('閉回路を一周すると電圧の和は 0（第 2 法則）: RC 回路の充電ループで E = V_R + V_C', () => {
    const run = simulate(RC, ['S_1'], 0.2);
    for (const s of run.states.slice(1)) {
      const E = s.V[indexOfName(RC, 'E_1')]!;
      expect(s.V[indexOfName(RC, 'R_1')]! + s.V[indexOfName(RC, 'C_1')]!).toBeCloseTo(E, 10);
    }
  });

  it('並列につないだ同じ抵抗には同じ電流が流れ、並列の導線には電流が等分される', () => {
    const c = circuitFrom([
      ['dc', [0, 1], [0, 0], { E: 10 }],
      ['wire', [0, 0], [1, 0]],
      ['resistor', [1, 0], [1, 1], { R: 100 }],
      ['wire', [1, 0], [2, 0]],
      ['resistor', [2, 0], [2, 1], { R: 100 }],
      ['wire', [0, 1], [1, 1]],
      ['wire', [1, 1], [2, 1]],
      // 下の導線に並列な 2 本目の導線（迂回路）
      ['wire', [0, 1], [0, 2]],
      ['wire', [0, 2], [1, 2]],
      ['wire', [1, 2], [1, 1]],
    ]);
    const s = last(simulate(c, [], DT));
    expect(s.I[2]!).toBeCloseTo(0.1, 12);
    expect(s.I[4]!).toBeCloseTo(0.1, 12);
    expect(s.I[0]!).toBeCloseTo(0.2, 12);
    // 電源の負極側の 0.2 A は、長さ 1 の導線と長さ 3 の迂回路に 3 : 1 で分かれる
    expect(-s.I[5]!).toBeCloseTo(0.15, 12);
    expect(-s.I[7]!).toBeCloseTo(0.05, 12);
  });
});

// ---------------------------------------------------------------------------
// 合成容量・合成抵抗（任意の回路）
// ---------------------------------------------------------------------------

describe('いろいろな回路', () => {
  it('直列のコンデンサーは合成容量 C₁C₂/(C₁ + C₂) で充電され、電気量が等しい', () => {
    const c = circuitFrom([
      ['dc', [0, 1], [0, 0], { E: 12 }],
      ['resistor', [0, 0], [1, 0], { R: 100 }],
      ['capacitor', [1, 0], [2, 0], { C: 100 }],
      ['capacitor', [2, 0], [2, 1], { C: 300 }],
      ['wire', [2, 1], [1, 1]],
      ['wire', [1, 1], [0, 1]],
    ]);
    const Cs = (100e-6 * 300e-6) / 400e-6;
    const tau = 100 * Cs;
    const run = simulate(c, [], 2 * tau);
    run.states.slice(1).forEach((s, k) => {
      const t = (k + 1) * DT;
      const total = s.V[2]! + s.V[3]!;
      expect(Math.abs(total - rcChargingVoltage(12, 100, Cs, t)) / 12).toBeLessThan(
        2 * sdirkBound(DT / tau) + 1e-12,
      );
      expect(100e-6 * s.V[2]!).toBeCloseTo(300e-6 * s.V[3]!, 12);
    });
  });

  it('充電したコンデンサーを別のコンデンサーに抵抗なしでつなぐと、1 ステップで電圧がそろい、電気量は保存される', () => {
    const c = circuitFrom([
      ['capacitor', [0, 0], [0, 1], { C: 100, V0: 12 }],
      ['switch', [0, 0], [1, 0]],
      ['capacitor', [1, 0], [1, 1], { C: 200, V0: 0 }],
      ['wire', [0, 1], [1, 1]],
    ]);
    const run = simulate(c, ['S_1'], 5 * DT);
    expect(run.sys.solver.impulsive).toBe(true);
    const Q = 100e-6 * 12;
    for (const s of run.states.slice(1)) {
      expect(s.V[0]!).toBeCloseTo(Q / 300e-6, 9);
      expect(s.V[2]!).toBeCloseTo(Q / 300e-6, 9);
    }
    // 2 ステップ目以降は電流が流れない（振動しない）
    for (const s of run.states.slice(2)) expect(Math.abs(s.I[1]!)).toBeLessThan(1e-9);
  });

  it('つながっていない 2 点を測る電圧計は値を示さない（NaN）', () => {
    const d = circuitFrom([
      ['dc', [0, 1], [0, 0], { E: 3 }],
      ['resistor', [1, 0], [1, 1], { R: 100 }],
      ['wire', [0, 0], [1, 0]],
      ['wire', [0, 1], [1, 1]],
      ['voltmeter', [3, 0], [3, 1]],
    ]);
    const s = last(simulate(d, [], DT));
    expect(Number.isNaN(s.V[4]!)).toBe(true);
    expect(s.V[1]!).toBeCloseTo(3, 12);
  });
});

// ---------------------------------------------------------------------------
// 解けない回路と、編集操作
// ---------------------------------------------------------------------------

describe('解けない回路の検出', () => {
  it('電源の短絡と、電源どうしを抵抗なしで並列にした回路は解かずに知らせる', () => {
    const shorted = circuitFrom([
      ['dc', [0, 1], [0, 0]],
      ['wire', [0, 0], [1, 0]],
      ['wire', [1, 0], [1, 1]],
      ['wire', [1, 1], [0, 1]],
    ]);
    const a = buildSystem(shorted, []);
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.issue.kind).toBe('shorted-source');
      expect(a.part).toBe(0);
    }
    const parallel = circuitFrom([
      ['dc', [0, 1], [0, 0]],
      ['wire', [0, 0], [1, 0]],
      ['dc', [1, 1], [1, 0]],
      ['wire', [1, 1], [0, 1]],
    ]);
    const b = buildSystem(parallel, []);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.issue.kind).toBe('source-loop');
  });

  it('スイッチで短絡させたときだけ解けなくなる', () => {
    const c = circuitFrom([
      ['dc', [0, 1], [0, 0]],
      ['wire', [0, 0], [1, 0]],
      ['resistor', [1, 0], [2, 0]],
      ['wire', [2, 0], [2, 1]],
      ['wire', [2, 1], [1, 1]],
      ['wire', [1, 1], [0, 1]],
      ['switch', [1, 0], [1, 1]],
    ]);
    expect(buildSystem(c, closedSwitches(c)).ok).toBe(true);
    const shorted = buildSystem(c, closedSwitches(c, 'S_1'));
    expect(shorted.ok).toBe(false);
    if (!shorted.ok) expect(shorted.issue.kind).toBe('shorted-source');
  });
});

describe('回路の編集', () => {
  it('置く・置き換える・反転・削除', () => {
    let c: Circuit = { parts: [] };
    const a = { x: 1, y: 1 };
    const b = { x: 1, y: 2 };
    let r = placePart(c, 'dc', a, b);
    c = r.circuit;
    // 縦の電源は正極（端子 2）が上
    expect(c.parts[0]!.p2).toEqual(a);
    expect(partAt(c, b, a)?.kind).toBe('dc');
    r = placePart(c, 'dc', b, a);
    expect(r.circuit).toBe(c);
    r = placePart(c, 'resistor', a, b);
    c = r.circuit;
    expect(c.parts).toHaveLength(1);
    expect(c.parts[0]!.kind).toBe('resistor');
    expect(c.parts[0]!.p1).toEqual(a);
    expect(partValue(c.parts[0]!, 'R')).toBe(PART_INFO.resistor.params[0]!.default);
    c = flipPart(c, r.id);
    expect(c.parts[0]!.p1).toEqual(b);
    c = setPartValue(c, r.id, 'R', 300);
    expect(partValue(c.parts[0]!, 'R')).toBe(300);
    c = removePart(c, r.id);
    expect(c.parts).toHaveLength(0);
    expect(() => placePart(c, 'wire', a, { x: 2, y: 2 })).toThrow();
    expect(() => placePart(c, 'wire', { x: COLS - 1, y: 0 }, { x: COLS, y: 0 })).toThrow();
  });

  it('名前は種類ごとの通し番号（直流・交流電源は共通の E）', () => {
    const c = circuitFrom([
      ['resistor', [0, 0], [1, 0]],
      ['dc', [1, 0], [2, 0]],
      ['wire', [2, 0], [3, 0]],
      ['resistor', [3, 0], [4, 0]],
      ['ac', [4, 0], [5, 0]],
    ]);
    expect(partNames(c)).toEqual(['R_1', 'E_1', '', 'R_2', 'E_2']);
  });

  it('回路の例はすべて格子の中にあり、同じ辺に部品が重ならない', () => {
    for (const id of ['rc', 'rl', 'lc', 'ac', 'dc', 'empty'] as const) {
      const c = preset(id).circuit;
      const keys = c.parts.map((p) => {
        const [u, v] = [nodeIndex(p.p1), nodeIndex(p.p2)].sort((x, y) => x - y);
        return `${u}-${v}`;
      });
      expect(new Set(keys).size).toBe(keys.length);
      for (const p of c.parts) {
        for (const q of [p.p1, p.p2]) {
          expect(q.x).toBeLessThan(COLS);
          expect(q.y).toBeLessThan(ROWS);
        }
      }
      // どのスイッチを閉じても電源は短絡しない
      expect(
        buildSystem(
          c,
          c.parts.map(() => false),
        ).ok,
      ).toBe(true);
      expect(
        buildSystem(
          c,
          c.parts.map(() => true),
        ).ok,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 数値計算の設定
// ---------------------------------------------------------------------------

describe('数値計算の設定', () => {
  it('部品の値の範囲で、1 つのループの時定数 RC・L/R は 10Δt 以上、ω₀Δt ≤ 0.01、交流の ωΔt ≤ 0.07', () => {
    const range = (kind: PartKind, key: string) => {
      const s = PART_INFO[kind].params.find((p) => p.key === key)!;
      return { min: s.min, max: s.max };
    };
    const R = range('resistor', 'R');
    const C = range('capacitor', 'C');
    const L = range('coil', 'L');
    const f = range('ac', 'f');
    // 単位換算（μF → F など）の丸めを許す
    expect(R.min * C.min * 1e-6).toBeGreaterThanOrEqual(10 * DT * (1 - 1e-12));
    expect((L.min * 1e-3) / R.max).toBeGreaterThanOrEqual(10 * DT * (1 - 1e-12));
    expect(DT / Math.sqrt(L.min * 1e-3 * C.min * 1e-6)).toBeLessThanOrEqual(0.01);
    expect(2 * Math.PI * f.max * DT).toBeLessThanOrEqual(0.07);
  });

  it('SDIRK 法は 2 次精度: Δt を半分にすると誤差が約 1/4 になる（後退オイラー法は 1/2）', () => {
    const c = rcCircuit({ E: 6, R: 100, C: 100 });
    const tau = 0.01;
    const err = (dt: number, method: 'sdirk2' | 'backward-euler') => {
      const sys = system(c, 'S_1');
      let x = initialState(sys, c).x;
      const n = Math.round(tau / dt);
      for (let i = 0; i < n; i++) x = sys.solver.step(x, i * dt, dt, method).x;
      return Math.abs(x[indexOfName(c, 'C_1')]! - rcChargingVoltage(6, 100, 100e-6, tau));
    };
    const h = 1e-3;
    expect(Math.log2(err(h, 'sdirk2') / err(h / 2, 'sdirk2'))).toBeCloseTo(2, 1);
    expect(Math.log2(err(h, 'backward-euler') / err(h / 2, 'backward-euler'))).toBeCloseTo(1, 1);
  });

  it('時定数が Δt より短い回路でも振動・発散しない（L 安定）', () => {
    // 10 Ω を 10 本並列（1 Ω）にして C = 10 μF: τ = 10 μs = Δt
    const specs: PartSpec[] = [['dc', [0, 1], [0, 0], { E: 6 }]];
    specs.push(['capacitor', [0, 0], [1, 0], { C: 10 }]);
    for (let x = 1; x < COLS; x++) {
      specs.push(['resistor', [x, 0], [x, 1], { R: 10 }]);
      if (x < COLS - 1) specs.push(['wire', [x, 0], [x + 1, 0]]);
      specs.push(['wire', [x - 1, 1], [x, 1]]);
    }
    const c = circuitFrom(specs);
    const run = simulate(c, [], 100 * DT);
    const iC = indexOfName(c, 'C_1');
    for (let i = 1; i < run.states.length; i++) {
      const v = run.states[i]!.V[iC]!;
      expect(v).toBeGreaterThanOrEqual(run.states[i - 1]!.V[iC]! - 1e-12);
      expect(v).toBeLessThanOrEqual(6 + 1e-12);
    }
    expect(last(run).V[iC]!).toBeCloseTo(6, 6);
  });
});
