/**
 * 電気力線・等電位線・試験電荷の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import { contourSegments, sampleGrid, type Segment } from '@/core/contour';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT,
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawLabel,
} from '@/ui/draw';
import { formatFixed } from '@/core/format';
import {
  CHARGE_RADIUS,
  NANO,
  REGION,
  TEST_CHARGE,
  charges,
  equipotentialLevels,
  field,
  fieldLines,
  potential,
  type FieldLine,
  type FieldParams,
  type TestChargeState,
} from './model';

export interface SceneOptions {
  showFieldLines: boolean;
  showEquipotentials: boolean;
  showTrail: boolean;
  showVectors: boolean;
}

/** 電荷の配置が変わったときだけ電気力線と等電位線を計算し直す */
let cache: {
  key: string;
  lines: FieldLine[];
  contours: { level: number; segments: Segment[] }[];
} | null = null;

function geometry(p: FieldParams) {
  const key = `${p.QA}|${p.QB}|${p.d}`;
  if (cache?.key !== key) {
    const grid = sampleGrid((x, y) => potential(p, x, y), REGION, 128, 72);
    cache = {
      key,
      lines: fieldLines(p),
      contours: equipotentialLevels().map((level) => ({
        level,
        segments: contourSegments(grid, level),
      })),
    };
  }
  return cache;
}

