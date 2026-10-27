/**
 * 気体分子運動論モデルの物理的な正しさのテスト。
 * 壁との衝突の厳密さ、力積から測った圧力と p = Nm⟨v²⟩/(3V)・状態方程式 pV = NkT の一致、
 * 温度と平均運動エネルギーの関係、マクスウェル分布を、パラメータ範囲の端も含めて確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { AVOGADRO, BOLTZMANN, GAS_CONSTANT } from '@/core/physics/constants';
import {
  DT,
  PARAMS,
  crossingTime,
  flyBetweenWalls,
  idealGasPressure,
  initialState,
  internalEnergy,
  kineticPressure,
  maxwellSpeedPdf,
  meanKineticEnergy,
  meanSquareSpeed,
  meanSquareVx,
  measuredPressure,
  measuredRightWallForce,
  moleculeMass,
  pressureBetween,
  rightWallForce,
  rmsSpeed,
  sampleTemperature,
  speeds,
  step,
  volume,
  type GasState,
  type KineticParams,
} from './model';

const CORNERS = paramCorners(PARAMS);
const DEFAULT = defaultParams(PARAMS);

function kineticEnergy(p: KineticParams, s: GasState): number {
  return 0.5 * moleculeMass(p) * meanSquareSpeed(s) * p.N;
}

/** 速度成分の絶対値の和 Σ|v_a|（衝突回数の数え方による誤差の上限に使う） */
function sumAbsVelocity(s: GasState, onlyX = false): number {
  let sum = 0;
  for (let i = 0; i < s.vel.length; i += onlyX ? 3 : 1) sum += Math.abs(s.vel[i]!);
  return sum;
}

/**
 * 時間 τ の測定で、圧力の測定値が理論値からずれうる最大値。
 * 分子 1 個・1 方向あたり、τ の間の衝突回数は |v_a|τ/L から最大 1 回ずれる（測定の始まりと終わりの端数）。
 * 1 回の力積は 2m|v_a| なので、力積の誤差は Σ 2m|v_a| 以下。これを面積 6L² と τ で割る。
 */
function pressureErrorBound(p: KineticParams, s: GasState, tau: number): number {
  return (2 * moleculeMass(p) * sumAbsVelocity(s)) / (tau * 6 * p.L * p.L);
}

describe('初期状態', () => {
  it('平均運動エネルギーがちょうど (3/2)kT（パラメータ範囲の全隅）', () => {
    for (const p of CORNERS) {
      const s = initialState(p);
      expect(relativeError(kineticEnergy(p, s) / p.N, 1.5 * BOLTZMANN * p.T)).toBeLessThan(1e-12);
      expect(relativeError(sampleTemperature(p, s), p.T)).toBeLessThan(1e-12);
    }
  });

  it('全分子が容器の中にあり、分子数は N', () => {
    for (const p of CORNERS) {
      const s = initialState(p);
      expect(s.pos.length).toBe(3 * p.N);
      for (const x of s.pos) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(p.L);
      }
    }
  });

  it('同じ N なら T を変えても速度の向きは同じで、大きさが √T に比例する', () => {
    const a = initialState(DEFAULT);
    const b = initialState({ ...DEFAULT, T: 4 * DEFAULT.T });
    for (let i = 0; i < a.vel.length; i++) {
      expect(b.vel[i]!).toBeCloseTo(2 * a.vel[i]!, 9);
    }
  });
});

