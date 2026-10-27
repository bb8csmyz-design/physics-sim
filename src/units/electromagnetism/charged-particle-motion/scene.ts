/**
 * 電場・磁場中の荷電粒子の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 * 視点（カメラ）は粒子が画面の端に近づくと追いかける。座標の目盛りで実際の位置が分かる。
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import { niceStep, tickDigits } from '@/core/ticks';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT,
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawDashedLine,
  drawLabel,
  drawOutOfPlaneMark,
} from '@/ui/draw';
import {
  electricForce,
  lorentzForce,
  omega,
  orbitCenter,
  radius,
  type ParticleParams,
  type ParticleState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
  showTrail: boolean;
  showOrbit: boolean;
}

/** 画面の中心（物理座標 [m]）。粒子を追いかけて動く */
export interface Camera {
  x: number;
  y: number;
}

/** 画面に映す範囲の高さ [m]。円運動なら直径の約 1.5 倍 */
export function viewHeight(p: ParticleParams): number {
  const r = radius(p);
  if (!Number.isFinite(r)) return 4;
  if (r === 0) return 2;
  return Math.min(30, Math.max(0.8, 3 * r));
}

export function initialCamera(p: ParticleParams): Camera {
  const c = orbitCenter(p);
  return c && Number.isFinite(c.y) && omega(p) !== 0 ? { x: 0, y: c.y } : { x: 0, y: 0 };
}

/** 粒子が中心から画面の 35% 以上離れたら、その位置を保つようにカメラを動かす */
function follow(cam: Camera, s: ParticleState, halfW: number, halfH: number): void {
  const dx = s.x - cam.x;
  const dy = s.y - cam.y;
  if (Math.abs(dx) > 0.7 * halfW) cam.x = s.x - Math.sign(dx) * 0.7 * halfW;
  if (Math.abs(dy) > 0.7 * halfH) cam.y = s.y - Math.sign(dy) * 0.7 * halfH;
}

/** 矢印の最大長（画面の高さに対する割合）と、大きさの基準値 */
const ARROW_MAX = 0.22;
const V_REF = 1; // [m/s]
const F_REF = 2e-3; // [N]

