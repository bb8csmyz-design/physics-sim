/**
 * 気体分子運動論の描画（Canvas）。容器の x-y 面への投影と、速さの分布（ヒストグラム）を描く。
 * 物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import { formatFixed, formatSig } from '@/core/format';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawDashedLine,
  drawLabel,
} from '@/ui/draw';
import { drawPlotAxes, type PlotRect } from '@/ui/plot';
import {
  TRACKED,
  maxwellSpeedPdf,
  rmsSpeed,
  speeds,
  type GasState,
  type KineticParams,
} from './model';

export interface SceneOptions {
  showTracked: boolean;
  showHistogram: boolean;
}

/** ヒストグラムの横軸の上限（√⟨v²⟩ の何倍まで描くか） */
const SPEED_RANGE = 2.6;
const BINS = 13;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: KineticParams,
  s: GasState,
  opt: SceneOptions,
): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 横長の画面では左に容器・右に分布、縦長の画面では上下に並べる
  const wide = size.width >= size.height * 1.25;
  let box: PlotRect = { left: 0, top: 0, width: size.width, height: size.height };
  let hist: PlotRect | null = null;
  if (opt.showHistogram) {
    if (wide) {
      const w = Math.min(size.height, size.width * 0.5);
      box = { left: 0, top: 0, width: w, height: size.height };
      hist = { left: w + 48, top: 34, width: size.width - w - 48 - 16, height: size.height - 84 };
    } else {
      const hh = size.height * 0.36;
      box = { left: 0, top: 0, width: size.width, height: size.height - hh };
      hist = { left: 56, top: size.height - hh + 24, width: size.width - 72, height: hh - 70 };
    }
  }
  drawContainer(ctx, size, pal, p, s, opt, box);
  if (hist) drawHistogram(ctx, pal, p, s, hist);
}

function drawContainer(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: KineticParams,
  s: GasState,
  opt: SceneOptions,
  r: PlotRect,
): void {
  const L = p.L;
  const vp = fitViewport(
    size,
    { xMin: 0, xMax: L, yMin: 0, yMax: L },
    {
      top: r.top + 30,
      left: r.left + 24,
      right: size.width - (r.left + r.width) + 24,
      bottom: size.height - (r.top + r.height) + 40,
    },
  );
  const x0 = vp.x(0);
  const x1 = vp.x(L);
  const y0 = vp.y(0);
  const y1 = vp.y(L);

  // 容器（x = L の壁は圧力を測る壁として色を付ける）
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.stroke();
  ctx.strokeStyle = pal.quantity.pressure;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1, y0);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, 'x = L の壁', x1, y1 - 18, pal.quantity.pressure, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 一辺の長さ（基準長）
  const ruleY = y0 + 18;
  drawArrow(ctx, (x0 + x1) / 2, ruleY, x0, ruleY, { color: pal.muted, width: 1, head: 6 });
  drawArrow(ctx, (x0 + x1) / 2, ruleY, x1, ruleY, { color: pal.muted, width: 1, head: 6 });
  const ruleText = `L = ${formatFixed(L, 2)} m`;
  ctx.save();
  ctx.font = CANVAS_FONT_SMALL;
  const tw = ctx.measureText(ruleText).width + 10;
  ctx.fillStyle = pal.bg;
  ctx.fillRect((x0 + x1) / 2 - tw / 2, ruleY - 8, tw, 16);
  ctx.restore();
  drawLabel(ctx, ruleText, (x0 + x1) / 2, ruleY, pal.muted, { font: CANVAS_FONT_SMALL });

  // 分子（奥行き z が手前ほど大きく描く）
  const n = s.pos.length / 3;
  const rBase = Math.max(1.6, Math.min(3, vp.len(L) / 90));
  ctx.save();
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (opt.showTracked && i === TRACKED) continue;
    const px = vp.x(s.pos[3 * i]!);
    const py = vp.y(s.pos[3 * i + 1]!);
    const rr = rBase * (0.7 + 0.6 * (s.pos[3 * i + 2]! / L));
    ctx.moveTo(px + rr, py);
    ctx.arc(px, py, rr, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();

  // 注目する分子と速度ベクトル（x-y 面への投影。長さは 2√⟨v²⟩ で 0.3L になるよう規格化）
  if (opt.showTracked && n > TRACKED) {
    const i = 3 * TRACKED;
    const px = vp.x(s.pos[i]!);
    const py = vp.y(s.pos[i + 1]!);
    const k = (0.3 * L) / (2 * rmsSpeed(p));
    const ex = px + vp.len(s.vel[i]! * k);
    const ey = py - vp.len(s.vel[i + 1]! * k);
    drawArrow(ctx, px, py, ex, ey, { color: pal.quantity.velocity });
    const len = Math.hypot(ex - px, ey - py);
    if (len > 14) {
      drawLabel(
        ctx,
        'v',
        ex + ((ex - px) / len) * 10,
        ey + ((ey - py) / len) * 10,
        pal.quantity.velocity,
        { font: CANVAS_FONT_MATH },
      );
    }
    drawBall(ctx, px, py, rBase + 3, pal.quantity.velocity, pal.bg);
  }
}

function drawHistogram(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  p: KineticParams,
  s: GasState,
  r: PlotRect,
): void {
  const vRms = rmsSpeed(p);
  const vMax = SPEED_RANGE * vRms;
  const width = vMax / BINS;
  const counts = new Array<number>(BINS).fill(0);
  for (const v of speeds(s)) {
    const k = Math.floor(v / width);
    if (k < BINS) counts[k]!++;
  }
  const n = s.pos.length / 3;
  // マクスウェル分布の山の高さ（v = √(2kT/m) = √(2/3)·√⟨v²⟩ で最大）
  const peak = n * width * maxwellSpeedPdf(p, Math.sqrt(2 / 3) * vRms);
  const yMax = Math.max(peak * 1.3, ...counts, 1);
  const plot = drawPlotAxes(ctx, pal, r, {
    x: { min: 0, max: vMax, label: 'v [m/s]', ticks: 4 },
    y: { min: 0, max: yMax, label: '分子数', ticks: 4 },
  });

  // ヒストグラム
  ctx.save();
  ctx.fillStyle = pal.quantity.velocity;
  ctx.globalAlpha = 0.45;
  for (let k = 0; k < BINS; k++) {
    const xa = plot.x(k * width) + 1;
    const xb = plot.x((k + 1) * width) - 1;
    const yt = plot.y(counts[k]!);
    ctx.fillRect(xa, yt, xb - xa, plot.y(0) - yt);
  }
  ctx.restore();

  // マクスウェル分布（同じ区間幅で個数に換算した曲線）
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const v = (i / 120) * vMax;
    const y = plot.y(n * width * maxwellSpeedPdf(p, v));
    if (i === 0) ctx.moveTo(plot.x(v), y);
    else ctx.lineTo(plot.x(v), y);
  }
  ctx.stroke();
  ctx.restore();

  // 二乗平均速度
  const xr = plot.x(vRms);
  drawDashedLine(ctx, xr, r.top, xr, r.top + r.height, pal.quantity.velocity, 1.5);
  drawLabel(ctx, `√⟨v²⟩ = ${formatSig(vRms, 3)} m/s`, xr + 6, r.top + 10, pal.fg, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });
  drawLabel(ctx, '曲線: マクスウェル分布', r.left + r.width, r.top - 12, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });
}
