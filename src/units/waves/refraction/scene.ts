/**
 * 光の屈折と全反射の描画（Canvas）。電場の濃淡で波を描き、光線・法線・角度を重ねる。
 */
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize } from '@/ui/canvas';
import { CANVAS_FONT_SMALL, drawArrow, drawDashedLine, drawLabel, drawSymbol } from '@/ui/draw';
import type { FieldRenderer } from '@/ui/fieldImage';
import { formatFixed } from '@/core/format';
import {
  electricField,
  incidenceAngle,
  isTotalReflection,
  reflectance,
  refractionAngle,
  vacuumWavelength,
  type RefractionParams,
  type RefractionState,
} from './model';

export interface SceneOptions {
  showField: boolean;
  showRays: boolean;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  field: FieldRenderer,
  p: RefractionParams,
  s: RefractionState,
  opt: SceneOptions,
): void {
  // 真空中の波長の 7 倍を画面の半幅にする（波長を変えると縮尺が変わり、基準長で実寸を示す）
  const W = 7 * vacuumWavelength(p);
  const H = 0.6 * W;
  const vp = fitViewport(size, { xMin: -W, xMax: W, yMin: -H, yMax: H }, 0);
  const left = vp.x(-W);
  const top = vp.y(H);
  const width = vp.len(2 * W);
  const height = vp.len(2 * H);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  if (opt.showField) {
    field.draw(
      ctx,
      { x: left, y: top, w: width, h: height },
      // 波の山（電場が正の部分）だけを色で描く。谷と 0 は背景色（教科書の波面の図に合わせる）
      (px, py) => {
        const e = electricField(p, (px - vp.x(0)) / vp.scale, (vp.y(0) - py) / vp.scale, s.tau);
        return (2 * Math.max(e, 0)) / 1.6 - 1;
      },
      { low: pal.bg, high: pal.quantity.electric },
    );
  }
  // 媒質 2 は薄く色をつけて区別する
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = pal.fixture;
  ctx.fillRect(left, vp.y(0), width, height / 2);
  ctx.restore();

  // 境界面と法線
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, vp.y(0));
  ctx.lineTo(left + width, vp.y(0));
  ctx.stroke();
  drawDashedLine(ctx, vp.x(0), top, vp.x(0), top + height, pal.muted, 1.5);
  drawSymbol(ctx, 'n_1', left + 10, top + 16, pal.fg, {
    align: 'left',
    suffix: ` = ${formatFixed(p.n1, 2)}（媒質 1）`,
  });
  drawSymbol(ctx, 'n_2', left + 10, top + height - 16, pal.fg, {
    align: 'left',
    suffix: ` = ${formatFixed(p.n2, 2)}（媒質 2）`,
  });

  // 光線（入射光・反射光・屈折光）と角度
  if (opt.showRays) {
    const o = { x: vp.x(0), y: vp.y(0) };
    const len = 0.92 * vp.len(H);
    const th1 = incidenceAngle(p);
    const R = reflectance(p);
    drawArrow(ctx, o.x - len * Math.sin(th1), o.y - len * Math.cos(th1), o.x, o.y, {
      color: pal.fg,
      width: 2.5,
    });
    // 反射光は反射率に応じた太さで描く（全反射なら入射光と同じ）
    drawArrow(ctx, o.x, o.y, o.x + len * Math.sin(th1), o.y - len * Math.cos(th1), {
      color: pal.fg,
      width: 0.8 + 1.7 * Math.sqrt(R),
      dashed: R < 0.5,
    });
    const r = Math.min(46, len * 0.4);
    drawAngle(ctx, o, r, -Math.PI / 2 - th1, -Math.PI / 2, pal.fg);
    if (th1 > 0.05) {
      const mid = -Math.PI / 2 - th1 / 2;
      drawSymbol(
        ctx,
        'θ_1',
        o.x + (r + 14) * Math.cos(mid),
        o.y + (r + 14) * Math.sin(mid),
        pal.fg,
      );
    }
    if (isTotalReflection(p)) {
      drawLabel(ctx, '全反射（屈折光なし）', o.x + 12, o.y + 22, pal.fg, {
        align: 'left',
        font: CANVAS_FONT_SMALL,
      });
    } else {
      const th2 = refractionAngle(p);
      drawArrow(ctx, o.x, o.y, o.x + len * Math.sin(th2), o.y + len * Math.cos(th2), {
        color: pal.fg,
        width: 2.5,
      });
      drawAngle(ctx, o, r, Math.PI / 2 - th2, Math.PI / 2, pal.fg);
      if (th2 > 0.05) {
        const mid = Math.PI / 2 - th2 / 2;
        drawSymbol(
          ctx,
          'θ_2',
          o.x + (r + 14) * Math.cos(mid),
          o.y + (r + 14) * Math.sin(mid),
          pal.fg,
        );
      }
    }
  }

  // 基準長（1 μm）
  const barLen = vp.len(1e-6);
  const bx = left + width - 14;
  const by = top + height - 14;
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx - barLen, by - 4);
  ctx.lineTo(bx - barLen, by);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx, by - 4);
  ctx.stroke();
  drawLabel(ctx, '1 μm', bx - barLen / 2, by - 11, pal.fg, { font: CANVAS_FONT_SMALL });
}

/** 角度の弧（画面座標の角度 a0 → a1、時計回り正） */
function drawAngle(
  ctx: CanvasRenderingContext2D,
  o: { x: number; y: number },
  r: number,
  a0: number,
  a1: number,
  color: string,
): void {
  if (Math.abs(a1 - a0) < 1e-3) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, a0, a1);
  ctx.stroke();
  ctx.restore();
}
