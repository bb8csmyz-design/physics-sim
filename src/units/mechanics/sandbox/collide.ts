/**
 * サンドボックスの当たり判定（回転しない凸形状どうし）。DOM に依存しない純粋な計算のみ。
 *
 * 形は円と凸多角形（頂点は中心からの相対座標、反時計回り）。物体は回転しないので、
 * 2 つの形の接触は「法線ベクトル n と法線方向の距離 sep」だけで表せる（接触点はいらない）。
 * 多角形どうしは分離軸定理（SAT）、円と多角形は最近点で判定する。
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'polygon'; verts: readonly Vec2[]; normals: readonly Vec2[] };

export interface ContactGeometry {
  /** b から a へ向かう単位法線（a をこの向きに動かすと離れる） */
  nx: number;
  ny: number;
  /** 法線方向のすき間 [m]。負なら重なっている（−めり込みの深さ） */
  sep: number;
}

/** 頂点（反時計回り）から多角形の形を作る。外向きの辺の単位法線も前計算する */
export function polygon(verts: readonly Vec2[]): Shape {
  const normals = verts.map((v, i) => {
    const w = verts[(i + 1) % verts.length]!;
    const dx = w.x - v.x;
    const dy = w.y - v.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dy / len, y: -dx / len };
  });
  return { kind: 'polygon', verts, normals };
}

/** 中心を原点とする幅 w・高さ h の長方形を angle [rad] だけ反時計回りに傾けた形 */
export function boxShape(w: number, h: number, angle = 0): Shape {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ] as const;
  return polygon(corners.map(([x, y]) => ({ x: c * x - s * y, y: s * x + c * y })));
}

export function circleShape(r: number): Shape {
  return { kind: 'circle', r };
}

/** 形を軸に投影した区間 [min, max]（形の中心を原点として） */
function project(shape: Shape, ax: number, ay: number): [number, number] {
  if (shape.kind === 'circle') return [-shape.r, shape.r];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of shape.verts) {
    const d = v.x * ax + v.y * ay;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi];
}

/** 多角形どうし（SAT）。a の中心 (ax, ay)、b の中心 (bx, by) */
function polygonPolygon(
  a: Shape & { kind: 'polygon' },
  ax: number,
  ay: number,
  b: Shape & { kind: 'polygon' },
  bx: number,
  by: number,
): ContactGeometry {
  let best: ContactGeometry = { nx: 0, ny: 1, sep: -Infinity };
  const dx = ax - bx;
  const dy = ay - by;
  for (const normals of [a.normals, b.normals]) {
    for (const u of normals) {
      const [aLo, aHi] = project(a, u.x, u.y);
      const [bLo, bHi] = project(b, u.x, u.y);
      const off = dx * u.x + dy * u.y; // a の中心の b の中心からの距離（軸方向）
      const sepPlus = off + aLo - bHi; // a が軸の正の側にあるときのすき間
      const sepMinus = bLo - (off + aHi); // a が負の側にあるときのすき間
      if (sepPlus >= sepMinus) {
        if (sepPlus > best.sep) best = { nx: u.x, ny: u.y, sep: sepPlus };
      } else if (sepMinus > best.sep) {
        best = { nx: -u.x, ny: -u.y, sep: sepMinus };
      }
    }
  }
  return best;
}

