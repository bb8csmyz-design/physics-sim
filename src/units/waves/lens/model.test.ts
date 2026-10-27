/**
 * 薄いレンズの像モデルの物理的な正しさのテスト。
 * レンズの式・倍率の公式に加え、
 *  (1) 物体の先端から出る多数の光線を薄いレンズの規則で追跡すると、すべて 1 点（像）に集まること
 *  (2) 球面でできた実際のレンズを屈折の法則で厳密に光線追跡すると、近軸光線がレンズの式どおりの点に集まること
 * をパラメータ範囲の全隅で確かめる（(2) は公式とは独立な検証）。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  A_MAX,
  A_MIN,
  DT,
  PARAMS,
  focalLength,
  hasStopped,
  imageDistance,
  imageHeight,
  imageKind,
  imageVelocity,
  initialState,
  magnification,
  objectDistance,
  outgoingSlope,
  principalRayHeights,
  step,
  type LensKind,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const KINDS: readonly LensKind[] = ['convex', 'concave'];
/** 調べる物体の位置（焦点の内側・外側・2 倍の位置の前後を含む） */
const DISTANCES = [0.02, 0.04, 0.07, 0.13, 0.25, 0.4, 0.55];

/**
 * 光線（点 (x0, y0) を通り傾き s の直線）の集まりの交点を最小二乗で求める。
 * 虚像のときはレンズを出た光線を後ろへ延長した交点になる。
 */
