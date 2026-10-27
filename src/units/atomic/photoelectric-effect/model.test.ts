/**
 * 光電効果モデルの物理的な正しさのテスト。
 * アインシュタインの光電方程式・限界振動数・阻止電圧・飽和電流の公式と、
 * 電子の運動のシミュレーション（乱数による放出 + 等加速度運動）から測った量との一致を確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  ELECTRON_MASS,
  ELECTRON_VOLT,
  ELEMENTARY_CHARGE,
  PLANCK,
  SPEED_OF_LIGHT,
} from '@/core/physics/constants';
import { Rng, seedRng } from '@/core/random';
import {
  DT,
  ELECTRONS_PER_DOT,
  GAP,
  HC_EV_NM,
  MEASURE_WINDOW,
  PARAMS,
  accelerationX,
  current,
  einsteinLine,
  electronEnergy,
  emits,
  frequency,
  initialState,
  maxKineticEnergy,
  maxSpeed,
  measuredCurrent,
  photonEnergyEV,
  photonRate,
  propagate,
  reachFraction,
  sampleEmission,
  saturationCurrent,
  step,
  stoppingVoltage,
  thresholdFrequency,
  thresholdWavelength,
  type PhotoParams,
  type PhotoState,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

/** duration 秒だけ時間発展させる。各ステップの状態を onStep に渡す */
function run(p: PhotoParams, duration: number, seed = 1, onStep?: (s: PhotoState) => void) {
  let s = initialState(seed);
  const n = Math.round(duration / DT);
  for (let i = 0; i < n; i++) {
    s = step(p, s, DT);
    onStep?.(s);
  }
  return s;
}

/** 二項分布の割合の標準誤差 √(q(1−q)/n) */
function binomialSigma(q: number, n: number): number {
  return Math.sqrt(Math.max(q * (1 - q), 1 / n) / n);
}

describe('光子のエネルギーと光電方程式', () => {
  it('hc/e ≈ 1240 nm·eV（E [eV] = 1240 / λ [nm]）', () => {
    expect(HC_EV_NM).toBeCloseTo(1239.84, 2);
  });

  it('入試の典型例: λ = 400 nm, Na（W = 2.3 eV）→ hν = 3.10 eV, K_max = 0.80 eV, V₀ = 0.80 V', () => {
    const p = { ...DEFAULT, lambda: 400, W: 2.3 };
    expect(frequency(p)).toBeCloseTo(7.49e14, -12);
    expect(photonEnergyEV(p)).toBeCloseTo(3.0996, 4);
    expect(maxKineticEnergy(p)).toBeCloseTo(0.7996, 4);
    expect(stoppingVoltage(p)).toBeCloseTo(0.7996, 4);
    // v_max = √(2K/m) ≈ 5.3×10⁵ m/s
    expect(relativeError(maxSpeed(p), 5.3e5)).toBeLessThan(2e-3);
  });

  it('E = hν = hc/λ（SI 単位での直接計算と一致）', () => {
    for (const p of CORNERS) {
      const E = (PLANCK * SPEED_OF_LIGHT) / (p.lambda * 1e-9) / ELECTRON_VOLT;
      expect(relativeError(photonEnergyEV(p), E)).toBeLessThan(1e-12);
    }
  });

  it('限界振動数 ν₀ = W/h・限界波長 λ₀ = hc/W で、ν > ν₀（λ < λ₀）のときだけ光電子が出る', () => {
    const p = { ...DEFAULT, W: 2.3 };
    expect(thresholdWavelength(p)).toBeCloseTo(539.1, 1);
    expect(
      relativeError(thresholdFrequency(p) * thresholdWavelength(p) * 1e-9, SPEED_OF_LIGHT),
    ).toBeLessThan(1e-12);
    for (const q of CORNERS) {
      expect(emits(q)).toBe(frequency(q) > thresholdFrequency(q));
      expect(emits(q)).toBe(q.lambda < thresholdWavelength(q));
    }
  });

  it('K_max = hν − W は ν の 1 次関数で、傾きはプランク定数 h、縦軸切片は −W', () => {
    for (const W of [1.8, 2.3, 4.3]) {
      const nu1 = 8e14;
      const nu2 = 1.4e15;
      const slope = ((einsteinLine(W, nu2) - einsteinLine(W, nu1)) * ELECTRON_VOLT) / (nu2 - nu1);
      expect(relativeError(slope, PLANCK)).toBeLessThan(1e-9);
      expect(einsteinLine(W, 0)).toBeCloseTo(-W, 12);
      expect(einsteinLine(W, (W * ELECTRON_VOLT) / PLANCK)).toBeCloseTo(0, 12);
    }
  });

  it('光を強くしても K_max・阻止電圧は変わらず、飽和電流は光の強さに比例する', () => {
    const weak = { ...DEFAULT, P: 50 };
    const strong = { ...DEFAULT, P: 200 };
    expect(stoppingVoltage(strong)).toBe(stoppingVoltage(weak));
    expect(saturationCurrent(strong) / saturationCurrent(weak)).toBeCloseTo(4, 12);
  });

  it('飽和電流 I₀ = eN, N = P/(hν)（光子 1 個につき電子 1 個）', () => {
    const p = { ...DEFAULT, lambda: 400, P: 100 };
    // 100 μW / 4.97×10⁻¹⁹ J ≈ 2.01×10¹⁴ 個/s → I₀ ≈ 32.2 μA
    expect(relativeError(photonRate(p), 2.014e14)).toBeLessThan(1e-3);
    expect(relativeError(saturationCurrent(p), ELEMENTARY_CHARGE * photonRate(p))).toBeLessThan(
      1e-12,
    );
    expect(relativeError(saturationCurrent(p), 32.27e-6)).toBeLessThan(1e-3);
  });

  it('限界振動数より小さい振動数の光では、どんなに強くても電流は 0', () => {
    const p = { ...DEFAULT, lambda: 700, W: 2.3, P: 200 };
    expect(emits(p)).toBe(false);
    for (const V of [-5, 0, 5]) expect(current(p, V)).toBe(0);
    const s = run(p, 200e-9);
    expect(s.emitted).toBe(0);
    expect(measuredCurrent(s)).toBe(0);
  });
});

