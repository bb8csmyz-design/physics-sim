/**
 * 配置の編集操作（追加・移動・削除・当たり判定）。DOM に依存しない純粋な処理のみ。
 * 編集はすべて SandboxDesign を直接書き換える（呼び出し側が変更後にシミュレーションをやり直す）。
 */
import type { ParamSpec } from '@/core/params';
import { collide, containsPoint, distanceToSegment, type Vec2 } from './collide';
import {
  PULLEY_RADIUS,
  WORLD,
  bodyShape,
  fixtureShape,
  inclineVertices,
  pulleyWinding,
  stringPathLength,
  type BodyDef,
  type Endpoint,
  type FixtureDef,
  type InclineDef,
  type JointDef,
  type SandboxDesign,
  type SpringDef,
  type StringDef,
  type WallDef,
} from './model';

/** 物体の数の上限（名前 A〜L） */
export const BODY_NAMES = 'ABCDEFGHIJKL';
export const MAX_FIXTURES = 24;
export const MAX_JOINTS = 24;

// ---------------------------------------------------------------------------
// 部品ごとの調整できる値（スライダーと読み込み時の範囲の検査に使う）
// ---------------------------------------------------------------------------

const MASS: ParamSpec<'m'> = {
  key: 'm',
  label: '質量',
  symbol: 'm',
  unit: 'kg',
  min: 0.1,
  max: 10,
  step: 0.1,
  default: 1,
};
const VX: ParamSpec<'vx'> = {
  key: 'vx',
  label: '初速度の x 成分',
  symbol: 'v_x',
  unit: 'm/s',
  min: -10,
  max: 10,
  step: 0.1,
  default: 0,
  hint: '右向きが正。画面上の矢印の先をドラッグしても変えられる',
};
const VY: ParamSpec<'vy'> = {
  key: 'vy',
  label: '初速度の y 成分',
  symbol: 'v_y',
  unit: 'm/s',
  min: -10,
  max: 10,
  step: 0.1,
  default: 0,
  hint: '上向きが正',
};

export const BALL_SPECS: readonly ParamSpec<'m' | 'r' | 'vx' | 'vy'>[] = [
  MASS,
  {
    key: 'r',
    label: '半径',
    symbol: 'r',
    unit: 'm',
    min: 0.05,
    max: 0.5,
    step: 0.01,
    default: 0.12,
  },
  VX,
  VY,
];

export const BLOCK_SPECS: readonly ParamSpec<'m' | 'w' | 'h' | 'angle' | 'vx' | 'vy'>[] = [
  MASS,
  { key: 'w', label: '幅', unit: 'm', min: 0.1, max: 1.5, step: 0.05, default: 0.3 },
  { key: 'h', label: '高さ', unit: 'm', min: 0.1, max: 1.5, step: 0.05, default: 0.3 },
  {
    key: 'angle',
    label: '傾き',
    unit: '°',
    min: -60,
    max: 60,
    step: 1,
    default: 0,
    hint: '物体は回転しない（この傾きのまま動く）。斜面の上に置くと斜面にそろう',
  },
  VX,
  VY,
];

export const WALL_SPECS: readonly ParamSpec<'w' | 'h'>[] = [
  { key: 'w', label: '幅', unit: 'm', min: 0.1, max: 6.4, step: 0.05, default: 2 },
  { key: 'h', label: '高さ', unit: 'm', min: 0.1, max: 3.6, step: 0.05, default: 0.2 },
];

export const INCLINE_SPECS: readonly ParamSpec<'w' | 'angle'>[] = [
  { key: 'w', label: '底辺の長さ', unit: 'm', min: 0.4, max: 5, step: 0.1, default: 2.4 },
  {
    key: 'angle',
    label: '傾斜角',
    symbol: 'θ',
    unit: '°',
    min: 5,
    max: 60,
    step: 1,
    default: 30,
  },
];