function leastSquaresIntersection(rays: { x0: number; y0: number; s: number }[]) {
  // y = y0 + s (x − x0) をすべて満たす (x, y) → 行列 [s −1] [x y]ᵀ = s x0 − y0
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b1 = 0;
  let b2 = 0;
  for (const r of rays) {
    const c = r.s * r.x0 - r.y0;
    a11 += r.s * r.s;
    a12 += -r.s;
    a22 += 1;
    b1 += r.s * c;
    b2 += -c;
  }
  const det = a11 * a22 - a12 * a12;
  return { x: (b1 * a22 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det };
}

describe('レンズの式と倍率', () => {
  it('凸レンズ f = 10 cm: a = 30 cm → b = 15 cm の実像（倒立・0.5 倍）', () => {
    const p = { ...DEFAULT, F: 0.1 };
    expect(imageDistance('convex', 0.3, p)).toBeCloseTo(0.15, 12);
    expect(magnification('convex', 0.3, p)).toBeCloseTo(0.5, 12);
    expect(imageKind('convex', 0.3, p)).toBe('real');
    expect(imageHeight('convex', 0.3, p)).toBeLessThan(0);
  });

  it('凸レンズ f = 10 cm: a = 5 cm → b = −10 cm の虚像（正立・2 倍、虫めがね）', () => {
    const p = { ...DEFAULT, F: 0.1 };
    expect(imageDistance('convex', 0.05, p)).toBeCloseTo(-0.1, 12);
    expect(magnification('convex', 0.05, p)).toBeCloseTo(2, 12);
    expect(imageKind('convex', 0.05, p)).toBe('virtual');
    expect(imageHeight('convex', 0.05, p)).toBeCloseTo(2 * p.h, 12);
  });

  it('凹レンズ f = −10 cm: a = 10 cm → b = −5 cm の虚像（正立・0.5 倍）', () => {
    const p = { ...DEFAULT, F: 0.1 };
    expect(focalLength('concave', p)).toBe(-0.1);
    expect(imageDistance('concave', 0.1, p)).toBeCloseTo(-0.05, 12);
    expect(magnification('concave', 0.1, p)).toBeCloseTo(0.5, 12);
  });

  it('a = 2f で等倍の実像、a = f で像はできない、a → ∞ で像は焦点へ', () => {
    for (const p of CORNERS) {
      expect(imageDistance('convex', 2 * p.F, p)).toBeCloseTo(2 * p.F, 12);
      expect(magnification('convex', 2 * p.F, p)).toBeCloseTo(1, 12);
      expect(imageKind('convex', p.F, p)).toBe('none');
      expect(relativeError(imageDistance('convex', 1e6, p), p.F)).toBeLessThan(1e-6);
    }
  });

  it('凹レンズの像は、どこに物体を置いても虚像・正立・縮小で、レンズと焦点の間にできる', () => {
    for (const p of CORNERS) {
      for (const a of DISTANCES) {
        const b = imageDistance('concave', a, p);
        expect(imageKind('concave', a, p)).toBe('virtual');
        expect(magnification('concave', a, p)).toBeLessThan(1);
        expect(imageHeight('concave', a, p)).toBeGreaterThan(0);
        expect(-b).toBeLessThan(p.F);
      }
    }
  });

  it('全隅で 1/a + 1/b = 1/f を満たす', () => {
    for (const kind of KINDS) {
      for (const p of CORNERS) {
        for (const a of DISTANCES) {
          if (kind === 'convex' && a === p.F) continue;
          const b = imageDistance(kind, a, p);
          expect(Math.abs(1 / a + 1 / b - 1 / focalLength(kind, p)) * p.F).toBeLessThan(1e-9);
        }
      }
    }
  });
});

describe('光線追跡（薄いレンズの規則）', () => {
  it('物体の先端から出た光線は、全隅でレンズの式が与える像の点に集まる（虚像は延長線が集まる）', () => {
    for (const kind of KINDS) {
      for (const p of CORNERS) {
        for (const a of DISTANCES) {
          if (Math.abs(a - p.F) < 1e-9) continue;
          const rays = [-0.04, -0.02, 0, 0.01, 0.03, 0.05].map((yL) => ({
            x0: 0,
            y0: yL,
            s: outgoingSlope(kind, a, p, yL),
          }));
          const img = leastSquaresIntersection(rays);
          const b = imageDistance(kind, a, p);
          const tag = JSON.stringify({ kind, a, p });
          expect(relativeError(img.x, b), tag).toBeLessThan(1e-9);
          expect(Math.abs(img.y - imageHeight(kind, a, p)) / p.h, tag).toBeLessThan(1e-8);
        }
      }
    }
  });

  it('作図の 3 本の光線: ① は焦点を通り、② は直進し、③ は光軸に平行に出る', () => {
    for (const kind of KINDS) {
      const p = DEFAULT;
      const a = 0.3;
      const f = focalLength(kind, p);
      const [y1, y2, y3] = principalRayHeights(kind, a, p) as [number, number, number];
      // ① 出た光線（またはその延長）は x = f で光軸と交わる
      expect(y1 + outgoingSlope(kind, a, p, y1) * f).toBeCloseTo(0, 12);
      // ② 入る前と後で傾きが同じ
      expect(outgoingSlope(kind, a, p, y2)).toBeCloseTo((0 - p.h) / a, 12);
      // ③ 出た後は光軸に平行
      expect(outgoingSlope(kind, a, p, y3)).toBeCloseTo(0, 12);
    }
  });
});

/**
 * 公式とは独立な検証: 球面 2 枚でできた実際のレンズ（屈折率 n）を、屈折の法則で厳密に光線追跡する。
 * 両凸レンズは曲率半径 R の球面 2 枚、両凹は逆向き。薄いレンズの焦点距離はレンズメーカーの式
 * 1/f = (n − 1)(2/R) になるはず。
 */
function traceThroughSphericalLens(
  kind: LensKind,
  f: number,
  a: number,
  h: number,
  yL: number,
): { x: number; y: number; dx: number; dy: number } {
  const n = 1.5;
  const R = 2 * (n - 1) * Math.abs(f); // レンズメーカーの式から
  const aperture = 0.002;
  const sag = R - Math.sqrt(R * R - aperture * aperture);
  // 両凸: 中心の厚さ 2·sag + 0.1 mm。両凹: 中心の厚さ 0.1 mm（縁が厚い）
  const half = kind === 'convex' ? sag + 5e-5 : 5e-5;
  // 面 1（左）・面 2（右）の球の中心
  const c1 = kind === 'convex' ? -half + R : -half - R;
  const c2 = kind === 'convex' ? half - R : half + R;
  let pos = { x: -a, y: h };
  let dir = normalize({ x: a, y: yL - h });
  const refract = (center: number, n1: number, n2: number, takeNear: boolean) => {
    // 光線と球 |p − (center, 0)| = R の交点
    const ox = pos.x - center;
    const oy = pos.y;
    const B = ox * dir.x + oy * dir.y;
    const C = ox * ox + oy * oy - R * R;
    const disc = Math.sqrt(B * B - C);
    const t = takeNear ? -B - disc : -B + disc;
    pos = { x: pos.x + t * dir.x, y: pos.y + t * dir.y };
    let nrm = normalize({ x: pos.x - center, y: pos.y });
    if (nrm.x * dir.x + nrm.y * dir.y > 0) nrm = { x: -nrm.x, y: -nrm.y };
    // ベクトル形の屈折の法則
    const eta = n1 / n2;
    const cosi = -(nrm.x * dir.x + nrm.y * dir.y);
    const k = 1 - eta * eta * (1 - cosi * cosi);
    const c = eta * cosi - Math.sqrt(k);
    dir = normalize({ x: eta * dir.x + c * nrm.x, y: eta * dir.y + c * nrm.y });
  };
  // 両凸: 面 1 は中心が右にある球の左側（近い交点）、面 2 は中心が左にある球の右側（遠い交点）
  refract(c1, 1, n, kind === 'convex');
  refract(c2, n, 1, kind !== 'convex');
  return { x: pos.x, y: pos.y, dx: dir.x, dy: dir.y };
}

function normalize(v: { x: number; y: number }) {
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
}

describe('球面レンズの厳密な光線追跡（独立な検証）', () => {
  it('近軸光線が、屈折の法則だけからレンズの式どおりの像の点に集まる（全隅）', () => {
    // レンズの式は近軸（光軸に近く、傾きの小さい光線）での近似。物体の高さを 1 mm に下げて
    // 近軸の条件で調べる（像の位置は物体の高さによらず、像の高さは物体の高さに比例する）
    const hp = 1e-3;
    for (const kind of KINDS) {
      for (const p of CORNERS) {
        for (const a of [0.04, 0.13, 0.25, 0.55]) {
          if (kind === 'convex' && Math.abs(a - p.F) < 0.02) continue; // 像が無限遠に近いと交点が不安定
          const f = focalLength(kind, p);
          const rays = [-1e-3, -5e-4, 5e-4, 1e-3].map((yL) => {
            const r = traceThroughSphericalLens(kind, f, a, hp, yL);
            return { x0: r.x, y0: r.y, s: r.dy / r.dx };
          });
          const img = leastSquaresIntersection(rays);
          const b = imageDistance(kind, a, p);
          const tag = JSON.stringify({ kind, a, p });
          // 差はレンズの厚さ（約 0.1 mm、厚さ/f ≲ 2e-3 の補正）と球面収差（(開口/f)² ≲ 4e-4）による。
          // 像が遠い（b が大きい）ほど同じ角度の誤差が大きく現れるので、|b| に対して 1% 以内とする
          expect(Math.abs(img.x - b), tag).toBeLessThan(0.01 * Math.max(Math.abs(b), p.F));
          const mExact = -b / a;
          expect(Math.abs(img.y / hp - mExact), tag).toBeLessThan(
            0.02 * Math.max(Math.abs(mExact), 1),
          );
        }
      }
    }
  });

  it('対照実験: 光軸から離れた物体（h/f が大きい）では収差が出て、レンズの式からずれる', () => {
    const p = { ...DEFAULT, F: 0.05 };
    const a = 0.13;
    const rays = [-1e-3, 1e-3].map((yL) => {
      const r = traceThroughSphericalLens('convex', 0.05, a, 0.02, yL);
      return { x0: r.x, y0: r.y, s: r.dy / r.dx };
    });
    const img = leastSquaresIntersection(rays);
    expect(relativeError(img.x, imageDistance('convex', a, p))).toBeGreaterThan(0.02);
  });
});

describe('物体の移動と像の移動', () => {
  it('物体は a = a₀ − vt で動き、可動範囲の端で止まる（全隅）', () => {
    for (const p of CORNERS) {
      let s = initialState(p);
      let maxErr = 0;
      for (let i = 0; i < 2000; i++) {
        s = step(p, s, DT);
        const free = p.a0 - p.v * s.t;
        const expected = Math.min(A_MAX, Math.max(A_MIN, free));
        maxErr = Math.max(maxErr, Math.abs(s.a - expected));
      }
      expect(maxErr).toBeLessThan(1e-12);
      if (p.v !== 0) expect(hasStopped(p, s)).toBe(true);
      else expect(s.a).toBe(p.a0);
    }
    expect(objectDistance({ ...DEFAULT, v: 0.05 }, 1e3)).toBe(A_MIN);
  });

  it('像の速さは db/dt = −(b/a)² da/dt（縦倍率 = 横倍率の 2 乗）。数値微分と一致する', () => {
    for (const kind of KINDS) {
      for (const p of CORNERS.filter((q) => q.v !== 0)) {
        for (const a of [0.04, 0.3]) {
          if (kind === 'convex' && Math.abs(a - p.F) < 0.02) continue;
          const da = 1e-7;
          const numeric =
            (imageDistance(kind, a - da, p) - imageDistance(kind, a + da, p)) / (2 * da);
          // 物体がレンズに近づく（da/dt = −v）とき
          expect(relativeError(imageVelocity(kind, a, p, -p.v), numeric * p.v)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('凸レンズに物体が近づくと、実像は遠ざかり、焦点を越えると虚像になる', () => {
    const p = { ...DEFAULT, F: 0.1, a0: 0.4, v: 0.04 };
    let s = initialState(p);
    let lastB = imageDistance('convex', s.a, p);
    let sawVirtual = false;
    for (let i = 0; i < 1000 && !hasStopped(p, s); i++) {
      s = step(p, s, DT);
      const b = imageDistance('convex', s.a, p);
      if (s.a > p.F) expect(b).toBeGreaterThan(lastB); // 実像はだんだん遠く・大きく
      if (s.a < p.F) {
        expect(imageKind('convex', s.a, p)).toBe('virtual');
        sawVirtual = true;
      }
      lastB = b;
    }
    expect(sawVirtual).toBe(true);
  });
});
