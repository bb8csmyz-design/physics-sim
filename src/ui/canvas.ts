/**
 * 高解像度（devicePixelRatio 対応）でリサイズに追従する Canvas と、
 * 物理座標 [m] ↔ 画面座標 [px] の変換（Viewport）。
 */
import type { Disposer } from '@/core/dom';
import { h } from '@/core/dom';
import { getPalette, onThemeChange, type Palette } from '@/core/theme';

export interface CanvasSize {
  /** CSS ピクセル単位の幅・高さ（描画はこの座標系で行う） */
  width: number;
  height: number;
}

export type DrawFunction = (
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  palette: Palette,
) => void;

export interface ResponsiveCanvas {
  readonly element: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** 直ちに再描画する（表示されていなければ何もしない） */
  redraw(): void;
}

export interface ResponsiveCanvasOptions {
  /** 幅 / 高さ の比（既定 16/9） */
  aspect?: number;
  /** 画面幅 600px 以下での幅 / 高さ の比（省略時は aspect と同じ） */
  mobileAspect?: number;
  /** スクリーンリーダー向けの説明 */
  ariaLabel: string;
  draw: DrawFunction;
  className?: string;
}

export function createResponsiveCanvas(
  opts: ResponsiveCanvasOptions,
  disposer: Disposer,
): ResponsiveCanvas {
  const canvas = h('canvas', { role: 'img', 'aria-label': opts.ariaLabel });
  const element = h(
    'div',
    {
      class: `canvas-box ${opts.className ?? ''}`,
      style: {
        '--aspect': String(opts.aspect ?? 16 / 9),
        '--aspect-mobile': String(opts.mobileAspect ?? opts.aspect ?? 16 / 9),
      },
    },
    canvas,
  );
  const ctx = canvas.getContext('2d')!;
  let size: CanvasSize = { width: 0, height: 0 };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    size = { width: rect.width, height: rect.height };
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };

  const redraw = () => {
    if (size.width === 0 || size.height === 0) return;
    const palette = getPalette();
    ctx.save();
    ctx.clearRect(0, 0, size.width, size.height);
    opts.draw(ctx, size, palette);
    ctx.restore();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  disposer.add(() => ro.disconnect());
  disposer.add(onThemeChange(redraw));

  return { element, canvas, redraw };
}

// ---------------------------------------------------------------------------
// Viewport: 物理座標（y 軸上向き）→ 画面座標
// ---------------------------------------------------------------------------

export interface WorldRect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Viewport {
  /** 1 m あたりのピクセル数 */
  readonly scale: number;
  /** 物理座標 x [m] → 画面 x [px] */
  x(m: number): number;
  /** 物理座標 y [m]（上向き正）→ 画面 y [px]（下向き正） */
  y(m: number): number;
  /** 長さ [m] → [px] */
  len(m: number): number;
}

export type Padding = number | { top: number; right: number; bottom: number; left: number };

/**
 * world の範囲が画面に収まるよう、縦横同じ縮尺で中央に配置する。
 * 縦横比を変えると物理的な形がゆがむので、縮尺は必ず共通にする。
 * padding は画面端の余白 [px]（凡例などの置き場を確保するときは辺ごとに指定する）。
 */
export function fitViewport(size: CanvasSize, world: WorldRect, padding: Padding = 16): Viewport {
  const pad =
    typeof padding === 'number'
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : padding;
  const availW = size.width - pad.left - pad.right;
  const availH = size.height - pad.top - pad.bottom;
  const w = world.xMax - world.xMin;
  const hgt = world.yMax - world.yMin;
  const scale = Math.min(availW / w, availH / hgt);
  const ox = pad.left + (availW - w * scale) / 2 - world.xMin * scale;
  const oy = pad.top + (availH + hgt * scale) / 2 + world.yMin * scale;
  return {
    scale,
    x: (m) => ox + m * scale,
    y: (m) => oy - m * scale,
    len: (m) => m * scale,
  };
}
