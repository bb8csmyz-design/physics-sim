/**
 * 点電荷の電場・電位と試験電荷の運動の物理的な正しさのテスト。
 * 公式（kQ/r, 重ね合わせ）、E = −∇V、解析解（クーロン力による直線運動）、
 * エネルギー保存、電気力線と等電位線の幾何学的な性質を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { contourSegments, sampleGrid } from '@/core/contour';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { COULOMB_CONSTANT } from '@/core/physics/constants';
import {
  CHARGE_RADIUS,
  DT,
  NANO,
  PARAMS,
  REGION,
  TEST_CHARGE,
  TEST_MASS,
  charges,
  energies,
  equipotentialLevels,
  field,
  fieldLines,
  initialState,
  lineCount,
  midpointValues,
  potential,
  radialTime,
  safeStepSize,
  step,
  type FieldParams,
  type TestChargeState,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
/** 電場は試験電荷の初期位置によらないので、場の検査は (Q_A, Q_B, d) の組だけで足りる */
const FIELD_CORNERS = CORNERS.filter((p) => p.x0 === DEFAULT.x0 && p.y0 === DEFAULT.y0);

/** 止まるか duration 秒たつまで動かす */
function simulate(p: FieldParams, duration: number, s0 = initialState(p)) {
  const states: TestChargeState[] = [s0];
  let s = s0;
  const n = Math.round(duration / DT);
  for (let i = 1; i <= n && s.status === 'moving'; i++) {
    s = step(p, s, DT);
    states.push(s);
  }
  return states;
}

/** 全隅の 6 秒間の運動（複数のテストで共有する） */
const CORNER_RUNS = new Map<FieldParams, TestChargeState[]>();
function cornerRun(p: FieldParams): TestChargeState[] {
  let r = CORNER_RUNS.get(p);
  if (!r) CORNER_RUNS.set(p, (r = simulate(p, 6)));
  return r;
}

const LINES = new Map<FieldParams, ReturnType<typeof fieldLines>>();
function linesOf(p: FieldParams) {
  let r = LINES.get(p);
  if (!r) LINES.set(p, (r = fieldLines(p)));
  return r;
}

describe('点電荷の電位と電場の公式', () => {
  it('電荷 1 つ: V = kQ/r, E = kQ/r²（向きは電荷から外向き）', () => {
    const p = { ...DEFAULT, QA: 3, QB: 0 };
    const A = charges(p)[0]!;
    const r = 0.12;
    const x = A.x + r * Math.cos(0.7);
    const y = A.y + r * Math.sin(0.7);
    const Q = 3 * NANO;
    expect(relativeError(potential(p, x, y), (COULOMB_CONSTANT * Q) / r)).toBeLessThan(1e-12);
    const E = field(p, x, y);
    expect(relativeError(Math.hypot(E.x, E.y), (COULOMB_CONSTANT * Q) / r ** 2)).toBeLessThan(
      1e-12,
    );
    expect(Math.atan2(E.y, E.x)).toBeCloseTo(0.7, 12);
  });

  it('k = 9.0×10⁹ N·m²/C² なので、1 nC から 0.1 m の電位は約 90 V', () => {
    const p = { ...DEFAULT, QA: 1, QB: 0 };
    const A = charges(p)[0]!;
    expect(potential(p, A.x + 0.1, A.y)).toBeCloseTo(89.88, 1);
  });

  it('重ね合わせ: 2 つの電荷の電位・電場はそれぞれの和', () => {
    for (const p of CORNERS) {
      const pa = { ...p, QB: 0 };
      const pb = { ...p, QA: 0 };
      const [x, y] = [0.07, -0.11];
      expect(potential(p, x, y)).toBeCloseTo(potential(pa, x, y) + potential(pb, x, y), 9);
      expect(field(p, x, y).x).toBeCloseTo(field(pa, x, y).x + field(pb, x, y).x, 9);
    }
  });

  it('E = −∇V（電場は電位の下がる向きで、大きさは電位の傾き）', () => {
    const h = 1e-6;
    for (const p of CORNERS) {
      for (const [x, y] of [
        [0.02, 0.07],
        [-0.2, -0.1],
        [0.25, 0.01],
      ] as const) {
        const E = field(p, x, y);
        const gx = (potential(p, x + h, y) - potential(p, x - h, y)) / (2 * h);
        const gy = (potential(p, x, y + h) - potential(p, x, y - h)) / (2 * h);
        const scale = Math.hypot(E.x, E.y) + 1e-9;
        // 中心差分の打ち切り誤差は h² 程度。丸め誤差 |V|·ε/h も小さい
        expect(Math.abs(E.x + gx) / scale, JSON.stringify(p)).toBeLessThan(1e-5);
        expect(Math.abs(E.y + gy) / scale, JSON.stringify(p)).toBeLessThan(1e-5);
      }
    }
  });

  it('等量異符号（+Q, −Q）: 中点の電位は 0、電場は 2kQ/(d/2)²（+ から − の向き）', () => {
    const p = { ...DEFAULT, QA: 2, QB: -2, d: 0.2 };
    const m = midpointValues(p);
    expect(Math.abs(m.V)).toBeLessThan(1e-9);
    expect(relativeError(m.E, (2 * COULOMB_CONSTANT * 2 * NANO) / 0.1 ** 2)).toBeLessThan(1e-12);
    expect(field(p, 0, 0).x).toBeGreaterThan(0);
  });

  it('等量同符号（+Q, +Q）: 中点の電場は 0、電位は 2kQ/(d/2)', () => {
    const p = { ...DEFAULT, QA: 2, QB: 2, d: 0.2 };
    const m = midpointValues(p);
    expect(m.E).toBeLessThan(1e-9);
    expect(relativeError(m.V, (2 * COULOMB_CONSTANT * 2 * NANO) / 0.1)).toBeLessThan(1e-12);
  });

  it('対称性: 図は x 軸について上下対称（V(x, y) = V(x, −y)）', () => {
    for (const p of CORNERS) {
      expect(potential(p, 0.1, 0.07)).toBeCloseTo(potential(p, 0.1, -0.07), 9);
    }
  });
});

