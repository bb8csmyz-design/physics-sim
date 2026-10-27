/**
 * ヤングの実験と回折格子の描画（Canvas）。
 * 左: スリットから広がる光の波の模式図（波長は誇張）、右: スクリーン上の明暗と光の強さ（実寸の目盛り付き）。
 */
import type { Palette } from '@/core/theme';
import { mixRgb, parseColor, type Rgb } from '@/core/color';
import { formatFixed } from '@/core/format';
import { niceStep, niceTicks, tickDigits } from '@/core/ticks';
import type { CanvasSize } from '@/ui/canvas';
import { CANVAS_FONT_SMALL, drawArrow, drawLabel, drawSymbol } from '@/ui/draw';
import {
  brightFringePosition,
  fringeSpacing,
  intensity,
  maxOrder,
  type SlitConfig,
  type SlitMode,
  type SlitState,
} from './model';

export interface SceneOptions {
  showWaves: boolean;
  showCurve: boolean;
}

/**
 * 光の波長 [nm] に対応する色（目に見える色の近似。380〜780 nm）。
 * 物理量から計算する「光そのものの色」なので、デザイン用の色トークンとは別に扱う。
 */
export function wavelengthToRgb(nm: number): Rgb {
  const [r, g, b] =
    nm < 440
      ? [(440 - nm) / 60, 0, 1]
      : nm < 490
        ? [0, (nm - 440) / 50, 1]
        : nm < 510
          ? [0, 1, (510 - nm) / 20]
          : nm < 580
            ? [(nm - 510) / 70, 1, 0]
            : nm < 645
              ? [1, (645 - nm) / 65, 0]
              : [1, 0, 0];
  // 可視域の両端では目の感度が下がる
  const k = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  const c = (v: number) => Math.round(255 * Math.pow(Math.max(0, v * k), 0.8));
  return [c(r), c(g), c(b)];
}

