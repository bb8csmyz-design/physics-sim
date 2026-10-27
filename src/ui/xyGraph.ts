/**
 * 2 つの量の関係のグラフ（I-V 特性、K-ν、E-n など。横軸が時間でないもの）。
 *
 * - setData(i, points) で i 番目の系列の点列を与える（理論曲線・測定点など）
 * - setMarkers() で「現在の条件」を示す点を、setGuides() で基準線（−V₀, ν₀ など）を描く
 * - 縦横の範囲は固定（パラメータが変わったら setXRange / setYRange で変える）
 *
 * createGraphTabs に createTimeGraph と並べて入れられる。
 */
import type { Disposer } from '@/core/dom';
import { h } from '@/core/dom';
import { formatFixed } from '@/core/format';
import type { Palette, Quantity } from '@/core/theme';
import { niceStep, niceTicks, tickDigits } from '@/core/ticks';
import { createResponsiveCanvas } from './canvas';
import { CANVAS_FONT_SMALL } from './draw';

export interface XYPoint {
  x: number;
  y: number;
}

export interface XYSeriesSpec {
  /** 凡例の文字列（空文字なら凡例に出さない） */
  label: string;
  /** 色を物理量で指定（推奨） */
  quantity?: Quantity;
  /** quantity で表せない場合の CSS 色 */
  color?: string;
  dashed?: boolean;
  /** 'line' = 折れ線（既定）, 'points' = 点だけ */
  style?: 'line' | 'points';
}

/** 基準線。axis: 'x' なら x = value の縦線、'y' なら y = value の横線 */
export interface XYGuide {
  axis: 'x' | 'y';
  value: number;
  label?: string;
}

/** 現在の条件を示す点。色は series 番目の系列と同じ */
export interface XYMarker extends XYPoint {
  series: number;
  label?: string;
}

export interface XYGraphOptions {
  /** 横軸ラベル（例: 'V [V]'） */
  xLabel: string;
  /** 縦軸ラベル（例: 'I [μA]'） */
  yLabel: string;
  series: readonly XYSeriesSpec[];
  xRange: readonly [number, number];
  yRange: readonly [number, number];
  ariaLabel: string;
  aspect?: number;
}

export interface XYGraph {
  readonly element: HTMLElement;
  setData(series: number, points: readonly XYPoint[]): void;
  setMarkers(markers: readonly XYMarker[]): void;
  setGuides(guides: readonly XYGuide[]): void;
  setXRange(range: readonly [number, number]): void;
  setYRange(range: readonly [number, number]): void;
  redraw(): void;
}

const MARGIN = { left: 52, right: 14, top: 30, bottom: 30 };