describe('マクスウェル分布', () => {
  // 大きな標本で統計的な性質を確かめる（乱数の種は固定なので結果は毎回同じ）
  const big = { ...DEFAULT, N: 20000 };
  const s = initialState(big);
  const vs = speeds(s);
  const m = moleculeMass(big);
  const kT = BOLTZMANN * big.T;

  it('確率密度 f(v) を積分すると 1、最大になるのは v = √(2kT/m)', () => {
    const vmax = 6 * rmsSpeed(big);
    const n = 6000;
    let integral = 0;
    let best = 0;
    let bestV = 0;
    for (let i = 0; i < n; i++) {
      const v = ((i + 0.5) / n) * vmax;
      const f = maxwellSpeedPdf(big, v);
      integral += (f * vmax) / n;
      if (f > best) {
        best = f;
        bestV = v;
      }
    }
    // 中点則の誤差は (Δv)² 程度の相対誤差で 1e-6 より十分小さい
    expect(Math.abs(integral - 1)).toBeLessThan(1e-6);
    expect(relativeError(bestV, Math.sqrt((2 * kT) / m))).toBeLessThan(2 / n + 1e-9);
  });

  it('標本の平均の速さが √(8kT/πm) に一致する（4σ 以内）', () => {
    const mean = vs.reduce((a, v) => a + v, 0) / vs.length;
    const expected = Math.sqrt((8 * kT) / (Math.PI * m));
    // マクスウェル分布の速さの標準偏差は √(kT/m)·√(3 − 8/π) ≈ 0.67√(kT/m)
    const sigma = (Math.sqrt(kT / m) * Math.sqrt(3 - 8 / Math.PI)) / Math.sqrt(vs.length);
    expect(Math.abs(mean - expected)).toBeLessThan(4 * sigma);
  });

  it('等方的: ⟨v_x²⟩ ≈ ⟨v²⟩/3（4σ 以内）', () => {
    const ratio = meanSquareVx(s) / meanSquareSpeed(s);
    // v_x² / (kT/m) は自由度 1 のカイ二乗分布（分散 2）なので、平均の相対ゆらぎは √(2/N)
    expect(Math.abs(ratio - 1 / 3)).toBeLessThan((4 * Math.sqrt(2 / vs.length)) / 3);
  });

  it('ヒストグラムがマクスウェル分布に合う（各区間の個数がポアソンゆらぎの 4σ 以内）', () => {
    const v0 = rmsSpeed(big);
    const bins = 12;
    const width = (3 * v0) / bins;
    const counts = new Array<number>(bins).fill(0);
    for (const v of vs) {
      const k = Math.floor(v / width);
      if (k < bins) counts[k]!++;
    }
    for (let k = 0; k < bins; k++) {
      // 区間内の確率をシンプソン則で求める
      const a = k * width;
      const b = a + width;
      const prob =
        ((b - a) / 6) *
        (maxwellSpeedPdf(big, a) + 4 * maxwellSpeedPdf(big, (a + b) / 2) + maxwellSpeedPdf(big, b));
      const expected = prob * vs.length;
      expect(Math.abs(counts[k]! - expected), `区間 ${k}`).toBeLessThan(
        4 * Math.sqrt(expected) + 2,
      );
    }
  });
});

describe('壁との弾性衝突（厳密解）', () => {
  /** 細かい刻みで 1 回ずつはね返りを処理する素朴な方法（比較用） */
  function bruteForce(x0: number, v0: number, dt: number, L: number) {
    const n = 100_000;
    const h = dt / n;
    let x = x0;
    let v = v0;
    let low = 0;
    let high = 0;
    for (let i = 0; i < n; i++) {
      x += v * h;
      if (x > L) {
        x = 2 * L - x;
        v = -v;
        high++;
      } else if (x < 0) {
        x = -x;
        v = -v;
        low++;
      }
    }
    return { x, v, low, high };
  }

  it('何回はね返っても、位置・速度・各壁への衝突回数が素朴な計算と一致する', () => {
    const L = 0.1;
    for (const [x0, v] of [
      [0.03, 1.7],
      [0.08, -2.9],
      [0.05, 0.4],
      [0.01, -0.05],
      [0.099, 11.3],
    ] as const) {
      const f = flyBetweenWalls(x0, v, 1, L);
      const b = bruteForce(x0, v, 1, L);
      expect(f.x).toBeCloseTo(b.x, 4);
      expect(f.v).toBe(b.v);
      expect(f.hitsLow).toBe(b.low);
      expect(f.hitsHigh).toBe(b.high);
    }
  });

  it('壁に当たらない区間では等速直線運動', () => {
    const f = flyBetweenWalls(0.02, 3, 0.01, 0.1);
    expect(f.x).toBeCloseTo(0.05, 14);
    expect(f.v).toBe(3);
    expect(f.hitsLow + f.hitsHigh).toBe(0);
  });

  it('速さと運動エネルギーが厳密に保存され、分子は常に容器の中にある', () => {
    for (const p of CORNERS) {
      let s = initialState(p);
      const e0 = kineticEnergy(p, s);
      const v0 = speeds(s);
      const dt = 7.3 * crossingTime(p); // 半端な長さで何度もはね返らせる
      for (let i = 0; i < 5; i++) s = step(p, s, dt);
      expect(relativeError(kineticEnergy(p, s), e0)).toBeLessThan(1e-12);
      speeds(s).forEach((v, i) => expect(relativeError(v, v0[i]!)).toBeLessThan(1e-12));
      for (const x of s.pos) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(p.L);
      }
    }
  });

  it('刻み幅によらない: 1 ステップで τ 進めても、細かく 1000 ステップに分けても同じ結果', () => {
    const tau = 3.3 * crossingTime(DEFAULT);
    const big = step(DEFAULT, initialState(DEFAULT), tau);
    let fine = initialState(DEFAULT);
    for (let i = 0; i < 1000; i++) fine = step(DEFAULT, fine, tau / 1000);
    expect(fine.hits).toBe(big.hits);
    expect(relativeError(fine.impulse, big.impulse)).toBeLessThan(1e-12);
    expect(relativeError(fine.t, big.t)).toBeLessThan(1e-12);
    for (let i = 0; i < big.pos.length; i++) {
      expect(Math.abs(fine.pos[i]! - big.pos[i]!)).toBeLessThan(1e-12 * DEFAULT.L * 1000);
    }
  });
});

