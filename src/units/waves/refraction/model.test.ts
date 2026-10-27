/**
 * 光の屈折と全反射モデルの物理的な正しさのテスト。
 * 屈折の法則・臨界角を公式で確かめるだけでなく、波（電場）が境界面で連続になること、
 * 反射と透過でエネルギーが保存されること（R + T = 1）、フェルマーの原理（光学距離最小）から
 * 求めた道すじが屈折の法則を満たすことを、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { SPEED_OF_LIGHT } from '@/core/physics/constants';
import {
  DT,
  PARAMS,
  criticalAngle,
  electricField,
  fermatCrossing,
  fresnel,
  incidenceAngle,
  initialState,
  isTotalReflection,
  lightFrequency,
  reflectance,
  refractionAngle,
  relativeIndex,
  speedIn,
  step,
  transmittance,
  wavelengthIn,
  type RefractionParams,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const DEG = Math.PI / 180;

describe('屈折の法則と臨界角', () => {
  it('空気 → ガラス（n = 1.5）、入射角 30° → 屈折角 19.47°', () => {
    const p = { ...DEFAULT, n1: 1, n2: 1.5, theta1: 30 };
    expect(refractionAngle(p) / DEG).toBeCloseTo(Math.asin(1 / 3) / DEG, 10);
    expect(relativeIndex(p)).toBeCloseTo(1.5, 12);
  });

  it('全隅で n₁ sin θ₁ = n₂ sin θ₂（全反射でなければ）', () => {
    for (const p of CORNERS) {
      if (isTotalReflection(p)) continue;
      const lhs = p.n1 * Math.sin(incidenceAngle(p));
      expect(Math.abs(lhs - p.n2 * Math.sin(refractionAngle(p)))).toBeLessThan(1e-12);
    }
  });

  it('臨界角: ガラス（1.5）→ 空気で sin θc = 1/1.5（41.8°）。それを超えると全反射', () => {
    const p = { ...DEFAULT, n1: 1.5, n2: 1 };
    expect(criticalAngle(p) / DEG).toBeCloseTo(Math.asin(1 / 1.5) / DEG, 10);
    expect(isTotalReflection({ ...p, theta1: 41 })).toBe(false);
    expect(isTotalReflection({ ...p, theta1: 42 })).toBe(true);
    expect(refractionAngle({ ...p, theta1: 42 })).toBeNaN();
    // 屈折率の小さい媒質から大きい媒質へは全反射しない
    expect(criticalAngle({ ...p, n1: 1, n2: 1.5 })).toBeNaN();
    for (const q of CORNERS) if (q.n1 <= q.n2) expect(isTotalReflection(q)).toBe(false);
  });

  it('垂直入射（θ₁ = 0）は曲がらず、同じ屈折率なら直進する', () => {
    for (const p of CORNERS) {
      expect(refractionAngle({ ...p, theta1: 0 })).toBeCloseTo(0, 15);
      if (p.n1 === p.n2) expect(refractionAngle(p)).toBeCloseTo(incidenceAngle(p), 12);
    }
  });

  it('媒質中の速さ・波長は 1/n 倍、振動数は変わらない（v = fλ）', () => {
    for (const p of CORNERS) {
      for (const m of [1, 2] as const) {
        expect(relativeError(speedIn(p, m), lightFrequency(p) * wavelengthIn(p, m))).toBeLessThan(
          1e-12,
        );
      }
      expect(relativeError(speedIn(p, 1) / speedIn(p, 2), p.n2 / p.n1)).toBeLessThan(1e-12);
      expect(relativeError(lightFrequency(p), SPEED_OF_LIGHT / (p.lambda0 * 1e-9))).toBeLessThan(
        1e-12,
      );
    }
  });
});

describe('フェルマーの原理（独立な検証）', () => {
  it('光学距離が最小になる道すじは、全隅で屈折の法則を満たす', () => {
    for (const p of CORNERS) {
      if (isTotalReflection(p) || p.theta1 === 0) continue;
      // 屈折の法則で決まる光線上の 2 点を A, B とし、その間の最短光路を独立に探す
      const th1 = incidenceAngle(p);
      const th2 = refractionAngle(p);
      const A = { x: -Math.sin(th1), y: Math.cos(th1) };
      const B = { x: Math.sin(th2), y: -Math.cos(th2) };
      const x = fermatCrossing(p, A, B);
      // 関数値の比較で最小点を探すので、位置の精度は √(ε·L/L″) 程度が限界
      // （L は光学距離、L″ = n₁cos²θ₁/AP + n₂cos²θ₂/PB は最小点での曲率。斜め入射ほど平らで粗くなる）
      const opl = p.n1 + p.n2;
      const curv = p.n1 * Math.cos(th1) ** 2 + p.n2 * Math.cos(th2) ** 2;
      const bound = 10 * Math.sqrt((Number.EPSILON * opl) / curv);
      expect(Math.abs(x), JSON.stringify(p)).toBeLessThan(bound);
    }
  });

  it('逆に、任意の 2 点を結ぶ最短光路の角度が n₁ sin θ₁ = n₂ sin θ₂ を満たす', () => {
    const p = { n1: 1.33, n2: 1.0 };
    const A = { x: -0.3, y: 0.5 };
    const B = { x: 0.7, y: -0.2 };
    const x = fermatCrossing(p, A, B);
    const sin1 = (x - A.x) / Math.hypot(x - A.x, A.y);
    const sin2 = (B.x - x) / Math.hypot(B.x - x, B.y);
    // 最小点の位置の精度 √ε ≈ 1.5e-8 の数倍まで
    expect(Math.abs(p.n1 * sin1 - p.n2 * sin2)).toBeLessThan(1e-7);
  });
});

describe('波としての光（電場の連続性とエネルギー保存）', () => {
  /** 境界面のすぐ上と下で電場と傾き ∂E/∂y を比べる */
  function boundaryMismatch(p: RefractionParams) {
    const lam = wavelengthIn(p, 1);
    const h = lam * 1e-6;
    let maxE = 0;
    let maxD = 0;
    for (const x of [-1.3, -0.2, 0.45, 2.1].map((c) => c * lam)) {
      for (const tau of [0, 0.13, 0.61]) {
        const up = electricField(p, x, 0, tau);
        const down = electricField(p, x, -1e-30, tau);
        maxE = Math.max(maxE, Math.abs(up - down));
        const dUp = (electricField(p, x, 2 * h, tau) - electricField(p, x, h, tau)) / h;
        const dDown = (electricField(p, x, -h, tau) - electricField(p, x, -2 * h, tau)) / h;
        // 傾きは波数（〜2π/λ）で割って無次元にして比べる
        maxD = Math.max(maxD, (Math.abs(dUp - dDown) * lam) / (2 * Math.PI));
      }
    }
    return { maxE, maxD };
  }

  it('全隅（全反射を含む）で、境界面の上下で電場とその傾きが連続', () => {
    for (const p of CORNERS) {
      const m = boundaryMismatch(p);
      expect(m.maxE, JSON.stringify(p)).toBeLessThan(1e-9);
      // 片側差分の誤差 ~ k·h（h = λ·1e-6）程度
      expect(m.maxD, JSON.stringify(p)).toBeLessThan(1e-4);
    }
  });

  it('エネルギー保存: 反射率 + 透過率 = 1（全隅）', () => {
    for (const p of CORNERS) {
      const R = reflectance(p);
      const T = transmittance(p);
      expect(R).toBeGreaterThanOrEqual(0);
      expect(T).toBeGreaterThanOrEqual(0);
      expect(Math.abs(R + T - 1), JSON.stringify(p)).toBeLessThan(1e-12);
    }
  });

  it('全反射では反射率 1、媒質 2 側の波は奥へ行くほど指数関数的に弱まる', () => {
    const p = { ...DEFAULT, n1: 1.5, n2: 1, theta1: 60 };
    expect(reflectance(p)).toBeCloseTo(1, 12);
    expect(transmittance(p)).toBe(0);
    const lam = wavelengthIn(p, 1);
    const amp = (y: number) =>
      Math.max(...Array.from({ length: 50 }, (_, i) => Math.abs(electricField(p, 0, y, i / 50))));
    expect(amp(-2 * lam)).toBeLessThan(0.05 * amp(0));
  });

  it('垂直入射の反射率は ((n₁ − n₂)/(n₁ + n₂))²（空気 → ガラスで 4%）', () => {
    const p = { ...DEFAULT, n1: 1, n2: 1.5, theta1: 0 };
    expect(reflectance(p)).toBeCloseTo(0.04, 12);
    expect(fresnel({ ...p, n2: 1 }).r.re).toBeCloseTo(0, 15);
  });

  it('屈折波の山（波面）の間隔は媒質 2 中の波長 λ₀/n₂、境界面に沿った周期は両側で等しい', () => {
    for (const p of CORNERS) {
      if (isTotalReflection(p)) continue;
      const lam2 = wavelengthIn(p, 2);
      const th2 = refractionAngle(p);
      // 屈折波の進む向きに λ₂ だけ進んだ点は同じ位相
      const P = { x: 0.3 * lam2, y: -0.5 * lam2 };
      const Q = { x: P.x + lam2 * Math.sin(th2), y: P.y - lam2 * Math.cos(th2) };
      expect(electricField(p, Q.x, Q.y, 0.2)).toBeCloseTo(electricField(p, P.x, P.y, 0.2), 9);
      // 境界面に沿った見かけの波長 λ₁/sin θ₁ = λ₂/sin θ₂（位相のつながり＝屈折の法則）
      if (p.theta1 > 0) {
        expect(
          relativeError(wavelengthIn(p, 1) / Math.sin(incidenceAngle(p)), lam2 / Math.sin(th2)),
        ).toBeLessThan(1e-12);
      }
    }
  });

  it('時間発展: 1 周期進むと同じ電場に戻る', () => {
    const p = DEFAULT;
    let s = initialState();
    for (let i = 0; i < Math.round(1 / DT); i++) s = step(s, DT);
    expect(electricField(p, 1e-7, 2e-7, s.tau)).toBeCloseTo(electricField(p, 1e-7, 2e-7, 0), 9);
    expect(electricField(p, 1e-7, -2e-7, s.tau)).toBeCloseTo(electricField(p, 1e-7, -2e-7, 0), 9);
  });
});

describe('数値計算の設定', () => {
  it('1 周期を 100 ステップ以上で描く', () => {
    expect(1 / DT).toBeGreaterThanOrEqual(100);
  });
});
