/**
 * Canvas の中に描く x-y グラフ（p-V 図・速さの分布など、横軸が時間でない図）の軸と目盛り。
 * 時間変化のグラフは timeGraph.ts の createTimeGraph を使う。
 *
 *   const plot = drawPlotAxes(ctx, pal, { left, top, width, height }, {
 *     x: { min: 0, max: 0.05, label: 'V [×10⁻³ m³]', unit: 1e-3 },
 *     y: { min: 0, max: 3e5, label: 'p [×10⁵ Pa]', unit: 1e5 },
 *   });
 *   ctx.lineTo(plot.x(V), plot.y(p));
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import { niceStep, niceTicks, tickDigits } from '@/core/ticks';
import { CANVAS_FONT_SMALL } from './draw';

export interface PlotAxis {
  min: number;
  max: number;
  /** 軸ラベル（例: 'V [×10⁻³ m³]'） */
  label: string;
  /** 目盛りの数値をこの値で割って表示する（例: 1e5 なら 200000 Pa → 2）。既定 1 */
  unit?: number;
  /** 目盛りのおおよその本数（既定 5） */
  ticks?: number;
  /** 目盛りの数値を表示しない（分布の縦軸など、相対的な大きさだけ示すとき） */
  hideTickLabels?: boolean;
}

export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlotMapping {
  readonly rect: PlotRect;
  /** データの x → 画面 x [px] */
  x(v: number): number;
  /** データの y → 画面 y [px]（上向き正） */
  y(v: number): number;
}

/** 目盛り・グリッド・枠・軸ラベルを描き、データ座標 → 画面座標の変換を返す */
export function drawPlotAxes(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  rect: PlotRect,
  axes: { x: PlotAxis; y: PlotAxis },
): PlotMapping {
  const { left, top, width, height } = rect;
  const right = left + width;
  const bottom = top + height;
  const { x: ax, y: ay } = axes;
  const x = (v: number) => left + ((v - ax.min) / (ax.max - ax.min)) * width;
  const y = (v: number) => bottom - ((v - ay.min) / (ay.max - ay.min)) * height;

  ctx.save();
  ctx.font = CANVAS_FONT_SMALL;
  ctx.lineWidth = 1;

  const xu = ax.unit ?? 1;
  const xStep = niceStep((ax.max - ax.min) / xu, ax.ticks ?? 5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of niceTicks(ax.min / xu, ax.max / xu, ax.ticks ?? 5)) {
    const px = x(t * xu);
    ctx.strokeStyle = t === 0 ? pal.axis : pal.grid;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
    if (!ax.hideTickLabels) {
      ctx.fillStyle = pal.muted;
      ctx.fillText(formatFixed(t, tickDigits(xStep)), px, bottom + 5);
    }
  }

  const yu = ay.unit ?? 1;
  const yStep = niceStep((ay.max - ay.min) / yu, ay.ticks ?? 5);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of niceTicks(ay.min / yu, ay.max / yu, ay.ticks ?? 5)) {
    const py = y(t * yu);
    ctx.strokeStyle = t === 0 ? pal.axis : pal.grid;
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
    if (!ay.hideTickLabels) {
      ctx.fillStyle = pal.muted;
      ctx.fillText(formatFixed(t, tickDigits(yStep)), left - 5, py);
    }
  }

  ctx.strokeStyle = pal.axis;
  ctx.strokeRect(left, top, width, height);

  ctx.fillStyle = pal.fg;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(ax.label, right, bottom + 20);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(ay.label, Math.max(2, left - 30), top - 6);
  ctx.restore();

  return { rect, x, y };
}