export function createXYGraph(opts: XYGraphOptions, disposer: Disposer): XYGraph {
  let xRange = opts.xRange;
  let yRange = opts.yRange;
  const data: XYPoint[][] = opts.series.map(() => []);
  let markers: readonly XYMarker[] = [];
  let guides: readonly XYGuide[] = [];

  const view = createResponsiveCanvas(
    {
      aspect: opts.aspect ?? 2.4,
      mobileAspect: 1.6,
      ariaLabel: opts.ariaLabel,
      draw,
      className: 'graph-canvas',
    },
    disposer,
  );

  function seriesColor(s: XYSeriesSpec | undefined, p: Palette): string {
    if (!s) return p.fg;
    return s.quantity ? p.quantity[s.quantity] : (s.color ?? p.fg);
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    p: Palette,
  ) {
    const x0 = MARGIN.left;
    const x1 = size.width - MARGIN.right;
    const y0 = MARGIN.top;
    const y1 = size.height - MARGIN.bottom;
    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    const px = (x: number) => x0 + ((x - xMin) / (xMax - xMin)) * (x1 - x0);
    const py = (y: number) => y1 - ((y - yMin) / (yMax - yMin)) * (y1 - y0);

    ctx.font = CANVAS_FONT_SMALL;
    ctx.lineWidth = 1;

    // 目盛りとグリッド（0 の線は軸の色）
    const yStep = niceStep(yMax - yMin, 4);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of niceTicks(yMin, yMax, 4)) {
      const y = py(v);
      ctx.strokeStyle = v === 0 ? p.axis : p.grid;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.fillStyle = p.muted;
      ctx.fillText(formatFixed(v, tickDigits(yStep)), x0 - 6, y);
    }
    const xStep = niceStep(xMax - xMin, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of niceTicks(xMin, xMax, 5)) {
      const x = px(v);
      ctx.strokeStyle = v === 0 ? p.axis : p.grid;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.fillStyle = p.muted;
      ctx.fillText(formatFixed(v, tickDigits(xStep)), x, y1 + 6);
    }
    ctx.strokeStyle = p.axis;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // 軸ラベル
    ctx.fillStyle = p.fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.yLabel, 6, y0 - 10);
    ctx.textAlign = 'right';
    ctx.fillText(opts.xLabel, x1, size.height - 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();

    // 基準線
    for (const g of guides) {
      ctx.save();
      ctx.strokeStyle = p.muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(px(g.value), y0);
        ctx.lineTo(px(g.value), y1);
      } else {
        ctx.moveTo(x0, py(g.value));
        ctx.lineTo(x1, py(g.value));
      }
      ctx.stroke();
      ctx.restore();
      if (g.label) {
        if (g.axis === 'x') {
          const x = px(g.value);
          const right = x < (x0 + x1) / 2;
          haloLabel(ctx, p, g.label, x + (right ? 4 : -4), y0 + 10, p.muted, {
            font: CANVAS_FONT_SMALL,
            align: right ? 'left' : 'right',
          });
        } else {
          haloLabel(ctx, p, g.label, x0 + 4, py(g.value) - 8, p.muted, {
            font: CANVAS_FONT_SMALL,
            align: 'left',
          });
        }
      }
    }

    // データ
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    opts.series.forEach((s, i) => {
      const pts = data[i]!;
      const color = seriesColor(s, p);
      if (s.style === 'points') {
        ctx.fillStyle = color;
        for (const q of pts) {
          if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
          ctx.beginPath();
          ctx.arc(px(q.x), py(q.y), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
      ctx.strokeStyle = color;
      ctx.setLineDash(s.dashed ? [6, 4] : []);
      ctx.beginPath();
      let started = false;
      for (const q of pts) {
        if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) {
          started = false;
          continue;
        }
        if (started) ctx.lineTo(px(q.x), py(q.y));
        else ctx.moveTo(px(q.x), py(q.y));
        started = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 現在の条件の点
    for (const m of markers) {
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
      const color = seriesColor(opts.series[m.series], p);
      const x = px(m.x);
      const y = py(m.y);
      ctx.fillStyle = color;
      ctx.strokeStyle = p.bg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (m.label) {
        const right = x < (x0 + x1) / 2;
        haloLabel(ctx, p, m.label, x + (right ? 9 : -9), y - 12, p.fg, {
          font: CANVAS_FONT_SMALL,
          align: right ? 'left' : 'right',
        });
      }
    }
    ctx.restore();

    // 凡例（右上）
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let lx = x1;
    const ly = y0 - 14;
    for (let i = opts.series.length - 1; i >= 0; i--) {
      const s = opts.series[i]!;
      if (!s.label) continue;
      const w = ctx.measureText(s.label).width;
      lx -= w;
      ctx.fillStyle = p.fg;
      ctx.fillText(s.label, lx, ly);
      lx -= 22;
      const color = seriesColor(s, p);
      if (s.style === 'points') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lx + 8, ly, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash(s.dashed ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 16, ly);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      lx -= 12;
    }
  }

  return {
    element: h('figure', { class: 'graph' }, view.element),
    setData(series, points) {
      if (data[series]) data[series] = [...points];
    },
    setMarkers(m) {
      markers = m;
    },
    setGuides(g) {
      guides = g;
    },
    setXRange(r) {
      xRange = r;
    },
    setYRange(r) {
      yRange = r;
    },
    redraw: view.redraw,
  };
}

/** 関数 f を [x0, x1] で n 等分してサンプルした点列（理論曲線を描くとき用） */
export function sampleCurve(f: (x: number) => number, x0: number, x1: number, n = 200): XYPoint[] {
  const pts: XYPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push({ x, y: f(x) });
  }
  return pts;
}

/** 線と重なっても読めるよう、背景色で縁取りした文字 */
function haloLabel(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: { font: string; align?: CanvasTextAlign },
): void {
  ctx.save();
  ctx.font = opts.font;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.bg;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