describe('試験電荷の運動と解析解', () => {
  it('正電荷 1 つに斥けられて直線上を遠ざかる: 到達時刻が解析解と一致する', () => {
    const p = { ...DEFAULT, QA: 4, QB: 0, d: 0.2 };
    const A = charges(p)[0]!;
    const r0 = 0.02;
    const states = simulate(p, 30, { x: A.x + r0, y: 0, vx: 0, vy: 0, status: 'moving' });
    let checked = 0;
    for (const r of [0.04, 0.08, 0.16, 0.3]) {
      const i = states.findIndex((s) => s.x - A.x >= r);
      expect(i, `r = ${r} に達しない`).toBeGreaterThan(0);
      // 刻み DT の格子上で初めて r を越えた時刻なので、誤差は DT 以内
      expect(Math.abs(i * DT - radialTime(4 * NANO, r0, r))).toBeLessThanOrEqual(DT);
      checked++;
    }
    expect(checked).toBe(4);
    // 運動は x 軸上にとどまる
    expect(states.every((s) => s.y === 0)).toBe(true);
  });

  it('負電荷 1 つに引き寄せられて衝突する: 衝突時刻が解析解と一致する', () => {
    const p = { ...DEFAULT, QA: -2, QB: 0, d: 0.2 };
    const A = charges(p)[0]!;
    const r0 = 0.1;
    const states = simulate(p, 30, { x: A.x + r0, y: 0, vx: 0, vy: 0, status: 'moving' });
    const last = states[states.length - 1]!;
    expect(last.status).toBe('hit-A');
    const tHit = (states.length - 1) * DT;
    expect(Math.abs(tHit - radialTime(-2 * NANO, r0, CHARGE_RADIUS))).toBeLessThanOrEqual(DT);
  });

  it('速さは ½mv² = q(V₀ − V) から求めた値と一致する（電位差だけで決まる）', () => {
    for (const p of CORNERS) {
      const s0 = initialState(p);
      const V0 = potential(p, s0.x, s0.y);
      for (const s of cornerRun(p).filter((_, i) => i % 200 === 0)) {
        if (s.status !== 'moving') continue;
        const vExact = Math.sqrt((2 * TEST_CHARGE * (V0 - potential(p, s.x, s.y))) / TEST_MASS);
        const v = Math.hypot(s.vx, s.vy);
        expect(Math.abs(v - vExact), JSON.stringify(p)).toBeLessThan(1e-3 * vExact + 1e-9);
      }
    }
  });

  it('電荷が 0 なら（電場がなければ）試験電荷は静止したまま', () => {
    const p = { ...DEFAULT, QA: 0, QB: 0 };
    const states = simulate(p, 2);
    expect(states.every((s) => s.x === p.x0 && s.y === p.y0 && s.vx === 0)).toBe(true);
  });

  it('動き出す向きは、その点の電場の向き（正の試験電荷）', () => {
    for (const p of CORNERS) {
      const E = field(p, p.x0, p.y0);
      if (Math.hypot(E.x, E.y) < 1e-6) continue;
      const s = step(p, initialState(p), DT);
      const cos = (s.vx * E.x + s.vy * E.y) / (Math.hypot(s.vx, s.vy) * Math.hypot(E.x, E.y));
      expect(cos, JSON.stringify(p)).toBeGreaterThan(1 - 1e-6);
    }
  });
});

