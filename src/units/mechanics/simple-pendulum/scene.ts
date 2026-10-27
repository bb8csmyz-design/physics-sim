/**
 * 単振り子の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { G_ACCEL } from '@/core/physics/constants';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  drawBall,
  drawDashedLine,
  drawEnergyBars,
  drawFixture,
  drawLabel,
  drawScaleBar,
  drawVector,
} from '@/ui/draw';
import {
  bottomSpeed,
  bottomTension,
  energies,
  position,
  smallAngleTheta,
  tangentialVelocity,
  tension,
  type PendulumParams,
  type PendulumState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
  showComponents: boolean;
  showApprox: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: PendulumParams,
  s: PendulumState,
  t: number,
  opt: SceneOptions,
): void {
  const L = p.L;
  const th0 = (p.theta0 * Math.PI) / 180;
  const vp = fitViewport(
    size,
    // 下側は最下点から下向きに伸びる矢印（最大 0.3L）の分の余白をとる
    { xMin: -1.15 * L, xMax: 1.15 * L, yMin: -1.35 * L, yMax: 0.05 * L },
    { top: 16, right: 16, bottom: 24, left: 16 },
  );
  const ox = vp.x(0);
  const oy = vp.y(0);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 天井と鉛直線
  drawFixture(ctx, ox - vp.len(0.25 * L), oy - 12, vp.len(0.5 * L), 12, 'bottom', pal.fixture);
  drawDashedLine(ctx, ox, oy, ox, vp.y(-1.1 * L), pal.muted);

  // おもりの通り道（円弧 ±θ₀）
  if (th0 > 0) {
    ctx.save();
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // 画面座標では y が下向きなので、鉛直下向き（π/2）から ±θ₀
    ctx.arc(ox, oy, vp.len(L), Math.PI / 2 - th0, Math.PI / 2 + th0);
    ctx.stroke();
    ctx.restore();
  }

  // 単振動の近似解 θ₀ cos ωt のおもり（比較用、中抜きの円）
  if (opt.showApprox && th0 > 0) {
    const ta = smallAngleTheta(p, t);
    const ax = vp.x(L * Math.sin(ta));
    const ay = vp.y(-L * Math.cos(ta));
    drawDashedLine(ctx, ox, oy, ax, ay, pal.muted);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(ax, ay, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 糸とおもり
  const q = position(p, s);
  const bx = vp.x(q.x);
  const by = vp.y(q.y);
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();

  // 振れ角 θ
  if (Math.abs(s.theta) > 0.03) {
    const r = Math.min(40, vp.len(L) * 0.25);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const a0 = Math.PI / 2;
    const a1 = Math.PI / 2 - s.theta;
    ctx.arc(ox, oy, r, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    ctx.restore();
    const am = Math.PI / 2 - s.theta / 2;
    drawLabel(ctx, 'θ', ox + (r + 10) * Math.cos(am), oy + (r + 10) * Math.sin(am), pal.fg, {
      font: CANVAS_FONT_MATH,
    });
  }

  drawBall(ctx, bx, by, 10, pal.body, pal.bodyStroke);

  // 単位ベクトル: 接線方向（θ が増える向き）と、おもりから固定点へ向かう向き（画面座標）
  const tx = Math.cos(s.theta);
  const ty = -Math.sin(s.theta);
  const cx = -Math.sin(s.theta);
  const cy = -Math.cos(s.theta);
  const len = vp.len(0.3 * L);

  // 力（最下点の張力を 0.3L の長さに規格化）
  const fRef = Math.max(bottomTension(p), p.m * G_ACCEL);
  const mg = p.m * G_ACCEL;
  if (opt.showForce) {
    drawVector(ctx, bx, by, 0, (mg / fRef) * len, pal.quantity.force, 'mg');
    const T = tension(p, s);
    drawVector(ctx, bx, by, cx * (T / fRef) * len, cy * (T / fRef) * len, pal.quantity.force, 'T');
  }
  if (opt.showComponents && Math.abs(s.theta) > 0.01) {
    // 重力の接線成分（復元力）−mg sin θ と、糸方向の成分 mg cos θ
    const ft = (-mg * Math.sin(s.theta)) / fRef;
    const fn = (mg * Math.cos(s.theta)) / fRef;
    drawVector(ctx, bx, by, tx * ft * len, ty * ft * len, pal.quantity.force, 'mg sinθ', {
      dashed: true,
      width: 2,
    });
    drawVector(ctx, bx, by, -cx * fn * len, -cy * fn * len, pal.quantity.force, 'mg cosθ', {
      dashed: true,
      width: 2,
    });
  }

  // 速度（最下点での速さを 0.3L の長さに規格化）
  const vMax = bottomSpeed(p);
  if (opt.showVelocity && vMax > 0) {
    const v = tangentialVelocity(p, s) / vMax;
    drawVector(ctx, bx, by, tx * v * len, ty * v * len, pal.quantity.velocity, 'v');
  }

  drawScaleBar(ctx, 14, size.height - 8, vp.scale, Math.min(120, size.width * 0.25), pal.muted);

  // エネルギー棒グラフ（初めの位置エネルギー = 力学的エネルギー を基準）
  const e = energies(p, s);
  drawEnergyBars(
    ctx,
    size.width - 14,
    10,
    Math.min(56, size.height * 0.16),
    [
      { label: 'K', value: e.kinetic, color: pal.quantity.kinetic },
      { label: 'U', value: e.potential, color: pal.quantity.potential },
      { label: 'E', value: e.total, color: pal.quantity.energy },
    ],
    energies(p, { theta: th0, omega: 0 }).total,
    pal,
  );
}
