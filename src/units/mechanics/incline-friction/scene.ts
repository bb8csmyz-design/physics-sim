/**
 * 斜面上の運動の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { G_ACCEL } from '@/core/physics/constants';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawBlock,
  drawDashedLine,
  drawEnergyBars,
  drawFixture,
  drawFixturePolygon,
  drawLabel,
  drawScaleBar,
  drawVector,
} from '@/ui/draw';
import {
  FOOT_DISTANCE,
  energies,
  frictionForce,
  normalForce,
  topPosition,
  type InclineParams,
  type InclineState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
  showComponents: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: InclineParams,
  s: InclineState,
  opt: SceneOptions,
): void {
  const th = (p.theta * Math.PI) / 180;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const length = FOOT_DISTANCE + topPosition(p); // 斜面の長さ [m]
  const block = 0.09 * length + 0.25; // 物体の一辺 [m]
  const margin = 0.08 * length;
  const vp = fitViewport(
    size,
    {
      xMin: -margin - block,
      xMax: length * c + margin,
      yMin: 0,
      yMax: Math.max(length * sn, 0.2 * length) + 1.6 * block,
    },
    { top: energyBarsHeight(size) + 26, right: 16, bottom: 36, left: 16 },
  );
  /** 斜面の下端から斜面に沿って u [m]、斜面から垂直に n [m] の点（画面座標） */
  const at = (u: number, n: number) => ({ x: vp.x(u * c - n * sn), y: vp.y(u * sn + n * c) });

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 床と斜面の台
  const floorY = vp.y(0);
  drawFixture(ctx, 0, floorY, size.width, 12, 'top', pal.fixture);
  if (p.theta > 0) {
    drawFixturePolygon(
      ctx,
      [at(0, 0), at(length, 0), { x: vp.x(length * c), y: floorY }],
      pal.fixture,
      [0, 1],
    );
    // 傾斜角 θ
    const r = Math.min(46, vp.len(length) * 0.25);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(vp.x(0), floorY, r, -th, 0);
    ctx.stroke();
    ctx.restore();
    drawLabel(
      ctx,
      'θ',
      vp.x(0) + (r + 10) * Math.cos(th / 2),
      floorY - (r + 10) * Math.sin(th / 2),
      pal.fg,
      { font: CANVAS_FONT_MATH },
    );
  }

  // 出発点
  const start = at(FOOT_DISTANCE, 0);
  const startTop = at(FOOT_DISTANCE, 1.4 * block);
  drawDashedLine(ctx, start.x, start.y, startTop.x, startTop.y, pal.muted);
  drawLabel(ctx, '出発点', startTop.x, startTop.y - 9, pal.muted, { font: CANVAS_FONT_SMALL });

  // 物体（斜面に沿って回転させて描く）
  const u = s.s + FOOT_DISTANCE;
  const center = at(u, block / 2);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(-th);
  drawBlock(ctx, 0, 0, vp.len(block), vp.len(block), pal.body, pal.bodyStroke);
  drawLabel(ctx, 'm', 0, 0, pal.bg, { font: CANVAS_FONT_MATH });
  ctx.restore();

  // 力（重力 mg を基準長 0.22 × 斜面の長さで描き、ほかの力も同じ縮尺）
  const mg = p.m * G_ACCEL;
  const fLen = vp.len(0.22 * length) / mg;
  if (opt.showForce) {
    drawVector(ctx, center.x, center.y, 0, mg * fLen, pal.quantity.force, 'mg');
    const N = normalForce(p);
    const bottom = at(u, 0);
    drawVector(ctx, bottom.x, bottom.y, -sn * N * fLen, -c * N * fLen, pal.quantity.force, 'N');
    const f = frictionForce(p, s);
    if (Math.abs(f) > 1e-9) {
      // 摩擦力は接触面（物体の底面）に沿って描く
      const base = at(u + (Math.sign(f) * block) / 2, 0);
      drawVector(ctx, base.x, base.y, c * f * fLen, -sn * f * fLen, pal.quantity.force, 'f');
    }
  }
  if (opt.showComponents && p.theta > 0) {
    const along = mg * sn * fLen;
    const perp = mg * c * fLen;
    drawVector(ctx, center.x, center.y, -c * along, sn * along, pal.quantity.force, 'mg sinθ', {
      dashed: true,
      width: 2,
    });
    drawVector(ctx, center.x, center.y, sn * perp, c * perp, pal.quantity.force, 'mg cosθ', {
      dashed: true,
      width: 2,
    });
  }

  // 速度（初速度 v₀ を斜面の長さの 25% で描く）
  if (opt.showVelocity && p.v0 > 0) {
    const vLen = vp.len(0.25 * length) / Math.max(p.v0, 1);
    const top = at(u, block + 0.25 * block);
    drawVector(ctx, top.x, top.y, c * s.v * vLen, -sn * s.v * vLen, pal.quantity.velocity, 'v');
  }

  drawScaleBar(ctx, 14, size.height - 8, vp.scale, Math.min(120, size.width * 0.25), pal.muted);

  // エネルギー棒グラフ（初めの力学的エネルギーを基準）
  const e = energies(p, s);
  const e0 = energies(p, { s: 0, v: p.v0, heat: 0, exited: false }).total;
  drawEnergyBars(
    ctx,
    size.width - 14,
    10,
    energyBarsHeight(size),
    [
      { label: 'K', value: e.kinetic, color: pal.quantity.kinetic },
      { label: 'U', value: e.potential, color: pal.quantity.potential },
      { label: 'Q', value: e.heat, color: pal.quantity.heat },
    ],
    e0,
    pal,
  );
}

function energyBarsHeight(size: CanvasSize): number {
  return Math.min(56, size.height * 0.16);
}
