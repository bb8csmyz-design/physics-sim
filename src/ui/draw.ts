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
 * 電池（直流電源）の記号。水平な導線上の (cx, cy) に置く。
 * 長い線が正極、短く太い線が負極。positive で正極の側（'left' | 'right'）を指定する。
 */
export function drawBattery(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  positive: 'left' | 'right',
  color: string,
  size = 14,
): void {
  const gap = size * 0.45;
  const plusX = positive === 'left' ? cx - gap / 2 : cx + gap / 2;
  const minusX = positive === 'left' ? cx + gap / 2 : cx - gap / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'butt';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plusX, cy - size);
  ctx.lineTo(plusX, cy + size);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(minusX, cy - size * 0.5);
  ctx.lineTo(minusX, cy + size * 0.5);
  ctx.stroke();
  ctx.restore();
  drawLabel(ctx, '+', plusX + (positive === 'left' ? -8 : 8), cy - size, color, {
    font: CANVAS_FONT_SMALL,
  });
}

/** 電流計・電圧計の記号（円の中に 'A' / 'V'）。中心 (cx, cy)、半径 r */
export function drawMeter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  label: string,
  color: string,
  fill: string,
): void {
  drawBall(ctx, cx, cy, r, fill, color);
  drawLabel(ctx, label, cx, cy + 0.5, color, { font: CANVAS_FONT });
}

/**
 * 光子（光の粒）を表す波束。(x, y) を中心に、向き angle [rad] へ進む長さ len の波形を描く。
 * wavelength は画面上の波の間隔 [px]（実際の波長に比例させると、色と波長の関係が見える）。
 */
export function drawPhoton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  wavelength: number,
  color: string,
  width = 2,
): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const amp = Math.min(5, wavelength * 0.45);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const n = Math.max(8, Math.ceil(len / 1.5));
  for (let i = 0; i <= n; i++) {
    const s = -len / 2 + (len * i) / n;
    // 両端で振幅が 0 になる包絡線
    const env = Math.sin((Math.PI * i) / n);
    const w = amp * env * Math.sin((2 * Math.PI * s) / wavelength);
    const px = x + ux * s - uy * w;
    const py = y + uy * s + ux * w;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  // 進む向きの小さな矢じり
  const hx = x + (ux * len) / 2;
  const hy = y + (uy * len) / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(hx + ux * 6, hy + uy * 6);
  ctx.lineTo(hx - uy * 4, hy + ux * 4);
  ctx.lineTo(hx + uy * 4, hy - ux * 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
