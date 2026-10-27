/**
 * ばねの単振動の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { niceStep, niceTicks, tickDigits } from '@/core/ticks';
import { formatFixed } from '@/core/format';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawBlock,
  drawDashedLine,
  drawFixture,
  drawLabel,
  drawSpring,
} from '@/ui/draw';
import {
  amplitude,
  angularFrequency,
  energies,
  referenceCirclePoint,
  springForce,
  type SpringParams,
  type SpringState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
  showCircle: boolean;
}

/** 画面の縮尺の基準長 [m]。振幅に合わせるが、小さすぎると見づらいので下限を設ける */
function sceneScale(p: SpringParams): number {
  return Math.max(amplitude(p), 0.1);
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: SpringParams,
  s: SpringState,
  opt: SceneOptions,
): void {
  const L = sceneScale(p);
  const A = amplitude(p);
  const blockW = 0.36 * L;
  const blockH = 0.26 * L;
  const wallX = -A - 0.55 * L - blockW / 2; // 最も縮んだときもばねが見える位置
  const floorY = 0;
  const circleR = A;
  const circleCY = floorY + blockH + 0.5 * L + circleR; // 物体の上の矢印と重ならない高さ
  const top = opt.showCircle ? circleCY + circleR + 0.12 * L : floorY + blockH + 0.45 * L;
  const vp = fitViewport(
    size,
    { xMin: wallX - 0.12 * L, xMax: A + blockW / 2 + 0.25 * L, yMin: floorY, yMax: top },
    // 上部はエネルギー棒グラフの置き場として空けておく
    { top: energyBarsHeight(size) + 24, right: 14, bottom: 44, left: 26 },
  );

  // 背景
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 床と壁
  const floorPx = vp.y(floorY);
  drawFixture(ctx, vp.x(wallX), floorPx, size.width, 12, 'top', pal.fixture);
  const wallTop = vp.y(floorY + blockH * 1.6);
  drawFixture(ctx, vp.x(wallX) - 14, wallTop, 14, floorPx - wallTop, 'right', pal.fixture);

  // 目盛り（床の下に x 座標 [m]）
  const step = niceStep(2 * Math.max(A, 0.05), 4);
  ctx.font = CANVAS_FONT_SMALL;
  for (const t of niceTicks(-A, A, 4)) {
    const x = vp.x(t);
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, floorPx + 12);
    ctx.lineTo(x, floorPx + 18);
    ctx.stroke();
    drawLabel(ctx, formatFixed(t, tickDigits(step)), x, floorPx + 28, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
  }
  drawLabel(ctx, 'x [m]', size.width - 8, floorPx + 28, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // つりあいの位置
  drawDashedLine(ctx, vp.x(0), floorPx, vp.x(0), vp.y(floorY + blockH * 1.5), pal.muted);
  if (!opt.showCircle) {
    // 参照円を表示しているときは円の中心の真下がつりあいの位置なので、文字は省く
    drawLabel(ctx, 'つりあいの位置', vp.x(0), vp.y(floorY + blockH * 1.5) - 9, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
  }

  // ばねと物体
  const bx = vp.x(s.x);
  const by = vp.y(floorY + blockH / 2);
  drawSpring(ctx, vp.x(wallX), bx - vp.len(blockW / 2), by, {
    color: pal.fg,
    coils: 11,
    amplitude: Math.max(5, vp.len(blockH) * 0.28),
  });
  drawBlock(ctx, bx, by, vp.len(blockW), vp.len(blockH), pal.body, pal.bodyStroke);
  drawLabel(ctx, 'm', bx, by, pal.bg, { font: CANVAS_FONT_MATH });

  // 変位 x（床の上、つりあいの位置から物体の中心まで）
  const dispY = floorPx - 5;
  if (Math.abs(vp.len(s.x)) > 4) {
    drawArrow(ctx, vp.x(0), dispY, bx, dispY, { color: pal.quantity.position, width: 2, head: 7 });
  }

  // ベクトル（最大値が 0.7L になるよう規格化した長さで描く）
  const w = angularFrequency(p);
  const arrowY = vp.y(floorY + blockH) - 14;
  if (opt.showVelocity && A > 0) {
    const len = (s.v / (A * w)) * 0.7 * L;
    drawArrow(ctx, bx, arrowY, bx + vp.len(len), arrowY, { color: pal.quantity.velocity });
    if (Math.abs(vp.len(len)) > 12) {
      drawLabel(ctx, 'v', bx + vp.len(len) + Math.sign(len) * 10, arrowY, pal.quantity.velocity, {
        font: CANVAS_FONT_MATH,
      });
    }
  }
  if (opt.showForce && A > 0) {
    const F = springForce(p, s.x);
    const len = (F / (p.k * A)) * 0.7 * L;
    const fy = by;
    const start = bx + Math.sign(len) * vp.len(blockW / 2);
    drawArrow(ctx, start, fy, start + vp.len(len), fy, { color: pal.quantity.force });
    if (Math.abs(vp.len(len)) > 12) {
      drawLabel(ctx, 'F', start + vp.len(len) + Math.sign(len) * 10, fy, pal.quantity.force, {
        font: CANVAS_FONT_MATH,
      });
    }
  }

  // 等速円運動との対応（参照円）
  if (opt.showCircle && A > 0) {
    const cx = vp.x(0);
    const cy = vp.y(circleCY);
    const r = vp.len(circleR);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const q = referenceCirclePoint(p, s);
    const qx = vp.x(q.x);
    const qy = vp.y(circleCY + q.y);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(qx, qy);
    ctx.stroke();
    ctx.restore();
    drawDashedLine(ctx, qx, qy, bx, vp.y(floorY + blockH), pal.quantity.position, 1.5);
    drawBall(ctx, qx, qy, 6, pal.quantity.position, pal.bg);
    drawLabel(ctx, '参照円（半径 A, 角速度 ω）', cx, cy - r - 10, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
  }

  drawEnergyBars(ctx, size, pal, p, s);
}

function energyBarsHeight(size: CanvasSize): number {
  return Math.min(64, size.height * 0.2);
}

/** 右上のエネルギー棒グラフ（K と U のやりとり、E は一定） */
function drawEnergyBars(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: SpringParams,
  s: SpringState,
): void {
  const e = energies(p, s);
  const E0 = 0.5 * p.k * amplitude(p) ** 2;
  if (E0 <= 0) return;
  const barW = 14;
  const gap = 8;
  const maxH = energyBarsHeight(size);
  const right = size.width - 14;
  const bottom = 10 + maxH;
  const bars = [
    { label: 'K', value: e.kinetic, color: pal.quantity.kinetic },
    { label: 'U', value: e.potential, color: pal.quantity.potential },
    { label: 'E', value: e.total, color: pal.quantity.energy },
  ];
  bars.forEach((b, i) => {
    const x = right - (bars.length - i) * (barW + gap) + gap;
    const hgt = (Math.min(b.value, E0 * 1.05) / E0) * maxH;
    ctx.fillStyle = pal.grid;
    ctx.fillRect(x, bottom - maxH, barW, maxH);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, bottom - hgt, barW, hgt);
    drawLabel(ctx, b.label, x + barW / 2, bottom + 11, pal.fg, { font: CANVAS_FONT_MATH });
  });
}