const PAD = { top: 8, right: 8, bottom: 26, left: 40 };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: ParticleParams,
  s: ParticleState,
  trail: readonly { x: number; y: number }[],
  cam: Camera,
  opt: SceneOptions,
): void {
  const H = viewHeight(p);
  const aspect = (size.width - PAD.left - PAD.right) / (size.height - PAD.top - PAD.bottom);
  const W = H * aspect;
  follow(cam, s, W / 2, H / 2);
  const world = {
    xMin: cam.x - W / 2,
    xMax: cam.x + W / 2,
    yMin: cam.y - H / 2,
    yMax: cam.y + H / 2,
  };
  const vp = fitViewport(size, world, PAD);
  const L = (m: number) => vp.len(m);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  const left = vp.x(world.xMin);
  const right = vp.x(world.xMax);
  const top = vp.y(world.yMax);
  const bottom = vp.y(world.yMin);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();

  // 座標の格子
  const stepM = niceStep(H, 4);
  const i0 = Math.floor(world.xMin / stepM) - 1;
  const i1 = Math.ceil(world.xMax / stepM) + 1;
  const j0 = Math.floor(world.yMin / stepM) - 1;
  const j1 = Math.ceil(world.yMax / stepM) + 1;
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    ctx.moveTo(vp.x(i * stepM), top);
    ctx.lineTo(vp.x(i * stepM), bottom);
  }
  for (let j = j0; j <= j1; j++) {
    ctx.moveTo(left, vp.y(j * stepM));
    ctx.lineTo(right, vp.y(j * stepM));
  }
  ctx.stroke();
  // 原点を通る軸
  ctx.strokeStyle = pal.axis;
  ctx.beginPath();
  ctx.moveTo(vp.x(0), top);
  ctx.lineTo(vp.x(0), bottom);
  ctx.moveTo(left, vp.y(0));
  ctx.lineTo(right, vp.y(0));
  ctx.stroke();

  // 磁場（⊙ / ⊗）と電場（上向きの矢印）
  const markR = Math.min(8, L(stepM) * 0.08);
  if (p.B !== 0) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        drawOutOfPlaneMark(
          ctx,
          vp.x((i + 0.25) * stepM),
          vp.y((j + 0.5) * stepM),
          markR,
          p.B > 0 ? 'out' : 'in',
          pal.quantity.magnetic,
        );
      }
    }
    ctx.restore();
  }
  if (p.E > 0) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const x = vp.x((i + 0.75) * stepM);
        drawArrow(ctx, x, vp.y((j + 0.2) * stepM), x, vp.y((j + 0.8) * stepM), {
          color: pal.quantity.electric,
          width: 1.5,
          head: 7,
        });
      }
    }
    ctx.restore();
  }

  // 円軌道（電場がないとき）
  const center = orbitCenter(p);
  if (opt.showOrbit && p.E === 0 && center && omega(p) !== 0) {
    const r = radius(p);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(vp.x(center.x), vp.y(center.y), L(r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawBall(ctx, vp.x(center.x), vp.y(center.y), 3, pal.muted, pal.muted);
    drawDashedLine(ctx, vp.x(center.x), vp.y(center.y), vp.x(s.x), vp.y(s.y), pal.muted);
    drawLabel(
      ctx,
      'r',
      (vp.x(center.x) + vp.x(s.x)) / 2 + 8,
      (vp.y(center.y) + vp.y(s.y)) / 2 - 8,
      pal.muted,
      { font: CANVAS_FONT_MATH },
    );
  }

  // 軌跡
  if (opt.showTrail && trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = pal.quantity.position;
    ctx.lineWidth = 2;
    ctx.beginPath();
    trail.forEach((q, i) =>
      i === 0 ? ctx.moveTo(vp.x(q.x), vp.y(q.y)) : ctx.lineTo(vp.x(q.x), vp.y(q.y)),
    );
    ctx.stroke();
    ctx.restore();
  }

  // 粒子とベクトル
  const px = vp.x(s.x);
  const py = vp.y(s.y);
  const Lmax = ARROW_MAX * H;
  const v = Math.hypot(s.vx, s.vy);
  if (opt.showVelocity && v > 0) {
    const len = L((Lmax * v) / (v + V_REF));
    const ex = px + (len * s.vx) / v;
    const ey = py - (len * s.vy) / v;
    drawArrow(ctx, px, py, ex, ey, { color: pal.quantity.velocity });
    if (len > 14)
      drawLabel(ctx, 'v', ex + (10 * s.vx) / v, ey - (10 * s.vy) / v, pal.quantity.velocity, {
        font: CANVAS_FONT_MATH,
      });
  }
  if (opt.showForce) {
    const f = lorentzForce(p, s);
    const fm = Math.hypot(f.x, f.y);
    if (fm > 0) {
      const len = L((Lmax * fm) / (fm + F_REF));
      const ex = px + (len * f.x) / fm;
      const ey = py - (len * f.y) / fm;
      drawArrow(ctx, px, py, ex, ey, { color: pal.quantity.force });
      if (len > 14)
        drawLabel(ctx, 'f', ex + (10 * f.x) / fm, ey - (10 * f.y) / fm, pal.quantity.force, {
          font: CANVAS_FONT_MATH,
        });
    }
    const fe = electricForce(p);
    if (fe !== 0) {
      const len = L((Lmax * Math.abs(fe)) / (Math.abs(fe) + F_REF));
      const ey = py - Math.sign(fe) * len;
      drawArrow(ctx, px, py, px, ey, { color: pal.quantity.force, dashed: true });
      if (len > 14)
        drawLabel(ctx, 'qE', px + 16, ey + Math.sign(fe) * 4, pal.quantity.force, {
          font: CANVAS_FONT_MATH,
        });
    }
  }
  drawBall(ctx, px, py, 9, pal.body, pal.bodyStroke);
  if (p.q !== 0) drawLabel(ctx, p.q > 0 ? '+' : '−', px, py + 1, pal.bg, { font: CANVAS_FONT });
  ctx.restore();

  // 枠と目盛り
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, right - left, bottom - top);
  const digits = tickDigits(stepM);
  for (let i = i0; i <= i1; i++) {
    const x = vp.x(i * stepM);
    if (x < left + 10 || x > right - 10) continue;
    drawLabel(ctx, formatFixed(i * stepM, digits), x, bottom + 12, pal.muted, {
      font: CANVAS_FONT_SMALL,
    });
  }
  for (let j = j0; j <= j1; j++) {
    const y = vp.y(j * stepM);
    if (y < top + 8 || y > bottom - 8) continue;
    drawLabel(ctx, formatFixed(j * stepM, digits), left - 6, y, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  }
  drawLabel(ctx, '[m]', left - 6, bottom + 12, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 凡例（左上）
  const legend: string[] = [];
  if (p.B !== 0) legend.push(`磁場 ${p.B > 0 ? '⊙ 紙面の裏から表へ' : '⊗ 紙面の表から裏へ'}`);
  if (p.E > 0) legend.push('電場 ↑ 上向き');
  legend.forEach((t, i) => {
    drawLabel(
      ctx,
      t,
      left + 8,
      top + 14 + i * 18,
      i === 0 && p.B !== 0 ? pal.quantity.magnetic : pal.quantity.electric,
      {
        font: CANVAS_FONT_SMALL,
        align: 'left',
      },
    );
  });
}
