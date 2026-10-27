/**
 * 人工衛星の運動の描画（Canvas）。物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import type { Palette } from '@/core/theme';
import { EARTH_RADIUS } from '@/core/physics/constants';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT_SMALL,
  drawBall,
  drawLabel,
  drawPath,
  drawScaleBar,
  drawVector,
} from '@/ui/draw';
import {
  analyticPosition,
  escapeRadius,
  gravityForce,
  launchRadius,
  launchSpeed,
  orbit,
  orbitKind,
  type KeplerParams,
  type KeplerState,
} from './model';

export interface SceneOptions {
  showVelocity: boolean;
  showForce: boolean;
  showOrbit: boolean;
  showArea: boolean;
}

/** 面積速度を見せるために 1 周を何等分するか */
const SECTORS = 12;

/** 描く範囲の半径 [m] */
function viewRadius(p: KeplerParams): number {
  const kind = orbitKind(p);
  if (kind === 'escape') return escapeRadius(p);
  if (kind === 'crash') return launchRadius(p);
  return Math.max(orbit(p).apogee, launchRadius(p));
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: KeplerParams,
  s: KeplerState,
  opt: SceneOptions,
): void {
  const o = orbit(p);
  const kind = orbitKind(p);
  const R = viewRadius(p) * 1.08;
  // 楕円は近地点・遠地点が x 軸上にあるので、横長の画面に合わせて中心を楕円の中心にずらす
  const cx = kind === 'ellipse' || kind === 'circle' ? -o.a * o.e * Math.cos(o.perigeeAngle) : 0;
  const halfW = kind === 'ellipse' || kind === 'circle' ? o.a * 1.08 : R;
  const halfH = kind === 'ellipse' || kind === 'circle' ? o.a * Math.sqrt(1 - o.e * o.e) * 1.08 : R;
  const vp = fitViewport(
    size,
    { xMin: cx - halfW, xMax: cx + halfW, yMin: -halfH, yMax: halfH },
    { top: 16, right: 16, bottom: 28, left: 16 },
  );

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 面積速度（等しい時間 T/12 ごとに掃く扇形を交互に塗る）
  if (opt.showArea && (kind === 'ellipse' || kind === 'circle')) {
    for (let k = 0; k < SECTORS; k++) {
      const pts = [{ x: vp.x(0), y: vp.y(0) }];
      for (let j = 0; j <= 16; j++) {
        const q = analyticPosition(p, ((k + j / 16) * o.period) / SECTORS);
        pts.push({ x: vp.x(q.x), y: vp.y(q.y) });
      }
      ctx.save();
      ctx.fillStyle = pal.quantity.momentum;
      ctx.globalAlpha = k % 2 === 0 ? 0.28 : 0.12;
      ctx.beginPath();
      pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 予想される軌道（2 次曲線 r = p/(1 + e cos(φ − φ_p))）
  if (opt.showOrbit) drawConic(ctx, vp, p, R * 1.5, pal.muted);

  // 地球
  ctx.save();
  ctx.fillStyle = pal.grid;
  ctx.strokeStyle = pal.fixture;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(vp.x(0), vp.y(0), vp.len(EARTH_RADIUS), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, '地球', vp.x(0), vp.y(0), pal.muted, { font: CANVAS_FONT_SMALL });

  // 近地点・遠地点
  if (kind === 'ellipse') {
    for (const [r, angle, label] of [
      [o.perigee, o.perigeeAngle, '近地点'],
      [o.apogee, o.perigeeAngle + Math.PI, '遠地点'],
    ] as const) {
      const x = vp.x(r * Math.cos(angle));
      const y = vp.y(r * Math.sin(angle));
      drawBall(ctx, x, y, 3, pal.muted, pal.muted);
      drawLabel(ctx, label, x, y + 14, pal.muted, { font: CANVAS_FONT_SMALL });
    }
  }

  // 動径と衛星
  const bx = vp.x(s.x);
  const by = vp.y(s.y);
  drawPath(
    ctx,
    [
      { x: vp.x(0), y: vp.y(0) },
      { x: bx, y: by },
    ],
    pal.muted,
    { width: 1, alpha: 0.6 },
  );
  drawBall(ctx, bx, by, 6, pal.body, pal.bodyStroke);

  // ベクトル（速さは最大の速さ、力は最も近づいたときの万有引力を基準に、画面の 25% の長さ）
  const len = vp.len(0.25 * R);
  if (opt.showVelocity) {
    const vMax = Math.max(o.h / Math.max(o.perigee, EARTH_RADIUS), launchSpeed(p));
    drawVector(ctx, bx, by, (s.vx / vMax) * len, (-s.vy / vMax) * len, pal.quantity.velocity, 'v');
  }
  if (opt.showForce) {
    const rMin = Math.max(o.perigee, EARTH_RADIUS);
    const fMax = gravityForce(p, { ...s, x: rMin, y: 0 });
    const F = gravityForce(p, s);
    const r = Math.hypot(s.x, s.y);
    drawVector(
      ctx,
      bx,
      by,
      (-s.x / r) * (F / fMax) * len,
      (s.y / r) * (F / fMax) * len,
      pal.quantity.force,
      'F',
    );
  }

  drawScaleBar(
    ctx,
    14,
    size.height - 8,
    vp.scale,
    Math.min(140, size.width * 0.3),
    pal.muted,
    'km',
    1000,
  );
}

/** 焦点を原点とする 2 次曲線（楕円・放物線・双曲線）を、半径 rMax までの範囲で破線で描く */
function drawConic(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  p: KeplerParams,
  rMax: number,
  color: string,
) {
  const o = orbit(p);
  const segments: { x: number; y: number }[][] = [[]];
  const n = 360;
  for (let i = 0; i <= n; i++) {
    const phi = o.perigeeAngle - Math.PI + (2 * Math.PI * i) / n;
    const den = 1 + o.e * Math.cos(phi - o.perigeeAngle);
    const r = den > 0 ? o.semiLatus / den : Infinity;
    if (r > rMax) {
      if (segments.at(-1)!.length) segments.push([]);
      continue;
    }
    segments.at(-1)!.push({ x: vp.x(r * Math.cos(phi)), y: vp.y(r * Math.sin(phi)) });
  }
  for (const seg of segments) drawPath(ctx, seg, color, { dashed: true, width: 1.5 });
}