describe('エネルギー保存', () => {
  it('K + qV が保存される（パラメータ範囲の全隅、6 秒間または止まるまで）', () => {
    for (const p of CORNERS) {
      const states = cornerRun(p);
      const e0 = energies(p, states[0]!).total;
      // 誤差の基準: 運動中に現れる運動エネルギーの最大値（全エネルギーは 0 に近いこともあるため）
      const kMax = Math.max(...states.map((s) => energies(p, s).kinetic));
      if (kMax === 0) continue;
      let maxErr = 0;
      for (const s of states) {
        if (s.status !== 'moving') continue;
        maxErr = Math.max(maxErr, Math.abs(energies(p, s).total - e0));
      }
      // 速度ベルレ法の 1 ステップのエネルギー誤差は (ωh)² 程度。適応刻み幅で ωh ≤ η = 0.02
      // に抑えているので、相対誤差は η² = 4×10⁻⁴ を超えない
      expect(maxErr / kMax, JSON.stringify(p)).toBeLessThan(4e-4);
    }
  });

  it('静電気力がした仕事 = 運動エネルギーの増加（W = q(V₀ − V)）', () => {
    const p = DEFAULT;
    const states = simulate(p, 3);
    const s = states[states.length - 1]!;
    const W = TEST_CHARGE * (potential(p, p.x0, p.y0) - potential(p, s.x, s.y));
    expect(relativeError(energies(p, s).kinetic, W)).toBeLessThan(1e-3);
  });
});

describe('電気力線', () => {
  it('電荷から出る本数は電荷の大きさに比例する', () => {
    expect(lineCount(1)).toBe(4);
    expect(lineCount(-2)).toBe(8);
    expect(lineCount(4)).toBe(16);
    expect(lineCount(0)).toBe(0);
    for (const p of FIELD_CORNERS) {
      const lines = linesOf(p);
      for (const c of charges(p).filter((c) => c.q > 0)) {
        expect(lines.filter((l) => l.from === c.name)).toHaveLength(lineCount(c.q / NANO));
      }
    }
  });

  it('電気力線の接線は各点の電場の向き（正電荷から出て負電荷に入る）', () => {
    for (const p of FIELD_CORNERS) {
      for (const line of linesOf(p)) {
        const sign = (charges(p).find((c) => c.name === line.from)!.q > 0 ? 1 : -1) as number;
        for (let i = 3; i < line.points.length - 3; i += 25) {
          const a = line.points[i - 1]!;
          const b = line.points[i + 1]!;
          const E = field(p, line.points[i]!.x, line.points[i]!.y);
          const t = { x: b.x - a.x, y: b.y - a.y };
          const cos =
            (sign * (t.x * E.x + t.y * E.y)) / (Math.hypot(t.x, t.y) * Math.hypot(E.x, E.y));
          expect(cos, JSON.stringify(p)).toBeGreaterThan(0.999);
        }
      }
    }
  });

  it('正電荷から出た線に沿って電位は下がり続ける', () => {
    for (const p of FIELD_CORNERS) {
      for (const line of linesOf(p).filter(
        (l) => charges(p).find((c) => c.name === l.from)!.q > 0,
      )) {
        const Vs = line.points.slice(1, -1).map((q) => potential(p, q.x, q.y));
        for (let i = 1; i < Vs.length; i++) expect(Vs[i]!).toBeLessThan(Vs[i - 1]! + 1e-9);
      }
    }
  });

  it('+Q と −Q: 正電荷から出た線の多くが負電荷に入る', () => {
    const lines = fieldLines({ ...DEFAULT, QA: 2, QB: -2 });
    const toB = lines.filter((l) => l.from === 'A' && l.end === 'B').length;
    expect(toB).toBeGreaterThanOrEqual(lineCount(2) / 2);
  });
});