/** 円 a（中心 (ax, ay)）と多角形 b（中心 (bx, by)） */
function circlePolygon(
  r: number,
  ax: number,
  ay: number,
  b: Shape & { kind: 'polygon' },
  bx: number,
  by: number,
): ContactGeometry {
  const cx = ax - bx;
  const cy = ay - by;
  const { verts, normals } = b;
  // 各辺からの符号付き距離の最大（すべて負なら円の中心は多角形の内部）
  let maxD = -Infinity;
  let maxI = 0;
  for (let i = 0; i < verts.length; i++) {
    const d = (cx - verts[i]!.x) * normals[i]!.x + (cy - verts[i]!.y) * normals[i]!.y;
    if (d > maxD) {
      maxD = d;
      maxI = i;
    }
  }
  if (maxD <= 0) {
    const n = normals[maxI]!;
    return { nx: n.x, ny: n.y, sep: maxD - r };
  }
  // 外部: 境界上の最近点
  let bestD2 = Infinity;
  let qx = 0;
  let qy = 0;
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i]!;
    const q = verts[(i + 1) % verts.length]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const t = Math.max(0, Math.min(1, ((cx - p.x) * ex + (cy - p.y) * ey) / (ex * ex + ey * ey)));
    const px = p.x + t * ex;
    const py = p.y + t * ey;
    const d2 = (cx - px) ** 2 + (cy - py) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      qx = px;
      qy = py;
    }
  }
  const d = Math.sqrt(bestD2);
  return { nx: (cx - qx) / d, ny: (cy - qy) / d, sep: d - r };
}

/**
 * 形 a（中心 (ax, ay)）と形 b（中心 (bx, by)）の接触の幾何。
 * 離れているときの sep は実際の距離以下の値（接触の候補を選ぶのに使う）。
 */
export function collide(
  a: Shape,
  ax: number,
  ay: number,
  b: Shape,
  bx: number,
  by: number,
): ContactGeometry {
  if (a.kind === 'circle' && b.kind === 'circle') {
    const dx = ax - bx;
    const dy = ay - by;
    const d = Math.hypot(dx, dy);
    if (d < 1e-12) return { nx: 0, ny: 1, sep: -(a.r + b.r) };
    return { nx: dx / d, ny: dy / d, sep: d - a.r - b.r };
  }
  if (a.kind === 'circle' && b.kind === 'polygon') return circlePolygon(a.r, ax, ay, b, bx, by);
  if (a.kind === 'polygon' && b.kind === 'circle') {
    const c = circlePolygon(b.r, bx, by, a, ax, ay);
    return { nx: -c.nx, ny: -c.ny, sep: c.sep };
  }
  return polygonPolygon(
    a as Shape & { kind: 'polygon' },
    ax,
    ay,
    b as Shape & { kind: 'polygon' },
    bx,
    by,
  );
}

/** 形を囲む軸平行な箱の半幅・半高さ */
export function halfExtents(shape: Shape): { hx: number; hy: number } {
  if (shape.kind === 'circle') return { hx: shape.r, hy: shape.r };
  let hx = 0;
  let hy = 0;
  for (const v of shape.verts) {
    hx = Math.max(hx, Math.abs(v.x));
    hy = Math.max(hy, Math.abs(v.y));
  }
  return { hx, hy };
}

/** 点 (px, py) が形（中心 (cx, cy)）の内部にあるか。margin [m] だけ外側も含める */
export function containsPoint(
  shape: Shape,
  cx: number,
  cy: number,
  px: number,
  py: number,
  margin = 0,
): boolean {
  if (shape.kind === 'circle') return Math.hypot(px - cx, py - cy) <= shape.r + margin;
  const x = px - cx;
  const y = py - cy;
  return shape.verts.every(
    (v, i) => (x - v.x) * shape.normals[i]!.x + (y - v.y) * shape.normals[i]!.y <= margin,
  );
}

/** 中心から向き (dx, dy)（単位ベクトル）に進んで形の境界に達する点までの距離 */
export function boundaryDistance(shape: Shape, dx: number, dy: number): number {
  if (shape.kind === 'circle') return shape.r;
  let best = Infinity;
  shape.verts.forEach((v, i) => {
    const n = shape.normals[i]!;
    const dn = dx * n.x + dy * n.y;
    if (dn > 1e-12) best = Math.min(best, (v.x * n.x + v.y * n.y) / dn);
  });
  return Number.isFinite(best) ? best : 0;
}

/** 点 p と線分 ab の距離 */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * ex), p.y - (a.y + t * ey));
}