/** ベクトルの矢印の最大長 [m]。大きさ m に対し Lmax·m/(m + ref) と飽和させて画面に収める */
const ARROW_MAX = 0.07;
const V_REF = 0.1; // [m/s]
const F_REF = TEST_CHARGE * 800; // [N]（電場 800 V/m のときの力）

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: FieldParams,
  s: TestChargeState,
  trail: readonly { x: number; y: number }[],
  opt: SceneOptions,
): void {
  const vp = fitViewport(size, REGION, { top: 8, right: 8, bottom: 30, left: 8 });
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 表示領域の外（試験電荷が出たら止まる境界）を薄く示す
  const x0 = vp.x(REGION.xMin);
  const y0 = vp.y(REGION.yMax);
  const w = vp.len(REGION.xMax - REGION.xMin);
  const hgt = vp.len(REGION.yMax - REGION.yMin);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, hgt);
  ctx.clip();

  const geo = geometry(p);
  if (opt.showEquipotentials) {
    ctx.save();
    ctx.strokeStyle = pal.quantity.potential;
    for (const { level, segments } of geo.contours) {
      ctx.globalAlpha = level === 0 ? 0.95 : 0.6;
      ctx.lineWidth = level === 0 ? 2 : 1.2;
      ctx.setLineDash(level === 0 ? [6, 4] : []);
      ctx.beginPath();
      for (const sg of segments) {
        ctx.moveTo(vp.x(sg.x0), vp.y(sg.y0));
        ctx.lineTo(vp.x(sg.x1), vp.y(sg.y1));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  if (opt.showFieldLines) drawFieldLines(ctx, vp, pal, p, geo.lines);

  // 試験電荷の軌跡
  if (opt.showTrail && trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = pal.quantity.position;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    trail.forEach((q, i) =>
      i === 0 ? ctx.moveTo(vp.x(q.x), vp.y(q.y)) : ctx.lineTo(vp.x(q.x), vp.y(q.y)),
    );
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = pal.grid;
  ctx.strokeRect(x0, y0, w, hgt);
  ctx.restore();

  // 点電荷
  for (const c of charges(p)) {
    const cx = vp.x(c.x);
    const cy = vp.y(c.y);
    const r = Math.max(10, vp.len(CHARGE_RADIUS));
    const Qnc = c.q / NANO;
    if (c.q === 0) {
      ctx.save();
      ctx.strokeStyle = pal.muted;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      drawBall(ctx, cx, cy, r, pal.body, pal.bodyStroke);
      drawLabel(ctx, c.q > 0 ? '+' : '−', cx, cy + 1, pal.bg, { font: CANVAS_FONT });
    }
    drawLabel(ctx, `${c.name}  ${formatFixed(Qnc, 1)} nC`, cx, cy + r + 12, pal.fg, {
      font: CANVAS_FONT_SMALL,
    });
  }

  // 試験電荷とベクトル
  const qx = vp.x(s.x);
  const qy = vp.y(s.y);
  if (opt.showVectors && s.status === 'moving') {
    const v = Math.hypot(s.vx, s.vy);
    if (v > 0) {
      const L = vp.len((ARROW_MAX * v) / (v + V_REF));
      const ex = qx + (L * s.vx) / v;
      const ey = qy - (L * s.vy) / v;
      drawArrow(ctx, qx, qy, ex, ey, { color: pal.quantity.velocity });
      if (L > 14)
        drawLabel(ctx, 'v', ex + (8 * s.vx) / v, ey - (8 * s.vy) / v - 8, pal.quantity.velocity, {
          font: CANVAS_FONT_MATH,
        });
    }
    const E = field(p, s.x, s.y);
    const F = TEST_CHARGE * Math.hypot(E.x, E.y);
    if (F > 0 && Number.isFinite(F)) {
      const L = vp.len((ARROW_MAX * F) / (F + F_REF));
      const ux = E.x / Math.hypot(E.x, E.y);
      const uy = E.y / Math.hypot(E.x, E.y);
      drawArrow(ctx, qx, qy, qx + L * ux, qy - L * uy, { color: pal.quantity.force });
      if (L > 14)
        drawLabel(ctx, 'F', qx + (L + 10) * ux, qy - (L + 10) * uy, pal.quantity.force, {
          font: CANVAS_FONT_MATH,
        });
    }
  }
  drawBall(ctx, qx, qy, 6, pal.quantity.position, pal.bg);
  drawLabel(ctx, 'q', qx - 10, qy - 12, pal.quantity.position, { font: CANVAS_FONT_MATH });

  // 状態の表示（左上）
  const message =
    s.status === 'hit-A' || s.status === 'hit-B'
      ? `電荷 ${s.status.slice(-1)} に衝突して停止`
      : s.status === 'out'
        ? '表示領域の外へ出たので停止'
        : null;
  if (message) {
    drawLabel(ctx, message, x0 + 10, y0 + 14, pal.fg, { font: CANVAS_FONT, align: 'left' });
  }

  drawScaleBar(ctx, vp, pal, x0 + 10, vp.y(REGION.yMin) + 18);
  if (opt.showEquipotentials) {
    drawLabel(ctx, '等電位線の間隔 25 V（破線は 0 V）', x0 + w, vp.y(REGION.yMin) + 18, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  }
}

/** 電気力線と、その中ほどに向きを示す矢じり */
function drawFieldLines(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  pal: Palette,
  p: FieldParams,
  lines: readonly FieldLine[],
): void {
  ctx.save();
  ctx.strokeStyle = pal.quantity.electric;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.9;
  for (const line of lines) {
    ctx.beginPath();
    line.points.forEach((q, i) =>
      i === 0 ? ctx.moveTo(vp.x(q.x), vp.y(q.y)) : ctx.lineTo(vp.x(q.x), vp.y(q.y)),
    );
    ctx.stroke();
    // 表示領域内の部分の中ほどに矢じり（電場の向き）
    const inside = line.points.filter(
      (q) => q.x > REGION.xMin && q.x < REGION.xMax && q.y > REGION.yMin && q.y < REGION.yMax,
    );
    const i = Math.floor(inside.length * 0.45);
    const a = inside[i];
    // 矢じりが見える長さ（14 px 以上）になる点まで進む
    const b = inside.slice(i + 1).find((q) => a && vp.len(Math.hypot(q.x - a.x, q.y - a.y)) >= 14);
    if (!a || !b) continue;
    const E = field(p, a.x, a.y);
    const forward = (b.x - a.x) * E.x + (b.y - a.y) * E.y >= 0;
    const [from, to] = forward ? [a, b] : [b, a];
    drawArrow(ctx, vp.x(from.x), vp.y(from.y), vp.x(to.x), vp.y(to.y), {
      color: pal.quantity.electric,
      width: 1.5,
      head: 9,
    });
  }
  ctx.restore();
}

/** 基準長（5 cm）のものさし */
function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  pal: Palette,
  x: number,
  y: number,
): void {
  const len = vp.len(0.05);
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.lineTo(x + len, y - 4);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, '5 cm', x + len + 8, y - 2, pal.fg, { font: CANVAS_FONT_SMALL, align: 'left' });
}
