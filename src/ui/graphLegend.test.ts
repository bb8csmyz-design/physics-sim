import { describe, expect, it } from 'vitest';
import { LEGEND_TEXT_OFFSET, layoutLegend } from './graphLegend';

describe('layoutLegend（グラフの凡例の配置）', () => {
  it('入りきるなら 1 行に右寄せで並べ、グラフの上端は変えない', () => {
    const l = layoutLegend([20, 30], { left: 6, right: 400, yLabelRight: 60 });
    expect(l.top).toBe(30);
    expect(l.items.map((it) => it.index).sort()).toEqual([0, 1]);
    const last = l.items.find((it) => it.index === 1)!;
    expect(last.x + LEGEND_TEXT_OFFSET + 30).toBeCloseTo(400);
    expect(new Set(l.items.map((it) => it.y)).size).toBe(1);
  });

  it('幅が足りなければ折り返し、縦軸ラベルと重ならない（スマホ幅）', () => {
    const yLabelRight = 120;
    const widths = [120, 80, 90];
    const l = layoutLegend(widths, { left: 6, right: 330, yLabelRight });
    expect(l.top).toBeGreaterThan(30);
    for (const it of l.items) {
      const end = it.x + LEGEND_TEXT_OFFSET + widths[it.index]!;
      expect(end).toBeLessThanOrEqual(330 + 1e-9);
      expect(it.x).toBeGreaterThanOrEqual(6);
      // 1 行目（縦軸ラベルと同じ行）の項目はラベルより右
      if (it.y === l.items[0]!.y && it.y < 20) expect(it.x).toBeGreaterThan(yLabelRight);
    }
    // 同じ行の項目どうしが重ならない
    const byRow = new Map<number, typeof l.items>();
    for (const it of l.items) byRow.set(it.y, [...(byRow.get(it.y) ?? []), it]);
    for (const row of byRow.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        expect(sorted[i]!.x).toBeGreaterThan(prev.x + LEGEND_TEXT_OFFSET + widths[prev.index]!);
      }
    }
    // 凡例の最下行はグラフの上端より上
    const lowest = Math.max(...l.items.map((it) => it.y));
    expect(lowest).toBeLessThan(l.top);
  });

  it('1 項目でも縦軸ラベルの右に入らなければ 2 行目に送る', () => {
    const l = layoutLegend([250], { left: 6, right: 300, yLabelRight: 100 });
    expect(l.items[0]!.y).toBeGreaterThan(16);
    expect(l.top).toBeGreaterThan(30);
  });

  it('幅が負の項目（ラベルなし）は出さない', () => {
    const l = layoutLegend([-1, 40], { left: 6, right: 300, yLabelRight: 50 });
    expect(l.items.map((it) => it.index)).toEqual([1]);
  });
});
