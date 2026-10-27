/**
 * 2 次元のスカラー場（水面波の変位・光の電場など）を色の濃淡で描く共通部品。
 *
 * 画面を cell × cell px のマス目に分けて値を計算し、低解像度の画像を拡大して描く
 * （毎フレーム全ピクセルを計算すると重いため）。値は -1〜1 に規格化して渡す。
 *   -1（谷）→ colors.low,  +1（山）→ colors.high の間を線形に補間する。NaN のマスは透明。
 */
import { mixRgb, parseColor, type Rgb } from '@/core/color';

export interface FieldColors {
  /** 値 -1 の色（getPalette() の色を渡す） */
  low: string;
  /** 値 +1 の色 */
  high: string;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldRenderer {
  /**
   * rect の範囲に場を描く。value(px, py) は画面座標 [px] での値（-1〜1、範囲外は NaN）。
   * cell はマス目の大きさ [px]（既定 3）。
   */
  draw(
    ctx: CanvasRenderingContext2D,
    rect: PixelRect,
    value: (px: number, py: number) => number,
    colors: FieldColors,
    cell?: number,
  ): void;
}

export function createFieldRenderer(): FieldRenderer {
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d')!;
  let image: ImageData | null = null;
  let colorKey = '';
  let low: Rgb = [0, 0, 0];
  let high: Rgb = [0, 0, 0];

  return {
    draw(ctx, rect, value, colors, cell = 3) {
      const nx = Math.max(1, Math.ceil(rect.w / cell));
      const ny = Math.max(1, Math.ceil(rect.h / cell));
      if (!image || image.width !== nx || image.height !== ny) {
        off.width = nx;
        off.height = ny;
        image = offCtx.createImageData(nx, ny);
      }
      if (colorKey !== colors.low + colors.high) {
        colorKey = colors.low + colors.high;
        low = parseColor(colors.low);
        high = parseColor(colors.high);
      }
      const data = image.data;
      const sx = rect.w / nx;
      const sy = rect.h / ny;
      for (let j = 0; j < ny; j++) {
        const py = rect.y + (j + 0.5) * sy;
        for (let i = 0; i < nx; i++) {
          const v = value(rect.x + (i + 0.5) * sx, py);
          const k = 4 * (j * nx + i);
          if (Number.isNaN(v)) {
            data[k + 3] = 0;
            continue;
          }
          const c = mixRgb(low, high, (v + 1) / 2);
          data[k] = c[0];
          data[k + 1] = c[1];
          data[k + 2] = c[2];
          data[k + 3] = 255;
        }
      }
      offCtx.putImageData(image, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    },
  };
}
