/**
 * 交流回路（RLC 直列回路）の物理的な正しさのテスト。
 * 定常状態の解析解、インピーダンスと位相差の公式、実効値、平均消費電力、共振、
 * 各素子の電圧と電流の位相関係、エネルギー収支を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  angularFrequency,
  averagePower,
  capacitiveReactance,
  decayTime,
  elementVoltages,
  farads,
  henries,
  impedance,
  inductiveReactance,
  initialState,
  peakCurrent,
  peakVoltage,
  phaseLag,
  resonanceFrequency,
  rmsCurrent,
  sourceVoltage,
  steadyState,
  step,
  storedEnergy,
  type AcParams,
  type AcState,
  type StartMode,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

function simulate(p: AcParams, duration: number, mode: StartMode = 'steady') {
  const n = Math.round(duration / DT);
  const ts = [0];
  const states: AcState[] = [initialState(p, mode)];
  let s = states[0]!;
  for (let k = 1; k <= n; k++) {
    s = step(p, s, (k - 1) * DT, DT);
    ts.push(k * DT);
    states.push(s);
  }
  return { ts, states };
}

/** 1 周期ちょうど（刻み幅の整数倍に丸めた長さ）の区間の平均 */
function periodMean(values: readonly number[], n: number): number {
  let sum = 0;
  for (let k = values.length - n; k < values.length; k++) sum += values[k]!;
  return sum / n;
}

describe('公式', () => {
  it('既定値（100 V, 50 Hz, 20 Ω, 100 mH, 200 μF）: X_L ≈ 31.4 Ω, X_C ≈ 15.9 Ω, Z ≈ 25.3 Ω', () => {
    expect(inductiveReactance(DEFAULT)).toBeCloseTo(10 * Math.PI, 9);
    expect(capacitiveReactance(DEFAULT)).toBeCloseTo(1 / (100 * Math.PI * 2e-4), 9);
    expect(impedance(DEFAULT)).toBeCloseTo(25.3, 2);
    expect(peakVoltage(DEFAULT)).toBeCloseTo(141.42, 2);
  });

  it('X_L は周波数に比例し、X_C は周波数に反比例する', () => {
    const p2 = { ...DEFAULT, f: 2 * DEFAULT.f };
    expect(inductiveReactance(p2) / inductiveReactance(DEFAULT)).toBeCloseTo(2, 12);
    expect(capacitiveReactance(p2) / capacitiveReactance(DEFAULT)).toBeCloseTo(0.5, 12);
  });

  it('共振周波数 f₀ = 1/(2π√(LC)) で X_L = X_C、Z = R が最小、位相差 0、電流が最大', () => {
    for (const p of CORNERS) {
      const res = { ...p, f: resonanceFrequency(p) };
      expect(relativeError(inductiveReactance(res), capacitiveReactance(res))).toBeLessThan(1e-12);
      expect(relativeError(impedance(res), p.R)).toBeLessThan(1e-12);
      expect(Math.abs(phaseLag(res))).toBeLessThan(1e-9);
      for (const k of [0.5, 0.9, 1.1, 2]) {
        expect(impedance({ ...p, f: k * res.f })).toBeGreaterThan(impedance(res));
      }
    }
  });

  it('平均消費電力 P = V_e I_e cos φ = I_e² R', () => {
    for (const p of CORNERS) {
      expect(
        relativeError(averagePower(p), p.Ve * rmsCurrent(p) * Math.cos(phaseLag(p))),
      ).toBeLessThan(1e-12);
    }
  });
});

describe('数値計算と定常状態の解析解の一致', () => {
  it('定常状態から始めると、パラメータ範囲の全隅で 3 周期の間 i = I₀ sin(ωt − φ) と一致する', () => {
    for (const p of CORNERS) {
      const { ts, states } = simulate(p, 3 / p.f);
      let maxErr = 0;
      ts.forEach((t, k) => {
        maxErr = Math.max(maxErr, Math.abs(states[k]!.i - steadyState(p, t).i));
      });
      // RK4 の大域誤差は (ωΔt)⁴ 程度（ωΔt, ω₀Δt ≤ 0.04 で 3×10⁻⁶ 以下）
      expect(maxErr / peakCurrent(p), JSON.stringify(p)).toBeLessThan(3e-6);
    }
  });

  it('電源を入れた瞬間から始めても、過渡現象が減衰すると定常状態に近づく', () => {
    for (const p of [DEFAULT, { ...DEFAULT, R: 5, f: 20 }, { ...DEFAULT, R: 100, L: 500, C: 20 }]) {
      expect(p.R).toBeLessThan(2 * Math.sqrt(henries(p) / farads(p)));
      // 減衰振動になる組（R < 2√(L/C)）を選んでいるので、過渡項は e^{−t/(2L/R)} で減衰する。
      // 12 × 2L/R 後には e⁻¹² ≈ 6×10⁻⁶ 倍（初期の過渡項は I₀ の (ω₀/ω) 倍程度まで）
      const T = 12 * decayTime(p);
      const { ts, states } = simulate(p, T, 'rest');
      const k = ts.length - 1;
      expect(
        Math.abs(states[k]!.i - steadyState(p, ts[k]!).i) / peakCurrent(p),
        JSON.stringify(p),
      ).toBeLessThan(1e-4);
    }
  });

  it('実効値: 1 周期の電流の 2 乗平均の平方根は I₀/√2 = V_e/Z', () => {
    for (const p of CORNERS) {
      const n = Math.round(1 / p.f / DT);
      const { states } = simulate(p, n * DT);
      const rms = Math.sqrt(
        periodMean(
          states.map((s) => s.i * s.i),
          n,
        ),
      );
      // 1 周期を刻み幅の整数倍に丸めたことによる誤差（≤ Δt·f）を含めて 10⁻³
      expect(relativeError(rms, rmsCurrent(p)), JSON.stringify(p)).toBeLessThan(1e-3);
      expect(relativeError(rmsCurrent(p), peakCurrent(p) / Math.SQRT2)).toBeLessThan(1e-12);
    }
  });
});

