/**
 * 光電効果の描画（Canvas）。光電管（陰極・陽極）と回路、飛んでいる光電子、
 * 右側に「hν = W + K_max」のエネルギーの棒グラフを描く。物理量の計算は model.ts に任せる。
 */
import type { Palette } from '@/core/theme';
import { formatFixed } from '@/core/format';
import { lightBand, wavelengthCss } from '@/core/spectrum';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawCircuitElement,
  drawLabel,
  drawMeter,
  drawPhoton,
} from '@/ui/draw';
import {
  EMIT_HALF,
  GAP,
  PARAMS,
  TIME_SCALE,
  emits,
  maxKineticEnergy,
  measuredCurrent,
  photonEnergyEV,
  type PhotoParams,
  type PhotoState,
} from './model';

export interface SceneOptions {
  showPhotons: boolean;
  showField: boolean;
}

const d = GAP;
/** 極板の厚さと半分の高さ [m]（描画用） */
const PLATE_T = 0.07 * d;
const PLATE_H = 0.8 * d;
/** 回路の下側の導線の高さ [m] */
const WIRE_Y = -PLATE_H - 0.5 * d;
/** 光源の位置と、光が当たる陰極上の点 [m] */
const SOURCE = { x: 0.7 * d, y: 1.32 * d };
const TARGET = { x: 0, y: 0 };
/** 光子のエネルギーの棒グラフの縦軸の上限 [eV]（波長の最小値 200 nm で約 6.2 eV） */
const BAR_MAX_EV = 6.5;

