/**
 * 回路エディタの描画（Canvas）。格子・部品の回路記号・電流の流れ・極板の電荷・計器の読み。
 * 物理量の計算は model.ts に任せ、ここでは描くだけ。回路図は縮尺のない模式図
 * （格子の 1 区画を 1 単位として fitViewport で縦横同じ縮尺にする）。
 */
import { formatFixed, formatSig } from '@/core/format';
import type { Palette } from '@/core/theme';
import { fitViewport, type CanvasSize, type Viewport } from '@/ui/canvas';
import {
  CANVAS_FONT_SMALL,
  drawCircuitElement,
  drawFlowDots,
  drawJunction,
  drawLabel,
  drawMeter,
  drawSwitch,
  drawSymbol,
  drawWire,
} from '@/ui/draw';
import {
  COLS,
  ROWS,
  isGridEdge,
  nodeIndex,
  partValue,
  type Circuit,
  type GridPoint,
  type Part,
  type SimState,
} from './model';

export interface SceneOptions {
  /** 電流の流れ（動く点） */
  showFlow: boolean;
  /** 部品の名前と値・計器の読み */
  showLabels: boolean;
}

export interface SceneView {
  circuit: Circuit;
  /** 部品の名前（'R_1' など。導線は ''） */
  names: readonly string[];
  /** スイッチが閉じているか（部品と同じ並び） */
  closed: readonly boolean[];
  state: SimState;
  /** 選択中の部品の id */
  selectedId: number | null;
  /** マウスを重ねている辺（部品を置く場所の予告） */
  hover: readonly [GridPoint, GridPoint] | null;
  /** 解けない回路の原因の部品（parts の添字） */
  problemPart: number | null;
  /** 電流の流れの表示: 流れた電気量 1 C あたりに点が進む距離 [px] */
  flowPxPerCoulomb: number;
  /** 極板の電荷の記号の数を決める基準の電圧 [V]（この電圧で 5 個） */
  voltageRef: number;
  options: SceneOptions;
}

/** 格子の間隔 [px] がこれより狭いときは、部品の値のラベルを省く（となりの部品と重なるため） */
const NARROW_SPACING = 64;

function isMeter(part: Part): boolean {
  return part.kind === 'ammeter' || part.kind === 'voltmeter';
}

/** 格子の周りの余白（格子の間隔を 1 とした単位） */
const MARGIN = 0.6;

export interface GridLayout {
  vp: Viewport;
  /** 格子の間隔 [px] */
  spacing: number;
}

/** 格子点 (x, y) → 画面座標。格子の y は下向きなので、物理座標の y = −y として fitViewport に渡す */
export function gridLayout(size: CanvasSize): GridLayout {
  const vp = fitViewport(size, {
    xMin: -MARGIN,
    xMax: COLS - 1 + MARGIN,
    yMin: -(ROWS - 1) - MARGIN,
    yMax: MARGIN,
  });
  return { vp, spacing: vp.scale };
}

function screen(layout: GridLayout, p: GridPoint): { x: number; y: number } {
  return { x: layout.vp.x(p.x), y: layout.vp.y(-p.y) };
}

/**
 * 画面上の点 (px, py) に最も近い辺（となり合う格子点の組）。辺から格子の間隔の 0.45 倍より遠ければ null
 * （スマホで格子の間隔が 50 px 程度でも、タップできる幅が 40 px 以上になる）。
 */
export function hitTestEdge(
  size: CanvasSize,
  px: number,
  py: number,
): [GridPoint, GridPoint] | null {
  const { vp } = gridLayout(size);
  const gx = (px - vp.x(0)) / vp.scale;
  const gy = (py - vp.y(0)) / vp.scale;
  let best: [GridPoint, GridPoint] | null = null;
  let bestD = 0.45;
  // 横の辺（行 y = round(gy)）と縦の辺（列 x = round(gx)）の候補
  const candidates: [GridPoint, GridPoint][] = [
    [
      { x: Math.floor(gx), y: Math.round(gy) },
      { x: Math.floor(gx) + 1, y: Math.round(gy) },
    ],
    [
      { x: Math.round(gx), y: Math.floor(gy) },
      { x: Math.round(gx), y: Math.floor(gy) + 1 },
    ],
  ];
  for (const [a, b] of candidates) {
    if (!isGridEdge(a, b)) continue;
    const d = a.y === b.y ? Math.abs(gy - a.y) : Math.abs(gx - a.x);
    if (d < bestD) {
      bestD = d;
      best = [a, b];
    }
  }
  return best;
}

