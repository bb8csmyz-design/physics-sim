/**
 * 弦と気柱の固有振動モデルの物理的な正しさのテスト。
 * 固有振動数の公式、端の条件（固定端・閉口端は節、開口端は腹）、進行波の重ね合わせとの一致を
 * パラメータ範囲の全隅で確かめる。さらに、波動方程式を差分法で時間発展させて測った振動数が
 * 公式と一致すること（公式とは独立な検証）を確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { convergenceOrder, estimatePeriod, relativeError } from '@/core/physics/analysis';
import { velocityVerletStep, type PhaseState } from '@/core/physics/integrators';
import {
  DT,
  KINDS,
  PARAMS,
  antinodePositions,
  densityChange,
  displacement,
  effectiveSpan,
  frequency,
  fundamentalFrequency,
  harmonic,
  modeShape,
  nodePositions,
  travelingWaves,
  wavelength,
  type ResonatorKind,
  type ResonatorParams,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

describe('固有振動数の公式', () => {
  it('弦: f = nv/(2L)。L = 0.6 m, v = 340 m/s の 2 倍振動は 566.7 Hz', () => {
    const p = { ...DEFAULT, L: 0.6, v: 340, n: 2 };
    expect(frequency('string', p)).toBeCloseTo((2 * 340) / 1.2, 10);
    expect(wavelength('string', p)).toBeCloseTo(0.6, 12);
  });

  it('開管: f = nV/(2(L + 2Δx))、閉管: f = (2n − 1)V/(4(L + Δx))', () => {
    const p = { ...DEFAULT, L: 0.5, v: 340, n: 1, dx: 0 };
    expect(frequency('open', p)).toBeCloseTo(340, 10);
    expect(frequency('closed', { ...p, L: 0.25 })).toBeCloseTo(340, 10);
    const q = { ...p, L: 0.48, dx: 0.01, n: 3 };
    expect(frequency('open', q)).toBeCloseTo((3 * 340) / (2 * 0.5), 10);
    expect(frequency('closed', q)).toBeCloseTo((5 * 340) / (4 * 0.49), 10);
  });

  it('閉管は奇数倍の振動だけ、弦と開管はすべての整数倍', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const p = { ...DEFAULT, n };
      expect(harmonic('closed', p)).toBe(2 * n - 1);
      for (const kind of KINDS) {
        expect(
          relativeError(frequency(kind, p) / fundamentalFrequency(kind, p), harmonic(kind, p)),
        ).toBeLessThan(1e-12);
      }
    }
  });

  it('同じ長さなら、閉管の基本振動数は開管の半分（開口端補正なし）', () => {
    const p = { ...DEFAULT, dx: 0 };
    expect(fundamentalFrequency('closed', p) / fundamentalFrequency('open', p)).toBeCloseTo(
      0.5,
      12,
    );
  });

  it('開口端補正があると、波長が伸びて振動数は下がる', () => {
    for (const kind of ['open', 'closed'] as const) {
      expect(frequency(kind, { ...DEFAULT, dx: 0.02 })).toBeLessThan(
        frequency(kind, { ...DEFAULT, dx: 0 }),
      );
    }
    expect(frequency('string', { ...DEFAULT, dx: 0.02 })).toBe(
      frequency('string', { ...DEFAULT, dx: 0 }),
    );
  });
});

describe('端の条件と定常波の形（全隅）', () => {
  const ts = [0, 0.37e-3, 1.1e-3];
  const dYdx = (kind: ResonatorKind, p: ResonatorParams, x: number) => {
    const h = 1e-6;
    return (modeShape(kind, p, x + h) - modeShape(kind, p, x - h)) / (2 * h);
  };

  it('弦の両端・閉管の閉口端は変位の節（常に y = 0）', () => {
    for (const p of CORNERS) {
      for (const t of ts) {
        expect(Math.abs(displacement('string', p, 0, t))).toBeLessThan(1e-12);
        expect(Math.abs(displacement('string', p, p.L, t))).toBeLessThan(1e-9);
        expect(Math.abs(displacement('closed', p, 0, t))).toBeLessThan(1e-12);
      }
    }
  });

  it('開口端（管口から Δx 外側）は変位の腹（|Y| = 1、傾き 0）で、密度変化は 0', () => {
    for (const p of CORNERS) {
      const checks: [ResonatorKind, number][] = [
        ['open', effectiveSpan('open', p)[0]],
        ['open', effectiveSpan('open', p)[1]],
        ['closed', effectiveSpan('closed', p)[1]],
      ];
      for (const [kind, x] of checks) {
        expect(Math.abs(modeShape(kind, p, x)), JSON.stringify({ kind, p })).toBeCloseTo(1, 9);
        expect(Math.abs(dYdx(kind, p, x)) * wavelength(kind, p)).toBeLessThan(1e-6);
        for (const t of ts) expect(Math.abs(densityChange(kind, p, x, t))).toBeLessThan(1e-9);
      }
    }
  });

  it('閉口端（変位の節）では密度変化が最大', () => {
    for (const p of CORNERS) {
      expect(Math.abs(densityChange('closed', p, 0, 0))).toBeCloseTo(1, 12);
    }
  });

  it('定常波は右へ進む波と左へ進む波（反射波）の重ね合わせに等しい', () => {
    for (const kind of KINDS) {
      for (const p of CORNERS.filter((_, i) => i % 7 === 0)) {
        const [a, b] = effectiveSpan(kind, p);
        for (let i = 0; i <= 20; i++) {
          const x = a + ((b - a) * i) / 20;
          for (const t of ts) {
            const w = travelingWaves(kind, p, x, t);
            expect(w.right + w.left).toBeCloseTo(displacement(kind, p, x, t), 12);
          }
        }
      }
    }
  });

  it('進行波は速さ v で進む（右向きの波の形が Δt 後に vΔt だけ右へ移る）', () => {
    for (const kind of KINDS) {
      const p = DEFAULT;
      const dt = 1.3e-4;
      for (const x of [0.1, 0.25, 0.4]) {
        const a = travelingWaves(kind, p, x, 0);
        const b = travelingWaves(kind, p, x + p.v * dt, dt);
        const c = travelingWaves(kind, p, x - p.v * dt, dt);
        expect(b.right).toBeCloseTo(a.right, 9);
        expect(c.left).toBeCloseTo(a.left, 9);
      }
    }
  });
});

describe('節と腹の位置', () => {
  it('節どうし・腹どうしの間隔は λ/2、節と腹の間隔は λ/4（全隅）', () => {
    for (const kind of KINDS) {
      for (const p of CORNERS) {
        const lambda = wavelength(kind, p);
        const nodes = nodePositions(kind, p);
        const antis = antinodePositions(kind, p);
        for (const xs of [nodes, antis]) {
          for (let i = 1; i < xs.length; i++)
            expect(xs[i]! - xs[i - 1]!).toBeCloseTo(lambda / 2, 9);
        }
        for (const x of nodes) expect(Math.abs(modeShape(kind, p, x))).toBeLessThan(1e-9);
        for (const x of antis) expect(Math.abs(modeShape(kind, p, x))).toBeCloseTo(1, 9);
      }
    }
  });

  it('節と腹の数: 弦は節 n+1・腹 n、開管は節 n・腹 n+1、閉管は節 n・腹 n', () => {
    for (const p of CORNERS) {
      expect(nodePositions('string', p).length).toBe(p.n + 1);
      expect(antinodePositions('string', p).length).toBe(p.n);
      expect(nodePositions('open', p).length).toBe(p.n);
      expect(antinodePositions('open', p).length).toBe(p.n + 1);
      expect(nodePositions('closed', p).length).toBe(p.n);
      expect(antinodePositions('closed', p).length).toBe(p.n);
    }
  });
});

/**
 * 公式とは独立な検証: 波動方程式 ∂²y/∂t² = v² ∂²y/∂x² を、定常波の範囲を N 等分した差分法で解く。
 * 固定端（節）は y = 0、開口端（腹）は傾き 0（鏡像点を使う）。保存力の系なので速度ベルレ法で進める。
 */
