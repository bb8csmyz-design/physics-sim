/**
 * 配置の編集操作（追加・つなぐ・移動・削除・当たり判定）のテスト。
 */
import { describe, expect, it } from 'vitest';
import { collide } from './collide';
import { addBody, addFixture, addJoint, hitTest, moveTo, remove, retension } from './design';
import {
  PULLEY_RADIUS,
  bodyShape,
  compile,
  fixtureShape,
  initialState,
  stringLength,
  type SandboxDesign,
  type StringDef,
} from './model';
import { defaultFloor, preset } from './presets';

const empty = (): SandboxDesign => ({ bodies: [], fixtures: [defaultFloor()], joints: [] });

describe('配置', () => {
  it('物体は A, B, C… の名前が付き、床にめり込んだ位置に置くと床の上に押し出される', () => {
    const d = empty();
    const a = addBody(d, 'block', 1, 0)!;
    const b = addBody(d, 'ball', 3, 1)!;
    expect([a.id, b.id]).toEqual(['A', 'B']);
    const floor = fixtureShape(d.fixtures[0]!);
    const c = collide(bodyShape(a), a.x, a.y, floor.shape, floor.x, floor.y);
    expect(c.sep).toBeGreaterThan(-1e-9);
    expect(a.y).toBeCloseTo(0.15, 9);
  });

  it('物体は 12 個まで', () => {
    const d = empty();
    for (let i = 0; i < 12; i++) expect(addBody(d, 'ball', 0.5 * i + 0.3, 2)).not.toBeNull();
    expect(addBody(d, 'ball', 3, 3)).toBeNull();
  });

  it('斜面の上に置いた箱は斜面の傾きにそろう', () => {
    const d = empty();
    addFixture(d, 'incline', 3, 0);
    const b = addBody(d, 'block', 3, 0.5)!;
    expect(b.kind === 'block' && b.angle).toBe(30);
  });
});

describe('糸・ばね', () => {
  it('ばねの自然長はつないだときの距離、糸の長さは張った状態の長さ', () => {
    const d = empty();
    addBody(d, 'ball', 2, 2);
    const sp = addJoint(d, 'spring', { body: 'A' }, { x: 2, y: 3 })!;
    expect(sp.kind === 'spring' && sp.L0).toBeCloseTo(1, 12);
    const st = addJoint(d, 'string', { body: 'A' }, { x: 3, y: 2 }) as StringDef;
    expect(st.L).toBeCloseTo(1, 12);
  });

  it('両端とも物体でない・同じ物体どうしはつながない', () => {
    const d = empty();
    addBody(d, 'ball', 2, 2);
    expect(addJoint(d, 'string', { x: 1, y: 1 }, { x: 2, y: 3 })).toBeNull();
    expect(addJoint(d, 'spring', { body: 'A' }, { body: 'A' })).toBeNull();
  });

  it('「物体 → 滑車」「滑車 → 別の物体」とつなぐと、滑車にかけた 1 本の糸になる', () => {
    const d = empty();
    const p = addFixture(d, 'pulley', 3, 3)!;
    addBody(d, 'block', 3 - PULLEY_RADIUS, 1.5);
    addBody(d, 'block', 3 + PULLEY_RADIUS, 2);
    addJoint(d, 'string', { body: 'A' }, { pulley: p.id });
    const j = addJoint(d, 'string', { pulley: p.id }, { body: 'B' }) as StringDef;
    expect(d.joints).toHaveLength(1);
    expect(j).toMatchObject({ a: { body: 'A' }, b: { body: 'B' }, via: p.id });
    // 鉛直な 2 本の糸 + 半周の弧
    const expected = 3 - 1.5 + (3 - 2) + Math.PI * PULLEY_RADIUS;
    expect(j.L).toBeCloseTo(expected, 9);
    const w = compile(d, preset('atwood').params);
    expect(stringLength(w.strings[0]!, initialState(w))).toBeCloseTo(expected, 9);
  });

  it('端を動かすと糸の長さが張った状態に合わせて変わる', () => {
    const d = empty();
    addBody(d, 'ball', 2, 2);
    const st = addJoint(d, 'string', { body: 'A' }, { x: 2, y: 3 }) as StringDef;
    moveTo(d, { type: 'body', id: 'A' }, 2, 1.5);
    expect(st.L).toBeCloseTo(1.5, 12);
    moveTo(d, { type: 'pin', id: st.id, end: 'b' }, 2, 3.3);
    expect(st.L).toBeCloseTo(1.8, 12);
  });
});

describe('削除と当たり判定', () => {
  it('物体や滑車を消すと、つながっている糸・ばねも消える', () => {
    const d = preset('atwood').design;
    remove(d, { type: 'body', id: 'B' });
    expect(d.joints).toHaveLength(0);
    const t = preset('table').design;
    remove(t, { type: 'fixture', id: 'p1' });
    expect(t.joints).toHaveLength(0);
    expect(t.bodies).toHaveLength(2);
  });

  it('物体 → 滑車 → 固定点 → 糸・ばね → 固定物 の順に選ばれる', () => {
    const d = preset('pendulum').design;
    retension(d);
    const A = d.bodies[0]!;
    expect(hitTest(d, A.x, A.y, 0.05)).toEqual({ type: 'body', id: 'A' });
    expect(hitTest(d, 3.2, 3.2, 0.05)).toEqual({ type: 'pin', id: 'c1', end: 'b' });
    expect(hitTest(d, (A.x + 3.2) / 2, (A.y + 3.2) / 2, 0.05)).toEqual({ type: 'joint', id: 'c1' });
    expect(hitTest(d, 1, -0.1, 0.05)).toEqual({ type: 'fixture', id: 'w1' });
    expect(hitTest(d, 1, 2, 0.05)).toBeNull();
  });
});
