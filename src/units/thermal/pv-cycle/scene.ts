/**
 * p-V 図と熱サイクルの描画（Canvas）。左にシリンダーとピストン、右に p-V 図を描く。
 * 物理量の計算は model.ts に任せ、ここでは描くだけ。
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import type { CanvasSize } from '@/ui/canvas';
import {
  CANVAS_FONT,
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBall,
  drawBlock,
  drawFixture,
  drawLabel,
} from '@/ui/draw';
import { drawPlotAxes, type PlotMapping, type PlotRect } from '@/ui/plot';
import {
  currentState,
  isothermPressure,
  processDirections,
  processPoint,
  type Cycle,
  type CycleSummary,
  type Progress,
  type StateVars,
} from './model';

export interface SceneOptions {
  showIsotherms: boolean;
  showArea: boolean;
  showArrows: boolean;
}

/** p-V 図・グラフの目盛りの単位（V は ×10⁻³ m³、p は ×10⁵ Pa で表示する） */
export const V_UNIT = 1e-3;
export const P_UNIT = 1e5;
/** 1 つの過程の曲線を描く点の数 */
const SAMPLES = 64;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  c: Cycle,
  sum: CycleSummary,
  pr: Progress,
  opt: SceneOptions,
): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  const cw = Math.max(96, Math.min(200, size.width * 0.28));
  const x = currentState(c, pr);
  drawCylinder(ctx, pal, c, sum, pr, x, opt, {
    left: 8,
    top: 16,
    width: cw - 16,
    height: size.height - 24,
  });
  drawDiagram(ctx, pal, c, sum, pr, x, opt, {
    left: cw + 40,
    top: 34,
    width: size.width - cw - 40 - 16,
    height: size.height - 34 - 44,
  });
}

function bounds(c: Cycle): { Vmax: number; pmax: number } {
  const states = c.processes.map((p) => p.start);
  return {
    Vmax: Math.max(...states.map((s) => s.V)),
    pmax: Math.max(...states.map((s) => s.p)),
  };
}

function drawCylinder(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  c: Cycle,
  sum: CycleSummary,
  pr: Progress,
  x: StateVars,
  opt: SceneOptions,
  r: PlotRect,
): void {
  const { Vmax } = bounds(c);
  const dir = processDirections(c, pr.index);
  const kind = c.processes[pr.index]!.kind;

  const wall = 8;
  const innerW = Math.min(r.width - 2 * wall - 8, 120);
  const cx = r.left + r.width / 2;
  const xl = cx - innerW / 2;
  const xr = cx + innerW / 2;
  const heatSpace = 48;
  const bottom = r.top + r.height - heatSpace;
  const pistonH = 12;
  const topSpace = 40;
  const maxGas = bottom - (r.top + topSpace) - pistonH;
  const gasH = (x.V / Vmax) * maxGas;
  const gasTop = bottom - gasH;

  // 気体（温度が高いほど濃く塗る）
  const heat = sum.Tmax > sum.Tmin ? (x.T - sum.Tmin) / (sum.Tmax - sum.Tmin) : 0.5;
  ctx.save();
  ctx.globalAlpha = 0.12 + 0.43 * heat;
  ctx.fillStyle = pal.quantity.temperature;
  ctx.fillRect(xl, gasTop, innerW, gasH);
  ctx.restore();
  drawLabel(ctx, `${formatFixed(x.T, 0)} K`, cx, gasTop + gasH / 2, pal.fg, {
    font: CANVAS_FONT,
  });

  // シリンダーの壁（断熱変化のときは断熱材を表すハッチを付ける）
  const wallTop = r.top + topSpace - 10;
  if (kind === 'adiabatic') {
    drawFixture(ctx, xl - wall, wallTop, wall, bottom - wallTop, 'right', pal.fixture);
    drawFixture(ctx, xr, wallTop, wall, bottom - wallTop, 'left', pal.fixture);
    drawFixture(ctx, xl - wall, bottom, innerW + 2 * wall, wall, 'top', pal.fixture);
    drawLabel(ctx, '断熱', cx, bottom + wall + 12, pal.muted, { font: CANVAS_FONT_SMALL });
  }
  ctx.save();
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(xl, wallTop);
  ctx.lineTo(xl, bottom);
  ctx.lineTo(xr, bottom);
  ctx.lineTo(xr, wallTop);
  ctx.stroke();
  ctx.restore();

  // ピストンとロッド
  const pistonY = gasTop - pistonH / 2;
  drawBlock(ctx, cx, pistonY, innerW - 2, pistonH, pal.body, pal.bodyStroke);
  ctx.save();
  ctx.strokeStyle = pal.body;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, pistonY - pistonH / 2);
  ctx.lineTo(cx, Math.min(pistonY - pistonH / 2, r.top + 4));
  ctx.stroke();
  ctx.restore();
  if (dir.work === 0) {
    // 定積変化: ピストンを止め具で固定する
    for (const sx of [xl + 3, xr - 9]) {
      ctx.fillStyle = pal.fixture;
      ctx.fillRect(sx, pistonY - pistonH / 2 - 7, 6, 7);
    }
  }

  if (!opt.showArrows) return;
  // 仕事: 膨張なら気体が外へ仕事をする（上向き）、圧縮なら外から仕事をされる（下向き）
  if (dir.work !== 0) {
    const ax = xr - 10;
    const yLow = pistonY - pistonH / 2 - 4;
    const yHigh = yLow - 26;
    if (dir.work > 0) drawArrow(ctx, ax, yLow, ax, yHigh, { color: pal.quantity.work });
    else drawArrow(ctx, ax, yHigh, ax, yLow, { color: pal.quantity.work });
    drawLabel(ctx, 'W', ax - 12, (yLow + yHigh) / 2, pal.quantity.work, {
      font: CANVAS_FONT_MATH,
    });
  }
  // 熱: 吸熱なら下から入る、放熱なら下へ出ていく
  if (dir.heat !== 0) {
    const hx = cx - 8;
    const yIn = bottom + 4;
    const yOut = bottom + heatSpace - 6;
    if (dir.heat > 0) drawArrow(ctx, hx, yOut, hx, yIn, { color: pal.quantity.heat });
    else drawArrow(ctx, hx, yIn, hx, yOut, { color: pal.quantity.heat });
    drawLabel(ctx, 'Q', hx + 14, (yIn + yOut) / 2, pal.quantity.heat, { font: CANVAS_FONT_MATH });
  }
}

