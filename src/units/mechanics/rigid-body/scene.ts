/**
 * はしごのつりあいの描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { G_ACCEL } from '@/core/physics/constants';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawBall,
  drawDashedLine,
  drawFixture,
  drawLabel,
  drawScaleBar,
  drawVector,
} from '@/ui/draw';
import {
  LADDER_LENGTH as L,
  forces,
  totalMass,
  type LadderParams,
  type LadderState,
} from './model';

export interface SceneOptions {
  showForce: boolean;
  showArms: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: LadderParams,
  s: LadderState,
  opt: SceneOptions,
): void {
  const vp = fitViewport(
    size,
    { xMin: -0.35 * L, xMax: 1.25 * L, yMin: -0.3 * L, yMax: 1.08 * L },
    { top: 16, right: 16, bottom: 16, left: 16 },
  );
  const th = s.theta;
  const co = Math.cos(th);
  const sn = Math.sin(th);
  /** はしごに沿って下端から u [m] の点（画面座標） */
  const along = (u: number) => ({ x: vp.x((L - u) * co), y: vp.y(u * sn) });

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 壁と床
  const wallX = vp.x(0);
  const floorY = vp.y(0);
  drawFixture(ctx, wallX - 14, vp.y(1.08 * L), 14, floorY - vp.y(1.08 * L), 'right', pal.fixture);
  drawFixture(ctx, wallX - 14, floorY, size.width, 12, 'top', pal.fixture);

  // はしご（2 本の支柱と横木）
  const bottom = along(0);
  const top = along(L);
  const nx = sn; // はしごに垂直な向き（画面座標）
  const ny = co;
  const halfW = 6;
  ctx.save();
  ctx.strokeStyle = pal.body;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const sgn of [-1, 1]) {
    ctx.moveTo(bottom.x + sgn * nx * halfW, bottom.y + sgn * ny * halfW);
    ctx.lineTo(top.x + sgn * nx * halfW, top.y + sgn * ny * halfW);
  }
  ctx.lineWidth = 2;
  for (let k = 1; k < 10; k++) {
    const q = along((k * L) / 10);
    ctx.moveTo(q.x - nx * halfW, q.y - ny * halfW);
    ctx.lineTo(q.x + nx * halfW, q.y + ny * halfW);
  }
  ctx.stroke();
  ctx.restore();

  // 床となす角 θ
  const r = Math.min(40, vp.len(L) * 0.18);
  ctx.save();
  ctx.strokeStyle = pal.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bottom.x, bottom.y, r, Math.PI, Math.PI + th);
  ctx.stroke();
  ctx.restore();
  drawLabel(
    ctx,
    'θ',
    bottom.x - (r + 10) * Math.cos(th / 2),
    bottom.y - (r + 10) * Math.sin(th / 2),
    pal.fg,
    {
      font: CANVAS_FONT_MATH,
    },
  );

  // 人（はしごに乗った質点）
  const person = along(p.d);
  if (p.M > 0) {
    drawBall(ctx, person.x, person.y - 12, 10, pal.body, pal.bodyStroke);
    drawLabel(ctx, 'M', person.x, person.y - 12, pal.bg, { font: CANVAS_FONT_MATH });
  }

  // 力（全体の重力 (m + M)g を 0.4L の長さとして同じ縮尺で描く）
  const F = forces(p, s);
  const scale = vp.len(0.4 * L) / (totalMass(p) * G_ACCEL);
  const mid = along(L / 2);
  if (opt.showForce) {
    drawVector(ctx, mid.x, mid.y, 0, p.m * G_ACCEL * scale, pal.quantity.force, 'mg');
    if (p.M > 0)
      drawVector(ctx, person.x, person.y, 0, p.M * G_ACCEL * scale, pal.quantity.force, 'Mg');
    drawVector(ctx, bottom.x, bottom.y, 0, -F.N1 * scale, pal.quantity.force, 'N₁');
    drawVector(ctx, bottom.x, bottom.y, -F.f * scale, 0, pal.quantity.force, 'f');
    drawVector(ctx, top.x, top.y, F.N2 * scale, 0, pal.quantity.force, 'N₂');
  }

  // 下端のまわりの力のモーメントの腕（作用線までの距離）
  if (opt.showArms) {
    const armY = floorY + 10;
    drawDashedLine(ctx, mid.x, mid.y, mid.x, armY, pal.muted);
    drawDashedLine(ctx, mid.x, armY, bottom.x, armY, pal.muted);
    drawLabel(ctx, '(L/2)cosθ', (mid.x + bottom.x) / 2, armY + 12, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
    if (p.M > 0) {
      drawDashedLine(ctx, person.x, person.y, person.x, armY + 26, pal.muted);
      drawDashedLine(ctx, person.x, armY + 26, bottom.x, armY + 26, pal.muted);
      drawLabel(ctx, 'd cosθ', (person.x + bottom.x) / 2, armY + 38, pal.muted, {
        font: CANVAS_FONT_SMALL,
      });
    }
    const armX = bottom.x + 14;
    drawDashedLine(ctx, top.x, top.y, armX, top.y, pal.muted);
    drawDashedLine(ctx, armX, top.y, armX, bottom.y, pal.muted);
    drawLabel(ctx, 'L sinθ', armX + 6, (top.y + bottom.y) / 2, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }

  if (s.ended) {
    const msg = s.ended === 'wall' ? '上端が壁から離れた' : '床に倒れた';
    drawLabel(ctx, msg, size.width - 16, 20, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  } else if (s.sliding) {
    drawLabel(ctx, '滑っている', size.width - 16, 20, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  }

  drawScaleBar(
    ctx,
    size.width - 140,
    size.height - 10,
    vp.scale,
    Math.min(120, size.width * 0.25),
    pal.muted,
  );
}