/** 部品の値の短い表示（'100 Ω', '6.0 V' など） */
export function valueText(part: Part): string {
  switch (part.kind) {
    case 'resistor':
      return `${formatFixed(partValue(part, 'R'), 0)} Ω`;
    case 'capacitor':
      return `${formatFixed(partValue(part, 'C'), 0)} μF`;
    case 'coil':
      return `${formatFixed(partValue(part, 'L'), 0)} mH`;
    case 'dc':
      return `${formatFixed(partValue(part, 'E'), 1)} V`;
    case 'ac':
      return `${formatFixed(partValue(part, 'Ve'), 0)} V ${formatFixed(partValue(part, 'f'), 0)} Hz`;
    default:
      return '';
  }
}

/** 電流 [A] の表示（mA で有効数字 3 桁） */
export function currentText(I: number): string {
  return Number.isFinite(I) ? `${formatSig(I * 1e3, 3)} mA` : '—';
}

/** 電圧 [V] の表示 */
export function voltageText(V: number): string {
  return Number.isFinite(V) ? `${formatSig(V, 3)} V` : '—';
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  pal: Palette,
  view: SceneView,
): void {
  const layout = gridLayout(size);
  const s = layout.spacing;
  const at = (p: GridPoint) => screen(layout, p);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, size.width, size.height);

  // 格子点
  ctx.fillStyle = pal.grid;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const q = at({ x, y });
      ctx.beginPath();
      ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 部品を置く場所の予告
  if (view.hover) {
    const [a, b] = view.hover.map(at) as [{ x: number; y: number }, { x: number; y: number }];
    ctx.save();
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  const { circuit, state } = view;

  // 選択中の部品の強調
  const selected = circuit.parts.find((p) => p.id === view.selectedId);
  if (selected) {
    const a = at(selected.p1);
    const b = at(selected.p2);
    ctx.save();
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = Math.min(28, s * 0.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  // 部品
  circuit.parts.forEach((part, i) => {
    const color = i === view.problemPart ? pal.danger : pal.fg;
    drawPart(ctx, part, at(part.p1), at(part.p2), view.closed[i] ?? false, s, color, pal);
  });

  // 3 本以上の導線が集まる点（接続点の黒丸）
  const degree = new Map<number, number>();
  for (const p of circuit.parts) {
    for (const q of [p.p1, p.p2]) degree.set(nodeIndex(q), (degree.get(nodeIndex(q)) ?? 0) + 1);
  }
  for (const [n, d] of degree) {
    if (d < 3) continue;
    const q = at({ x: n % COLS, y: Math.floor(n / COLS) });
    drawJunction(ctx, q.x, q.y, pal.fg);
  }

  // 極板の電荷（記号の数は電圧に比例。voltageRef で 5 個）
  circuit.parts.forEach((part, i) => {
    if (part.kind !== 'capacitor') return;
    const V = state.V[i]!;
    if (!Number.isFinite(V)) return;
    const n = Math.min(6, Math.round((5 * Math.abs(V)) / view.voltageRef));
    if (n === 0) return;
    const a = at(part.p1);
    const b = at(part.p2);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const off = Math.max(7, s * 0.08) + 9;
    for (const [side, sign] of [
      [-1, V > 0 ? '+' : '−'],
      [1, V > 0 ? '−' : '+'],
    ] as const) {
      for (let k = 0; k < n; k++) {
        const w = (k - (n - 1) / 2) * 6;
        drawLabel(
          ctx,
          sign,
          mx + ux * off * side - uy * w,
          my + uy * off * side + ux * w,
          pal.quantity.electric,
          { font: CANVAS_FONT_SMALL },
        );
      }
    }
  });

  // 電流の流れ（点の移動量 ∝ 流れた電気量）
  if (view.options.showFlow && view.flowPxPerCoulomb > 0) {
    circuit.parts.forEach((part, i) => {
      if (part.kind === 'voltmeter') return;
      const q = state.flowed[i]!;
      if (q === 0 || !Number.isFinite(q)) return;
      drawFlowDots(ctx, [at(part.p1), at(part.p2)], q * view.flowPxPerCoulomb, {
        color: pal.quantity.current,
        spacing: s / 2,
        radius: 3,
      });
    });
  }

  // 名前・値・計器の読み
  if (view.options.showLabels) {
    circuit.parts.forEach((part, i) => {
      const name = view.names[i];
      if (!name) return;
      const a = at(part.p1);
      const b = at(part.p2);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const horizontal = a.y === b.y;
      const color = i === view.problemPart ? pal.danger : pal.fg;
      // 格子が狭い（スマホ）ときは、部品の値は表に任せて名前と計器の読みだけを描く
      const value =
        s < NARROW_SPACING && !isMeter(part)
          ? ''
          : part.kind === 'ammeter'
            ? currentText(state.I[i]!)
            : part.kind === 'voltmeter'
              ? voltageText(state.V[i]!)
              : valueText(part);
      const valueColor =
        part.kind === 'ammeter'
          ? pal.quantity.current
          : part.kind === 'voltmeter'
            ? pal.quantity.potential
            : pal.muted;
      // 計器の円・交流電源の円はほかより大きいので、ラベルを少し離す
      const big = isMeter(part) || part.kind === 'ac';
      if (horizontal) {
        const d = big ? s * 0.32 + 6 : s * 0.3;
        drawSymbol(ctx, name, mx, my - d, color);
        if (value) drawLabel(ctx, value, mx, my + d + 2, valueColor, { font: CANVAS_FONT_SMALL });
      } else {
        const d = big ? s * 0.28 + 6 : s * 0.22;
        drawSymbol(ctx, name, mx + d, my - 9, color, { align: 'left' });
        if (value) {
          drawLabel(ctx, value, mx + d, my + 9, valueColor, {
            font: CANVAS_FONT_SMALL,
            align: 'left',
          });
        }
      }
    });
  }

  if (circuit.parts.length === 0) {
    drawLabel(
      ctx,
      '下のボタンで部品を選び、格子の点と点の間をタップして置こう',
      size.width / 2,
      size.height / 2,
      pal.muted,
      { font: CANVAS_FONT_SMALL },
    );
  }
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  part: Part,
  a: { x: number; y: number },
  b: { x: number; y: number },
  closed: boolean,
  s: number,
  color: string,
  pal: Palette,
): void {
  const style = { color, fill: pal.bg };
  switch (part.kind) {
    case 'wire':
      drawWire(ctx, [a, b], color);
      break;
    case 'resistor':
      drawCircuitElement(ctx, 'resistor', a.x, a.y, b.x, b.y, { ...style, size: s * 0.6 });
      break;
    case 'capacitor':
      drawCircuitElement(ctx, 'capacitor', a.x, a.y, b.x, b.y, {
        ...style,
        size: Math.max(10, s * 0.14),
      });
      break;
    case 'coil':
      drawCircuitElement(ctx, 'coil', a.x, a.y, b.x, b.y, { ...style, size: s * 0.64 });
      break;
    case 'dc':
      drawCircuitElement(ctx, 'battery', a.x, a.y, b.x, b.y, style);
      break;
    case 'ac':
      drawCircuitElement(ctx, 'ac-source', a.x, a.y, b.x, b.y, {
        ...style,
        size: Math.max(22, s * 0.46),
      });
      break;
    case 'switch':
      drawSwitch(ctx, a.x, a.y, b.x, b.y, closed, { ...style, size: s * 0.56 });
      break;
    case 'ammeter':
    case 'voltmeter': {
      const r = Math.max(11, s * 0.2);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      drawWire(ctx, [a, b], color);
      drawMeter(ctx, mx, my, r, part.kind === 'ammeter' ? 'A' : 'V', color, pal.bg);
      // + 端子（端子 1）の側に「+」
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const px = mx - ux * (r + 7) + uy * 9;
      const py = my - uy * (r + 7) - ux * 9;
      drawLabel(ctx, '+', px, py, color, { font: CANVAS_FONT_SMALL });
      break;
    }
  }
}
