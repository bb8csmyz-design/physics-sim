/**
 * 2 物体の衝突の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { niceTicks } from '@/core/ticks';
import { formatFixed } from '@/core/format';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawBlock,
  drawDashedLine,
  drawEnergyBars,
  drawFixture,
  drawLabel,
  drawVector,
} from '@/ui/draw';
import {
  FLOOR_HALF_WIDTH,
  afterCollision,
  blockSize,
  centerOfMass,
  energies,
  momenta,
  type CollisionParams,
  type CollisionState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showMomentum: boolean;
  showCenter: boolean;
}

/** 矢印の最大の長さ [m]（衝突の前後で最も大きい速度・運動量をこの長さで描く） */
const ARROW_MAX = 1.1;

/** 衝突の前後で最も大きい速さと運動量の大きさ（矢印の長さの基準） */
function references(p: CollisionParams): { v: number; p: number } {
  const after = afterCollision(p);
  const vs = [p.vA, p.vB, after.vA, after.vB];
  const ps = [
    p.mA * p.vA,
    p.mB * p.vB,
    p.mA * after.vA,
    p.mB * after.vB,
    p.mA * p.vA + p.mB * p.vB,
  ];
  return {
    v: Math.max(...vs.map(Math.abs), 1e-6),
    p: Math.max(...ps.map(Math.abs), 1e-6),
  };
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: CollisionParams,
  s: CollisionState,
  opt: SceneOptions,
): void {
  const W = FLOOR_HALF_WIDTH;
  const vp = fitViewport(
    size,
    { xMin: -W, xMax: W, yMin: -0.3, yMax: 1.45 },
    { top: Math.min(56, size.height * 0.16) + 24, right: 12, bottom: 30, left: 12 },
  );
  const floorY = vp.y(0);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 床と目盛り
  drawFixture(ctx, 0, floorY, size.width, 12, 'top', pal.fixture);
  for (const x of niceTicks(-W, W, 7)) {
    if (vp.x(x) > size.width - 48) continue; // 右端の「x [m]」と重ならないように
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vp.x(x), floorY + 12);
    ctx.lineTo(vp.x(x), floorY + 18);
    ctx.stroke();
    drawLabel(ctx, formatFixed(x, 0), vp.x(x), floorY + 28, pal.muted, { font: CANVAS_FONT_SMALL });
  }
  drawLabel(ctx, 'x [m]', size.width - 8, floorY + 28, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 物体（中心の高さ = 一辺の半分）
  const blocks = [
    { name: 'A', x: s.xA, v: s.vA, m: p.mA },
    { name: 'B', x: s.xB, v: s.vB, m: p.mB },
  ];
  const mom = momenta(p, s);
  const ref = references(p);
  for (const b of blocks) {
    const a = blockSize(b.m);
    const cx = vp.x(b.x);
    const cy = vp.y(a / 2);
    drawBlock(ctx, cx, cy, vp.len(a), vp.len(a), pal.body, pal.bodyStroke);
    drawLabel(ctx, b.name, cx, cy, pal.bg, { font: CANVAS_FONT_MATH });
    // 速度は物体の上、運動量はさらにその上に描く
    if (opt.showVelocity) {
      const y = vp.y(a + 0.25);
      drawVector(
        ctx,
        cx,
        y,
        vp.len((b.v / ref.v) * ARROW_MAX),
        0,
        pal.quantity.velocity,
        `v${b.name}`,
      );
    }
    if (opt.showMomentum) {
      const y = vp.y(a + 0.6);
      const pv = b.name === 'A' ? mom.pA : mom.pB;
      drawVector(
        ctx,
        cx,
        y,
        vp.len((pv / ref.p) * ARROW_MAX),
        0,
        pal.quantity.momentum,
        `p${b.name}`,
      );
    }
  }

  // 重心と、運動量の和（重心の真上に描く）
  if (opt.showCenter) {
    const g = centerOfMass(p, s);
    const gx = vp.x(g);
    drawDashedLine(ctx, gx, floorY, gx, vp.y(1.3), pal.muted);
    drawLabel(ctx, 'G', gx - 9, vp.y(1.3), pal.muted, { font: CANVAS_FONT_MATH, align: 'right' });
    if (opt.showMomentum) {
      drawVector(
        ctx,
        gx,
        vp.y(1.3),
        vp.len((mom.total / ref.p) * ARROW_MAX),
        0,
        pal.quantity.momentum,
        'pA + pB',
        {
          width: 3,
        },
      );
    }
  }

  // 衝突した時刻
  if (s.collidedAt !== null) {
    drawLabel(ctx, `衝突した時刻 t = ${formatFixed(s.collidedAt, 3)} s`, 12, 18, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }

  // エネルギー棒グラフ（初めの運動エネルギーの和を基準）
  const e = energies(p, s);
  drawEnergyBars(
    ctx,
    size.width - 14,
    10,
    Math.min(56, size.height * 0.16),
    [
      { label: 'K', value: e.total, color: pal.quantity.kinetic },
      { label: 'ΔK', value: e.lost, color: pal.quantity.heat },
    ],
    e.total + e.lost,
    pal,
  );
}
