/**
 * 時間グラフ（x-t, v-t, エネルギー-t など）。
 *
 * - push(t, [y1, y2, ...]) で値を記録し、redraw() で描く（描画は単元の render から呼ぶ）
 * - 横軸は直近 window 秒をスクロール表示
 * - 縦軸は yRange 固定、または自動（これまでの最大・最小に合わせて広がる一方。ガタつき防止）
 */
import type { Disposer } from '@/core/dom';
import { h } from '@/core/dom';
import { formatFixed } from '@/core/format';
import type { Palette, Quantity } from '@/core/theme';
import { niceBounds, niceStep, niceTicks, tickDigits } from '@/core/ticks';
import { createResponsiveCanvas } from './canvas';
import { CANVAS_FONT_SMALL } from './draw';

export interface SeriesSpec {
  /** 凡例の文字列（例: 'x', '運動エネルギー K'） */
  label: string;
  /** 色を物理量で指定（推奨。全単元で色をそろえるため） */
  quantity?: Quantity;
  /** quantity で表せない参照用の線（「S₁ からの波」など）は、パレットの文字色・補助色を使う */
  tone?: 'fg' | 'muted';
  dashed?: boolean;
  /** 点線（実線・破線に加えて 3 本目を区別したいとき） */
  dotted?: boolean;
}

/** 線種に応じた setLineDash の引数（凡例用は短め） */
function dashPattern(s: SeriesSpec, legend = false): number[] {
  if (s.dotted) return legend ? [1.5, 3] : [2, 4];
  if (s.dashed) return legend ? [4, 3] : [6, 4];
  return [];
}

export interface TimeGraphOptions {
  /** 縦軸ラベル（例: 'x [m]'） */
  yLabel: string;
  /** 横軸ラベル（既定 't [s]'。push する時刻の単位を変えたときに合わせる） */
  xLabel?: string;
  series: readonly SeriesSpec[];
  /** 表示する時間幅 [s]（既定 10） */
  window?: number;
  /** 縦軸の範囲を固定する。省略すると自動 */
  yRange?: readonly [number, number];
  /** 自動範囲のとき、0 を中心に上下対称にする */
  symmetric?: boolean;
  ariaLabel: string;
  aspect?: number;
  /** 横軸の単位。'ms' なら目盛りをミリ秒で表示する（push する t と window は秒のまま） */
  timeUnit?: 's' | 'ms';
}

export interface TimeGraph {
  readonly element: HTMLElement;
  push(t: number, values: readonly number[]): void;
  clear(): void;
  setYRange(range: readonly [number, number] | null): void;
  /** 縦軸ラベルを変える（パラメータに応じて単位の桁を変えるときなど） */
  setYLabel(label: string): void;
  /** 表示する時間幅 [s] を変える（周期に合わせるときなど） */
  setWindow(seconds: number): void;
  redraw(): void;
}

const MARGIN = { left: 52, right: 14, top: 30, bottom: 30 };
/** 1 画面あたりの最大点数（これより細かい記録は間引く） */
const POINTS_PER_WINDOW = 600;

