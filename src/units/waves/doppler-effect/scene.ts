/**
 * ドップラー効果の描画（Canvas）。波面・音源・観測者を描くだけで、計算は model.ts に任せる。
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
  frontCenter,
  frontRadius,
  wavelength,
  type DopplerParams,
  type DopplerState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showWavelength: boolean;
}

/** 画面に映す範囲 [m]（原点は画面中央） */
const VIEW = { xMin: -8, xMax: 8, yMin: -4.5, yMax: 4.5 };
/** 速度ベクトルの規格化: パラメータの最大の速さ 80 m/s をこの長さ [m] で描く */
const ARROW_PER_SPEED = 2.4 / 80;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: DopplerParams,
  s: DopplerState,
  opt: SceneOptions,
): void {
  const vp = fitViewport(size, VIEW, { top: 12, right: 12, bottom: 34, left: 12 });
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 音源と観測者が動く直線と目盛り（2 m ごと）
  const axisY = vp.y(0);
  drawDashedLine(ctx, vp.x(VIEW.xMin), axisY, vp.x(VIEW.xMax), axisY, pal.grid);
  const bottom = vp.y(VIEW.yMin);
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vp.x(VIEW.xMin), bottom);
  ctx.lineTo(vp.x(VIEW.xMax), bottom);
  ctx.stroke();
  for (let x = VIEW.xMin; x <= VIEW.xMax; x += 2) {
    ctx.beginPath();
    ctx.moveTo(vp.x(x), bottom);
    ctx.lineTo(vp.x(x), bottom + 5);
    ctx.stroke();
    drawLabel(ctx, formatFixed(x, 0), vp.x(x), bottom + 15, pal.muted, { font: CANVAS_FONT_SMALL });
  }
  drawLabel(ctx, 'x [m]', vp.x(VIEW.xMax), bottom + 28, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 波面（音波の山）。古い波面ほど薄くする
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    vp.x(VIEW.xMin),
    vp.y(VIEW.yMax),
    vp.len(VIEW.xMax - VIEW.xMin),
    vp.len(VIEW.yMax - VIEW.yMin),
  );
  ctx.clip();
  ctx.strokeStyle = pal.quantity.position;
  ctx.lineWidth = 1.5;
  for (const f of s.fronts) {
    const r = frontRadius(f, s.t);
    if (r <= 0) continue;
    ctx.globalAlpha = Math.max(0.15, 1 - r / 16);
    ctx.beginPath();
    ctx.arc(vp.x(frontCenter(p, f, s.t)), axisY, vp.len(r), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 波長 λ（音源の前後で隣り合う波面の間隔）
  if (opt.showWavelength && s.fronts.length >= 2) {
    const newest = s.fronts[s.fronts.length - 1]!;
    const prev = s.fronts[s.fronts.length - 2]!;
    for (const side of [1, -1] as const) {
      const e0 = frontCenter(p, newest, s.t) + side * frontRadius(newest, s.t);
      const e1 = frontCenter(p, prev, s.t) + side * frontRadius(prev, s.t);
      const y = vp.y(-1.6);
      const x0 = vp.x(e0);
      const x1 = vp.x(e1);
      drawArrow(ctx, (x0 + x1) / 2, y, x0, y, { color: pal.fg, width: 1.5, head: 6 });
      drawArrow(ctx, (x0 + x1) / 2, y, x1, y, { color: pal.fg, width: 1.5, head: 6 });
      drawSymbol(ctx, side === 1 ? 'λ_1' : 'λ_2', (x0 + x1) / 2, y + 14, pal.fg, {
        suffix: ` = ${formatFixed(wavelength(p, side), 2)} m`,
      });
    }
  }

  // 風
  if (p.w !== 0) {
    const y = vp.y(VIEW.yMax - 0.6);
    const x0 = vp.x(VIEW.xMin + 0.6);
    const len = vp.len(Math.abs(p.w) * ARROW_PER_SPEED * 2);
    const [a, b] = p.w > 0 ? [x0, x0 + len] : [x0 + len, x0];
    drawArrow(ctx, a, y, b, y, { color: pal.muted, width: 2 });
    drawLabel(ctx, `風 ${formatFixed(Math.abs(p.w), 0)} m/s`, x0, y + 16, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }

  // 音源 S と観測者 O
  const sx = vp.x(s.xs);
  const ox = vp.x(s.xo);
  drawBall(ctx, sx, axisY, 9, pal.body, pal.bodyStroke);
  drawLabel(ctx, '音源 S', sx, axisY + 22, pal.fg, { font: CANVAS_FONT_SMALL });
  drawBall(ctx, ox, axisY, 9, pal.bg, pal.fg);
  drawLabel(ctx, '観測者 O', ox, axisY + 22, pal.fg, { font: CANVAS_FONT_SMALL });

  if (opt.showVelocity) {
    const arrow = (x: number, v: number, label: string) => {
      if (v === 0) return;
      const y = axisY - 20;
      const x1 = x + vp.len(v * ARROW_PER_SPEED);
      drawArrow(ctx, x, y, x1, y, { color: pal.quantity.velocity });
      drawSymbol(ctx, label, x1 + Math.sign(v) * 6, y, pal.quantity.velocity, {
        align: v > 0 ? 'left' : 'right',
      });
    };
    arrow(sx, p.vs, 'v_S');
    arrow(ox, p.vo, 'v_O');
  }
}
