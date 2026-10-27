/**
 * 2 つの波源による干渉モデルの物理的な正しさのテスト。
 * 合成波を時間発展させて測った振幅が干渉の条件式（解析解）と一致すること、
 * 強め合う線・弱め合う線の本数と位置が公式どおりであることを、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import {
  AMPLITUDE,
  DT,
  FREQUENCY,
  PARAMS,
  displacements,
  distances,
  hyperbolaX,
  initialState,
  interferenceKind,
  lineCount,
  lineOffsets,
  pathDifference,
  resultantAmplitude,
  step,
  waveSpeed,
  type InterferenceParams,
  type SourcePhase,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const PHASES: readonly SourcePhase[] = ['same', 'opposite'];

/** 1 周期ぶん時間発展させ、点 (x, y) の合成波の変位の最大値（＝振幅）を測る */
function measuredAmplitude(p: InterferenceParams, phase: SourcePhase, x: number, y: number) {
  const n = Math.round(1 / FREQUENCY / DT);
  let s = initialState();
  let maxAbs = 0;
  for (let i = 0; i <= n; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(displacements(p, phase, x, y, s.t).total));
    s = step(s, DT);
  }
  return maxAbs;
}

describe('合成波の振幅（シミュレーションと解析解）', () => {
  it('全隅で、点 P の振幅が 2A|cos(πΔ/λ − φ/2)| と一致する', () => {
    for (const phase of PHASES) {
      for (const p of CORNERS) {
        const measured = measuredAmplitude(p, phase, p.xP, p.yP);
        // 1 周期 200 点の標本の最大値なので、真の振幅より最大 2A(1 − cos(π/200)) ≈ 2.5e-4 小さい
        expect(
          Math.abs(measured - resultantAmplitude(p, phase, p.xP, p.yP)),
          JSON.stringify({ phase, p }),
        ).toBeLessThan(3e-4);
      }
    }
  });

  it('強め合う点（経路差 mλ）の振幅は 2A、弱め合う点（(m + ½)λ）は 0（同位相）', () => {
    const p = DEFAULT;
    for (const delta of lineOffsets(p, 'same', 'constructive')) {
      for (const y of [0.02, 0.07, 0.13]) {
        const x = hyperbolaX(p, delta, y);
        const [r1, r2] = distances(p, x, y);
        expect(r1 - r2).toBeCloseTo(delta, 12);
        expect(resultantAmplitude(p, 'same', x, y)).toBeCloseTo(2 * AMPLITUDE, 10);
        expect(measuredAmplitude(p, 'same', x, y)).toBeGreaterThan(2 * AMPLITUDE - 3e-4);
      }
    }
    for (const delta of lineOffsets(p, 'same', 'destructive')) {
      const x = hyperbolaX(p, delta, 0.05);
      expect(resultantAmplitude(p, 'same', x, 0.05)).toBeCloseTo(0, 10);
      expect(measuredAmplitude(p, 'same', x, 0.05)).toBeLessThan(1e-9);
    }
  });

  it('逆位相の波源では、強め合う点と弱め合う点が入れかわる', () => {
    for (const p of CORNERS.filter((_, i) => i % 4 === 0)) {
      const sum =
        resultantAmplitude(p, 'same', p.xP, p.yP) ** 2 +
        resultantAmplitude(p, 'opposite', p.xP, p.yP) ** 2;
      // |2cos θ|² + |2sin θ|² = 4
      expect(sum).toBeCloseTo(4 * AMPLITUDE ** 2, 10);
    }
    // 垂直二等分線（経路差 0）は同位相なら腹、逆位相なら節
    expect(resultantAmplitude(DEFAULT, 'same', 0, 0.1)).toBeCloseTo(2, 12);
    expect(resultantAmplitude(DEFAULT, 'opposite', 0, 0.1)).toBeCloseTo(0, 12);
  });

  it('振幅は 0 以上 2A 以下で、y 軸について左右対称', () => {
    for (const phase of PHASES) {
      for (const p of CORNERS) {
        const a = resultantAmplitude(p, phase, p.xP, p.yP);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(2 * AMPLITUDE + 1e-12);
        expect(resultantAmplitude(p, phase, -p.xP, p.yP)).toBeCloseTo(a, 12);
      }
    }
  });
});

