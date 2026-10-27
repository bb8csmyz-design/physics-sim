/**
 * 鉛直面内の円運動の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { G_ACCEL } from '@/core/physics/constants';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_SMALL,
  drawBall,
  drawDashedLine,
  drawEnergyBars,
  drawFixture,
  drawLabel,
  drawPath,
  drawScaleBar,
  drawVector,
} from '@/ui/draw';
import {
  bottomTension,
  energies,
  position,
  slackPoint,
  tension,
  velocity,
  type CircleParams,
  type CircleState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
  showSlackPoint: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: CircleParams,
  s: CircleState,
  opt: SceneOptions,
): void {
  const r = p.r;
  const vp = fitViewport(
    size,
    { xMin: -1.45 * r, xMax: 1.45 * r, yMin: -1.3 * r, yMax: 1.3 * r },
    { top: 16, right: 70, bottom: 28, left: 16 },
  );
  const cx = vp.x(0);
  const cy = vp.y(0);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 円軌道と、最下点・中心・最高点の高さ
  ctx.save();
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, vp.len(r), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  for (const [y, label] of [
    [-r, '最下点'],
    [0, '中心の高さ'],
    [r, '最高点'],
  ] as const) {
    drawDashedLine(ctx, vp.x(-1.3 * r), vp.y(y), vp.x(1.3 * r), vp.y(y), pal.grid);
    drawLabel(ctx, label, vp.x(1.32 * r), vp.y(y), pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }

  // 糸がたるむ点
  const q = slackPoint(p);
  if (opt.showSlackPoint && q) {
    const sx = vp.x(r * Math.sin(q.theta));
    const sy = vp.y(-r * Math.cos(q.theta));
    drawBall(ctx, sx, sy, 4, pal.muted, pal.muted);
    drawLabel(ctx, '糸がたるむ点', sx + 8, sy - 12, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }

  // 固定点（天井の金具）
  drawFixture(ctx, cx - 14, cy - 10, 28, 10, 'bottom', pal.fixture);

  const pos = position(p, s);
  const bx = vp.x(pos.x);
  const by = vp.y(pos.y);

  // 糸がたるんでからの軌跡（放物線）
  if (s.mode === 'free' && s.release) {
    const pts: { x: number; y: number }[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const tau = (s.tau * i) / n;
      pts.push({
        x: vp.x(s.release.x + s.release.vx * tau),
        y: vp.y(s.release.y + s.release.vy * tau - 0.5 * G_ACCEL * tau * tau),
      });
    }
    drawPath(ctx, pts, pal.quantity.position, { width: 2, alpha: 0.7 });
  }

  // 糸（たるんでいるときは垂れ下がった曲線）
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  if (s.mode === 'circle') {
    ctx.lineTo(bx, by);
  } else {
    const slack = Math.max(0, r - Math.hypot(pos.x, pos.y));
    ctx.quadraticCurveTo((cx + bx) / 2, (cy + by) / 2 + vp.len(slack) * 1.2, bx, by);
  }
  ctx.stroke();
  ctx.restore();

  // 小球
  drawBall(ctx, bx, by, 9, pal.body, pal.bodyStroke);

  // ベクトル（速さは v₀、力は最下点での張力を基準に、半径の 60% の長さで描く）
  const len = vp.len(0.6 * r);
  if (opt.showVelocity && p.v0 > 0) {
    const { vx, vy } = velocity(p, s);
    drawVector(ctx, bx, by, (vx / p.v0) * len, (-vy / p.v0) * len, pal.quantity.velocity, 'v');
  }
  if (opt.showForce) {
    const fRef = bottomTension(p);
    const mg = p.m * G_ACCEL;
    drawVector(ctx, bx, by, 0, (mg / fRef) * len, pal.quantity.force, 'mg');
    const T = tension(p, s);
    const d = Math.hypot(pos.x, pos.y);
    if (T > 0 && d > 0) {
      drawVector(
        ctx,
        bx,
        by,
        (-pos.x / d) * (T / fRef) * len,
        (pos.y / d) * (T / fRef) * len,
        pal.quantity.force,
        'T',
      );
    }
  }

  drawScaleBar(ctx, 14, size.height - 8, vp.scale, Math.min(120, size.width * 0.25), pal.muted);

  // エネルギー棒グラフ（初めの運動エネルギー = 力学的エネルギー を基準）
  const e = energies(p, s);
  const barsH = Math.min(56, size.height * 0.16);
  drawEnergyBars(
    ctx,
    size.width - 10,
    size.height - barsH - 24,
    barsH,
    [
      { label: 'K', value: e.kinetic, color: pal.quantity.kinetic },
      { label: 'U', value: e.potential, color: pal.quantity.potential },
      { label: 'E', value: e.total, color: pal.quantity.energy },
    ],
    0.5 * p.m * p.v0 * p.v0,
    pal,
  );
}