describe('電流-電圧特性（理論式）', () => {
  it('V ≥ 0 で飽和電流、V = −V₀ で 0、その間で連続かつ単調に増える（パラメータ範囲の全隅）', () => {
    for (const p of CORNERS) {
      const I0 = saturationCurrent(p);
      const V0 = stoppingVoltage(p);
      expect(current(p, 0)).toBe(I0);
      expect(current(p, 5)).toBe(I0);
      expect(current(p, -V0)).toBe(0);
      let prev = -Infinity;
      for (let V = -5; V <= 5 + 1e-9; V += 0.05) {
        const I = current(p, V);
        expect(Number.isFinite(I)).toBe(true);
        expect(I).toBeGreaterThanOrEqual(prev - 1e-18);
        expect(I).toBeGreaterThanOrEqual(0);
        expect(I).toBeLessThanOrEqual(I0);
        prev = I;
      }
      if (emits(p)) {
        // V = 0 と V = −V₀ の近くで連続
        expect(relativeError(current(p, -1e-9), I0)).toBeLessThan(1e-6);
        expect(current(p, -V0 * (1 - 1e-9))).toBeLessThan(1e-6 * I0);
      }
    }
  });
});

describe('光電子の放出（乱数）の分布', () => {
  const p = { ...DEFAULT, lambda: 250, W: 2.3 }; // K_max ≈ 2.66 eV
  const SAMPLES = 40_000;
  const rng = new Rng(seedRng(11));
  const electrons = Array.from({ length: SAMPLES }, () => sampleEmission(p, rng));
  const kinetic = electrons.map(
    (e) => (0.5 * ELECTRON_MASS * (e.vx ** 2 + e.vy ** 2 + e.vz ** 2)) / ELECTRON_VOLT,
  );

  it('飛び出す電子の運動エネルギーは K_max = hν − W を超えず、最大値は K_max に一致する', () => {
    const Kmax = maxKineticEnergy(p);
    expect(Math.max(...kinetic)).toBeLessThanOrEqual(Kmax * (1 + 1e-12));
    // 一様分布の最大値は 1 − 1/(n+1) 程度
    expect(Math.max(...kinetic)).toBeGreaterThan(Kmax * (1 - 10 / SAMPLES));
    // 一様分布の平均は K_max/2（標準誤差 K_max/√(12n)）
    const mean = kinetic.reduce((a, b) => a + b, 0) / SAMPLES;
    expect(Math.abs(mean - Kmax / 2)).toBeLessThan((5 * Kmax) / Math.sqrt(12 * SAMPLES));
    expect(electrons.every((e) => e.vx >= 0)).toBe(true);
  });

  it('陽極に達する割合（½mvₓ² > e|V|）が理論式 1 − x + x ln x と一致する', () => {
    const V0 = stoppingVoltage(p);
    for (const V of [-0.1, -0.5, -1, -2, -2.5].map((r) => (r / 2.66) * V0)) {
      const reached = electrons.filter(
        (e) => 0.5 * ELECTRON_MASS * e.vx * e.vx > -ELEMENTARY_CHARGE * V,
      ).length;
      const q = reachFraction(p, V);
      expect(Math.abs(reached / SAMPLES - q), `V=${V}`).toBeLessThan(5 * binomialSigma(q, SAMPLES));
    }
  });
});