describe('強め合う線・弱め合う線の本数', () => {
  /** 線分 S₁S₂ 上で振幅を細かく調べ、腹（振幅 2A）と節（振幅 0）を数える */
  function countOnSegment(p: InterferenceParams, phase: SourcePhase) {
    const N = 20000;
    const amp: number[] = [];
    for (let i = 1; i < N; i++) {
      amp.push(resultantAmplitude(p, phase, -p.d / 2 + (p.d * i) / N, 0));
    }
    let antinodes = 0;
    let nodes = 0;
    for (let i = 1; i < amp.length - 1; i++) {
      const [a, b, c] = [amp[i - 1]!, amp[i]!, amp[i + 1]!];
      if (b >= a && b > c && b > 1.99) antinodes++;
      if (b <= a && b < c && b < 0.01) nodes++;
    }
    return { antinodes, nodes };
  }

  it('数値的に数えた線分 S₁S₂ 上の腹・節の数が、公式（|mλ| < d などを満たす m の数）と一致する（全隅）', () => {
    for (const phase of PHASES) {
      for (const p of CORNERS) {
        const c = countOnSegment(p, phase);
        expect(c.antinodes, JSON.stringify({ phase, p })).toBe(lineCount(p, phase, 'constructive'));
        expect(c.nodes, JSON.stringify({ phase, p })).toBe(lineCount(p, phase, 'destructive'));
      }
    }
  });

  it('入試の典型例: d = 6 cm, λ = 2 cm, 同位相 → 強め合う線 5 本・弱め合う線 6 本', () => {
    const p = { ...DEFAULT, d: 0.06, lambda: 0.02 };
    expect(lineCount(p, 'same', 'constructive')).toBe(5);
    expect(lineCount(p, 'same', 'destructive')).toBe(6);
    expect(lineCount(p, 'opposite', 'constructive')).toBe(6);
    expect(lineCount(p, 'opposite', 'destructive')).toBe(5);
  });

  it('線分 S₁S₂ 上の節の間隔は λ/2（定常波と同じ）', () => {
    const p = { ...DEFAULT, d: 0.1, lambda: 0.03 };
    const offs = lineOffsets(p, 'same', 'destructive');
    // S₁S₂ 上では r₁ − r₂ = 2x なので、x = δ/2
    for (let i = 1; i < offs.length; i++) {
      expect((offs[i]! - offs[i - 1]!) / 2).toBeCloseTo(p.lambda / 2, 12);
    }
  });
});

describe('干渉の判定と波の性質', () => {
  it('判定: 経路差 mλ は強め合う、(m+½)λ は弱め合う', () => {
    const p = DEFAULT;
    const y = 0.06;
    expect(interferenceKind(p, 'same', hyperbolaX(p, p.lambda, y), y)).toBe('constructive');
    expect(interferenceKind(p, 'same', hyperbolaX(p, 1.5 * p.lambda, y), y)).toBe('destructive');
    expect(interferenceKind(p, 'opposite', hyperbolaX(p, 1.5 * p.lambda, y), y)).toBe(
      'constructive',
    );
    expect(interferenceKind(p, 'same', hyperbolaX(p, 1.25 * p.lambda, y), y)).toBe('partial');
    expect(pathDifference(p, hyperbolaX(p, -p.lambda, y), y)).toBeCloseTo(p.lambda, 12);
  });

  it('1 つの波源からの波は速さ v = fλ で外へ進む（山が Δt 後に vΔt 先へ移る）', () => {
    for (const p of CORNERS.filter((_, i) => i % 9 === 0)) {
      const v = waveSpeed(p);
      expect(v).toBeCloseTo(FREQUENCY * p.lambda, 12);
      const t = 0.123;
      const dt = 0.037;
      const x = 0.05;
      // S₁ から右へ x 進んだ点と、さらに vΔt 進んだ点で、Δt 後の変位が同じ
      const a = displacements(p, 'same', x - p.d / 2, 0, t).y1;
      const b = displacements(p, 'same', x - p.d / 2 + v * dt, 0, t + dt).y1;
      expect(b).toBeCloseTo(a, 10);
    }
  });

  it('遠方での強め合う方向は d sin θ = mλ（双曲線の漸近線）', () => {
    const p = DEFAULT;
    for (const delta of lineOffsets(p, 'same', 'constructive')) {
      const y = 1e4;
      const x = hyperbolaX(p, delta, y);
      // θ は y 軸から測った角
      const sinTheta = x / Math.hypot(x, y);
      expect(Math.abs(p.d * sinTheta - delta) / p.lambda).toBeLessThan(1e-8);
    }
  });
});

describe('数値計算の設定', () => {
  it('ωΔt ≤ 0.04（1 周期 150 ステップ以上）', () => {
    expect(2 * Math.PI * FREQUENCY * DT).toBeLessThanOrEqual(0.04);
  });

  it('パラメータ範囲で線の本数が多すぎない（画面で見分けられる: 強め合う線は 21 本以下）', () => {
    for (const p of CORNERS) expect(lineCount(p, 'same', 'constructive')).toBeLessThanOrEqual(21);
  });
});
