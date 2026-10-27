/**
 * 放物運動の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { niceStep, niceTicks, tickDigits } from '@/core/ticks';
import { formatFixed } from '@/core/format';
import { G_ACCEL } from '@/core/physics/constants';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT_SMALL,
  drawBall,
  drawDashedLine,
  drawEnergyBars,
  drawFixture,
  drawLabel,
  drawPath,
  drawVector,
} from '@/ui/draw';
import {
  analyticState,
  energies,
  flightSummary,
  idealSummary,
  type ProjectileParams,
  type ProjectileState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showComponents: boolean;
  showForce: boolean;
  showIdeal: boolean;
}

/** 軌跡を描く点の数 */
const PATH_POINTS = 160;

/** 描画範囲 [m]。この条件の軌道（と比較用の空気抵抗なしの軌道）が収まるように決める */
function worldOf(p: ProjectileParams, opt: SceneOptions) {
  const real = flightSummary(p);
  const ideal = idealSummary(p);
  const useIdeal = opt.showIdeal && p.k > 0;
  const xMax = Math.max(real.range, useIdeal ? ideal.range : 0);
  const yMax = Math.max(real.maxHeight, useIdeal ? ideal.maxHeight : 0, p.h0);
  // 真上に投げたときなど幅が小さい場合も、縦横比が極端にならないよう最小幅を確保する
  const span = Math.max(xMax, yMax, 1);
  return { xMax: Math.max(xMax, 0.5 * span), yMax: Math.max(yMax, 0.15 * span), span };
}

/** 軌道 0 ≤ t ≤ tEnd の点列（解析解から求める。地面より下は描かない） */
function pathPoints(p: ProjectileParams, tEnd: number, vp: Viewport) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= PATH_POINTS; i++) {
    const a = analyticState(p, (tEnd * i) / PATH_POINTS);
    pts.push({ x: vp.x(a.x), y: vp.y(Math.max(a.y, 0)) });
  }
  return pts;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: ProjectileParams,
  s: ProjectileState,
  t: number,
  opt: SceneOptions,
): void {
  const w = worldOf(p, opt);
  const towerW = p.h0 > 0 ? 0.06 * w.span : 0;
  const vp = fitViewport(
    size,
    { xMin: -towerW - 0.04 * w.span, xMax: w.xMax + 0.06 * w.span, yMin: 0, yMax: w.yMax },
    { top: energyBarsHeight(size) + 30, right: 18, bottom: 40, left: 18 },
  );

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 地面と目盛り（x [m]）
  const groundPx = vp.y(0);
  drawFixture(ctx, 0, groundPx, size.width, 12, 'top', pal.fixture);
  const tickStep = niceStep(w.xMax, 5);
  for (const x of niceTicks(0, w.xMax + 0.05 * w.span, 5)) {
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vp.x(x), groundPx + 12);
    ctx.lineTo(vp.x(x), groundPx + 18);
    ctx.stroke();
    drawLabel(ctx, formatFixed(x, tickDigits(tickStep)), vp.x(x), groundPx + 28, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
  }
  drawLabel(ctx, 'x [m]', size.width - 8, groundPx + 28, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 投射台（高さ h）
  if (p.h0 > 0) {
    const top = vp.y(p.h0);
    drawFixture(ctx, vp.x(-towerW), top, vp.len(towerW), groundPx - top, 'right', pal.fixture);
    drawFixture(ctx, vp.x(-towerW), top, vp.len(towerW), 4, 'top', pal.fixture);
  }

  // 比較用: 空気抵抗なしの軌道（破線）
  if (opt.showIdeal && p.k > 0) {
    const ideal = { ...p, k: 0 };
    drawPath(ctx, pathPoints(ideal, idealSummary(ideal).flightTime, vp), pal.muted, {
      dashed: true,
      width: 1.5,
    });
  }

  // 最高点の高さ
  const sum = flightSummary(p);
  if (sum.maxHeight > p.h0 + 1e-9) {
    const yH = vp.y(sum.maxHeight);
    drawDashedLine(ctx, vp.x(0), yH, vp.x(w.xMax), yH, pal.muted);
    drawLabel(ctx, `H = ${formatFixed(sum.maxHeight, 2)} m`, vp.x(0) + 4, yH - 9, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }

  // ここまでの軌跡（解析解と数値解は一致するので、なめらかな解析解で描く）
  drawPath(ctx, pathPoints(p, s.landed ? sum.flightTime : t, vp), pal.quantity.position, {
    width: 2,
    alpha: 0.7,
  });

  // 物体
  const bx = vp.x(s.x);
  const by = vp.y(s.y);
  const r = 7;
  drawBall(ctx, bx, by - (s.y <= 0 ? r : 0), r, pal.body, pal.bodyStroke);

  // ベクトル（速さは「空気抵抗なしで着地するときの速さ」を基準に、画面の 22% の長さに規格化）
  const vRef = Math.max(idealSummary(p).landingSpeed, 1);
  const vScale = (0.22 * vp.len(w.span)) / vRef;
  if (!s.landed) {
    if (opt.showComponents) {
      drawVector(ctx, bx, by, s.vx * vScale, 0, pal.quantity.velocity, 'vx', {
        dashed: true,
        width: 2,
      });
      drawVector(ctx, bx, by, 0, -s.vy * vScale, pal.quantity.velocity, 'vy', {
        dashed: true,
        width: 2,
      });
    }
    if (opt.showVelocity) {
      drawVector(ctx, bx, by, s.vx * vScale, -s.vy * vScale, pal.quantity.velocity, 'v');
    }
    if (opt.showForce) {
      // 重力 mg の長さを画面の 12% とし、抵抗力 kv も同じ縮尺で描く
      const fScale = (0.12 * vp.len(w.span)) / (p.m * G_ACCEL);
      drawVector(ctx, bx, by, 0, p.m * G_ACCEL * fScale, pal.quantity.force, 'mg');
      if (p.k > 0) {
        const fx = -p.k * s.vx * fScale;
        const fy = -p.k * s.vy * fScale;
        drawVector(ctx, bx, by, fx, -fy, pal.quantity.force, 'kv');
      }
    }
  }

  // エネルギー棒グラフ（初めの力学的エネルギーを基準）
  const e = energies(p, s);
  const e0 = 0.5 * p.m * p.v0 ** 2 + p.m * G_ACCEL * p.h0;
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
