/**
 * レンズによる像の描画（Canvas）。物体・作図の 3 本の光線・像・焦点を描く。
 */
import type { Palette } from '@/core/theme';
import { formatFixed } from '@/core/format';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawDashedLine,
  drawLabel,
  drawSymbol,
} from '@/ui/draw';
import {
  imageDistance,
  imageHeight,
  outgoingSlope,
  principalRayHeights,
  type LensKind,
  type LensParams,
  type LensState,
} from './model';

export interface SceneOptions {
  showRays: boolean;
  showVelocity: boolean;
}

/** 画面に映す範囲 [m]（レンズが中央、光軸が y = 0） */
const VIEW = { xMin: -0.6, xMax: 0.6, yMin: -0.24, yMax: 0.24 };
/** レンズの半分の高さ [m]（描画用） */
const LENS_HALF = 0.2;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  kind: LensKind,
  p: LensParams,
  s: LensState,
  opt: SceneOptions,
): void {
  const vp = fitViewport(size, VIEW, { top: 8, right: 10, bottom: 26, left: 10 });
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const a = s.a;
  const b = imageDistance(kind, a, p);
  const yImg = imageHeight(kind, a, p);
  const left = vp.x(VIEW.xMin);
  const right = vp.x(VIEW.xMax);
  const axisY = vp.y(0);

  // 光軸と目盛り（0.1 m ごと）
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, axisY);
  ctx.lineTo(right, axisY);
  ctx.stroke();
  const tickY = vp.y(VIEW.yMin);
  for (let i = -6; i <= 6; i++) {
    const x = vp.x(i / 10);
    ctx.beginPath();
    ctx.moveTo(x, tickY);
    ctx.lineTo(x, tickY + 4);
    ctx.stroke();
    // 両端は単位の表示と重なるので数値を省く
    if (i % 2 === 0 && Math.abs(i) < 6) {
      drawLabel(ctx, formatFixed(i / 10, 1), x, tickY + 14, pal.muted, { font: CANVAS_FONT_SMALL });
    }
  }
  drawLabel(ctx, 'x [m]', right, tickY + 14, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 焦点 F と 2F
  for (const sign of [-1, 1]) {
    drawBall(ctx, vp.x(sign * p.F), axisY, 3.5, pal.fg, pal.fg);
    drawLabel(ctx, 'F', vp.x(sign * p.F), axisY + 14, pal.fg, { font: CANVAS_FONT_SMALL });
    if (2 * p.F < VIEW.xMax) {
      drawBall(ctx, vp.x(sign * 2 * p.F), axisY, 2.5, pal.muted, pal.muted);
      drawLabel(ctx, '2F', vp.x(sign * 2 * p.F), axisY + 14, pal.muted, {
        font: CANVAS_FONT_SMALL,
      });
    }
  }

  // レンズ（記号: 凸は外向き、凹は内向きの矢じり）
  const top = vp.y(LENS_HALF);
  const bottom = vp.y(-LENS_HALF);
  const cx = vp.x(0);
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.fillStyle = pal.fg;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, bottom);
  ctx.stroke();
  const head = 8;
  const dir = kind === 'convex' ? 1 : -1;
  for (const [y, sgn] of [
    [top, -1],
    [bottom, 1],
  ] as const) {
    const tip = y;
    const base = y - sgn * dir * head;
    ctx.beginPath();
    ctx.moveTo(cx, kind === 'convex' ? tip : base);
    ctx.lineTo(cx - head * 0.7, kind === 'convex' ? base : tip);
    ctx.lineTo(cx + head * 0.7, kind === 'convex' ? base : tip);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  drawLabel(ctx, kind === 'convex' ? '凸レンズ' : '凹レンズ', cx, top - 2, pal.muted, {
    font: CANVAS_FONT_SMALL,
    baseline: 'bottom',
  });

  // 作図の 3 本の光線
  const tip = { x: vp.x(-a), y: vp.y(p.h) };
  if (opt.showRays) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, vp.y(VIEW.yMax), right - left, vp.len(VIEW.yMax - VIEW.yMin));
    ctx.clip();
    for (const yL of principalRayHeights(kind, a, p)) {
      if (Math.abs(yL) > LENS_HALF) continue; // レンズに当たらない光線は描かない
      const slope = outgoingSlope(kind, a, p, yL);
      const lensPt = { x: cx, y: vp.y(yL) };
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(lensPt.x, lensPt.y);
      ctx.lineTo(right, vp.y(yL + slope * VIEW.xMax));
      ctx.stroke();
      // 虚像のときは、出た光線を逆向きに延長した線（破線）が像に集まる
      if (Number.isFinite(b) && b < 0) {
        drawDashedLine(ctx, lensPt.x, lensPt.y, vp.x(b), vp.y(yL + slope * b), pal.muted, 1.2);
      }
    }
    ctx.restore();
  }

  // 物体
  drawArrow(ctx, tip.x, axisY, tip.x, tip.y, { color: pal.bodyStroke, width: 4, head: 11 });
  drawLabel(ctx, '物体', tip.x, axisY + 14, pal.fg, { font: CANVAS_FONT_SMALL });
  if (opt.showVelocity && p.v !== 0) {
    const len = vp.len((p.v / 0.05) * 0.08);
    const y = tip.y - 14;
    drawArrow(ctx, tip.x, y, tip.x + len, y, { color: pal.quantity.velocity, width: 2.5 });
    drawSymbol(ctx, 'v', tip.x + len + Math.sign(len) * 10, y, pal.quantity.velocity);
  }

  // 像
  if (!Number.isFinite(b)) {
    drawLabel(ctx, '像はできない（光が平行に出る）', right - 4, vp.y(VIEW.yMax) + 12, pal.fg, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  } else if (b > VIEW.xMax || b < VIEW.xMin || Math.abs(yImg) > VIEW.yMax) {
    drawLabel(
      ctx,
      `像は画面の外（b = ${formatFixed(b, 2)} m）`,
      right - 4,
      vp.y(VIEW.yMax) + 12,
      pal.fg,
      { font: CANVAS_FONT_SMALL, align: 'right' },
    );
  } else {
    const ix = vp.x(b);
    drawArrow(ctx, ix, axisY, ix, vp.y(yImg), {
      color: pal.quantity.position,
      width: 4,
      head: 11,
      dashed: b < 0,
    });
    // 像の名前は矢印の先に置く（光軸の下の「物体」「F」の文字と重ならないように）
    drawLabel(
      ctx,
      b > 0 ? '実像' : '虚像',
      ix,
      vp.y(yImg) + (yImg > 0 ? -10 : 12),
      pal.quantity.position,
      {
        font: CANVAS_FONT_SMALL,
      },
    );
  }
}
