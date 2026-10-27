/**
 * サンドボックスの描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawBlock,
  drawDashedLine,
  drawFixturePolygon,
  drawLabel,
  drawPath,
  drawSpringBetween,
  drawVector,
} from '@/ui/draw';
import { boundaryDistance, type Vec2 } from './collide';
import type { Selection } from './design';
import {
  PULLEY_RADIUS,
  WORLD,
  anchorPosition,
  fixtureShape,
  pulleyLeg,
  stringLength,
  type Anchor,
  type SandboxDesign,
  type SandboxState,
  type SandboxWorld,
} from './model';

/** 速度ベクトルの長さ: 速さ 1 m/s を ARROW_SECONDS [m] の長さで描く（上限 ARROW_MAX [m]） */
export const ARROW_SECONDS = 0.3;
const ARROW_MAX = 1.8;

export interface SceneOptions {
  showVelocity: boolean;
  showValues: boolean;
  showTrail: boolean;
  showGrid: boolean;
}

export interface SceneView {
  design: SandboxDesign;
  world: SandboxWorld;
  state: SandboxState;
  options: SceneOptions;
  selection: Selection | null;
  /** 編集中（t = 0 で停止中）。選んだ物体の初速度の矢印をドラッグできることを示す */
  editing: boolean;
  /** 各物体の軌跡（world.bodies と同じ並び） */
  trails: readonly (readonly Vec2[])[];
  /** ばね・糸をつなごうとしているときの線（始点 → 指の位置） */
  preview: { from: Vec2; to: Vec2 } | null;
}

/** 画面の左・下の目盛りの文字の余白 [px] */
const PAD = { top: 10, right: 10, bottom: 22, left: 32 };

export function sandboxViewport(size: CanvasSize): Viewport {
  return fitViewport(size, WORLD, PAD);
}

/** 画面座標 [px] → 物理座標 [m] */
export function toWorld(vp: Viewport, px: number, py: number): Vec2 {
  return { x: (px - vp.x(0)) / vp.scale, y: (vp.y(0) - py) / vp.scale };
}

/** 初速度の矢印の先（つまみ）の位置 [m]。初速度が 0 なら物体の右に置く */
export function velocityHandle(design: SandboxDesign, id: string): Vec2 | null {
  const b = design.bodies.find((x) => x.id === id);
  if (!b) return null;
  if (Math.hypot(b.vx, b.vy) * ARROW_SECONDS < handleClearance(b)) {
    return { x: b.x + handleClearance(b), y: b.y };
  }
  return { x: b.x + b.vx * ARROW_SECONDS, y: b.y + b.vy * ARROW_SECONDS };
}

function handleClearance(b: SandboxDesign['bodies'][number]): number {
  return (b.kind === 'ball' ? b.r : Math.hypot(b.w, b.h) / 2) + 0.12;
}