const LAMBDA_MAX = PARAMS.find((s) => s.key === 'lambda')!.max;
const P_SPEC = PARAMS.find((s) => s.key === 'P')!;
const V_MAX = PARAMS.find((s) => s.key === 'V')!.max;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: PhotoParams,
  s: PhotoState,
  opt: SceneOptions,
): void {
  const narrow = size.width < 520;
  const barsW = narrow ? 104 : 132;
  const vp = fitViewport(
    size,
    { xMin: -0.3 * d, xMax: 1.3 * d, yMin: WIRE_Y - 0.5 * d, yMax: SOURCE.y + 0.04 * d },
    { top: 12, right: barsW + 8, bottom: 8, left: 8 },
  );

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  const lightColor = wavelengthCss(p.lambda) ?? pal.muted;

  // 光電管のガラス（中は真空）
  const glass = {
    x: vp.x(-0.2 * d),
    y: vp.y(PLATE_H + 0.18 * d),
    w: vp.len(1.4 * d),
    h: vp.len(2 * PLATE_H + 0.3 * d),
  };
  ctx.save();
  ctx.strokeStyle = pal.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(glass.x, glass.y, glass.w, glass.h, 14);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, '真空', glass.x + 8, glass.y + 12, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  // 光線（帯）と光子
  const ang = Math.atan2(vp.y(TARGET.y) - vp.y(SOURCE.y), vp.x(TARGET.x) - vp.x(SOURCE.x));
  const half = vp.len(EMIT_HALF) * 0.85;
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const sx = vp.x(SOURCE.x);
  const sy = vp.y(SOURCE.y);
  const tx = vp.x(TARGET.x);
  const ty = vp.y(TARGET.y);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.moveTo(sx + nx * half, sy + ny * half);
  ctx.lineTo(tx + nx * half, ty + ny * half);
  ctx.lineTo(tx - nx * half, ty - ny * half);
  ctx.lineTo(sx - nx * half, sy - ny * half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (opt.showPhotons) {
    // 光子の数は光の強さに比例させ、波の間隔は波長に比例させる（模式的）
    const n = Math.round(3 + (5 * (p.P - P_SPEC.min)) / (P_SPEC.max - P_SPEC.min));
    const realSeconds = s.t / TIME_SCALE;
    const len = Math.hypot(tx - sx, ty - sy);
    for (let k = 0; k < n; k++) {
      const f = (realSeconds / 0.9 + k / n) % 1;
      const off = ((k % 3) - 1) * half * 0.55;
      const along = 0.08 + 0.84 * f;
      drawPhoton(
        ctx,
        sx + (tx - sx) * along + nx * off,
        sy + (ty - sy) * along + ny * off,
        ang,
        Math.min(30, len * 0.18),
        (4 + (22 * p.lambda) / LAMBDA_MAX) * 0.9,
        lightColor,
      );
    }
  }
  const band = lightBand(p.lambda);
  drawLabel(ctx, `λ = ${formatFixed(p.lambda, 0)} nm（${band}）`, 10, 14, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  // 極板
  const plate = (x0: number) => {
    ctx.save();
    ctx.fillStyle = pal.body;
    ctx.strokeStyle = pal.bodyStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(vp.x(x0), vp.y(PLATE_H), vp.len(PLATE_T), vp.len(2 * PLATE_H));
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  plate(-PLATE_T);
  plate(d);
  drawLabel(ctx, '陰極 K', vp.x(-PLATE_T / 2), vp.y(-PLATE_H) + 12, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });
  drawLabel(ctx, '陽極 P', vp.x(d + PLATE_T), vp.y(PLATE_H) - 10, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 電場（陽極の電位が高いと陽極 → 陰極の向き）
  if (opt.showField && p.V !== 0) {
    const len = vp.len((Math.abs(p.V) / V_MAX) * 0.6 * d);
    const dir = p.V > 0 ? -1 : 1;
    const cx = vp.x(d / 2);
    for (const yy of [-0.3, -0.75]) {
      const y = vp.y(yy * PLATE_H);
      drawArrow(ctx, cx - (dir * len) / 2, y, cx + (dir * len) / 2, y, {
        color: pal.quantity.electric,
        width: 2,
        head: 8,
      });
    }
    if (len > 14) {
      drawLabel(
        ctx,
        'E',
        cx + (dir * len) / 2 + dir * 9,
        vp.y(-0.3 * PLATE_H),
        pal.quantity.electric,
        { font: CANVAS_FONT_MATH },
      );
    }
  }

  // 光電子（点 1 個が多数の電子を表す）
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x(0), vp.y(PLATE_H * 1.15), vp.len(d), vp.len(2.3 * PLATE_H));
  ctx.clip();
  ctx.fillStyle = pal.quantity.electron;
  for (const e of s.electrons) {
    ctx.beginPath();
    ctx.arc(vp.x(e.x), vp.y(e.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 回路（電源と電流計）
  const wy = vp.y(WIRE_Y);
  const xl = vp.x(-PLATE_T / 2);
  const xr = vp.x(d + PLATE_T / 2);
  const xb = vp.x(0.28 * d);
  const xm = vp.x(0.74 * d);
  const mr = 13;
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xl, vp.y(-PLATE_H));
  ctx.lineTo(xl, wy);
  ctx.lineTo(xb - 14, wy);
  ctx.moveTo(xb + 14, wy);
  ctx.lineTo(xm - mr, wy);
  ctx.moveTo(xm + mr, wy);
  ctx.lineTo(xr, wy);
  ctx.lineTo(xr, vp.y(-PLATE_H));
  ctx.stroke();
  ctx.restore();
  // 電源（正極＝長い線を、電位の高い側の極板につなぐ）
  const plusRight = p.V >= 0;
  drawCircuitElement(
    ctx,
    'battery',
    xb + (plusRight ? -14 : 14),
    wy,
    xb + (plusRight ? 14 : -14),
    wy,
    {
      color: pal.fg,
      width: 1.5,
      size: 8,
    },
  );
  drawLabel(ctx, '+', xb + (plusRight ? 11 : -11), wy - 20, pal.fg, { font: CANVAS_FONT_SMALL });
  drawMeter(ctx, xm, wy, mr, 'A', pal.fg, pal.bg);
  const sign = p.V > 0 ? '+' : '';
  drawLabel(ctx, `V = ${sign}${formatFixed(p.V, 2)} V`, xb, wy + 22, pal.fg, {
    font: CANVAS_FONT_SMALL,
  });
  drawLabel(
    ctx,
    `I = ${formatFixed(measuredCurrent(s) * 1e6, 1)} μA`,
    xm,
    wy + 40,
    pal.quantity.current,
    { font: CANVAS_FONT_SMALL },
  );

  drawEnergyBars(ctx, size, pal, p, barsW, lightColor);
}

/** 右側の棒グラフ: 光子のエネルギー hν と、仕事関数 W + 最大運動エネルギー K_max の比較 */
function drawEnergyBars(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: PhotoParams,
  width: number,
  lightColor: string,
): void {
  const top = 36;
  const bottom = size.height - 40;
  const left = size.width - width;
  const ev = (e: number) => (e / BAR_MAX_EV) * (bottom - top);
  const barW = Math.min(30, width * 0.24);
  const x1 = left + width * 0.22;
  const x2 = left + width * 0.62;
  const hv = photonEnergyEV(p);
  const K = maxKineticEnergy(p);

  drawLabel(ctx, 'エネルギー', left + width / 2, 14, pal.fg, { font: CANVAS_FONT_SMALL });
  ctx.save();
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left + 4, bottom);
  ctx.lineTo(size.width - 6, bottom);
  ctx.stroke();
  ctx.restore();

  // 光子 1 個のエネルギー
  ctx.fillStyle = lightColor;
  ctx.fillRect(x1 - barW / 2, bottom - ev(hv), barW, ev(hv));
  drawLabel(ctx, 'hν', x1, bottom + 12, pal.fg, { font: CANVAS_FONT_MATH });
  drawLabel(ctx, formatFixed(hv, 2), x1, bottom - ev(hv) - 9, pal.fg, { font: CANVAS_FONT_SMALL });

  // 仕事関数（金属から出るのに必要）＋ 最大運動エネルギー
  ctx.fillStyle = pal.fixture;
  ctx.fillRect(x2 - barW / 2, bottom - ev(p.W), barW, ev(p.W));
  drawLabel(ctx, 'W', x2, bottom - ev(p.W) / 2, pal.bg, { font: CANVAS_FONT_MATH });
  if (K > 0) {
    ctx.fillStyle = pal.quantity.kinetic;
    ctx.fillRect(x2 - barW / 2, bottom - ev(p.W + K), barW, ev(K));
    if (ev(K) > 16) {
      drawLabel(ctx, 'K', x2, bottom - ev(p.W + K / 2), pal.bg, { font: CANVAS_FONT_MATH });
    }
  }
  drawLabel(ctx, 'W + K', x2, bottom + 12, pal.fg, { font: CANVAS_FONT_SMALL });
  drawLabel(ctx, formatFixed(p.W + K, 2), x2, bottom - ev(p.W + K) - 9, pal.fg, {
    font: CANVAS_FONT_SMALL,
  });
  // hν の高さの補助線
  ctx.save();
  ctx.strokeStyle = pal.muted;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x1 + barW / 2, bottom - ev(hv));
  ctx.lineTo(x2 + barW / 2, bottom - ev(hv));
  ctx.stroke();
  ctx.restore();

  drawLabel(
    ctx,
    emits(p) ? `Kₘₐₓ = ${formatFixed(K, 2)} eV` : 'hν < W: 電子は出ない',
    left + width / 2,
    bottom + 30,
    emits(p) ? pal.quantity.kinetic : pal.fg,
    { font: CANVAS_FONT_SMALL },
  );
}
