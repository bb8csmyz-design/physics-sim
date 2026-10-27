/**
 * 弦と気柱の固有振動の描画（Canvas）。定常波の形・包絡線・節と腹・空気の疎密を描く。
 * 気柱の空気の変位（縦波）は、教科書と同じく横波のように縦にとって描く。
 */
import type { Palette } from '@/core/theme';
import { formatFixed } from '@/core/format';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT_SMALL,
  drawBall,
  drawDashedLine,
  drawFixture,
  drawLabel,
  drawSymbol,
} from '@/ui/draw';
import {
  antinodePositions,
  displacement,
  effectiveSpan,
  modeShape,
  nodePositions,
  probePosition,
  travelingWaves,
  waveNumber,
  type ResonatorKind,
  type ResonatorParams,
  type ResonatorState,
} from './model';

export interface SceneOptions {
  showEnvelope: boolean;
  showTraveling: boolean;
  showNodes: boolean;
  showDensity: boolean;
}

/** 管の内側の半径 [m]（描画用）。変位はこの 0.8 倍を腹の振幅として誇張して描く */
const R = 0.11;
const AMP = 0.8 * R;
/** 画面に映す範囲 [m]（長さの最大 1 m と開口端補正が収まる） */
const VIEW = { xMin: -0.08, xMax: 1.08, yMin: -R - 0.14, yMax: R + 0.05 };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  kind: ResonatorKind,
  p: ResonatorParams,
  s: ResonatorState,
  opt: SceneOptions,
): void {
  const vp = fitViewport(size, VIEW, { top: 10, right: 14, bottom: 8, left: 14 });
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  const [a, b] = effectiveSpan(kind, p);
  const y0 = vp.y(0);

  // 弦の支点・管の壁
  if (kind === 'string') {
    for (const x of [0, p.L]) {
      const side = x === 0 ? 'right' : 'left';
      const px = vp.x(x) + (x === 0 ? -10 : 0);
      drawFixture(ctx, px, vp.y(R * 0.6), 10, vp.len(1.2 * R), side, pal.fixture);
    }
  } else {
    ctx.save();
    ctx.strokeStyle = pal.fixture;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const y of [R, -R]) {
      ctx.moveTo(vp.x(0), vp.y(y));
      ctx.lineTo(vp.x(p.L), vp.y(y));
    }
    ctx.stroke();
    ctx.restore();
    if (kind === 'closed') {
      drawFixture(ctx, vp.x(0) - 10, vp.y(R), 10, vp.len(2 * R), 'right', pal.fixture);
    }
  }

  // 空気の疎密（各層の空気が x 方向に変位する様子を縦線で描く。密なところほど線が詰まる）
  if (opt.showDensity && kind !== 'string') {
    const k = waveNumber(kind, p);
    const xi = 0.6 / k; // 縦の変位の振幅。疎密の最大が ±60% になる大きさ
    const cols = Math.round(p.L / 0.018);
    ctx.save();
    ctx.strokeStyle = pal.muted;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const x0 = (p.L * i) / cols;
      const x = x0 + xi * displacement(kind, p, x0, s.t);
      if (x < 0 || x > p.L) continue;
      ctx.moveTo(vp.x(x), vp.y(R * 0.92));
      ctx.lineTo(vp.x(x), vp.y(-R * 0.92));
    }
    ctx.stroke();
    ctx.restore();
  }

  // 包絡線（腹で最大の振幅 ±|Y(x)|）
  if (opt.showEnvelope) {
    for (const sign of [1, -1]) {
      drawCurve(
        ctx,
        vp,
        a,
        b,
        (x) => sign * AMP * Math.abs(modeShape(kind, p, x)),
        pal.muted,
        [4, 4],
      );
    }
  }
  // 入射波（右向き）と反射波（左向き）
  if (opt.showTraveling) {
    drawCurve(
      ctx,
      vp,
      a,
      b,
      (x) => AMP * travelingWaves(kind, p, x, s.t).right,
      pal.fg,
      [7, 4],
      1.5,
    );
    drawCurve(
      ctx,
      vp,
      a,
      b,
      (x) => AMP * travelingWaves(kind, p, x, s.t).left,
      pal.muted,
      [2, 3],
      1.5,
    );
  }
  // 定常波（合成波）
  drawCurve(
    ctx,
    vp,
    a,
    b,
    (x) => AMP * displacement(kind, p, x, s.t),
    pal.quantity.position,
    [],
    3,
  );

  // 開口端補正（管口の外の腹の位置）
  if (kind !== 'string' && p.dx > 0) {
    const ends = kind === 'open' ? [a, b] : [b];
    for (const x of ends) drawDashedLine(ctx, vp.x(x), vp.y(R), vp.x(x), vp.y(-R), pal.muted);
  }

  // 節と腹
  const axisY = vp.y(-R - 0.03);
  if (opt.showNodes) {
    for (const x of nodePositions(kind, p)) {
      drawBall(ctx, vp.x(x), y0, 3.5, pal.bg, pal.fg);
      drawLabel(ctx, '節', vp.x(x), axisY, pal.fg, { font: CANVAS_FONT_SMALL });
    }
    for (const x of antinodePositions(kind, p)) {
      drawLabel(ctx, '腹', vp.x(x), axisY, pal.quantity.position, { font: CANVAS_FONT_SMALL });
    }
  }

  // 観測点
  const xp = probePosition(p);
  const yp = vp.y(AMP * displacement(kind, p, xp, s.t));
  drawDashedLine(ctx, vp.x(xp), vp.y(R), vp.x(xp), vp.y(-R), pal.quantity.position);
  drawBall(ctx, vp.x(xp), yp, 5, pal.quantity.position, pal.bg);

  // 目盛り（0.1 m ごと）
  const tickY = vp.y(-R - 0.065);
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vp.x(0), tickY);
  ctx.lineTo(vp.x(1), tickY);
  ctx.stroke();
  for (let i = 0; i <= 10; i++) {
    const x = vp.x(i / 10);
    ctx.beginPath();
    ctx.moveTo(x, tickY);
    ctx.lineTo(x, tickY + (i % 5 === 0 ? 6 : 3));
    ctx.stroke();
    if (i % 2 === 0) {
      drawLabel(ctx, formatFixed(i / 10, 1), x, tickY + 15, pal.muted, { font: CANVAS_FONT_SMALL });
    }
  }
  drawLabel(ctx, 'x [m]', vp.x(1.07), tickY + 29, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });
  drawSymbol(ctx, 'L', vp.x(p.L), vp.y(R) - 10, pal.fg);
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  a: number,
  b: number,
  f: (x: number) => number,
  color: string,
  dash: number[],
  width = 1.5,
): void {
  const n = 240;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    if (i === 0) ctx.moveTo(vp.x(x), vp.y(f(x)));
    else ctx.lineTo(vp.x(x), vp.y(f(x)));
  }
  ctx.stroke();
  ctx.restore();
}