export function drawSandbox(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  view: SceneView,
): void {
  const vp = sandboxViewport(size);
  const { design, world, state, options, selection } = view;

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  drawGrid(ctx, vp, pal, options.showGrid);

  // 固定物
  for (const f of design.fixtures) {
    const selected = selection?.type === 'fixture' && selection.id === f.id;
    if (f.kind === 'pulley') continue;
    const s = fixtureShape(f);
    if (s.shape.kind !== 'polygon') continue;
    const pts = s.shape.verts.map((v) => ({ x: vp.x(s.x + v.x), y: vp.y(s.y + v.y) }));
    drawFixturePolygon(ctx, pts, pal.fixture);
    if (selected) outline(ctx, pts, pal.accent);
  }

  // 軌跡
  if (options.showTrail) {
    for (const trail of view.trails) {
      drawPath(
        ctx,
        trail.map((p) => ({ x: vp.x(p.x), y: vp.y(p.y) })),
        pal.quantity.position,
        { width: 1.5, alpha: 0.55 },
      );
    }
  }

  // ばね・糸（物体の下に描いて、物体の縁から出ているように見せる）
  const sel = (id: string) => selection?.type === 'joint' && selection.id === id;
  for (const sp of world.springs) {
    const [p, q] = edgePoints(world, state, sp.a, sp.b);
    drawSpringBetween(ctx, vp.x(p.x), vp.y(p.y), vp.x(q.x), vp.y(q.y), {
      color: sel(sp.id) ? pal.accent : pal.fg,
      coils: 10,
      amplitude: 6,
      width: sel(sp.id) ? 2.5 : 1.8,
    });
  }
  for (const str of world.strings) {
    const color = sel(str.id) ? pal.accent : pal.fg;
    const width = sel(str.id) ? 2.5 : 1.6;
    const slack = stringLength(str, state) < str.L - 1e-4;
    const [ax, ay] = anchorPosition(str.a, state);
    const [bx, by] = anchorPosition(str.b, state);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (slack) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (str.pulley) {
      const p = str.pulley;
      const la = pulleyLeg(p, ax, ay, true);
      const lb = pulleyLeg(p, bx, by, false);
      ctx.moveTo(vp.x(ax), vp.y(ay));
      ctx.lineTo(vp.x(la.tx), vp.y(la.ty));
      // 画面の y は下向きなので、角度の符号と回る向きが反転する
      ctx.arc(vp.x(p.x), vp.y(p.y), vp.len(p.r), -la.beta, -lb.beta, p.sigma > 0);
      ctx.lineTo(vp.x(bx), vp.y(by));
    } else {
      ctx.moveTo(vp.x(ax), vp.y(ay));
      ctx.lineTo(vp.x(bx), vp.y(by));
    }
    ctx.stroke();
    ctx.restore();
  }

  // 滑車（糸の上に描く）
  for (const f of design.fixtures) {
    if (f.kind !== 'pulley') continue;
    const selected = selection?.type === 'fixture' && selection.id === f.id;
    const cx = vp.x(f.x);
    const cy = vp.y(f.y);
    const r = vp.len(PULLEY_RADIUS);
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawBall(ctx, cx, cy, r, pal.surface, pal.fixture);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = selected ? pal.accent : pal.fixture;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawBall(ctx, cx, cy, 3, pal.fixture, pal.fixture);
  }

  // 糸・ばねの固定端
  for (const j of design.joints) {
    for (const end of ['a', 'b'] as const) {
      const e = j[end];
      if (!('x' in e)) continue;
      const selected = selection?.type === 'pin' && selection.id === j.id && selection.end === end;
      drawBall(ctx, vp.x(e.x), vp.y(e.y), 4.5, pal.fixture, selected ? pal.accent : pal.fixture);
      if (selected) ring(ctx, vp.x(e.x), vp.y(e.y), 9, pal.accent);
    }
  }

  // 物体
  world.bodies.forEach((b, i) => {
    const x = vp.x(state.x[i]!);
    const y = vp.y(state.y[i]!);
    const selected = selection?.type === 'body' && selection.id === b.id;
    if (b.shape.kind === 'circle') {
      drawBall(ctx, x, y, vp.len(b.shape.r), pal.body, pal.bodyStroke);
      if (selected) ring(ctx, x, y, vp.len(b.shape.r) + 5, pal.accent);
    } else {
      const pts = b.shape.verts.map((v) => ({ x: x + vp.len(v.x), y: y - vp.len(v.y) }));
      const def = design.bodies.find((d) => d.id === b.id);
      const w = def?.kind === 'block' ? def.w : 0;
      const hgt = def?.kind === 'block' ? def.h : 0;
      const angle = def?.kind === 'block' ? (def.angle * Math.PI) / 180 : 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-angle);
      drawBlock(ctx, 0, 0, vp.len(w), vp.len(hgt), pal.body, pal.bodyStroke);
      ctx.restore();
      if (selected) outline(ctx, pts, pal.accent, 5);
    }
    drawLabel(ctx, b.id, x, y + 0.5, pal.bg, { font: CANVAS_FONT });
  });

  // 速度ベクトル・値
  world.bodies.forEach((b, i) => {
    const x = vp.x(state.x[i]!);
    const y = vp.y(state.y[i]!);
    const vx = state.vx[i]!;
    const vy = state.vy[i]!;
    const speed = Math.hypot(vx, vy);
    if (options.showVelocity && speed > 1e-3) {
      const len = Math.min(speed * ARROW_SECONDS, ARROW_MAX) / speed;
      drawVector(ctx, x, y, vp.len(vx * len), -vp.len(vy * len), pal.quantity.velocity, 'v');
    }
    if (options.showValues) {
      drawLabel(
        ctx,
        `${formatFixed(speed, 2)} m/s`,
        x,
        y - vp.len(b.hy) - 10,
        pal.quantity.velocity,
        { font: CANVAS_FONT_SMALL },
      );
    }
  });

  // 編集中: 選んだ物体の初速度のつまみ
  if (view.editing && selection?.type === 'body') {
    const b = design.bodies.find((x) => x.id === selection.id);
    const hnd = velocityHandle(design, selection.id);
    if (b && hnd) {
      const hasV = Math.hypot(b.vx, b.vy) > 1e-9;
      if (hasV) {
        drawArrow(ctx, vp.x(b.x), vp.y(b.y), vp.x(hnd.x), vp.y(hnd.y), {
          color: pal.quantity.velocity,
          dashed: true,
        });
      }
      ring(ctx, vp.x(hnd.x), vp.y(hnd.y), 8, pal.quantity.velocity);
      drawLabel(ctx, 'v₀', vp.x(hnd.x) + 14, vp.y(hnd.y) - 12, pal.quantity.velocity, {
        font: CANVAS_FONT_SMALL,
        align: 'left',
      });
    }
  }

  if (view.preview) {
    const { from, to } = view.preview;
    drawDashedLine(ctx, vp.x(from.x), vp.y(from.y), vp.x(to.x), vp.y(to.y), pal.accent, 2);
    ring(ctx, vp.x(to.x), vp.y(to.y), 6, pal.accent);
  }

  if (design.bodies.length === 0) {
    drawLabel(
      ctx,
      '上の「球」「箱」などを選んでから、置きたい場所をタップ',
      size.width / 2,
      size.height * 0.4,
      pal.muted,
      { font: CANVAS_FONT_SMALL },
    );
  }
}

