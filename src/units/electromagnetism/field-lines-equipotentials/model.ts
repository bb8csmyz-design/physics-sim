/**
 * 2 つの点電荷がつくる電場と電位、およびその中を動く試験電荷の物理モデル。
 * DOM に依存しない純粋な計算のみ。
 *
 * 座標: なめらかな水平面を真上から見た図。2 つの点電荷の中点 M を原点とし、
 *       右向きを x 軸正、上向き（画面の上）を y 軸正とする。
 *       電荷 A は (−d/2, 0)、電荷 B は (+d/2, 0) に固定されている。
 * 電位の基準: 無限遠を 0 V とする。
 *
 * 電場（重ね合わせ）: E = Σ kQ_i (r − r_i)/|r − r_i|³,   電位: V = Σ kQ_i/|r − r_i|
 * 試験電荷の運動方程式: m a = qE（保存力のみ → シンプレクティック法）
 */
import { COULOMB_CONSTANT } from '@/core/physics/constants';
import { velocityVerletStep } from '@/core/physics/integrators';
import type { ParamSpec, ParamValues } from '@/core/params';
import type { Bounds } from '@/core/contour';

export type FieldParamKey = 'QA' | 'QB' | 'd' | 'x0' | 'y0';
export type FieldParams = ParamValues<FieldParamKey>;

/** 1 nC [C] */
export const NANO = 1e-9;

export const PARAMS: readonly ParamSpec<FieldParamKey>[] = [
  {
    key: 'QA',
    label: '電荷 A',
    symbol: 'Q_A',
    unit: 'nC',
    min: -4,
    max: 4,
    step: 0.5,
    default: 2,
    hint: '左の点電荷。負の値は負電荷',
  },
  {
    key: 'QB',
    label: '電荷 B',
    symbol: 'Q_B',
    unit: 'nC',
    min: -4,
    max: 4,
    step: 0.5,
    default: -2,
    hint: '右の点電荷',
  },
  {
    key: 'd',
    label: '電荷間の距離',
    symbol: 'd',
    unit: 'm',
    min: 0.1,
    max: 0.3,
    step: 0.01,
    default: 0.2,
  },
  {
    key: 'x0',
    label: '試験電荷の初期位置 x',
    symbol: 'x_0',
    unit: 'm',
    min: -0.25,
    max: 0.25,
    step: 0.01,
    default: -0.04,
  },
  {
    key: 'y0',
    label: '試験電荷の初期位置 y',
    symbol: 'y_0',
    unit: 'm',
    min: -0.15,
    max: 0.15,
    step: 0.01,
    default: 0.05,
  },
];

/** 試験電荷の電荷 q [C]（正） */
export const TEST_CHARGE = 1 * NANO;
/** 試験電荷（小球）の質量 m [kg] = 0.10 g */
export const TEST_MASS = 1e-4;
/** 点電荷（固定した小球）の半径 [m]。試験電荷の中心がこれより近づいたら衝突とみなす */
export const CHARGE_RADIUS = 0.008;
/** 表示・計算する領域 [m]。試験電荷がこの外に出たら止める */
export const REGION: Bounds = { xMin: -0.32, xMax: 0.32, yMin: -0.18, yMax: 0.18 };
/**
 * 物理ステップ（記録・描画）の刻み幅 [s]。精度は step() の中の適応刻み幅（ETA）で決まり、
 * 電荷に近づいたときはこれより細かく分割する
 */
export const DT = 2e-3;
/** 適応刻み幅の安全係数 η: h ≤ η·min(r/v, √(r/a))（r は最寄りの電荷までの距離） */
export const ETA = 0.02;
/** 電荷 1 nC あたりの電気力線の本数（本数は電荷に比例する） */
export const LINES_PER_NC = 4;
/** 等電位線の間隔 ΔV [V] と、描く電位の上限 |V| [V] */
export const EQUIPOTENTIAL_STEP = 25;
export const EQUIPOTENTIAL_MAX = 400;

export interface PointCharge {
  name: 'A' | 'B';
  /** 電荷 [C] */
  q: number;
  x: number;
  y: number;
}

export function charges(p: FieldParams): PointCharge[] {
  return [
    { name: 'A', q: p.QA * NANO, x: -p.d / 2, y: 0 },
    { name: 'B', q: p.QB * NANO, x: p.d / 2, y: 0 },
  ];
}

/** 電位 V(x, y) [V]（無限遠を 0 V）。描画・積分で大量に呼ぶので配列を作らずに計算する */
export function potential(p: FieldParams, x: number, y: number): number {
  const xa = -p.d / 2;
  const xb = p.d / 2;
  let V = 0;
  if (p.QA !== 0) V += (COULOMB_CONSTANT * p.QA * NANO) / Math.hypot(x - xa, y);
  if (p.QB !== 0) V += (COULOMB_CONSTANT * p.QB * NANO) / Math.hypot(x - xb, y);
  return V;
}