export const SPRING_SPECS: readonly ParamSpec<'k' | 'L0'>[] = [
  {
    key: 'k',
    label: 'ばね定数',
    symbol: 'k',
    unit: 'N/m',
    min: 1,
    max: 200,
    step: 1,
    default: 20,
  },
  {
    key: 'L0',
    label: '自然長',
    symbol: 'ℓ_0',
    unit: 'm',
    min: 0.1,
    max: 4,
    step: 0.05,
    default: 1,
    hint: '置いたときの長さが自然長になる（あとから変えると、伸び・縮みのある状態から始まる）',
  },
];

// ---------------------------------------------------------------------------
// 位置・名前
// ---------------------------------------------------------------------------

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 配置できる範囲に収める */
export function clampToWorld(x: number, y: number): Vec2 {
  return { x: clamp(x, WORLD.xMin, WORLD.xMax), y: clamp(y, WORLD.yMin, WORLD.yMax) };
}

export function findBody(d: SandboxDesign, id: string): BodyDef | undefined {
  return d.bodies.find((b) => b.id === id);
}

export function findFixture(d: SandboxDesign, id: string): FixtureDef | undefined {
  return d.fixtures.find((f) => f.id === id);
}

/** 糸・ばねの端の位置（参照先がなければ null） */
export function endpointPos(d: SandboxDesign, e: Endpoint): Vec2 | null {
  if ('body' in e) {
    const b = findBody(d, e.body);
    return b ? { x: b.x, y: b.y } : null;
  }
  if ('pulley' in e) {
    const p = findFixture(d, e.pulley);
    return p ? { x: p.x, y: p.y } : null;
  }
  return { x: e.x, y: e.y };
}

