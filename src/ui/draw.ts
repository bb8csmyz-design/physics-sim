/**
 * Canvas 描画の共通部品。座標はすべて画面座標 [px]。
 * 見た目を単元間でそろえるため、矢印・ばね・壁などは必ずここの関数で描く。
 */

export interface ArrowStyle {
  color: string;
  width?: number;
  /** 矢じりの長さ [px] */
  head?: number;
  dashed?: boolean;
}

/** (x0, y0) から (x1, y1) への矢印。長さが短すぎるときは描かない */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  style: ArrowStyle,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  const width = style.width ?? 2.5;
  const head = Math.min(style.head ?? 10, len * 0.6);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (style.dashed) ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45);
  ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * x0 から x1 まで水平に伸びるつる巻きばね（ジグザグ）。
 * 巻き数を固定することで、伸び縮みが見た目にも分かるようにする。
 */
export function drawSpring(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  opts: { coils?: number; amplitude?: number; color: string; width?: number; lead?: number },
): void {
  const coils = opts.coils ?? 12;
  const amp = opts.amplitude ?? 10;
  const lead = Math.min(opts.lead ?? 10, Math.abs(x1 - x0) / 4);
  const dir = Math.sign(x1 - x0) || 1;
  const start = x0 + dir * lead;
  const end = x1 - dir * lead;
  const n = coils * 2;
  ctx.save();
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.width ?? 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(start, y);
  for (let i = 0; i < n; i++) {
    const x = start + ((end - start) * (i + 0.5)) / n;
    ctx.lineTo(x, y + (i % 2 === 0 ? -amp : amp));
  }
  ctx.lineTo(end, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

/** 斜線ハッチ付きの固定面（壁・床・天井）。(x, y, w, h) の矩形をハッチし、side 側に実線を引く */
export function drawFixture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  hgt: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  color: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, hgt);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = -hgt; d < w + hgt; d += 8) {
    ctx.moveTo(x + d, y + hgt);
    ctx.lineTo(x + d + hgt, y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (side === 'top') {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
  } else if (side === 'bottom') {
    ctx.moveTo(x, y + hgt);
    ctx.lineTo(x + w, y + hgt);
  } else if (side === 'left') {
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + hgt);
  } else {
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + hgt);
  }
  ctx.stroke();
  ctx.restore();
}

/** 角丸の物体（ブロック）。中心 (cx, cy) */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  hgt: number,
  fill: string,
  stroke: string,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - hgt / 2, w, hgt, Math.min(6, w / 6));
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 小球。中心 (cx, cy), 半径 r */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke: string,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 破線（基準線・補助線） */
export function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width = 1,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

export const CANVAS_FONT =
  '500 13px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif';
export const CANVAS_FONT_SMALL =
  '12px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif';
export const CANVAS_FONT_MATH = 'italic 15px "Times New Roman", "STIX Two Math", serif';

/** ラベル文字列。align/baseline は Canvas の指定と同じ */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: { align?: CanvasTextAlign; baseline?: CanvasTextBaseline; font?: string } = {},
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = opts.font ?? CANVAS_FONT;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = opts.baseline ?? 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * ラベル付きのベクトル矢印。始点 (x, y) から (dx, dy) [px] だけ伸ばし、
 * 先端の少し先に記号（'v', 'mg' など）を書く。短すぎる矢印にはラベルを付けない。
 */
export function drawVector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: string,
  label?: string,
  style: Omit<ArrowStyle, 'color'> = {},
): void {
  drawArrow(ctx, x, y, x + dx, y + dy, { ...style, color });
  const len = Math.hypot(dx, dy);
  if (!label || len < 12) return;
  const ux = dx / len;
  const uy = dy / len;
  // 横向きに近い矢印は、長いラベル（'mg sinθ' など）が矢印に重ならないよう先端の外側にそろえる
  const horizontal = Math.abs(ux) > 0.7;
  const off = horizontal ? 6 : 11;
  drawLabel(ctx, label, x + dx + ux * off, y + dy + uy * off, color, {
    font: CANVAS_FONT_MATH,
    align: horizontal ? (ux > 0 ? 'left' : 'right') : 'center',
  });
}