/** 電場 E(x, y) [V/m]（= [N/C]） */
export function field(p: FieldParams, x: number, y: number): { x: number; y: number } {
  let ex = 0;
  let ey = 0;
  const add = (Q: number, cx: number) => {
    if (Q === 0) return;
    const rx = x - cx;
    const r = Math.hypot(rx, y);
    const c = (COULOMB_CONSTANT * Q * NANO) / (r * r * r);
    ex += c * rx;
    ey += c * y;
  };
  add(p.QA, -p.d / 2);
  add(p.QB, p.d / 2);
  return { x: ex, y: ey };
}

// ---------------------------------------------------------------------------
// 試験電荷の運動
// ---------------------------------------------------------------------------

export type MotionStatus = 'moving' | 'hit-A' | 'hit-B' | 'out';

export interface TestChargeState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  status: MotionStatus;
}

export function initialState(p: FieldParams): TestChargeState {
  return { x: p.x0, y: p.y0, vx: 0, vy: 0, status: statusAt(p, p.x0, p.y0) };
}

function statusAt(p: FieldParams, x: number, y: number): MotionStatus {
  for (const c of charges(p)) {
    if (c.q !== 0 && Math.hypot(x - c.x, y - c.y) <= CHARGE_RADIUS) return `hit-${c.name}`;
  }
  if (x < REGION.xMin || x > REGION.xMax || y < REGION.yMin || y > REGION.yMax) return 'out';
  return 'moving';
}

/** 加速度 a = qE/m [m/s²] */
export function acceleration(p: FieldParams, x: number, y: number): { x: number; y: number } {
  const E = field(p, x, y);
  return { x: (TEST_CHARGE * E.x) / TEST_MASS, y: (TEST_CHARGE * E.y) / TEST_MASS };
}

/** 最寄りの電荷（0 でないもの）までの距離 [m] */
function nearestChargeDistance(p: FieldParams, x: number, y: number): number {
  let r = Infinity;
  for (const c of charges(p)) if (c.q !== 0) r = Math.min(r, Math.hypot(x - c.x, y - c.y));
  return r;
}

/** 状態 s で許される最大の刻み幅（電荷に近く・速いほど細かくする） */
export function safeStepSize(p: FieldParams, s: TestChargeState): number {
  const r = nearestChargeDistance(p, s.x, s.y);
  const a = acceleration(p, s.x, s.y);
  const v = Math.hypot(s.vx, s.vy);
  const am = Math.hypot(a.x, a.y);
  return ETA * Math.min(v > 0 ? r / v : Infinity, am > 0 ? Math.sqrt(r / am) : Infinity);
}

/**
 * dt だけ進める。電荷の近くでは速度ベルレ法の刻みを細かく分割する（適応刻み幅）。
 * 電荷に衝突するか領域の外に出たら、その場で止まる（status が変わる）。
 */
export function step(p: FieldParams, s: TestChargeState, dt: number): TestChargeState {
  let cur = s;
  let done = 0;
  while (cur.status === 'moving' && done < dt) {
    const h = Math.min(dt - done, safeStepSize(p, cur));
    const next = velocityVerletStep(
      (_t, q) => {
        const a = acceleration(p, q[0]!, q[1]!);
        return [a.x, a.y];
      },
      0,
      { x: [cur.x, cur.y], v: [cur.vx, cur.vy] },
      h,
    );
    const x = next.x[0]!;
    const y = next.x[1]!;
    cur = { x, y, vx: next.v[0]!, vy: next.v[1]!, status: statusAt(p, x, y) };
    done += h;
  }
  if (cur.status !== 'moving' && s.status === 'moving') cur = { ...cur, vx: 0, vy: 0 };
  return cur;
}

export interface Energies {
  /** 運動エネルギー ½mv² [J] */
  kinetic: number;
  /** 静電気力による位置エネルギー U = qV [J] */
  potential: number;
  total: number;
}

export function energies(p: FieldParams, s: TestChargeState): Energies {
  const kinetic = 0.5 * TEST_MASS * (s.vx * s.vx + s.vy * s.vy);
  const pot = TEST_CHARGE * potential(p, s.x, s.y);
  return { kinetic, potential: pot, total: kinetic + pot };
}

/**
 * 正電荷 Q の点電荷から距離 r0 の点に静かに置いた試験電荷が、距離 r に達するまでの時間（解析解）。
 * 斥力（Q > 0）: エネルギー保存 ½mv² = kQq(1/r0 − 1/r) を積分して
 *   t = √(m r0³ / 2kQq) · [ √(u(u−1)) + ln(√u + √(u−1)) ],  u = r/r0 ≥ 1
 * 引力（Q < 0）: t = √(m r0³ / 2k|Q|q) · [ √(u(1−u)) + arccos √u ],  u = r/r0 ≤ 1
 */
export function radialTime(Q: number, r0: number, r: number): number {
  const c = Math.sqrt((TEST_MASS * r0 ** 3) / (2 * COULOMB_CONSTANT * Math.abs(Q) * TEST_CHARGE));
  const u = r / r0;
  if (Q > 0) return c * (Math.sqrt(u * (u - 1)) + Math.log(Math.sqrt(u) + Math.sqrt(u - 1)));
  return c * (Math.sqrt(u * (1 - u)) + Math.acos(Math.sqrt(u)));
}

