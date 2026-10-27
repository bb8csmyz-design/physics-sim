/**
 * 放射性崩壊モデルの物理的な正しさのテスト。
 * 乱数で決めた崩壊の時刻から数えた残りの数・放射能が、N = N₀(1/2)^{t/T}、A = λN と
 * 統計的なゆらぎの範囲で一致することを、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  ACTIVITY_WINDOW_RATIO,
  DT,
  PARAMS,
  activityWindow,
  decayConstant,
  decayedBy,
  expectedActivity,
  expectedMeasuredActivity,
  expectedRemaining,
  initialState,
  meanLife,
  measuredActivity,
  remaining,
  step,
  type DecayParams,
  type DecayState,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

/** 時刻 t の状態（step を繰り返して進める） */
function runTo(p: DecayParams, t: number, seed = 1): DecayState {
  let s = initialState(p, seed);
  const n = Math.round(t / DT);
  for (let i = 0; i < n; i++) s = step(p, s, DT);
  return s;
}

/** 二項分布 B(N₀, q) の標準偏差 */
function binomialSigma(N0: number, q: number): number {
  return Math.sqrt(N0 * q * (1 - q));
}

describe('半減期・崩壊定数の公式', () => {
  it('N(T) = N₀/2、N(2T) = N₀/4、N(3T) = N₀/8', () => {
    for (const p of CORNERS) {
      expect(expectedRemaining(p, 0)).toBe(p.N0);
      expect(relativeError(expectedRemaining(p, p.T), p.N0 / 2)).toBeLessThan(1e-12);
      expect(relativeError(expectedRemaining(p, 2 * p.T), p.N0 / 4)).toBeLessThan(1e-12);
      expect(relativeError(expectedRemaining(p, 3 * p.T), p.N0 / 8)).toBeLessThan(1e-12);
    }
  });

  it('λT = ln 2、平均寿命 τ = 1/λ、N₀(1/2)^{t/T} = N₀e^{−λt}', () => {
    for (const p of CORNERS) {
      expect(decayConstant(p) * p.T).toBeCloseTo(Math.LN2, 12);
      expect(meanLife(p) * decayConstant(p)).toBeCloseTo(1, 12);
      for (const t of [0.3, 1, 7.5, 40]) {
        const a = expectedRemaining(p, t);
        const b = p.N0 * Math.exp(-decayConstant(p) * t);
        expect(relativeError(a, b)).toBeLessThan(1e-12);
      }
    }
  });

  it('放射能 A = λN = −dN/dt で、0〜t の崩壊数の合計は N₀ − N(t)', () => {
    const p = DEFAULT;
    // dN/dt を中心差分で（誤差 ∝ h²）
    for (const t of [0, 2, 10]) {
      const h = 1e-4;
      const dNdt = (expectedRemaining(p, t + h) - expectedRemaining(p, t - h)) / (2 * h);
      expect(relativeError(-dNdt, expectedActivity(p, t))).toBeLessThan(1e-8);
    }
    // A を台形公式で積分（刻み 1 ms、誤差は相対 1e-7 程度）
    const tEnd = 12;
    const n = 12_000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const t0 = (tEnd * i) / n;
      const t1 = (tEnd * (i + 1)) / n;
      sum += ((expectedActivity(p, t0) + expectedActivity(p, t1)) / 2) * (t1 - t0);
    }
    expect(relativeError(sum, p.N0 - expectedRemaining(p, tEnd))).toBeLessThan(1e-6);
  });
});