function drawDiagram(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  c: Cycle,
  sum: CycleSummary,
  pr: Progress,
  x: StateVars,
  opt: SceneOptions,
  r: PlotRect,
): void {
  const { Vmax, pmax } = bounds(c);
  const plot = drawPlotAxes(ctx, pal, r, {
    x: { min: 0, max: Vmax * 1.08, label: 'V [×10⁻³ m³]', unit: V_UNIT },
    y: { min: 0, max: pmax * 1.12, label: 'p [×10⁵ Pa]', unit: P_UNIT },
  });
  const paths = c.processes.map((proc) =>
    Array.from({ length: SAMPLES + 1 }, (_, i) => processPoint(c.gas, c.n, proc, i / SAMPLES)),
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.left, r.top, r.width, r.height);
  ctx.clip();

  // 等温線（最高温度・最低温度）
  if (opt.showIsotherms) {
    for (const T of [sum.Tmax, sum.Tmin]) drawIsotherm(ctx, pal, plot, c.n, T, Vmax * 1.08);
  }

  // 囲む面積 = 正味の仕事
  if (opt.showArea) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = pal.quantity.work;
    ctx.beginPath();
    paths.flat().forEach((pt, i) => {
      if (i === 0) ctx.moveTo(plot.x(pt.V), plot.y(pt.p));
      else ctx.lineTo(plot.x(pt.V), plot.y(pt.p));
    });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // サイクルの経路（進行中の過程を強調）
  paths.forEach((pts, i) => {
    ctx.save();
    ctx.strokeStyle = i === pr.index ? pal.accent : pal.fg;
    ctx.lineWidth = i === pr.index ? 3.5 : 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((pt, j) => {
      if (j === 0) ctx.moveTo(plot.x(pt.V), plot.y(pt.p));
      else ctx.lineTo(plot.x(pt.V), plot.y(pt.p));
    });
    ctx.stroke();
    ctx.restore();
    // 向きを表す矢印（過程の中ほど）
    const a = pts[Math.floor(SAMPLES * 0.42)]!;
    const b = pts[Math.floor(SAMPLES * 0.58)]!;
    const dx = plot.x(b.V) - plot.x(a.V);
    const dy = plot.y(b.p) - plot.y(a.p);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      const mx = (plot.x(a.V) + plot.x(b.V)) / 2;
      const my = (plot.y(a.p) + plot.y(b.p)) / 2;
      const ux = dx / len;
      const uy = dy / len;
      drawArrow(ctx, mx - ux * 7, my - uy * 7, mx + ux * 7, my + uy * 7, {
        color: i === pr.index ? pal.accent : pal.fg,
        head: 10,
        width: 2,
      });
    }
  });
  ctx.restore();

  // 状態の名前（サイクルの中心から外向きにずらして置く）
  const vertices = c.processes.map((proc) => ({ name: proc.from, s: proc.start }));
  const gx = vertices.reduce((a, v) => a + plot.x(v.s.V), 0) / vertices.length;
  const gy = vertices.reduce((a, v) => a + plot.y(v.s.p), 0) / vertices.length;
  for (const v of vertices) {
    const px = plot.x(v.s.V);
    const py = plot.y(v.s.p);
    const d = Math.hypot(px - gx, py - gy) || 1;
    drawBall(ctx, px, py, 3.5, pal.fg, pal.bg);
    drawLabel(ctx, v.name, px + ((px - gx) / d) * 14, py + ((py - gy) / d) * 14, pal.fg, {
      font: CANVAS_FONT_MATH,
    });
  }

  // 現在の状態
  drawBall(ctx, plot.x(x.V), plot.y(x.p), 6.5, pal.accent, pal.bg);

  if (opt.showIsotherms) {
    drawLabel(
      ctx,
      `等温線 ${formatFixed(sum.Tmax, 0)} K・${formatFixed(sum.Tmin, 0)} K`,
      r.left + r.width,
      r.top - 12,
      pal.quantity.temperature,
      { font: CANVAS_FONT_SMALL, align: 'right' },
    );
  }
}

function drawIsotherm(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  plot: PlotMapping,
  n: number,
  T: number,
  vEnd: number,
): void {
  const vStart = vEnd * 0.01;
  ctx.save();
  ctx.strokeStyle = pal.quantity.temperature;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  for (let i = 0; i <= 160; i++) {
    const V = vStart + ((vEnd - vStart) * i) / 160;
    const py = Math.max(plot.rect.top - 10, plot.y(isothermPressure(n, T, V)));
    if (i === 0) ctx.moveTo(plot.x(V), py);
    else ctx.lineTo(plot.x(V), py);
  }
  ctx.stroke();
  ctx.restore();
}