describe('光電子の運動のシミュレーション', () => {
  it('極板間の電子の力学的エネルギー ½mv² − eφ(x) が保存される（等加速度運動の式で厳密に進めている）', () => {
    for (const V of [-5, -1, 0, 3, 5]) {
      const p = { ...DEFAULT, lambda: 200, W: 1.8, V };
      const rng = new Rng(seedRng(5));
      for (let k = 0; k < 20; k++) {
        let e = sampleEmission(p, rng);
        const E0 = electronEnergy(p, e);
        for (let i = 0; i < 200; i++) {
          e = propagate(e, accelerationX(p), DT);
          const scale = ELECTRON_VOLT * (maxKineticEnergy(p) + Math.abs(V));
          expect(Math.abs(electronEnergy(p, e) - E0) / scale).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('定常状態で測った光電流が理論値 I と一致する（V > 0, V = 0, −V₀ < V < 0）', () => {
    for (const V of [2, 0, -0.3]) {
      const p = { ...DEFAULT, lambda: 400, W: 2.3, V }; // V₀ ≈ 0.80 V
      const T_SETTLE = 300e-9; // 遅い電子も極板間を渡り終える時間
      const T_MEASURE = 3000e-9;
      let collectedAtSettle = 0;
      let n = 0;
      const s = run(p, T_SETTLE + T_MEASURE, 7, (st) => {
        n++;
        if (n === Math.round(T_SETTLE / DT)) collectedAtSettle = st.collected;
      });
      const counts = s.collected - collectedAtSettle;
      const I = (counts * ELECTRONS_PER_DOT * ELEMENTARY_CHARGE) / T_MEASURE;
      const expected = current(p, V);
      // 到達数はポアソン分布に従うので、相対的なゆらぎは 1/√(期待数)
      const expectedCounts = (expected * T_MEASURE) / (ELECTRONS_PER_DOT * ELEMENTARY_CHARGE);
      // V = 0 では非常に遅い電子が残るので、その分（ごく少数）も許す
      expect(Math.abs(counts - expectedCounts), `V=${V}`).toBeLessThan(
        5 * Math.sqrt(expectedCounts) + 0.01 * expectedCounts,
      );
      expect(relativeError(I, expected), `V=${V}`).toBeLessThan(0.15);
    }
  });

  it('阻止電圧 V = −V₀ では 1 個も陽極に達しない。少し浅くすると達する電子が現れる', () => {
    const base = { ...DEFAULT, lambda: 300, W: 2.3 };
    const V0 = stoppingVoltage(base);
    const stopped = run({ ...base, V: -V0 }, 2000e-9, 3);
    expect(stopped.emitted).toBeGreaterThan(1000);
    expect(stopped.collected).toBe(0);
    const almost = run({ ...base, V: -0.8 * V0 }, 2000e-9, 3);
    expect(almost.collected).toBeGreaterThan(0);
  });

  it('V = 0 で陽極に達した電子の運動エネルギーの最大値が K_max = hν − W に一致する', () => {
    const p = { ...DEFAULT, lambda: 300, W: 2.3, V: 0 };
    let s = initialState(9);
    let maxK = 0;
    for (let i = 0; i < Math.round(3000e-9 / DT); i++) {
      const next = step(p, s, DT);
      // このステップで陽極に達した電子 = 前のステップにいて、今いない電子のうち x が大きいもの
      if (next.collected > s.collected) {
        for (const e of s.electrons) {
          const k = (0.5 * ELECTRON_MASS * (e.vx ** 2 + e.vy ** 2 + e.vz ** 2)) / ELECTRON_VOLT;
          if (e.x + e.vx * DT >= GAP) maxK = Math.max(maxK, k);
        }
      }
      s = next;
    }
    expect(maxK).toBeLessThanOrEqual(maxKineticEnergy(p) * (1 + 1e-12));
    expect(relativeError(maxK, maxKineticEnergy(p))).toBeLessThan(0.02);
  });

  it('測定した電流（直近 100 ns の平均）は飽和電流のまわりでゆらぐ', () => {
    const p = { ...DEFAULT, V: 3 };
    const s = run(p, 600e-9, 2);
    const expectedCounts =
      (saturationCurrent(p) * MEASURE_WINDOW) / (ELECTRONS_PER_DOT * ELEMENTARY_CHARGE);
    expect(Math.abs(measuredCurrent(s) / saturationCurrent(p) - 1)).toBeLessThan(
      5 / Math.sqrt(expectedCounts),
    );
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で、1 ステップの移動距離は極板間隔の 1/50 以下', () => {
    for (const p of CORNERS) {
      // 陽極に達するときの速さが最大（運動エネルギー K_max + eV）
      const K = (maxKineticEnergy(p) + Math.max(0, p.V)) * ELECTRON_VOLT;
      const vMax = Math.sqrt((2 * K) / ELECTRON_MASS);
      expect(vMax * DT).toBeLessThanOrEqual(GAP / 50);
    }
  });

  it('パラメータ範囲全体で、1 ステップに飛び出す点の数の期待値は 1 未満（表示が詰まらない）', () => {
    for (const p of CORNERS) {
      const rate = emits(p) ? photonRate(p) / ELECTRONS_PER_DOT : 0;
      expect(rate * DT).toBeLessThan(1);
    }
  });

  it('全隅で 200 ns 動かしても状態が有限のまま', () => {
    for (const p of CORNERS) {
      const s = run(p, 200e-9, 1);
      expect(s.electrons.every((e) => Number.isFinite(e.x) && Number.isFinite(e.vx))).toBe(true);
      expect(Number.isFinite(measuredCurrent(s))).toBe(true);
    }
  });
});