describe('シミュレーション（乱数による崩壊）', () => {
  it('t = 0 では N₀ 個すべてが残っていて、数は時間とともに増えない。崩壊した数との和は常に N₀', () => {
    for (const p of CORNERS) {
      let s = initialState(p, 3);
      expect(remaining(s)).toBe(p.N0);
      let prev = p.N0;
      for (let i = 0; i < Math.round((4 * p.T) / DT); i += 7) {
        for (let k = 0; k < 7; k++) s = step(p, s, DT);
        const N = remaining(s);
        expect(N).toBeLessThanOrEqual(prev);
        expect(N + decayedBy(s, s.t)).toBe(p.N0);
        prev = N;
      }
    }
  });

  it('全隅で、残りの数が T, 2T, 3T 後に N₀/2, N₀/4, N₀/8 と統計誤差（5σ）の範囲で一致する', () => {
    for (const p of CORNERS) {
      const s0 = initialState(p, 5);
      for (const k of [1, 2, 3]) {
        const q = 0.5 ** k;
        const N = remaining(runTo(p, k * p.T, 5));
        expect(Math.abs(N - p.N0 * q), JSON.stringify({ ...p, k })).toBeLessThan(
          5 * binomialSigma(p.N0, q),
        );
        // step で進めた結果と、時刻を直接指定した結果が同じ
        expect(N).toBe(p.N0 - decayedBy(s0, k * p.T));
      }
    }
  });

  it('多数の原子核では、半分になる時刻（寿命の中央値）が半減期 T に一致する', () => {
    const p = { T: 5, N0: 100_000 };
    const s = initialState(p, 9);
    const median = s.sorted[p.N0 / 2]!;
    // 中央値の標準誤差は 1/(2f(T)√N₀)（f は寿命の確率密度、f(T) = λ/2）= 1/(λ√N₀) ≈ 0.005T
    const se = 1 / (decayConstant(p) * Math.sqrt(p.N0));
    expect(Math.abs(median - p.T)).toBeLessThan(5 * se);
  });

  it('寿命の平均が平均寿命 τ = T/ln2 に一致する', () => {
    const p = { T: 3, N0: 100_000 };
    const s = initialState(p, 4);
    const mean = s.decayTimes.reduce((a, b) => a + b, 0) / p.N0;
    // 指数分布の標準偏差は τ なので、平均の標準誤差は τ/√N₀
    expect(Math.abs(mean - meanLife(p))).toBeLessThan((5 * meanLife(p)) / Math.sqrt(p.N0));
  });

  it('無記憶性: 時刻 T に残っていた原子核も、そこからさらに T 後には半分になる', () => {
    const p = { T: 4, N0: 100_000 };
    const s = initialState(p, 6);
    const n1 = p.N0 - decayedBy(s, p.T);
    const n2 = p.N0 - decayedBy(s, 2 * p.T);
    expect(Math.abs(n2 / n1 - 0.5)).toBeLessThan(5 * Math.sqrt(0.25 / n1));
  });

  it('ln(N/N₀) は t の 1 次関数で、傾きは −λ（片対数グラフで直線）', () => {
    const p = { T: 2, N0: 200_000 };
    const s = initialState(p, 8);
    const ts: number[] = [];
    const ys: number[] = [];
    for (let t = 0; t <= 3 * p.T; t += 0.25) {
      ts.push(t);
      ys.push(Math.log((p.N0 - decayedBy(s, t)) / p.N0));
    }
    const n = ts.length;
    const mt = ts.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (ts[i]! - mt) * (ys[i]! - my);
      den += (ts[i]! - mt) ** 2;
    }
    expect(relativeError(-num / den, decayConstant(p))).toBeLessThan(0.01);
  });

  it('同じシードなら同じ結果、違うシードなら違う結果（確率的なゆらぎ）', () => {
    expect(initialState(DEFAULT, 1).decayTimes).toEqual(initialState(DEFAULT, 1).decayTimes);
    expect(initialState(DEFAULT, 1).decayTimes).not.toEqual(initialState(DEFAULT, 2).decayTimes);
  });
});

describe('放射能の測定', () => {
  it('測定した放射能の平均（多数回）が期待値と一致し、期待値は A = λN に近い', () => {
    for (const p of CORNERS) {
      for (const k of [0.5, 2]) {
        const t = k * p.T;
        const RUNS = 40;
        let sum = 0;
        for (let seed = 1; seed <= RUNS; seed++) {
          const s = { ...initialState(p, seed), t };
          sum += measuredActivity(p, s);
        }
        const mean = sum / RUNS;
        const expected = expectedMeasuredActivity(p, t);
        // 1 回の測定の崩壊数はほぼポアソン分布（分散 ≈ 平均）
        const w = activityWindow(p);
        const sigma = Math.sqrt(expected * w) / w / Math.sqrt(RUNS);
        expect(Math.abs(mean - expected), JSON.stringify({ ...p, k })).toBeLessThan(5 * sigma);
        // 幅 w の平均なので、瞬間の λN とのずれは λw/2 = (ln2/2)·0.1 ≈ 3.5% 程度
        const bias = (Math.LN2 * ACTIVITY_WINDOW_RATIO) / 2;
        expect(relativeError(expected, expectedActivity(p, t))).toBeLessThan(bias * 1.1);
      }
    }
  });

  it('t = 0 の測定値は 0、期待値は λN₀', () => {
    const s = initialState(DEFAULT, 1);
    expect(measuredActivity(DEFAULT, s)).toBe(0);
    expect(expectedMeasuredActivity(DEFAULT, 0)).toBe(expectedActivity(DEFAULT, 0));
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で λΔt ≤ 0.01、放射能を測る幅は 10Δt 以上', () => {
    for (const p of CORNERS) {
      expect(decayConstant(p) * DT).toBeLessThanOrEqual(0.01);
      expect(activityWindow(p)).toBeGreaterThanOrEqual(10 * DT - 1e-12);
    }
  });
});