function unusedId(d: SandboxDesign, prefix: string): string {
  const used = new Set([...d.fixtures.map((f) => f.id), ...d.joints.map((j) => j.id)]);
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

// ---------------------------------------------------------------------------
// 追加
// ---------------------------------------------------------------------------

export type BodyKind = BodyDef['kind'];
export type FixtureKind = 'floor' | 'wall' | 'incline' | 'pulley';

/** 物体を (x, y) に置く。上限に達していたら null */
export function addBody(d: SandboxDesign, kind: BodyKind, x: number, y: number): BodyDef | null {
  const id = [...BODY_NAMES].find((c) => !d.bodies.some((b) => b.id === c));
  if (!id) return null;
  const p = clampToWorld(x, y);
  const body: BodyDef =
    kind === 'ball'
      ? { kind: 'ball', id, x: p.x, y: p.y, r: 0.12, m: 1, vx: 0, vy: 0 }
      : { kind: 'block', id, x: p.x, y: p.y, w: 0.3, h: 0.3, angle: 0, m: 1, vx: 0, vy: 0 };
  d.bodies.push(body);
  settleBody(d, body, true);
  return body;
}

/** 固定物を (x, y) に置く。上限に達していたら null */
export function addFixture(
  d: SandboxDesign,
  kind: FixtureKind,
  x: number,
  y: number,
): FixtureDef | null {
  if (d.fixtures.length >= MAX_FIXTURES) return null;
  const p = clampToWorld(x, y);
  let f: FixtureDef;
  switch (kind) {
    case 'floor':
      f = { kind: 'wall', id: unusedId(d, 'w'), x: p.x, y: p.y, w: 2, h: 0.2 };
      break;
    case 'wall':
      f = { kind: 'wall', id: unusedId(d, 'w'), x: p.x, y: p.y, w: 0.2, h: 1.6 };
      break;
    case 'incline':
      // クリックした点を底辺の中点にする（床の上に置きやすいように）
      f = { kind: 'incline', id: unusedId(d, 'i'), x: p.x, y: p.y, w: 2.4, angle: 30, flip: false };
      break;
    case 'pulley':
      f = { kind: 'pulley', id: unusedId(d, 'p'), x: p.x, y: p.y };
      break;
  }
  d.fixtures.push(f);
  return f;
}

/** 端 a, b の間の自然な長さ（糸なら経路の長さ） */
function separation(d: SandboxDesign, a: Endpoint, b: Endpoint): number {
  const pa = endpointPos(d, a)!;
  const pb = endpointPos(d, b)!;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function sameEnd(a: Endpoint, b: Endpoint): boolean {
  if ('body' in a && 'body' in b) return a.body === b.body;
  if ('pulley' in a && 'pulley' in b) return a.pulley === b.pulley;
  return false;
}

/**
 * ばね・糸を端 a から端 b へつなぐ。両端とも物体でない・同じ物体どうし・上限のときは null。
 * 糸を「物体 → 滑車」とつないだあと「滑車 → 別の物体」とつなぐと、滑車にかけた 1 本の糸になる。
 */
export function addJoint(
  d: SandboxDesign,
  kind: JointDef['kind'],
  a: Endpoint,
  b: Endpoint,
): JointDef | null {
  if (d.joints.length >= MAX_JOINTS || sameEnd(a, b)) return null;
  if (!endpointPos(d, a) || !endpointPos(d, b)) return null;
  if (!('body' in a) && !('body' in b)) return null;
  if (kind === 'spring') {
    const L0 = clamp(separation(d, a, b), SPRING_SPECS[1]!.min, SPRING_SPECS[1]!.max);
    const j: SpringDef = { kind: 'spring', id: unusedId(d, 's'), a, b, k: 20, L0 };
    d.joints.push(j);
    return j;
  }
  // 滑車から引き出す糸: その滑車で止まっている糸があれば、滑車にかけた 1 本の糸にする
  const pulleyEnd = 'pulley' in a ? a : 'pulley' in b ? b : null;
  const other = pulleyEnd === a ? b : a;
  if (pulleyEnd && 'pulley' in pulleyEnd && 'body' in other) {
    const prev = d.joints.find(
      (j): j is StringDef =>
        j.kind === 'string' &&
        j.via === null &&
        (('pulley' in j.a && j.a.pulley === pulleyEnd.pulley) ||
          ('pulley' in j.b && j.b.pulley === pulleyEnd.pulley)),
    );
    if (prev) {
      const start = 'pulley' in prev.a ? prev.b : prev.a;
      if (sameEnd(start, other)) return null;
      prev.a = start;
      prev.b = other;
      prev.via = pulleyEnd.pulley;
      retension(d);
      return prev;
    }
  }
  const j: StringDef = { kind: 'string', id: unusedId(d, 'c'), a, b, via: null, L: 0 };
  d.joints.push(j);
  retension(d);
  return j;
}

// ---------------------------------------------------------------------------
// 移動・変更・削除
// ---------------------------------------------------------------------------

/** 選択の対象: 物体・固定物・糸/ばね・糸/ばねの固定端（joint の a / b） */
export type Selection =
  | { type: 'body'; id: string }
  | { type: 'fixture'; id: string }
  | { type: 'joint'; id: string }
  | { type: 'pin'; id: string; end: 'a' | 'b' };

/** 要素の基準点（ドラッグの基準。斜面は底辺の中点） */
export function selectionPos(d: SandboxDesign, sel: Selection): Vec2 | null {
  if (sel.type === 'body') return findBody(d, sel.id) ?? null;
  if (sel.type === 'fixture') return findFixture(d, sel.id) ?? null;
  const j = d.joints.find((x) => x.id === sel.id);
  if (!j) return null;
  if (sel.type === 'pin') {
    const e = j[sel.end];
    return 'x' in e ? { x: e.x, y: e.y } : null;
  }
  const pa = endpointPos(d, j.a);
  const pb = endpointPos(d, j.b);
  return pa && pb ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } : null;
}

/** 要素を (x, y) へ動かす（糸・ばね本体は動かせない）。物体は settle = true なら重なりを解消する */
export function moveTo(d: SandboxDesign, sel: Selection, x: number, y: number, settle = false) {
  const p = clampToWorld(x, y);
  if (sel.type === 'body') {
    const b = findBody(d, sel.id);
    if (!b) return;
    b.x = p.x;
    b.y = p.y;
    if (settle) settleBody(d, b, true);
  } else if (sel.type === 'fixture') {
    const f = findFixture(d, sel.id);
    if (!f) return;
    f.x = p.x;
    f.y = p.y;
  } else if (sel.type === 'pin') {
    const j = d.joints.find((x) => x.id === sel.id);
    if (j && 'x' in j[sel.end]) j[sel.end] = { x: p.x, y: p.y };
  }
  retension(d);
}

/** 要素を削除する。物体・滑車を消すと、それにつながる糸・ばねも消える */
export function remove(d: SandboxDesign, sel: Selection): void {
  if (sel.type === 'body') {
    d.bodies = d.bodies.filter((b) => b.id !== sel.id);
    d.joints = d.joints.filter((j) => !refersTo(j, 'body', sel.id));
  } else if (sel.type === 'fixture') {
    d.fixtures = d.fixtures.filter((f) => f.id !== sel.id);
    d.joints = d.joints.filter(
      (j) => !refersTo(j, 'pulley', sel.id) && !(j.kind === 'string' && j.via === sel.id),
    );
  } else {
    d.joints = d.joints.filter((j) => j.id !== sel.id);
  }
}

function refersTo(j: JointDef, key: 'body' | 'pulley', id: string): boolean {
  return [j.a, j.b].some((e) => key in e && (e as Record<string, string>)[key] === id);
}

/** 物体・固定物・ばねの値を変える（範囲外の値は範囲に収める） */
export function updateProps(
  d: SandboxDesign,
  sel: Selection,
  patch: Partial<Record<string, number | boolean>>,
): void {
  const target =
    sel.type === 'body'
      ? findBody(d, sel.id)
      : sel.type === 'fixture'
        ? findFixture(d, sel.id)
        : d.joints.find((j) => j.id === sel.id);
  if (!target) return;
  Object.assign(target, patch);
  if (sel.type === 'body') settleBody(d, target as BodyDef, false);
  retension(d);
}

/** すべての糸を張った状態（長さ = 端から端までの経路の長さ）にする */
export function retension(d: SandboxDesign): void {
  for (const j of d.joints) {
    if (j.kind !== 'string') continue;
    const pa = endpointPos(d, j.a);
    const pb = endpointPos(d, j.b);
    if (!pa || !pb) continue;
    const via = j.via ? findFixture(d, j.via) : undefined;
    j.L = stringPathLength(
      {
        pulley: via
          ? {
              x: via.x,
              y: via.y,
              r: PULLEY_RADIUS,
              sigma: pulleyWinding(via.x, via.y, pa.x, pa.y, pb.x, pb.y),
            }
          : null,
      },
      pa.x,
      pa.y,
      pb.x,
      pb.y,
    );
  }
}

/**
 * 物体が固定物・他の物体と重なっていたら、最短の向きに押し出す（置いたとき・離したとき）。
 * alignToIncline = true なら、斜面に重なった箱の傾きを斜面にそろえる。
 */
export function settleBody(d: SandboxDesign, b: BodyDef, alignToIncline: boolean): void {
  if (alignToIncline && b.kind === 'block') {
    const inc = d.fixtures.find(
      (f): f is InclineDef =>
        // 台の底辺より下（斜面の裏側）に置いたときはそろえない
        f.kind === 'incline' && overlapsFixture(b, f) && b.y >= f.y,
    );
    if (inc) b.angle = inc.flip ? -inc.angle : inc.angle;
  }
  for (let it = 0; it < 12; it++) {
    let moved = false;
    const shape = bodyShape(b);
    for (const f of d.fixtures) {
      const s = fixtureShape(f);
      const c = collide(shape, b.x, b.y, s.shape, s.x, s.y);
      if (c.sep < -1e-9) {
        b.x -= c.nx * c.sep;
        b.y -= c.ny * c.sep;
        moved = true;
      }
    }
    for (const o of d.bodies) {
      if (o === b) continue;
      const c = collide(shape, b.x, b.y, bodyShape(o), o.x, o.y);
      if (c.sep < -1e-9) {
        b.x -= c.nx * c.sep;
        b.y -= c.ny * c.sep;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function overlapsFixture(b: BodyDef, f: WallDef | InclineDef): boolean {
  const s = fixtureShape(f);
  return collide(bodyShape(b), b.x, b.y, s.shape, s.x, s.y).sep < 0;
}

// ---------------------------------------------------------------------------
// 当たり判定（タップした要素を探す）
// ---------------------------------------------------------------------------

/**
 * 点 (x, y) にある要素を探す。tol は判定を広げる距離 [m]（指で押しやすくする）。
 * 物体 → 滑車 → 糸・ばねの固定端 → 糸・ばね → 固定物 の順に優先する（上に描くものほど先）。
 */
export function hitTest(d: SandboxDesign, x: number, y: number, tol: number): Selection | null {
  for (let i = d.bodies.length - 1; i >= 0; i--) {
    const b = d.bodies[i]!;
    if (containsPoint(bodyShape(b), b.x, b.y, x, y, tol)) return { type: 'body', id: b.id };
  }
  for (const f of d.fixtures) {
    if (f.kind === 'pulley' && Math.hypot(f.x - x, f.y - y) <= PULLEY_RADIUS + tol)
      return { type: 'fixture', id: f.id };
  }
  for (const j of d.joints) {
    for (const end of ['a', 'b'] as const) {
      const e = j[end];
      if ('x' in e && Math.hypot(e.x - x, e.y - y) <= tol) return { type: 'pin', id: j.id, end };
    }
  }
  for (const j of d.joints) {
    const pa = endpointPos(d, j.a);
    const pb = endpointPos(d, j.b);
    if (!pa || !pb) continue;
    const via = j.kind === 'string' && j.via ? findFixture(d, j.via) : undefined;
    const segs: [Vec2, Vec2][] = via
      ? [
          [pa, via],
          [via, pb],
        ]
      : [[pa, pb]];
    if (segs.some(([p, q]) => distanceToSegment({ x, y }, p, q) <= tol))
      return { type: 'joint', id: j.id };
  }
  for (let i = d.fixtures.length - 1; i >= 0; i--) {
    const f = d.fixtures[i]!;
    if (f.kind === 'pulley') continue;
    const s = fixtureShape(f);
    if (containsPoint(s.shape, s.x, s.y, x, y, tol)) return { type: 'fixture', id: f.id };
  }
  return null;
}

/** 糸・ばねの端にする要素（物体・滑車。それ以外の場所は固定点） */
export function endpointAt(d: SandboxDesign, x: number, y: number, tol: number): Endpoint {
  const hit = hitTest(d, x, y, tol);
  if (hit?.type === 'body') return { body: hit.id };
  if (hit?.type === 'fixture' && findFixture(d, hit.id)?.kind === 'pulley')
    return { pulley: hit.id };
  const p = clampToWorld(x, y);
  return { x: p.x, y: p.y };
}

// ---------------------------------------------------------------------------
// その他
// ---------------------------------------------------------------------------

export function cloneDesign(d: SandboxDesign): SandboxDesign {
  return structuredClone(d);
}

/** 斜面の斜辺上で、下端から距離 s の位置に、高さ hgt の箱を斜面にそろえて置くときの中心 */
export function pointOnSlope(f: InclineDef, s: number, hgt: number): Vec2 {
  const [p0, p1] = inclineVertices(f);
  const foot = f.flip ? p1 : p0;
  const th = (f.angle * Math.PI) / 180;
  const dir = f.flip ? -1 : 1;
  return {
    x: foot[0] + dir * (s * Math.cos(th) - (hgt / 2) * Math.sin(th)),
    y: foot[1] + s * Math.sin(th) + (hgt / 2) * Math.cos(th),
  };
}
