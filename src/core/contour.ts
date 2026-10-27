/**
 * 等高線（等値線）の計算。格子点で関数値を求め、マーチングスクエア法で
 * f(x, y) = level となる線分の集まりを返す。等電位線などの描画に使う（UI に依存しない）。
 */

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ScalarGrid {
  readonly bounds: Bounds;
  /** 格子の分割数（格子点は (nx + 1) × (ny + 1) 個） */
  readonly nx: number;
  readonly ny: number;
  /** values[j * (nx + 1) + i] = f(x_i, y_j) */
  readonly values: Float64Array;
}

export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function sampleGrid(
  f: (x: number, y: number) => number,
  bounds: Bounds,
  nx: number,
  ny: number,
): ScalarGrid {
  const values = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    const y = bounds.yMin + ((bounds.yMax - bounds.yMin) * j) / ny;
    for (let i = 0; i <= nx; i++) {
      const x = bounds.xMin + ((bounds.xMax - bounds.xMin) * i) / nx;
      values[j * (nx + 1) + i] = f(x, y);
    }
  }
  return { bounds, nx, ny, values };
}

/**
 * f = level の等値線を線分の列で返す。値が有限でない格子点を含むセルは飛ばす。
 * 鞍点型のあいまいなセルはセル中心の値（4 隅の平均）で接続を決める。
 */
export function contourSegments(grid: ScalarGrid, level: number): Segment[] {
  const { bounds, nx, ny, values } = grid;
  const dx = (bounds.xMax - bounds.xMin) / nx;
  const dy = (bounds.yMax - bounds.yMin) / ny;
  const out: Segment[] = [];
  const v = (i: number, j: number) => values[j * (nx + 1) + i]!;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      // 隅: 0 = 左下, 1 = 右下, 2 = 右上, 3 = 左上
      const c = [v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)] as const;
      if (!c.every(Number.isFinite)) continue;
      const x = bounds.xMin + i * dx;
      const y = bounds.yMin + j * dy;
      const corner = [
        [x, y],
        [x + dx, y],
        [x + dx, y + dy],
        [x, y + dy],
      ] as const;
      // 辺 k は隅 k と隅 k+1 を結ぶ。level をまたぐ辺の交点を線形補間で求める
      const cross: ([number, number] | null)[] = [0, 1, 2, 3].map((k) => {
        const a = c[k]!;
        const b = c[(k + 1) % 4]!;
        if (a < level === b < level) return null;
        const u = (level - a) / (b - a);
        const pa = corner[k]!;
        const pb = corner[(k + 1) % 4]!;
        return [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u];
      });
      const edges = [0, 1, 2, 3].filter((k) => cross[k]);
      const push = (k0: number, k1: number) => {
        const p = cross[k0]!;
        const q = cross[k1]!;
        out.push({ x0: p[0], y0: p[1], x1: q[0], y1: q[1] });
      };
      if (edges.length === 2) {
        push(edges[0]!, edges[1]!);
      } else if (edges.length === 4) {
        // 鞍点: 中心の値が隅 0 と同じ側なら、隅 0 を含む領域が中心でつながっている
        const center = (c[0] + c[1] + c[2] + c[3]) / 4;
        if (center < level === c[0] < level) {
          push(0, 1);
          push(2, 3);
        } else {
          push(3, 0);
          push(1, 2);
        }
      }
    }
  }
  return out;
}