describe('各素子の電圧と電流の位相', () => {
  it('抵抗の電圧は電流と同位相、コイルの電圧は π/2 進み、コンデンサーの電圧は π/2 遅れる', () => {
    const p = DEFAULT;
    const w = angularFrequency(p);
    const I0 = peakCurrent(p);
    const { ts, states } = simulate(p, 2 / p.f);
    states.forEach((s, k) => {
      const th = w * ts[k]! - phaseLag(p);
      const v = elementVoltages(p, s, ts[k]!);
      const tol = 1e-4 * peakVoltage(p);
      expect(Math.abs(v.R - p.R * I0 * Math.sin(th))).toBeLessThan(tol);
      expect(Math.abs(v.L - inductiveReactance(p) * I0 * Math.sin(th + Math.PI / 2))).toBeLessThan(
        tol,
      );
      expect(Math.abs(v.C - capacitiveReactance(p) * I0 * Math.sin(th - Math.PI / 2))).toBeLessThan(
        tol,
      );
    });
  });

  it('コイルの電圧 v_L は L di/dt に等しい（電流の数値微分と比較）', () => {
    const p = DEFAULT;
    const { ts, states } = simulate(p, 1 / p.f);
    for (let k = 1; k < states.length - 1; k += 50) {
      const didt = (states[k + 1]!.i - states[k - 1]!.i) / (2 * DT);
      const vL = elementVoltages(p, states[k]!, ts[k]!).L;
      // 中心差分の誤差は (ωΔt)²/6 × X_L I₀ 程度
      expect(Math.abs(henries(p) * didt - vL)).toBeLessThan(1e-3 * peakVoltage(p));
    }
  });

  it('抵抗だけで電力を消費する: 1 周期平均で v_L·i と v_C·i は 0、v_R·i は I_e²R', () => {
    for (const p of CORNERS) {
      const n = Math.round(1 / p.f / DT);
      const { ts, states } = simulate(p, n * DT);
      const v = states.map((s, k) => elementVoltages(p, s, ts[k]!));
      const P = averagePower(p);
      const scale = peakVoltage(p) * peakCurrent(p);
      expect(
        Math.abs(
          periodMean(
            v.map((x, k) => x.L * states[k]!.i),
            n,
          ),
        ) / scale,
      ).toBeLessThan(2e-3);
      expect(
        Math.abs(
          periodMean(
            v.map((x, k) => x.C * states[k]!.i),
            n,
          ),
        ) / scale,
      ).toBeLessThan(2e-3);
      expect(
        relativeError(
          periodMean(
            v.map((x, k) => x.R * states[k]!.i),
            n,
          ),
          P,
        ),
        JSON.stringify(p),
      ).toBeLessThan(5e-3);
    }
  });
});

describe('エネルギー収支', () => {
  it('電源の仕事 = ジュール熱 + コイルとコンデンサーのエネルギーの増加（全隅・全時刻）', () => {
    for (const p of CORNERS) {
      const { states } = simulate(p, 2 / p.f);
      const U0 = storedEnergy(p, states[0]!);
      const scale = averagePower(p) * (2 / p.f) + U0;
      let maxErr = 0;
      for (const s of states) {
        maxErr = Math.max(maxErr, Math.abs(s.work - s.heat - (storedEnergy(p, s) - U0)));
      }
      expect(maxErr / scale, JSON.stringify(p)).toBeLessThan(1e-6);
    }
  });

  it('定常状態では、10 周期の間に電源がした仕事 = 平均消費電力 × 時間', () => {
    for (const p of [DEFAULT, { ...DEFAULT, f: 200, R: 5 }, { ...DEFAULT, f: 10, C: 20 }]) {
      const n = 10 * (1 / p.f / DT);
      const { states } = simulate(p, Math.round(n) * DT);
      const last = states[states.length - 1]!;
      expect(
        relativeError(last.work, averagePower(p) * Math.round(n) * DT),
        JSON.stringify(p),
      ).toBeLessThan(1e-3);
    }
  });

  it('電源電圧 0 のときに定常状態の電流は −I₀ sin φ（電流は φ だけ遅れる）', () => {
    expect(sourceVoltage(DEFAULT, 0)).toBe(0);
    expect(steadyState(DEFAULT, 0).i).toBeCloseTo(
      -peakCurrent(DEFAULT) * Math.sin(phaseLag(DEFAULT)),
      12,
    );
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で ωΔt ≤ 0.04、ω₀Δt ≤ 0.04、RΔt/L ≤ 0.04', () => {
    for (const p of CORNERS) {
      expect(angularFrequency(p) * DT).toBeLessThanOrEqual(0.04);
      expect(DT / Math.sqrt(henries(p) * farads(p))).toBeLessThanOrEqual(0.04);
      expect((p.R * DT) / henries(p)).toBeLessThanOrEqual(0.04);
    }
  });
});