/**
 * 格子間隔 h の線形補間で求めた等値線の端点が、真の等電位線からずれる距離の上限の目安
 * δ = h²‖H‖ / (8|∇V|)（H は V のヘッセ行列。補間誤差 h²|V''|/8 を勾配で割ったもの）
 */
function interpolationOffset(p: FieldParams, x: number, y: number, h: number): number {
  const e = 1e-5;
  const E = field(p, x, y);
  // ∇V = −E。2 階微分は電場の中心差分から求める
  const ex1 = field(p, x + e, y);
  const ex0 = field(p, x - e, y);
  const ey1 = field(p, x, y + e);
  const ey0 = field(p, x, y - e);
  const Vxx = -(ex1.x - ex0.x) / (2 * e);
  const Vyy = -(ey1.y - ey0.y) / (2 * e);
  const Vxy = -(ey1.x - ey0.x) / (2 * e);
  const hess = Math.sqrt(Vxx * Vxx + 2 * Vxy * Vxy + Vyy * Vyy);
  return (h * h * hess) / (8 * Math.hypot(E.x, E.y));
}

describe('等電位線', () => {
  it('等電位線は電気力線（電場）と直交し、線上の電位はその値に等しい', () => {
    const h = 0.004;
    for (const p of FIELD_CORNERS) {
      const nx = Math.round((REGION.xMax - REGION.xMin) / h);
      const ny = Math.round((REGION.yMax - REGION.yMin) / h);
      const grid = sampleGrid((x, y) => potential(p, x, y), REGION, nx, ny);
      for (const level of equipotentialLevels().filter((_, i) => i % 6 === 0)) {
        for (const s of contourSegments(grid, level)) {
          const mx = (s.x0 + s.x1) / 2;
          const my = (s.y0 + s.y1) / 2;
          // 電荷のすぐ近く（r < 6h）は電位が発散して格子が粗すぎるので除く
          if (charges(p).some((c) => c.q !== 0 && Math.hypot(mx - c.x, my - c.y) < 6 * h)) continue;
          const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
          if (len < h / 4) continue;
          const E = field(p, mx, my);
          const cos =
            Math.abs((s.x1 - s.x0) * E.x + (s.y1 - s.y0) * E.y) / (len * Math.hypot(E.x, E.y));
          // 線分の両端はそれぞれ真の等電位線から δ だけずれうるので、長さ len の線分の向きの誤差は
          // 2δ/len 程度（電場が 0 になる点の近くの短い線分で大きくなる）。それに 3° の余裕を足す
          const tol = 0.05 + (2 * interpolationOffset(p, mx, my, h)) / len;
          expect(cos, JSON.stringify({ p, level })).toBeLessThan(tol);
          expect(Math.abs(potential(p, mx, my) - level), JSON.stringify({ p, level })).toBeLessThan(
            0.05 * Math.max(25, Math.abs(level)),
          );
        }
      }
    }
  });

  it('電位の一覧は ΔV 間隔で 0 V を含む', () => {
    const levels = equipotentialLevels();
    expect(levels).toContain(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeCloseTo(25, 12);
  });
});

describe('数値計算の設定', () => {
  it('適応刻み幅は電荷に近いほど小さく、遠くでは DT のまま', () => {
    const p = { ...DEFAULT, QA: 4, QB: 0 };
    const A = charges(p)[0]!;
    const s = (r: number): TestChargeState => ({
      x: A.x + r,
      y: 0,
      vx: 0.1,
      vy: 0,
      status: 'moving',
    });
    expect(safeStepSize(p, s(0.01))).toBeLessThan(safeStepSize(p, s(0.1)));
    expect(safeStepSize(p, { ...s(0.3), vx: 0 })).toBeGreaterThan(DT);
  });

  it('全隅で 6 秒分の計算が破綻しない（NaN にならず、領域内か衝突で止まる）', () => {
    for (const p of FIELD_CORNERS) {
      const states = cornerRun(p);
      const last = states[states.length - 1]!;
      expect(Number.isFinite(last.x + last.y + last.vx + last.vy), JSON.stringify(p)).toBe(true);
    }
  });
});
