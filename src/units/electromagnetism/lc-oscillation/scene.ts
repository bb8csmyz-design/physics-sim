/**
 * 電気振動（LC 回路）の描画（Canvas）。回路図・極板の電荷・電流の流れ・電場と磁場の強さの目安・
 * エネルギーの棒グラフ。物理量の計算は model.ts に任せ、ここでは描くだけ。回路図は縮尺のない模式図。
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawArrow,
  drawBarChart,
  drawCircuitElement,
  drawFlowDots,
  drawLabel,
  drawTerminal,
  drawWire,
} from '@/ui/draw';
import {
  TIME_SCALE,
  capacitorVoltage,
  energies,
  initialCharge,
  maxCurrent,
  type LcParams,
  type LcState,
} from './model';

export interface SceneOptions {
  showCurrent: boolean;
  showFields: boolean;
  showEnergyBars: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: LcParams,
  s: LcState,
  opt: SceneOptions,
): void {
  // 横長の画面ではエネルギーの棒グラフを回路図の右に、縦長（スマホ）では下に置く
  const narrow = size.width / size.height < 1.5;
  const vp = fitViewport(
    size,
    narrow
      ? { xMin: -2.4, xMax: 12.4, yMin: -5.6, yMax: 7.4 }
      : { xMin: -2.4, xMax: 15.2, yMin: -1.2, yMax: 7.4 },
    12,
  );
  const pt = (x: number, y: number) => ({ x: vp.x(x), y: vp.y(y) });
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const wire = pal.fg;
  const Q0 = initialCharge(p);

  // 導線とスイッチ（t = 0 に閉じた状態）
  drawWire(ctx, [pt(0, 6), pt(3.6, 6)], wire);
  drawWire(ctx, [pt(5.2, 6), pt(10, 6)], wire);
  drawWire(ctx, [pt(10, 0), pt(0, 0)], wire);
  drawWire(ctx, [pt(3.6, 6), pt(5.2, 6)], wire, 3);
  drawTerminal(ctx, vp.x(3.6), vp.y(6), wire, pal.bg);
  drawTerminal(ctx, vp.x(5.2), vp.y(6), wire, pal.bg);
  drawLabel(ctx, 'S', vp.x(4.4), vp.y(6) - 16, wire, { font: CANVAS_FONT_MATH });

  // コンデンサー（左）とコイル（右）
  drawCircuitElement(ctx, 'capacitor', vp.x(0), vp.y(6), vp.x(0), vp.y(0), {
    color: wire,
    size: 14,
  });
  drawLabel(ctx, 'C', vp.x(0) + 30, vp.y(3), wire, { font: CANVAS_FONT_MATH });
  drawLabel(
    ctx,
    `${formatFixed(capacitorVoltage(p, s.q), 2)} V`,
    vp.x(0) + 22,
    vp.y(3) + 20,
    pal.quantity.electric,
    {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    },
  );
  drawCircuitElement(ctx, 'coil', vp.x(10), vp.y(6), vp.x(10), vp.y(0), { color: wire, size: 64 });
  drawLabel(ctx, 'L', vp.x(10) + 30, vp.y(3), wire, { font: CANVAS_FONT_MATH });
  drawLabel(
    ctx,
    `i = ${formatFixed(s.i * 1e3, 1)} mA`,
    vp.x(6.9),
    vp.y(6) + 20,
    pal.quantity.current,
    {
      font: CANVAS_FONT_SMALL,
    },
  );

  // 極板の電荷（記号の数は電気量に比例。最大 Q₀ で 5 個）
  const n = Q0 > 0 ? Math.round((5 * Math.abs(s.q)) / Q0) : 0;
  for (let k = 0; k < n; k++) {
    const x = vp.x(0) + (k - (n - 1) / 2) * 6;
    drawLabel(ctx, s.q > 0 ? '+' : '−', x, vp.y(3) - 16, pal.quantity.electric, {
      font: CANVAS_FONT_SMALL,
    });
    drawLabel(ctx, s.q > 0 ? '−' : '+', x, vp.y(3) + 16, pal.quantity.electric, {
      font: CANVAS_FONT_SMALL,
    });
  }

  // 電流の流れ（点の移動量 ∝ 流れた電気量 Q₀ − q。最大電流のとき実時間で毎秒 60 px）
  const I0 = maxCurrent(p);
  if (opt.showCurrent && I0 > 0) {
    const loop = [pt(0, 3.4), pt(0, 6), pt(10, 6), pt(10, 0), pt(0, 0), pt(0, 2.6)];
    drawFlowDots(ctx, loop, ((Q0 - s.q) / (I0 * TIME_SCALE)) * 60, {
      color: pal.quantity.current,
      radius: 3.5,
    });
  }

  // 電場（極板の間）と磁場（コイルの中）の強さの目安
  if (opt.showFields && Q0 > 0) {
    drawFieldArrow(ctx, vp, -1.3, (s.q / Q0) * -1.6, pal.quantity.electric, 'E');
    drawFieldArrow(ctx, vp, 8.6, (s.i / I0) * 1.6, pal.quantity.magnetic, 'B');
  }

  if (opt.showEnergyBars) drawEnergyBars(ctx, vp, pal, p, s, narrow);
}

/** x の位置に、y = 3 を中心とした長さ len（上向き正）の縦の矢印 */
function drawFieldArrow(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  x: number,
  len: number,
  color: string,
  label: string,
): void {
  const y0 = vp.y(3 - len / 2);
  const y1 = vp.y(3 + len / 2);
  drawArrow(ctx, vp.x(x), y0, vp.x(x), y1, { color, width: 3 });
  drawLabel(ctx, label, vp.x(x) - 14, vp.y(3), color, { font: CANVAS_FONT_MATH });
}

/** エネルギーの棒グラフ（満杯の基準: はじめの静電エネルギー ½CV₀²） */
function drawEnergyBars(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  pal: Palette,
  p: LcParams,
  s: LcState,
  narrow: boolean,
): void {
  const ref = energies(p, { q: initialCharge(p), i: 0 }).total;
  const opts = { track: pal.grid, labelColor: pal.fg, title: 'エネルギー' };
  if (narrow) {
    const bars = [
      { label: '電場', value: energies(p, s).electric, color: pal.quantity.electric },
      { label: '磁場', value: energies(p, s).magnetic, color: pal.quantity.magnetic },
      { label: '和', value: energies(p, s).total, color: pal.quantity.energy },
    ];
    drawBarChart(ctx, vp.x(2.6), vp.y(-1.6), vp.len(9.4), vp.len(3.6), bars, ref, {
      ...opts,
      orientation: 'horizontal',
    });
  } else {
    const bars = [
      { label: '電場', value: energies(p, s).electric, color: pal.quantity.electric },
      { label: '磁場', value: energies(p, s).magnetic, color: pal.quantity.magnetic },
      { label: '和', value: energies(p, s).total, color: pal.quantity.energy },
    ];
    drawBarChart(ctx, vp.x(12.3), vp.y(5.7), vp.len(2.8), vp.len(5.4), bars, ref, {
      ...opts,
      orientation: 'vertical',
    });
  }
}
