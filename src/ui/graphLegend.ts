/**
 * グラフ（createTimeGraph / createXYGraph）の上端に置く縦軸ラベルと凡例の配置。
 * 幅の狭い画面（スマホ）で凡例が縦軸ラベルに重ならないよう、入りきらなければ凡例を折り返し、
 * そのぶんグラフの上の余白を広げる。
 */

/** 凡例 1 項目の線（見本）の長さと文字との間隔 [px] */
const SWATCH = 16;
const SWATCH_GAP = 6;
/** 凡例の項目どうしの間隔 [px] */
const ITEM_GAP = 12;
/** 凡例 1 行の高さ [px] */
const ROW_HEIGHT = 16;
/** 1 行目の中心の y 座標と、1 行のときのグラフ上端の y 座標 [px] */
const FIRST_ROW_Y = 16;
const BASE_TOP = 30;

export interface PlacedLegendItem {
  /** 凡例の項目の番号（labelWidths の添字） */
  index: number;
  /** 線（見本）の左端の x [px]。文字は x + 22 から */
  x: number;
  /** 行の中心の y [px] */
  y: number;
}

export interface LegendLayout {
  items: PlacedLegendItem[];
  /** グラフの描画領域の上端 [px]（凡例の行数に応じて下がる） */
  top: number;
  /** 縦軸ラベルを描く y（textBaseline = 'bottom'） */
  yLabelBaseline: number;
}

/**
 * 凡例を右寄せで並べる。1 行目は縦軸ラベルの右（yLabelRight より右）だけを使い、
 * 入りきらない項目は次の行（左端 left から使える）に送る。
 * labelWidths が空の項目（幅 < 0）は凡例に出さない。
 */
export function layoutLegend(
  labelWidths: readonly number[],
  opts: { left: number; right: number; yLabelRight: number },
): LegendLayout {
  const rows: { index: number; width: number }[][] = [[]];
  let used = 0;
  labelWidths.forEach((w, index) => {
    if (w < 0) return;
    const width = SWATCH + SWATCH_GAP + w;
    const row = rows[rows.length - 1]!;
    const rowLeft = rows.length === 1 ? opts.yLabelRight + ITEM_GAP : opts.left;
    const need = used + (row.length ? ITEM_GAP : 0) + width;
    if (row.length && need > opts.right - rowLeft) {
      rows.push([{ index, width }]);
      used = width;
    } else {
      row.push({ index, width });
      used = need;
    }
  });
  // 1 行目が縦軸ラベルとぶつかるなら（1 項目でも長すぎる場合）、凡例はすべて 2 行目以降に回す
  const first = rows[0]!;
  const firstWidth = first.reduce((s, it, i) => s + it.width + (i ? ITEM_GAP : 0), 0);
  if (first.length && firstWidth > opts.right - opts.yLabelRight - ITEM_GAP) rows.unshift([]);

  const items: PlacedLegendItem[] = [];
  rows.forEach((row, r) => {
    const y = FIRST_ROW_Y + r * ROW_HEIGHT;
    let x = opts.right;
    for (let i = row.length - 1; i >= 0; i--) {
      const it = row[i]!;
      x -= it.width;
      items.push({ index: it.index, x, y });
      x -= ITEM_GAP;
    }
  });
  const usedRows = rows.length - (rows[rows.length - 1]!.length ? 0 : 1);
  return {
    items,
    top: BASE_TOP + Math.max(0, usedRows - 1) * ROW_HEIGHT,
    yLabelBaseline: BASE_TOP - 10,
  };
}

/** 凡例の文字の左端（線の左端 x から） */
export const LEGEND_TEXT_OFFSET = SWATCH + SWATCH_GAP;