// ---------------------------------------------------------------------------
// 電気力線と等電位線（描画用。計算は純粋関数）
// ---------------------------------------------------------------------------

export interface FieldLine {
  /** 出発した電荷 */
  from: 'A' | 'B';
  /** 終点: 電荷に入った / 領域の外へ出た / 電場が 0 の点で止まった */
  end: 'A' | 'B' | 'out' | 'null';
  points: { x: number; y: number }[];
}

/** 電荷 Q [nC] から出る（入る）電気力線の本数。|Q| に比例させる */
export function lineCount(Qnc: number): number {
  return Math.round(Math.abs(Qnc) * LINES_PER_NC);
}

/** 電気力線をたどるときの 1 歩の長さ [m] */
const TRACE_STEP = 0.0015;
/** たどる領域（表示領域より少し広く） */
const TRACE_MARGIN = 0.06;

/**
 * 点 (x, y) から電場の向き（dir = +1）または逆向き（dir = −1）に電気力線をたどる。
 * 単位ベクトル E/|E| の場を RK4 で積分する。
 */
export function traceFieldLine(
  p: FieldParams,
  x: number,
  y: number,
  dir: 1 | -1,
  from: 'A' | 'B',
): FieldLine {
  const unit = (px: number, py: number): [number, number] | null => {
    const E = field(p, px, py);
    const m = Math.hypot(E.x, E.y);
    if (!(m > 0) || !Number.isFinite(m)) return null;
    return [(dir * E.x) / m, (dir * E.y) / m];
  };
  const pts = [{ x, y }];
  const cs = charges(p).filter((c) => c.q !== 0);
  const maxSteps = 4000;
  let end: FieldLine['end'] = 'null';
  for (let i = 0; i < maxSteps; i++) {
    const k1 = unit(x, y);
    const k2 = k1 && unit(x + (TRACE_STEP / 2) * k1[0], y + (TRACE_STEP / 2) * k1[1]);
    const k3 = k2 && unit(x + (TRACE_STEP / 2) * k2[0], y + (TRACE_STEP / 2) * k2[1]);
    const k4 = k3 && unit(x + TRACE_STEP * k3[0], y + TRACE_STEP * k3[1]);
    if (!k1 || !k2 || !k3 || !k4) break;
    const sx = (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
    const sy = (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
    // 電場が 0 になる点の近くでは向きが打ち消し合って進めなくなる
    if (Math.hypot(sx, sy) < 0.2) break;
    x += TRACE_STEP * sx;
    y += TRACE_STEP * sy;
    pts.push({ x, y });
    const hit = cs.find((c) => c.name !== from && Math.hypot(x - c.x, y - c.y) < CHARGE_RADIUS);
    if (hit) {
      pts.push({ x: hit.x, y: hit.y });
      end = hit.name;
      break;
    }
    if (
      x < REGION.xMin - TRACE_MARGIN ||
      x > REGION.xMax + TRACE_MARGIN ||
      y < REGION.yMin - TRACE_MARGIN ||
      y > REGION.yMax + TRACE_MARGIN
    ) {
      end = 'out';
      break;
    }
  }
  return { from, end, points: pts };
}

/**
 * 電気力線の一覧。正電荷からは電場の向きに、負電荷からは逆向きにたどる。
 * 正電荷から出て負電荷に入る線は正電荷側の 1 本だけを残す（負電荷側から重複して描かない）。
 */
export function fieldLines(p: FieldParams): FieldLine[] {
  const lines: FieldLine[] = [];
  const cs = charges(p);
  const hasPositive = cs.some((c) => c.q > 0);
  for (const c of cs) {
    const n = lineCount(c.q / NANO);
    if (n === 0) continue;
    const dir = c.q > 0 ? 1 : -1;
    // 相手の電荷の方向を基準に、両側へ対称に振り分ける（x 軸対称な図にする）
    const other = cs.find((o) => o !== c)!;
    const base = Math.atan2(other.y - c.y, other.x - c.x);
    for (let k = 0; k < n; k++) {
      const ang = base + (2 * Math.PI * (k + 0.5)) / n;
      const sx = c.x + CHARGE_RADIUS * Math.cos(ang);
      const sy = c.y + CHARGE_RADIUS * Math.sin(ang);
      const line = traceFieldLine(p, sx, sy, dir, c.name);
      line.points.unshift({ x: c.x, y: c.y });
      if (dir < 0 && hasPositive && line.end !== 'out' && line.end !== 'null') continue;
      lines.push(line);
    }
  }
  return lines;
}

/** 描く等電位線の電位の一覧 [V]（ΔV 間隔、0 V を含む） */
export function equipotentialLevels(): number[] {
  const n = Math.round(EQUIPOTENTIAL_MAX / EQUIPOTENTIAL_STEP);
  return Array.from({ length: 2 * n + 1 }, (_, i) => (i - n) * EQUIPOTENTIAL_STEP);
}

/** 中点 M（原点）の電位 [V] と電場の強さ [V/m] */
export function midpointValues(p: FieldParams): { V: number; E: number } {
  const E = field(p, 0, 0);
  return { V: potential(p, 0, 0), E: Math.hypot(E.x, E.y) };
}
