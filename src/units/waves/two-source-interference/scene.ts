/**
 * 2 つの波源による干渉の描画（Canvas）。水面の変位を濃淡で描き、強め合う線・弱め合う線と点 P を重ねる。
 */
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import { CANVAS_FONT_SMALL, drawBall, drawDashedLine, drawLabel, drawSymbol } from '@/ui/draw';
import type { FieldRenderer } from '@/ui/fieldImage';
import {
  AMPLITUDE,
  displacements,
  hyperbolaX,
  lineOffsets,
  sources,
  type InterferenceParams,
  type InterferenceState,
  type SourcePhase,
} from './model';

export interface SceneOptions {
  showConstructive: boolean;
  showDestructive: boolean;
  showPathToP: boolean;
}

/** 画面に映す水面の範囲 [m] */
const VIEW = { xMin: -0.16, xMax: 0.16, yMin: -0.03, yMax: 0.15 };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  field: FieldRenderer,
  p: InterferenceParams,
  phase: SourcePhase,
  s: InterferenceState,
  opt: SceneOptions,
): void {
  const vp = fitViewport(size, VIEW, 0);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 水面の変位（山 = 濃い、谷 = 背景色）
  const left = vp.x(VIEW.xMin);
  const top = vp.y(VIEW.yMax);
  const width = vp.len(VIEW.xMax - VIEW.xMin);
  const height = vp.len(VIEW.yMax - VIEW.yMin);
  field.draw(
    ctx,
    { x: left, y: top, w: width, h: height },
    (px, py) => {
      const x = (px - vp.x(0)) / vp.scale;
      const y = (vp.y(0) - py) / vp.scale;
      return displacements(p, phase, x, y, s.t).total / (2 * AMPLITUDE);
    },
    { low: pal.bg, high: pal.quantity.position },
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  if (opt.showConstructive)
    drawLines(ctx, vp, p, lineOffsets(p, phase, 'constructive'), pal.fg, false);
  if (opt.showDestructive)
    drawLines(ctx, vp, p, lineOffsets(p, phase, 'destructive'), pal.fg, true);
  ctx.restore();

  // 波源と点 P
  const [s1, s2] = sources(p);
  const P = { x: vp.x(p.xP), y: vp.y(p.yP) };
  if (opt.showPathToP) {
    for (const src of [s1, s2]) {
      drawDashedLine(ctx, vp.x(src.x), vp.y(src.y), P.x, P.y, pal.fg, 1.5);
    }
  }
  for (const [src, name] of [
    [s1, 'S_1'],
    [s2, 'S_2'],
  ] as const) {
    drawBall(ctx, vp.x(src.x), vp.y(src.y), 5, pal.body, pal.bodyStroke);
    drawSymbol(ctx, name, vp.x(src.x), vp.y(src.y) + 16, pal.fg);
  }
  drawBall(ctx, P.x, P.y, 5, pal.quantity.position, pal.bg);
  drawSymbol(ctx, 'P', P.x + 10, P.y - 10, pal.fg, { align: 'left' });

  // 基準長（5 cm）
  const barY = size.height - 14;
  const barX = size.width - 14;
  const barLen = vp.len(0.05);
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX - barLen, barY - 4);
  ctx.lineTo(barX - barLen, barY);
  ctx.lineTo(barX, barY);
  ctx.lineTo(barX, barY - 4);
  ctx.stroke();
  drawLabel(ctx, '5 cm', barX - barLen / 2, barY - 10, pal.fg, { font: CANVAS_FONT_SMALL });
}

/** 経路差 r₁ − r₂ = δ の双曲線（強め合う線・弱め合う線）を描く */
function drawLines(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  p: InterferenceParams,
  offsets: readonly number[],
  color: string,
  dashed: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(dashed ? [5, 5] : []);
  for (const delta of offsets) {
    ctx.beginPath();
    // 波源を結ぶ直線の上下は対称なので、y ≥ 0 の側を描き、y < 0 の側は鏡映する
    for (const sign of [1, -1]) {
      for (let i = 0; i <= 80; i++) {
        const y = (sign * (VIEW.yMax * i)) / 80;
        const x = vp.x(hyperbolaX(p, delta, y));
        if (i === 0) ctx.moveTo(x, vp.y(y));
        else ctx.lineTo(x, vp.y(y));
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