/** ばねを物体の縁から縁まで描くための端点 [m] */
function edgePoints(world: SandboxWorld, s: SandboxState, a: Anchor, b: Anchor): [Vec2, Vec2] {
  const [ax, ay] = anchorPosition(a, s);
  const [bx, by] = anchorPosition(b, s);
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 1e-9)
    return [
      { x: ax, y: ay },
      { x: bx, y: by },
    ];
  const ux = (bx - ax) / d;
  const uy = (by - ay) / d;
  const ra = a.body >= 0 ? boundaryDistance(world.bodies[a.body]!.shape, ux, uy) : 0;
  const rb = b.body >= 0 ? boundaryDistance(world.bodies[b.body]!.shape, -ux, -uy) : 0;
  if (ra + rb >= d)
    return [
      { x: ax, y: ay },
      { x: bx, y: by },
    ];
  return [
    { x: ax + ux * ra, y: ay + uy * ra },
    { x: bx - ux * rb, y: by - uy * rb },
  ];
}

function drawGrid(ctx: CanvasRenderingContext2D, vp: Viewport, pal: Palette, lines: boolean) {
  const x0 = vp.x(WORLD.xMin);
  const x1 = vp.x(WORLD.xMax);
  const y0 = vp.y(WORLD.yMin);
  const y1 = vp.y(WORLD.yMax);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.grid;
  if (lines) {
    ctx.beginPath();
    for (let x = 0.5; x < WORLD.xMax - 1e-9; x += 0.5) {
      ctx.moveTo(vp.x(x), y0);
      ctx.lineTo(vp.x(x), y1);
    }
    for (let y = 0.5; y < WORLD.yMax - 1e-9; y += 0.5) {
      ctx.moveTo(x0, vp.y(y));
      ctx.lineTo(x1, vp.y(y));
    }
    ctx.stroke();
  }
  ctx.strokeStyle = pal.axis;
  ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);
  ctx.restore();
  // 目盛り（1 m ごと。最後の目盛りに単位を付ける）
  const xLast = Math.floor(WORLD.xMax);
  for (let x = 0; x <= xLast; x += 1) {
    drawLabel(ctx, x === xLast ? `${x} m` : String(x), vp.x(x), y0 + 11, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
  }
  const yLast = Math.floor(WORLD.yMax);
  for (let y = 0; y <= yLast; y += 1) {
    drawLabel(ctx, y === yLast ? `${y} m` : String(y), x0 - 4, vp.y(y), pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  }
}

function outline(
  ctx: CanvasRenderingContext2D,
  pts: readonly Vec2[],
  color: string,
  grow = 3,
): void {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const x = p.x + (dx / d) * grow;
    const y = p.y + (dy / d) * grow;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