/** スクリーンに映す範囲の半分 [m]（明線がいくつか見えるきりのよい値） */
export function screenHalfRange(mode: SlitMode, c: SlitConfig): number {
  let want: number;
  if (mode === 'double') {
    want = 3.5 * fringeSpacing(c);
  } else {
    const m = Math.min(maxOrder(c), 2);
    want = Math.min(1.25 * brightFringePosition(c, m), 3 * c.L);
  }
  const mag = 10 ** Math.floor(Math.log10(want));
  const nice = [1, 2, 5, 10].find((k) => k * mag >= want) ?? 10;
  return nice * mag;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  mode: SlitMode,
  c: SlitConfig,
  lambdaNm: number,
  s: SlitState,
  opt: SceneOptions,
): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const split = Math.round(size.width * 0.5);
  drawSchematic(ctx, { x0: 8, x1: split - 10, y0: 8, y1: size.height - 8 }, pal, mode, c, s, opt);
  drawScreen(
    ctx,
    { x0: split, x1: size.width - 8, y0: 8, y1: size.height - 8 },
    pal,
    mode,
    c,
    lambdaNm,
    opt,
  );
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** 模式図: 平面波がスリットに入り、各スリットから円形の波が広がる（波長は誇張） */
function drawSchematic(
  ctx: CanvasRenderingContext2D,
  box: Box,
  pal: Palette,
  mode: SlitMode,
  c: SlitConfig,
  s: SlitState,
  opt: SceneOptions,
): void {
  const h = box.y1 - box.y0;
  const cy = (box.y0 + box.y1) / 2;
  const lam = h / 14; // 模式図の波長 [px]
  const plateX = box.x0 + (box.x1 - box.x0) * 0.24;
  const screenX = box.x1 - 4;
  const shown = mode === 'double' ? 2 : Math.min(c.N, 7);
  const gap = mode === 'double' ? 3.2 * lam : 1.3 * lam;
  const slitYs = Array.from({ length: shown }, (_, j) => cy + (j - (shown - 1) / 2) * gap);
  const phase = s.tau - Math.floor(s.tau);

  drawLabel(ctx, '模式図（縮尺は正確でない）', box.x0, box.y0 + 8, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  if (opt.showWaves) {
    ctx.save();
    ctx.strokeStyle = pal.quantity.electric;
    ctx.lineWidth = 1.3;
    // 左から来る平面波（波面 = 縦線）
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let x = plateX - (1 - phase) * lam; x > box.x0; x -= lam) {
      ctx.moveTo(x, cy - h * 0.32);
      ctx.lineTo(x, cy + h * 0.32);
    }
    ctx.stroke();
    // 各スリットから広がる円形の波（ホイヘンスの原理）
    ctx.beginPath();
    ctx.rect(plateX, box.y0 + 18, screenX - plateX, h - 18); // 上端は見出しの文字に空ける
    ctx.clip();
    ctx.globalAlpha = Math.max(0.2, 0.7 - 0.06 * shown);
    for (const y of slitYs) {
      for (let r = phase * lam; r < screenX - plateX + h; r += lam) {
        if (r < 1) continue;
        ctx.beginPath();
        ctx.arc(plateX, y, r, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // スリット板（スリットの位置だけ切れ目を入れる）
  ctx.save();
  ctx.strokeStyle = pal.fixture;
  ctx.lineWidth = 5;
  ctx.beginPath();
  let y = box.y0 + 18;
  for (const sy of slitYs) {
    ctx.moveTo(plateX, y);
    ctx.lineTo(plateX, sy - 4);
    y = sy + 4;
  }
  ctx.lineTo(plateX, y);
  ctx.moveTo(plateX, y);
  ctx.lineTo(plateX, box.y1 - 18);
  ctx.stroke();
  ctx.restore();

  // スクリーン
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(screenX, box.y0 + 18);
  ctx.lineTo(screenX, box.y1 - 18);
  ctx.stroke();

  // d と L
  if (slitYs.length >= 2) {
    const ya = slitYs[0]!;
    const yb = slitYs[1]!;
    const bx = plateX - 12;
    ctx.strokeStyle = pal.fg;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx + 4, ya);
    ctx.lineTo(bx, ya);
    ctx.lineTo(bx, yb);
    ctx.lineTo(bx + 4, yb);
    ctx.stroke();
    drawSymbol(ctx, 'd', bx - 8, (ya + yb) / 2, pal.fg);
  }
  const ly = box.y1 - 8;
  drawArrow(ctx, (plateX + screenX) / 2, ly, plateX, ly, { color: pal.fg, width: 1.2, head: 6 });
  drawArrow(ctx, (plateX + screenX) / 2, ly, screenX, ly, { color: pal.fg, width: 1.2, head: 6 });
  drawSymbol(ctx, 'L', (plateX + screenX) / 2, ly - 10, pal.fg);
  if (mode === 'grating' && c.N > shown) {
    drawLabel(ctx, `（${c.N} 本のうち ${shown} 本を表示）`, plateX + 6, box.y1 - 30, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'left',
    });
  }
}

/** スクリーン上の明暗（光の色で）と光の強さのグラフ。縦軸は実寸 */
function drawScreen(
  ctx: CanvasRenderingContext2D,
  box: Box,
  pal: Palette,
  mode: SlitMode,
  c: SlitConfig,
  lambdaNm: number,
  opt: SceneOptions,
): void {
  const W = screenHalfRange(mode, c);
  const useMm = W < 0.1;
  const unit = useMm ? 1e3 : 1;
  const top = box.y0 + 40;
  const bottom = box.y1 - 6;
  const yOf = (x: number) => top + ((W - x) / (2 * W)) * (bottom - top);
  const labelW = 40;
  const stripX = box.x0 + labelW;
  const stripW = Math.min(34, (box.x1 - stripX) * 0.3);
  const curveX0 = stripX + stripW + 8;
  const curveW = box.x1 - curveX0 - 40; // 右端は次数 m の表示に空ける

  drawLabel(ctx, 'スクリーン上の明暗（実寸）', box.x0, box.y0 + 8, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'left',
  });

  // 明暗の帯: 暗い幕の色と光の色を、光の強さの割合で混ぜる
  const dark = parseColor(pal.screen);
  const light = wavelengthToRgb(lambdaNm);
  const rows = Math.ceil(bottom - top);
  const profile: number[] = [];
  for (let i = 0; i < rows; i++) {
    // 鋭い明線を見落とさないよう、1 画素に 3 点とって最大値をとる
    let I = 0;
    for (const f of [0.17, 0.5, 0.83]) {
      const x = W - ((i + f) / rows) * 2 * W;
      I = Math.max(I, intensity(c, x));
    }
    profile.push(I);
    const col = mixRgb(dark, light, I);
    ctx.fillStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
    ctx.fillRect(stripX, top + i, stripW, 1.5);
  }

  // 目盛り
  const step = niceStep(2 * W * unit, 4);
  ctx.strokeStyle = pal.axis;
  ctx.lineWidth = 1;
  for (const t of niceTicks(-W * unit, W * unit, 4)) {
    const y = yOf(t / unit);
    ctx.beginPath();
    ctx.moveTo(stripX - 5, y);
    ctx.lineTo(stripX, y);
    ctx.stroke();
    drawLabel(ctx, formatFixed(t, tickDigits(step)), stripX - 7, y, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  }
  drawLabel(ctx, `x [${useMm ? 'mm' : 'm'}]`, stripX - 7, top - 14, pal.muted, {
    font: CANVAS_FONT_SMALL,
    align: 'right',
  });

  // 光の強さのグラフ（右向きが強い）と明線の次数
  if (opt.showCurve && curveW > 20) {
    ctx.strokeStyle = pal.grid;
    ctx.beginPath();
    ctx.moveTo(curveX0, top);
    ctx.lineTo(curveX0, bottom);
    ctx.stroke();
    ctx.strokeStyle = pal.fg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    profile.forEach((I, i) => {
      const px = curveX0 + I * curveW;
      if (i === 0) ctx.moveTo(px, top + i + 0.5);
      else ctx.lineTo(px, top + i + 0.5);
    });
    ctx.stroke();
    drawLabel(ctx, '光の強さ →', curveX0 + curveW, top - 14, pal.muted, {
      font: CANVAS_FONT_SMALL,
      align: 'right',
    });
  }
  const mMax = maxOrder(c);
  let lastY = -Infinity;
  for (let m = -mMax; m <= mMax; m++) {
    const x = brightFringePosition(c, m);
    if (!Number.isFinite(x) || Math.abs(x) > W) continue;
    const y = yOf(x);
    if (Math.abs(y - lastY) < 15) continue; // 詰まりすぎるときは間引く
    lastY = y;
    drawLabel(ctx, `m=${m}`, box.x1, y, pal.fg, { font: CANVAS_FONT_SMALL, align: 'right' });
  }
}