describe('圧力: 力積から測った値と p = Nm⟨v²⟩/(3V) の一致', () => {
  it('分子運動論の式 p = Nm⟨v²⟩/(3V) と状態方程式 p = NkT/V が一致する（全隅）', () => {
    for (const p of CORNERS) {
      const s = initialState(p);
      expect(relativeError(kineticPressure(p, s), idealGasPressure(p))).toBeLessThan(1e-12);
    }
  });

  it('時間平均した圧力が理論値と一致する（全隅。誤差は衝突回数の端数による上限以内で、3% 未満）', () => {
    for (const p of CORNERS) {
      const s0 = initialState(p);
      const tau = 100 * crossingTime(p);
      const s = step(p, s0, tau);
      const theory = kineticPressure(p, s0);
      const bound = pressureErrorBound(p, s0, tau);
      expect(Math.abs(measuredPressure(p, s) - theory), JSON.stringify(p)).toBeLessThanOrEqual(
        bound * (1 + 1e-9),
      );
      // 端数による誤差は 1 方向あたり 1 回分なので、τ = 100 L/√⟨v²⟩ なら相対誤差は約 3/100 以下
      expect(bound / theory, JSON.stringify(p)).toBeLessThan(0.03);
    }
  });

  it('実際の刻み幅 DT で動かしても、時間平均の圧力が状態方程式 pV = NkT を満たす', () => {
    const p = DEFAULT;
    let s = initialState(p);
    const n = Math.round((30 * crossingTime(p)) / DT);
    for (let i = 0; i < n; i++) s = step(p, s, DT);
    const ratio = (measuredPressure(p, s) * volume(p)) / (p.N * BOLTZMANN * p.T);
    const bound = pressureErrorBound(p, s, s.t) / idealGasPressure(p);
    expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(bound * (1 + 1e-9));
    expect(Math.abs(ratio - 1)).toBeLessThan(0.1);
  });

  it('x = L の壁が受ける平均の力が F = Nm⟨v_x²⟩/L に一致する（全隅）', () => {
    for (const p of CORNERS) {
      const s0 = initialState(p);
      const tau = 100 * crossingTime(p);
      const s = step(p, s0, tau);
      // 1 個の分子が x = L の壁に当たる回数は |v_x|τ/(2L) から最大 1 回ずれる
      const bound = (2 * moleculeMass(p) * sumAbsVelocity(s0, true)) / tau;
      expect(Math.abs(measuredRightWallForce(s) - rightWallForce(p, s0))).toBeLessThanOrEqual(
        bound * (1 + 1e-9),
      );
    }
  });

  it('1 個の分子が x = L の壁に当たる間隔は 2L/|v_x|', () => {
    const s0 = initialState(DEFAULT);
    const vx = Math.abs(s0.vel[0]!);
    const tau = 50 * crossingTime(DEFAULT);
    const s = step(DEFAULT, s0, tau);
    expect(Math.abs(s.trackedHitsRight - (vx * tau) / (2 * DEFAULT.L))).toBeLessThanOrEqual(1);
  });

  it('区間の平均の圧力は、区間を合わせると全体の時間平均になる', () => {
    const s0 = initialState(DEFAULT);
    const s1 = step(DEFAULT, s0, 10 * crossingTime(DEFAULT));
    const s2 = step(DEFAULT, s1, 30 * crossingTime(DEFAULT));
    const whole = pressureBetween(DEFAULT, s0, s2);
    const parts =
      (pressureBetween(DEFAULT, s0, s1) * s1.t + pressureBetween(DEFAULT, s1, s2) * (s2.t - s1.t)) /
      s2.t;
    expect(relativeError(parts, whole)).toBeLessThan(1e-12);
    expect(relativeError(measuredPressure(DEFAULT, s2), whole)).toBeLessThan(1e-12);
  });
});

