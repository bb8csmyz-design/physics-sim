/**
 * RL 回路の描画（Canvas）。回路図・電流の流れ・エネルギーの棒グラフ。
 * 物理量の計算は model.ts に任せ、ここでは描くだけ。回路図は縮尺のない模式図。
 */
import { formatFixed } from '@/core/format';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT_MATH,
  CANVAS_FONT_SMALL,
  drawBarChart,
  drawCircuitElement,
  drawFlowDots,
  drawJunction,
  drawLabel,
  drawTerminal,
  drawWire,
} from '@/ui/draw';
import {
  TIME_SCALE,
  coilEnergy,
  coilVoltage,
  henries,
  type RlParams,
  type RlState,
  type SwitchPosition,
} from './model';

export interface SceneOptions {
  showCurrent: boolean;
  showEnergyBars: boolean;
}

/** 回路図の座標（模式図の単位。y 上向き） */
const P = {
  batteryBottom: { x: 0, y: 0 },
  batteryTop: { x: 0, y: 6 },
  a: { x: 2.2, y: 6 },
  b: { x: 2.2, y: 4.3 },
  bBottom: { x: 2.2, y: 0 },
  pivot: { x: 3.8, y: 6 },
  topRight: { x: 10, y: 6 },
  bottomRight: { x: 10, y: 0 },
} as const;

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  p: RlParams,
  s: RlState,
  sw: SwitchPosition,
  opt: SceneOptions,
): void {
  // 横長の画面ではエネルギーの棒グラフを回路図の右に、縦長（スマホ）では下に置く
  const narrow = size.width / size.height < 1.5;
  const vp = fitViewport(
    size,
    narrow
      ? { xMin: -1.8, xMax: 12.4, yMin: -5.6, yMax: 7.4 }
      : { xMin: -1.8, xMax: 15.2, yMin: -1.2, yMax: 7.4 },
    12,
  );
  const pt = (q: { x: number; y: number }) => ({ x: vp.x(q.x), y: vp.y(q.y) });
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const wire = pal.fg;

  // 導線
  drawWire(ctx, [pt(P.batteryTop), pt(P.a)], wire);
  drawWire(ctx, [pt(P.b), pt(P.bBottom)], wire);
  drawWire(ctx, [pt(P.bottomRight), pt(P.batteryBottom)], wire);
  drawJunction(ctx, vp.x(P.bBottom.x), vp.y(P.bBottom.y), wire);

  // 電池（上が正極）・抵抗・コンデンサー
  drawCircuitElement(ctx, 'battery', vp.x(0), vp.y(0), vp.x(0), vp.y(6), { color: wire });
  drawLabel(ctx, 'E', vp.x(0) - 26, vp.y(3), wire, { font: CANVAS_FONT_MATH });
  drawLabel(ctx, `${formatFixed(p.E, 1)} V`, vp.x(0) - 26, vp.y(3) + 18, pal.muted, {
    font: CANVAS_FONT_SMALL,
  });
  drawCircuitElement(ctx, 'resistor', vp.x(P.pivot.x), vp.y(6), vp.x(10), vp.y(6), {
    color: wire,
    fill: pal.bg,
    size: 56,
  });
  drawLabel(ctx, 'R', vp.x(6.9), vp.y(6) - 22, wire, { font: CANVAS_FONT_MATH });
  drawCircuitElement(ctx, 'coil', vp.x(10), vp.y(6), vp.x(10), vp.y(0), {
    color: wire,
    size: 64,
  });
  drawLabel(ctx, 'L', vp.x(10) + 30, vp.y(3), wire, { font: CANVAS_FONT_MATH });

  // スイッチ
  drawWire(ctx, [pt(P.pivot), pt(sw === 'a' ? P.a : P.b)], wire, 3);
  for (const c of [P.a, P.b, P.pivot]) drawTerminal(ctx, vp.x(c.x), vp.y(c.y), wire, pal.bg);
  drawLabel(ctx, 'a', vp.x(P.a.x), vp.y(P.a.y) - 14, wire, { font: CANVAS_FONT_MATH });
  drawLabel(ctx, 'b', vp.x(P.b.x) - 12, vp.y(P.b.y), wire, { font: CANVAS_FONT_MATH });
  drawLabel(ctx, 'S', vp.x(P.pivot.x), vp.y(P.pivot.y) - 16, wire, { font: CANVAS_FONT_MATH });

  // 電流の流れ（点の移動量 ∝ 流れた電気量。電流 E/R のとき実時間で毎秒 60 px）
  const I = s.I;
  if (opt.showCurrent) {
    const loop =
      sw === 'a'
        ? [P.batteryBottom, P.batteryTop, P.a, P.pivot, P.topRight, P.bottomRight, P.batteryBottom]
        : [P.bBottom, P.b, P.pivot, P.topRight, P.bottomRight, P.bBottom];
    const offset = ((s.charge * p.R) / p.E / TIME_SCALE) * 60;
    drawFlowDots(ctx, loop.map(pt), offset, { color: pal.quantity.current, radius: 3.5 });
  }

  // 電圧と電流の値
  drawLabel(
    ctx,
    `${formatFixed(coilVoltage(p, I, sw), 2)} V`,
    vp.x(10) + 22,
    vp.y(3) + 20,
    pal.quantity.magnetic,
    {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    },
  );
  drawLabel(
    ctx,
    `I = ${formatFixed(I * 1e3, 1)} mA`,
    vp.x(6.9),
    vp.y(6) + 22,
    pal.quantity.current,
    {
      font: CANVAS_FONT_SMALL,
    },
  );
  drawLabel(
    ctx,
    sw === 'a' ? 'a 側（電池あり）' : 'b 側（電池なし）',
    vp.x(5.6),
    vp.y(1.2),
    pal.muted,
    {
      font: CANVAS_FONT_SMALL,
    },
  );

  if (opt.showEnergyBars) drawEnergyBars(ctx, vp, pal, p, s, narrow);
}

/** エネルギーの棒グラフ（満杯の基準: 十分後のコイルのエネルギー ½L(E/R)² の 2 倍） */
function drawEnergyBars(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  pal: Palette,
  p: RlParams,
  s: RlState,
  narrow: boolean,
): void {
  const ref = henries(p) * (p.E / p.R) ** 2;
  const opts = { track: pal.grid, labelColor: pal.fg, title: 'エネルギー' };
  if (narrow) {
    const bars = [
      { label: 'W 電池の仕事', value: s.work, color: pal.quantity.energy },
      { label: 'U コイル', value: coilEnergy(p, s.I), color: pal.quantity.magnetic },
      { label: 'Q ジュール熱', value: s.heat, color: pal.quantity.heat },
    ];
    drawBarChart(ctx, vp.x(2.6), vp.y(-1.6), vp.len(9.4), vp.len(3.6), bars, ref, {
      ...opts,
      orientation: 'horizontal',
    });
  } else {
    const bars = [
      { label: 'W', value: s.work, color: pal.quantity.energy },
      { label: 'U', value: coilEnergy(p, s.I), color: pal.quantity.magnetic },
      { label: 'Q', value: s.heat, color: pal.quantity.heat },
    ];
    drawBarChart(ctx, vp.x(12.3), vp.y(5.7), vp.len(2.8), vp.len(5.4), bars, ref, {
      ...opts,
      orientation: 'vertical',
    });
  }
}
