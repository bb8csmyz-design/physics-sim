/**
 * 鉛直ばね振り子の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { niceStep, niceTicks, tickDigits } from '@/core/ticks';
import { formatFixed } from '@/core/format';
import { G_ACCEL } from '@/core/physics/constants';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawBlock,
  drawDashedLine,
  drawEnergyBars,
  drawFixture,
  drawLabel,
  drawSpringBetween,
  drawVector,
} from '@/ui/draw';
import {
  NATURAL_LENGTH,
  amplitude,
  angularFrequency,
  energies,
  equilibriumStretch,
  springForce,
  type VSpringParams,
  type VSpringState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: VSpringParams,
  s: VSpringState,
  opt: SceneOptions,
): void {
  const d = equilibriumStretch(p);
  const A = amplitude(p);
  const ceiling = d + NATURAL_LENGTH; // 天井の位置 [m]（つりあいの位置から上向き）
  const H = ceiling + Math.max(A, 0.05); // 描く範囲の高さ
  const blockH = 0.1 * H;
  const blockW = 0.13 * H;
  const bottom = -Math.max(A, 0.05) - blockH / 2;
  const vp = fitViewport(
    size,
    // 下側には最下点で下向きに伸びる矢印（最大 0.2H）の分の余白をとる
    { xMin: -0.75 * H, xMax: 0.62 * H, yMin: bottom - 0.22 * H, yMax: ceiling },
    { top: 14, right: 14, bottom: 14, left: 14 },
  );
  const cx = vp.x(0);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 天井
  drawFixture(
    ctx,
    cx - vp.len(0.3 * H),
    vp.y(ceiling) - 12,
    vp.len(0.6 * H),
    12,
    'bottom',
    pal.fixture,
  );

  // 基準の位置: 自然長の位置（x = d）とつりあいの位置（x = 0）
  const lineL = vp.x(-0.3 * H);
  const lineR = vp.x(0.25 * H);
  for (const [y, label] of [
    [d, '自然長の位置'],
    [0, 'つりあいの位置'],
  ] as const) {
    drawDashedLine(ctx, lineL, vp.y(y), lineR, vp.y(y), pal.muted);
    drawLabel(ctx, label, lineL - 6, vp.y(y), pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  }
  // つりあいの伸び d
  if (vp.len(d) > 14) {
    const ax = vp.x(0.2 * H);
    drawDashedLine(ctx, ax, vp.y(d), ax, vp.y(0), pal.muted);
    drawLabel(ctx, 'd', ax + 10, vp.y(d / 2), pal.muted, { font: CANVAS_FONT_MATH });
  }

  // x 軸の目盛り（右側、つりあいの位置が 0、上向き正）
  const axisX = vp.x(0.36 * H);
  const span = Math.max(A, 0.05);
  const tickStep = niceStep(2 * span, 4);
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(axisX, vp.y(span));
  ctx.lineTo(axisX, vp.y(-span));
  ctx.stroke();
  for (const t of niceTicks(-span, span, 4)) {
    ctx.beginPath();
    ctx.moveTo(axisX, vp.y(t));
    ctx.lineTo(axisX + 6, vp.y(t));
    ctx.stroke();
    drawLabel(ctx, formatFixed(t, tickDigits(tickStep)), axisX + 10, vp.y(t), pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }
  drawLabel(ctx, 'x [m]', axisX, vp.y(span) - 12, pal.muted, { font: CANVAS_FONT_SMALL });

  // ばねとおもり
  const by = vp.y(s.x);
  const topOfBlock = vp.y(s.x + blockH / 2);
  drawSpringBetween(ctx, cx, vp.y(ceiling), cx, topOfBlock, {
    color: pal.fg,
    coils: 12,
    amplitude: Math.max(5, vp.len(blockW) * 0.22),
  });
  drawBlock(ctx, cx, by, vp.len(blockW), vp.len(blockH), pal.body, pal.bodyStroke);
  drawLabel(ctx, 'm', cx, by, pal.bg, { font: CANVAS_FONT_MATH });

  // 力（最下点での弾性力 k(d + A) を 0.2H の長さに規格化）
  if (opt.showForce) {
    const fRef = p.k * (d + Math.max(A, 0.05));
    const scale = vp.len(0.2 * H) / fRef;
    const F = springForce(p, s.x);
    drawVector(
      ctx,
      cx + vp.len(blockW * 0.25),
      topOfBlock,
      0,
      -F * scale,
      pal.quantity.force,
      'kΔl',
    );
    drawVector(
      ctx,
      cx - vp.len(blockW * 0.25),
      vp.y(s.x - blockH / 2),
      0,
      p.m * G_ACCEL * scale,
      pal.quantity.force,
      'mg',
    );
  }

  // 速度（最大の速さ Aω を 0.18H の長さに規格化）
  if (opt.showVelocity && A > 0) {
    const vx = cx - vp.len(blockW * 0.9);
    const len = (s.v / (A * angularFrequency(p))) * vp.len(0.18 * H);
    drawVector(ctx, vx, by, 0, -len, pal.quantity.velocity, 'v');
  }

  // エネルギー棒グラフ（K と、つりあいの位置を基準とした位置エネルギー U = ½kx²）
  const e = energies(p, s);
  drawEnergyBars(
    ctx,
    size.width - 14,
    10,
    Math.min(64, size.height * 0.2),
    [
      { label: 'K', value: e.kinetic, color: pal.quantity.kinetic },
      { label: 'U', value: e.restoring, color: pal.quantity.potential },
      { label: 'E', value: e.kinetic + e.restoring, color: pal.quantity.energy },
    ],
    0.5 * p.k * A * A,
    pal,
  );
}
