/**
 * 電気振動（LC 回路）の物理的な正しさのテスト。
 * 解析解、周期 T = 2π√(LC)、電流の最大値、エネルギー保存（静電エネルギー ↔ 磁場のエネルギー）を、
 * パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  analyticState,
  angularFrequency,
  capacitorVoltage,
  energies,
  frequency,
  henries,
  initialCharge,
  initialState,
  maxCurrent,
  period,
  step,
  type LcParams,
  type LcState,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

function simulate(p: LcParams, duration: number) {
  const n = Math.round(duration / DT);
  const ts = [0];
  const states: LcState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= n; i++) {
    s = step(p, s, DT);
    ts.push(i * DT);
    states.push(s);
  }
  return { ts, states };
}

describe('公式', () => {
  it('L = 50 mH, C = 20 μF のとき T = 2π√(LC) = 2π ms、f ≈ 159 Hz', () => {
    const p = { ...DEFAULT, L: 50, C: 20 };
    expect(period(p)).toBeCloseTo(2 * Math.PI * 1e-3, 12);
    expect(frequency(p)).toBeCloseTo(1000 / (2 * Math.PI), 9);
  });

  it('L を 4 倍にすると周期は 2 倍、C を 4 倍にしても 2 倍。周期は電圧によらない', () => {
    expect(period({ ...DEFAULT, L: 4 * 20 }) / period({ ...DEFAULT, L: 20 })).toBeCloseTo(2, 12);
    expect(period({ ...DEFAULT, C: 4 * 20 }) / period({ ...DEFAULT, C: 20 })).toBeCloseTo(2, 12);
    expect(period({ ...DEFAULT, V0: 1 })).toBe(period({ ...DEFAULT, V0: 12 }));
  });

  it('電流の最大値 I₀ = Q₀ω = V₀√(C/L)（エネルギー保存 ½CV₀² = ½LI₀² と同じ）', () => {
    for (const p of CORNERS) {
      expect(relativeError(maxCurrent(p), initialCharge(p) * angularFrequency(p))).toBeLessThan(
        1e-12,
      );
      expect(
        relativeError(0.5 * henries(p) * maxCurrent(p) ** 2, 0.5 * p.C * 1e-6 * p.V0 ** 2),
      ).toBeLessThan(1e-12);
    }
  });
});

describe('数値計算と解析解の一致', () => {
  it('パラメータ範囲の全隅で、3 周期後の電気量・電流が解析解と一致する', () => {
    for (const p of CORNERS) {
      const { ts, states } = simulate(p, 3 * period(p));
      const last = states[states.length - 1]!;
      const exact = analyticState(p, ts[ts.length - 1]!);
      // 速度ベルレ法の位相誤差は 1 rad あたり (ωΔt)²/24 で、3 周期（6π rad）で 1.3×10⁻³ 以下
      expect(Math.abs(last.q - exact.q) / initialCharge(p), JSON.stringify(p)).toBeLessThan(2e-3);
      expect(Math.abs(last.i - exact.i) / maxCurrent(p), JSON.stringify(p)).toBeLessThan(2e-3);
    }
  });

  it('シミュレーションから測った周期が T = 2π√(LC) と一致する（全隅）', () => {
    for (const p of CORNERS) {
      const T = period(p);
      const { ts, states } = simulate(p, 5.2 * T);
      const measured = estimatePeriod(
        ts,
        states.map((s) => s.i),
      );
      // 速度ベルレ法の周期の誤差は (ωΔt)²/24 ≤ 7×10⁻⁵
      expect(relativeError(measured, T), JSON.stringify(p)).toBeLessThan(1e-4);
    }
  });

  it('電流は電気量より位相が π/2 遅れる: q = 0 のとき電流が最大、電流 0 のとき |q| が最大', () => {
    const p = DEFAULT;
    const T = period(p);
    const quarter = analyticState(p, T / 4);
    expect(Math.abs(quarter.q) / initialCharge(p)).toBeLessThan(1e-12);
    expect(relativeError(quarter.i, maxCurrent(p))).toBeLessThan(1e-12);
    const half = analyticState(p, T / 2);
    expect(relativeError(half.q, -initialCharge(p))).toBeLessThan(1e-12);
  });

  it('はじめの電圧が 0 なら何も起こらない', () => {
    const p = { ...DEFAULT, V0: 0 };
    for (const s of simulate(p, 0.01).states) expect(s.q === 0 && s.i === 0).toBe(true);
  });
});

describe('エネルギー保存', () => {
  it('静電エネルギーと磁場のエネルギーの和が 30 周期にわたって保存され、ドリフトしない', () => {
    for (const p of CORNERS) {
      const n = Math.round((30 * period(p)) / DT);
      const e0 = energies(p, initialState(p)).total;
      let s = initialState(p);
      let firstMax = 0;
      let lastMax = 0;
      for (let k = 1; k <= n; k++) {
        s = step(p, s, DT);
        const err = relativeError(energies(p, s).total, e0);
        if (k <= n / 10) firstMax = Math.max(firstMax, err);
        if (k > n - n / 10) lastMax = Math.max(lastMax, err);
      }
      // 速度ベルレ法のエネルギー誤差は最大 (ωΔt)²/4 程度で頭打ちになる
      const bound = (angularFrequency(p) * DT) ** 2 / 2;
      expect(Math.max(firstMax, lastMax), JSON.stringify(p)).toBeLessThan(bound);
      expect(lastMax, JSON.stringify(p)).toBeLessThan(firstMax * 1.05 + 1e-15);
    }
  });

  it('全エネルギーは ½CV₀²。1/4 周期ごとに静電エネルギーと磁場のエネルギーが入れかわる', () => {
    const p = DEFAULT;
    const U0 = 0.5 * p.C * 1e-6 * p.V0 ** 2;
    const T = period(p);
    expect(relativeError(energies(p, initialState(p)).total, U0)).toBeLessThan(1e-12);
    const e = energies(p, analyticState(p, T / 4));
    expect(e.electric / U0).toBeLessThan(1e-12);
    expect(relativeError(e.magnetic, U0)).toBeLessThan(1e-12);
  });

  it('コンデンサーの電圧はコイルの電圧 L di/dt に等しい（キルヒホッフの第 2 法則）', () => {
    const p = DEFAULT;
    const { states } = simulate(p, period(p));
    for (let k = 1; k < states.length - 1; k += 37) {
      const didt = (states[k + 1]!.i - states[k - 1]!.i) / (2 * DT);
      const V = capacitorVoltage(p, states[k]!.q);
      // 中心差分の誤差は (ωΔt)²/6 × V₀ 程度
      expect(Math.abs(henries(p) * didt - V)).toBeLessThan(
        ((angularFrequency(p) * DT) ** 2 / 6) * p.V0 * 1.5 + 1e-9,
      );
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で ωΔt ≤ 0.04（1 周期あたり 150 ステップ以上）', () => {
    for (const p of CORNERS) expect(angularFrequency(p) * DT).toBeLessThanOrEqual(0.04);
  });
});