export function createTimeGraph(opts: TimeGraphOptions, disposer: Disposer): TimeGraph {
  let windowSec = opts.window ?? 10;
  let minInterval = windowSec / POINTS_PER_WINDOW;
  let ts: number[] = [];
  let ys: number[][] = opts.series.map(() => []);
  let fixedRange: readonly [number, number] | null = opts.yRange ?? null;
  let autoMin = Infinity;
  let autoMax = -Infinity;
  let yLabel = opts.yLabel;

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

  function seriesColor(s: SeriesSpec, p: Palette): string {
    return s.quantity ? p.quantity[s.quantity] : s.tone === 'muted' ? p.muted : p.fg;
  }

  function yBounds(): [number, number] {
    if (fixedRange) return [fixedRange[0], fixedRange[1]];
    if (!Number.isFinite(autoMin)) return [-1, 1];
    if (opts.symmetric) {
      const m = Math.max(Math.abs(autoMin), Math.abs(autoMax));
      const [, hi] = niceBounds(-m, m, 4);
      return [-hi, hi];
    }
    return niceBounds(Math.min(autoMin, 0), Math.max(autoMax, 0), 4);
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
    const tNow = ts.length ? ts[ts.length - 1]! : 0;
    const tMax = Math.max(windowSec, tNow);
    const tMin = tMax - windowSec;
    const [yMin, yMax] = yBounds();
    const px = (t: number) => x0 + ((t - tMin) / (tMax - tMin)) * (x1 - x0);
    const py = (v: number) => y1 - ((v - yMin) / (yMax - yMin)) * (y1 - y0);

    ctx.font = CANVAS_FONT_SMALL;
    ctx.lineWidth = 1;

    // 縦軸の目盛りとグリッド
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
    // 横軸の目盛りとグリッド（表示単位で「きりのよい」値にする）
    const tFactor = opts.timeUnit === 'ms' ? 1000 : 1;
    const tStep = niceStep(windowSec * tFactor, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tu of niceTicks(tMin * tFactor, tMax * tFactor, 5)) {
      const t = tu / tFactor;
      const x = px(t);
      ctx.strokeStyle = p.grid;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.fillStyle = p.muted;
      ctx.fillText(formatFixed(tu, tickDigits(tStep)), x, y1 + 6);
    }
    // 枠
    ctx.strokeStyle = p.axis;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // 軸ラベル
    ctx.fillStyle = p.fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(yLabel, 6, y0 - 10);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.xLabel ?? (opts.timeUnit === 'ms' ? 't [ms]' : 't [s]'), x1, size.height - 2);

    // データ
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    opts.series.forEach((s, i) => {
      const data = ys[i]!;
      const color = seriesColor(s, p);
      ctx.strokeStyle = color;
      ctx.setLineDash(dashPattern(s));
      ctx.beginPath();
      let started = false;
      for (let j = 0; j < ts.length; j++) {
        const t = ts[j]!;
        if (t < tMin - minInterval) continue;
        const x = px(t);
        const y = py(data[j]!);
        if (started) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke();
      if (ts.length) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px(tNow), py(data[data.length - 1]!), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();

    // 凡例（右上）
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let lx = x1;
    const ly = y0 - 14;
    for (let i = opts.series.length - 1; i >= 0; i--) {
      const s = opts.series[i]!;
      const w = ctx.measureText(s.label).width;
      lx -= w;
      ctx.fillStyle = p.fg;
      ctx.fillText(s.label, lx, ly);
      lx -= 22;
      ctx.strokeStyle = seriesColor(s, p);
      ctx.lineWidth = 2.5;
      ctx.setLineDash(dashPattern(s, true));
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 16, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      lx -= 12;
    }
  }

  function trim(tNow: number) {
    // 表示範囲より古い点を捨てる（1 点だけ残して線を画面端までつなぐ）
    let k = 0;
    while (k < ts.length - 1 && ts[k + 1]! < tNow - windowSec) k++;
    if (k > POINTS_PER_WINDOW / 4) {
      ts = ts.slice(k);
      ys = ys.map((a) => a.slice(k));
    }
  }

  return {
    element: h('figure', { class: 'graph' }, view.element),
    push(t, values) {
      const last = ts[ts.length - 1];
      if (last !== undefined && t - last < minInterval) return;
      ts.push(t);
      values.forEach((v, i) => {
        ys[i]?.push(v);
        if (Number.isFinite(v)) {
          autoMin = Math.min(autoMin, v);
          autoMax = Math.max(autoMax, v);
        }
      });
      trim(t);
    },
    clear() {
      ts = [];
      ys = opts.series.map(() => []);
      autoMin = Infinity;
      autoMax = -Infinity;
    },
    setYRange(range) {
      fixedRange = range;
    },
    setYLabel(label) {
      yLabel = label;
    },
    setWindow(seconds) {
      windowSec = seconds;
      minInterval = windowSec / POINTS_PER_WINDOW;
    },
    redraw: view.redraw,
  };
}

/** タブに入れられるグラフ（createTimeGraph / createXYGraph） */
export interface GraphView {
  readonly element: HTMLElement;
  redraw(): void;
  /** 記録したデータを消す（記録しないグラフは省略） */
  clear?(): void;
}

export interface GraphTab {
  /** タブの表示名（例: 'x-t'） */
  label: string;
  graph: GraphView;
}

/**
 * 複数のグラフをタブで切り替える。全グラフにデータは記録され続け、表示中のものだけ描画する。
 */
export function createGraphTabs(tabs: readonly GraphTab[]): {
  element: HTMLElement;
  redraw(): void;
  clear(): void;
} {
  let active = 0;
  const panels = tabs.map((t, i) =>
    h('div', { class: 'graph-panel', role: 'tabpanel', hidden: i !== 0 }, t.graph.element),
  );
  const buttons = tabs.map((t, i) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        class: 'seg-btn',
        'aria-selected': String(i === 0),
        onclick: () => select(i),
      },
      t.label,
    ),
  );
  function select(i: number) {
    active = i;
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    panels.forEach((p, j) => (p.hidden = i !== j));
    tabs[i]!.graph.redraw();
  }
  return {
    element: h(
      'div',
      { class: 'graph-tabs' },
      tabs.length > 1
        ? h('div', { class: 'seg', role: 'tablist', 'aria-label': 'グラフの種類' }, buttons)
        : null,
      panels,
    ),
    redraw: () => tabs[active]!.graph.redraw(),
    clear: () => tabs.forEach((t) => t.graph.clear?.()),
  };
}