/**
 * (x0, y0) から (x1, y1) まで、任意の向きに伸びるつる巻きばね。
 * drawSpring（水平）を回転して描く。
 */
export function drawSpringBetween(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: { coils?: number; amplitude?: number; color: string; width?: number; lead?: number },
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  drawSpring(ctx, 0, len, 0, opts);
  ctx.restore();
}

/** 点列を結ぶ折れ線（軌跡など）。点は画面座標 [px] */
export function drawPath(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  color: string,
  opts: { width?: number; dashed?: boolean; alpha?: number } = {},
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.width ?? 2;
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.dashed) ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.stroke();
  ctx.restore();
}

export interface EnergyBar {
  /** 棒の下に書く記号（'K', 'U', 'E' など） */
  label: string;
  value: number;
  color: string;
}

/**
 * 右上のエネルギー棒グラフ。reference（初めの力学的エネルギーなど）を棒の高さ maxHeight に対応させる。
 * 値が負になりうる量（重力の位置エネルギーなど）は、基準を変えて非負にしてから渡す。
 */
export function drawEnergyBars(
  ctx: CanvasRenderingContext2D,
  right: number,
  top: number,
  maxHeight: number,
  bars: readonly EnergyBar[],
  reference: number,
  pal: { grid: string; fg: string },
): void {
  if (!(reference > 0)) return;
  const barW = 14;
  const gap = 8;
  const bottom = top + maxHeight;
  bars.forEach((b, i) => {
    const x = right - (bars.length - i) * (barW + gap) + gap;
    const hgt = (Math.max(0, Math.min(b.value, reference * 1.05)) / reference) * maxHeight;
    ctx.fillStyle = pal.grid;
    ctx.fillRect(x, top, barW, maxHeight);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, bottom - hgt, barW, hgt);
    drawLabel(ctx, b.label, x + barW / 2, bottom + 11, pal.fg, { font: CANVAS_FONT_MATH });
  });
}

/** 縮尺の目安（「1 m」などの基準長の線）。左端 (x, y) から右へ、およそ maxPx 以下のきりのよい長さで描く */
export function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pxPerUnit: number,
  maxPx: number,
  color: string,
  unit = 'm',
  unitFactor = 1,
): void {
  // きりのよい長さ（1, 2, 5 × 10ⁿ）で maxPx に収まる最大のもの
  const maxLen = maxPx / pxPerUnit;
  const mag = 10 ** Math.floor(Math.log10(maxLen));
  const nice = [5, 2, 1].map((c) => c * mag).find((v) => v <= maxLen) ?? mag;
  const w = nice * pxPerUnit;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y - 4);
  ctx.stroke();
  ctx.restore();
  const shown = Number((nice / unitFactor).toPrecision(3));
  drawLabel(ctx, `${shown} ${unit}`, x + w / 2, y - 10, color, { font: CANVAS_FONT_SMALL });
}

/**
 * 斜線ハッチ付きの多角形の固定物（斜面の台など）。points は画面座標 [px]。
 * outline に指定した辺（i 番目の点から i+1 番目の点）だけ実線で縁取る（省略時は全周）。
 */
export function drawFixturePolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  color: string,
  outline?: readonly number[],
): void {
  if (points.length < 3) return;
  const xs = points.map((q) => q.x);
  const ys = points.map((q) => q.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const hgt = Math.max(...ys) - y0;
  ctx.save();
  ctx.beginPath();
  points.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = -hgt; d < w + hgt; d += 8) {
    ctx.moveTo(x0 + d, y0 + hgt);
    ctx.lineTo(x0 + d + hgt, y0);
  }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const edges = outline ?? points.map((_, i) => i);
  for (const i of edges) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}
