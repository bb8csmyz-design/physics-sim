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
 * 物理量の記号（'v_S', 'θ_1', 'λ' など）。'_' 以降を立体の添字で描く（core/dom.ts の symbol() と同じ書式）。
 * 中心 (x, y) に置く。suffix（' = 0.68 m' など）は記号の後ろに通常の文字で続ける。
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  sym: string,
  x: number,
  y: number,
  color: string,
  opts: { align?: 'left' | 'center' | 'right'; suffix?: string } = {},
): void {
  const [base = '', sub = ''] = sym.split('_');
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = CANVAS_FONT_MATH;
  const wBase = ctx.measureText(base).width;
  ctx.font = CANVAS_FONT_SMALL;
  const wSub = sub ? ctx.measureText(sub).width + 1 : 0;
  const wSuffix = opts.suffix ? ctx.measureText(opts.suffix).width : 0;
  const total = wBase + wSub + wSuffix;
  const align = opts.align ?? 'center';
  let cx = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  ctx.font = CANVAS_FONT_MATH;
  ctx.fillText(base, cx, y);
  cx += wBase;
  if (sub) {
    ctx.font = CANVAS_FONT_SMALL;
    ctx.fillText(sub, cx + 1, y + 5);
    cx += wSub;
  }
  if (opts.suffix) {
    ctx.font = CANVAS_FONT_SMALL;
    ctx.fillText(opts.suffix, cx, y);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 電磁気の図記号（回路素子・紙面に垂直な場・電流の流れ）
// ---------------------------------------------------------------------------

export type CircuitElementKind = 'resistor' | 'capacitor' | 'coil' | 'battery' | 'ac-source';

export interface CircuitElementStyle {
  color: string;
  /** 記号の塗り（抵抗の箱・交流電源の円の内側）。省略時は塗らない */
  fill?: string;
  width?: number;
  /** 記号部分の長さ [px]（導線方向）。省略時は素子ごとの既定値 */
  size?: number;
}

const ELEMENT_SIZE: Record<CircuitElementKind, number> = {
  resistor: 44,
  capacitor: 12,
  coil: 48,
  battery: 10,
  'ac-source': 30,
};

/**
 * (x0, y0) から (x1, y1) への導線の中央に回路素子の記号を描く（JIS C 0617 の記号）。
 * 電池は (x1, y1) 側が正極（長い線）。交流電源は円の中に正弦波。
 */
export function drawCircuitElement(
  ctx: CanvasRenderingContext2D,
  kind: CircuitElementKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  style: CircuitElementStyle,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const size = Math.min(style.size ?? ELEMENT_SIZE[kind], len * 0.8);
  const a = (len - size) / 2;
  const b = (len + size) / 2;
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.width ?? 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 導線（記号の両側）
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(a, 0);
  ctx.moveTo(b, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.beginPath();
  switch (kind) {
    case 'resistor': {
      const hgt = size * 0.32;
      ctx.rect(a, -hgt / 2, size, hgt);
      if (style.fill) {
        ctx.fillStyle = style.fill;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case 'capacitor': {
      const plate = 30;
      ctx.lineWidth = (style.width ?? 2) * 1.5;
      ctx.moveTo(a, -plate / 2);
      ctx.lineTo(a, plate / 2);
      ctx.moveTo(b, -plate / 2);
      ctx.lineTo(b, plate / 2);
      ctx.stroke();
      break;
    }
    case 'coil': {
      const n = 4;
      const r = size / n / 2;
      for (let i = 0; i < n; i++) {
        const cx = a + r * (2 * i + 1);
        ctx.moveTo(cx - r, 0);
        ctx.arc(cx, 0, r, Math.PI, 0, false);
      }
      ctx.stroke();
      break;
    }
    case 'battery': {
      // 負極（短く太い線）→ 正極（長く細い線）
      ctx.lineWidth = (style.width ?? 2) * 2;
      ctx.moveTo(a, -8);
      ctx.lineTo(a, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = style.width ?? 2;
      ctx.moveTo(b, -16);
      ctx.lineTo(b, 16);
      ctx.stroke();
      break;
    }
    case 'ac-source': {
      const r = size / 2;
      ctx.arc(a + r, 0, r, 0, Math.PI * 2);
      if (style.fill) {
        ctx.fillStyle = style.fill;
        ctx.fill();
      }
      ctx.stroke();
      ctx.beginPath();
      // 円の中の正弦波（導線の向きに依存しないよう、回転を戻して横向きに描く）
      ctx.save();
      ctx.translate(a + r, 0);
      ctx.rotate(-Math.atan2(y1 - y0, x1 - x0));
      for (let i = 0; i <= 24; i++) {
        const u = (i / 24) * 2 - 1;
        const x = u * r * 0.6;
        const y = -Math.sin(u * Math.PI) * r * 0.35;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}

/**
 * (x0, y0) から (x1, y1) への導線の途中に、開閉スイッチ（ナイフスイッチ）を描く。
 * 両端の接点は白抜きの小円（fill は背景色）。開いているときはレバーを 30° 持ち上げる。
 */
export function drawSwitch(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  closed: boolean,
  style: { color: string; fill: string; width?: number; size?: number },
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const size = Math.min(style.size ?? 36, len * 0.8);
  const a = (len - size) / 2;
  const b = (len + size) / 2;
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width ?? 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(a, 0);
  ctx.moveTo(b, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  // レバー（導線の向きによらず、画面の上側か左側へ開く）
  const up = Math.abs(y1 - y0) > Math.abs(x1 - x0) ? (y1 > y0 ? 1 : -1) : x1 > x0 ? -1 : 1;
  const angle = closed ? 0 : (up * Math.PI) / 6;
  ctx.lineWidth = (style.width ?? 2) * 1.5;
  ctx.beginPath();
  ctx.moveTo(a, 0);
  ctx.lineTo(a + size * Math.cos(angle), size * Math.sin(angle));
  ctx.stroke();
  ctx.restore();
  for (const u of [a, b]) {
    drawTerminal(
      ctx,
      x0 + ((x1 - x0) * u) / len,
      y0 + ((y1 - y0) * u) / len,
      style.color,
      style.fill,
    );
  }
}

/** 導線（折れ線） */
export function drawWire(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  color: string,
  width = 2,
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

/** 端子・接点（白抜きの小円）。fill は背景色を渡す */
export function drawTerminal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  fill: string,
  r = 4,
): void {
  drawBall(ctx, x, y, r, fill, color);
}

/** 導線の接続点（黒丸） */
export function drawJunction(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  r = 3.5,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 紙面に垂直なベクトル（磁場など）の記号。
 * 'out' = ⊙（紙面の裏から表へ）, 'in' = ⊗（紙面の表から裏へ）
 */
export function drawOutOfPlaneMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  direction: 'out' | 'in',
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, r / 5);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  if (direction === 'out') {
    ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const d = r * 0.6;
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x - d, y + d);
    ctx.lineTo(x + d, y - d);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 折れ線に沿って等間隔の点を描く（電流の流れの表示）。
 * offset [px] を電流に比例して増やすと点が流れる（負なら逆向き）。
 */
export function drawFlowDots(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  offset: number,
  opts: { color: string; spacing?: number; radius?: number },
): void {
  const spacing = opts.spacing ?? 24;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lengths.push(l);
    total += l;
  }
  if (total <= 0 || !Number.isFinite(offset)) return;
  ctx.save();
  ctx.fillStyle = opts.color;
  let s = ((offset % spacing) + spacing) % spacing;
  let seg = 0;
  let segStart = 0;
  for (; s < total; s += spacing) {
    while (seg < lengths.length - 1 && s > segStart + lengths[seg]!) {
      segStart += lengths[seg]!;
      seg++;
    }
    const u = lengths[seg]! > 0 ? (s - segStart) / lengths[seg]! : 0;
    const p0 = points[seg]!;
    const p1 = points[seg + 1]!;
    ctx.beginPath();
    ctx.arc(p0.x + (p1.x - p0.x) * u, p0.y + (p1.y - p0.y) * u, opts.radius ?? 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface BarSpec {
  label: string;
  value: number;
  color: string;
}

/**
 * エネルギーなどの棒グラフ。(x, y, w, hgt) の枠の中に、ref を満杯として棒を並べる。
 * 'vertical' は縦棒を横に並べ（ラベルは枠の下）、'horizontal' は横棒を縦に並べる（ラベルは枠の左）。
 */
export function drawBarChart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  hgt: number,
  bars: readonly BarSpec[],
  ref: number,
  opts: {
    orientation: 'vertical' | 'horizontal';
    track: string;
    labelColor: string;
    title?: string;
  },
): void {
  if (!(ref > 0)) return;
  const n = bars.length;
  const ratio = (v: number) => Math.max(0, Math.min(v / ref, 1.05));
  ctx.save();
  if (opts.orientation === 'vertical') {
    const slot = w / n;
    const barW = Math.min(slot * 0.62, 22);
    bars.forEach((b, i) => {
      const bx = x + slot * i + (slot - barW) / 2;
      ctx.fillStyle = opts.track;
      ctx.fillRect(bx, y, barW, hgt);
      ctx.fillStyle = b.color;
      const bh = ratio(b.value) * hgt;
      ctx.fillRect(bx, y + hgt - bh, barW, bh);
      drawLabel(ctx, b.label, bx + barW / 2, y + hgt + 12, opts.labelColor, {
        font: CANVAS_FONT_SMALL,
      });
    });
    if (opts.title)
      drawLabel(ctx, opts.title, x + w / 2, y - 10, opts.labelColor, { font: CANVAS_FONT_SMALL });
  } else {
    const slot = hgt / n;
    const barH = Math.min(slot * 0.62, 16);
    bars.forEach((b, i) => {
      const by = y + slot * i + (slot - barH) / 2;
      ctx.fillStyle = opts.track;
      ctx.fillRect(x, by, w, barH);
      ctx.fillStyle = b.color;
      ctx.fillRect(x, by, ratio(b.value) * w, barH);
      drawLabel(ctx, b.label, x - 6, by + barH / 2, opts.labelColor, {
        font: CANVAS_FONT_SMALL,
        align: 'right',
      });
    });
    if (opts.title) {
      drawLabel(ctx, opts.title, x, y - 8, opts.labelColor, {
        font: CANVAS_FONT_SMALL,
        align: 'left',
      });
    }
  }
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