function simulateWaveEquation(kind: ResonatorKind, p: ResonatorParams, N: number, periods: number) {
  const [a, b] = effectiveSpan(kind, p);
  const h = (b - a) / N;
  const xs = Array.from({ length: N + 1 }, (_, i) => a + i * h);
  const leftFree = kind === 'open';
  const rightFree = kind !== 'string';
  const v2 = p.v * p.v;
  const accel = (_t: number, y: readonly number[]) =>
    y.map((yi, i) => {
      const yl = i === 0 ? (leftFree ? y[1]! : 0) : y[i - 1]!;
      const yr = i === N ? (rightFree ? y[N - 1]! : 0) : y[i + 1]!;
      if ((i === 0 && !leftFree) || (i === N && !rightFree)) return 0;
      return (v2 * (yl - 2 * yi + yr)) / (h * h);
    });
  let s: PhaseState = { x: xs.map((x) => modeShape(kind, p, x)), v: xs.map(() => 0) };
  const dt = (0.5 * h) / p.v; // CFL 条件 vΔt/h ≤ 1 を満たす
  const steps = Math.ceil(periods / frequency(kind, p) / dt);
  // 腹（左端が節なら λ/4 の位置、開管なら左端）の変位を記録する
  const probe = leftFree ? 0 : Math.round(wavelength(kind, p) / 4 / h);
  const ts: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= steps; i++) {
    ts.push(i * dt);
    ys.push(s.x[probe]!);
    s = velocityVerletStep(accel, i * dt, s, dt);
  }
  return estimatePeriod(ts, ys);
}

describe('波動方程式の数値解（独立な検証）', () => {
  it('差分法で時間発展させた振動の周期が、全種類・全モードで固有振動数の公式と一致する', () => {
    for (const kind of KINDS) {
      for (const n of [1, 2, 3, 4, 5]) {
        const p = { ...DEFAULT, n, dx: 0.02 };
        const T = simulateWaveEquation(kind, p, 200, 4.3);
        // 空間差分の分散誤差で振動数は (kh)²/24 だけ低く出る。最大の kh ≈ 9π/2/200 で約 2.1e-4
        expect(relativeError(1 / T, frequency(kind, p)), `${kind} n=${n}`).toBeLessThan(5e-4);
      }
    }
  });

  it('格子を細かくすると誤差が 2 次で 0 に近づく（数値解が公式に収束する）', () => {
    const p = { ...DEFAULT, n: 3, dx: 0.01 };
    const Ns = [40, 80, 160];
    const errs = Ns.map((N) =>
      relativeError(1 / simulateWaveEquation('closed', p, N, 3.3), frequency('closed', p)),
    );
    expect(
      convergenceOrder(
        Ns.map((N) => 1 / N),
        errs,
      ),
    ).toBeCloseTo(2, 0);
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で、最大の振動数でも 1 周期 150 ステップ以上', () => {
    for (const kind of KINDS) {
      for (const p of CORNERS) expect(1 / frequency(kind, p) / DT).toBeGreaterThanOrEqual(150);
    }
  });

  it('固有振動数は可聴域（20 Hz〜20 kHz）に収まる', () => {
    for (const kind of KINDS) {
      for (const p of CORNERS) {
        expect(frequency(kind, p)).toBeGreaterThan(20);
        expect(frequency(kind, p)).toBeLessThan(20000);
      }
    }
  });
});