describe('ボイル・シャルルの法則と相似則', () => {
  it('温度を 4 倍にすると、同じ軌道を半分の時間でたどり、測った圧力は厳密に 4 倍', () => {
    const p1 = DEFAULT;
    const p4 = { ...DEFAULT, T: 4 * DEFAULT.T };
    const tau = 20 * crossingTime(p1);
    const a = step(p1, initialState(p1), tau);
    const b = step(p4, initialState(p4), tau / 2);
    expect(b.hits).toBe(a.hits);
    expect(relativeError(measuredPressure(p4, b), 4 * measuredPressure(p1, a))).toBeLessThan(1e-9);
  });

  it('体積一定なら p ∝ T、温度一定なら p ∝ 1/V、分子数に比例', () => {
    const p0 = idealGasPressure(DEFAULT);
    expect(idealGasPressure({ ...DEFAULT, T: 2 * DEFAULT.T }) / p0).toBeCloseTo(2, 12);
    expect(idealGasPressure({ ...DEFAULT, L: 2 * DEFAULT.L }) / p0).toBeCloseTo(1 / 8, 12);
    expect(idealGasPressure({ ...DEFAULT, N: 3 * DEFAULT.N }) / p0).toBeCloseTo(3, 12);
  });

  it('pV = nRT（n = N/N_A）の形でも成り立つ', () => {
    for (const p of CORNERS) {
      const n = p.N / AVOGADRO;
      expect(relativeError(idealGasPressure(p) * volume(p), n * GAS_CONSTANT * p.T)).toBeLessThan(
        1e-12,
      );
    }
  });
});

describe('温度と分子の運動', () => {
  it('二乗平均速度 √⟨v²⟩ = √(3RT/M) = √(3kT/m) が標本の値と一致する', () => {
    for (const p of CORNERS) {
      const v = rmsSpeed(p);
      expect(relativeError(v, Math.sqrt((3 * BOLTZMANN * p.T) / moleculeMass(p)))).toBeLessThan(
        1e-12,
      );
      expect(relativeError(Math.sqrt(meanSquareSpeed(initialState(p))), v)).toBeLessThan(1e-12);
    }
  });

  it('教科書の値: 300 K の He は約 1.37×10³ m/s、H₂ は約 1.93×10³ m/s', () => {
    expect(rmsSpeed({ ...DEFAULT, T: 300, M: 4 })).toBeCloseTo(1367.6, 0);
    expect(rmsSpeed({ ...DEFAULT, T: 300, M: 2 })).toBeCloseTo(1934.1, 0);
  });

  it('同じ温度なら分子の種類（M）によらず平均運動エネルギーは等しい', () => {
    const he = { ...DEFAULT, M: 4 };
    const ar = { ...DEFAULT, M: 40 };
    expect(meanKineticEnergy(he)).toBe(meanKineticEnergy(ar));
    const ke = (p: KineticParams) => 0.5 * moleculeMass(p) * meanSquareSpeed(initialState(p));
    expect(relativeError(ke(he), ke(ar))).toBeLessThan(1e-12);
    // 速さは √M に反比例
    expect(rmsSpeed(he) / rmsSpeed(ar)).toBeCloseTo(Math.sqrt(10), 12);
  });

  it('内部エネルギー U = (3/2)nRT は全分子の運動エネルギーの和', () => {
    for (const p of CORNERS) {
      const s = initialState(p);
      expect(relativeError(internalEnergy(p), kineticEnergy(p, s))).toBeLessThan(1e-12);
      expect(
        relativeError(internalEnergy(p), 1.5 * (p.N / AVOGADRO) * GAS_CONSTANT * p.T),
      ).toBeLessThan(1e-12);
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で、1 ステップに分子が進む距離は容器の一辺の 5% 以下（描画が飛ばない）', () => {
    for (const p of CORNERS) {
      const vmax = Math.max(...speeds(initialState(p)));
      expect(vmax * DT, JSON.stringify(p)).toBeLessThanOrEqual(0.05 * p.L);
    }
  });
});
