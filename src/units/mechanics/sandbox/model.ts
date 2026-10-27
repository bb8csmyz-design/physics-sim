/**
 * 力学サンドボックスの物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 既定の床の上面の左端を原点とし、右向きを x 軸の正、鉛直上向きを y 軸の正とする [m]。
 *       重力による位置エネルギーの基準は y = 0（既定の床の上面）。
 *
 * モデル（高校物理の理想化に合わせる）:
 *  - 物体は大きさのある剛体だが回転しない（並進運動だけ。教科書で「質点として扱う物体」）。
 *    形（円・長方形）は衝突・接触の判定にだけ使う。箱は置いたときの傾きを保ったまま動く。
 *  - 保存力: 重力 mg（鉛直下向き）、ばねの弾性力 k(ℓ − ℓ₀)（軽いばね）
 *  - 接触: 物体どうし・物体と床・壁・斜面はめり込まない。垂直抗力 N、摩擦力（静止摩擦は最大 μN、
 *    動摩擦は μ′N で滑りと逆向き）、衝突は反発係数 e（法線方向の相対速度が −e 倍になる）
 *  - 糸: 軽くて伸びない糸（引くことはできるが押せない＝たるむ）。軽くなめらかな滑車にかけられる。
 *
 * 数値積分: 保存力は速度ベルレ法で進め、拘束（接触・糸）は
 *   位置の拘束（SHAKE 法: めり込み・糸の伸びを、ステップ初めの拘束の向きに沿って戻す）と
 *   速度の拘束（RATTLE 法: 接触面に向かう速度・糸を伸ばす速度を取り除く）で満たす。
 * ガウス＝ザイデル法で全拘束を繰り返し解く（拘束力の大きさは 0 以上に制限する＝押さない・引かない）。
 * 摩擦力は位置・速度の両方の段階でクーロンの法則（|f| ≤ μN）に従って加える。
 *
 * 失われた力学的エネルギーは物理法則から求めて記録する（保存則のテストに使う）:
 *  - 摩擦熱: 動摩擦力 × 滑った距離
 *  - 衝突: ½(1 − e²)·u·J（u: 衝突直前に近づく速さ、J: 衝突で止めるのに要した力積）。
 *    2 物体なら ½·m₁m₂/(m₁ + m₂)·(1 − e²)u² になる。たるんだ糸が急に張るときも e = 0 の衝突として数える。
 */
import { G_ACCEL } from '@/core/physics/constants';
import type { ParamSpec, ParamValues } from '@/core/params';
import { boxShape, circleShape, collide, halfExtents, polygon, type Shape } from './collide';

// ---------------------------------------------------------------------------
// 全体のパラメータ
// ---------------------------------------------------------------------------

export type SandboxParamKey = 'g' | 'mu' | 'muk' | 'e';
export type SandboxParams = ParamValues<SandboxParamKey>;

export const PARAMS: readonly ParamSpec<SandboxParamKey>[] = [
  {
    key: 'g',
    label: '重力加速度',
    symbol: 'g',
    unit: 'm/s²',
    min: 0,
    max: 20,
    step: 0.1,
    default: G_ACCEL,
    hint: '0 にすると無重力（宇宙空間）',
  },
  {
    key: 'mu',
    label: '静止摩擦係数',
    symbol: 'μ',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    hint: 'すべての接触面で共通。止まっている物体が滑り出すかどうかを決める',
  },
  {
    key: 'muk',
    label: '動摩擦係数',
    symbol: "μ'",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.2,
    hint: '滑っている物体の摩擦力 μ′N を決める（μ′ > μ のときは μ′ = μ として計算する）',
  },
  {
    key: 'e',
    label: '反発係数',
    symbol: 'e',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
    hint: '物体どうし・物体と床や壁の衝突で共通（1 で弾性衝突）',
  },
];

/**
 * 物理ステップの刻み幅 [s]。ばねの角振動数はパラメータ範囲全体で ω ≤ 64 rad/s
 * （k ≤ 200 N/m、換算質量 ≥ 0.05 kg）なので ωΔt ≤ 0.032。
 * 衝突 1 回あたりのエネルギーの誤差は g·u·Δt 程度（u: 衝突の速さ）。
 */
export const DT = 5e-4;

/** 表示・配置する範囲 [m]（16:9）。既定の床の上面が y = 0 */
export const WORLD = { xMin: 0, xMax: 6.4, yMin: -0.2, yMax: 3.4 } as const;

/** 滑車の半径 [m] */
export const PULLEY_RADIUS = 0.15;

// ---------------------------------------------------------------------------
// 配置（保存・読み込みの対象）
// ---------------------------------------------------------------------------

/** 糸・ばねの端: 物体の中心 / 滑車の軸 / 固定点 */
export type Endpoint = { body: string } | { pulley: string } | { x: number; y: number };

/** 球（円）。(x, y) は中心 */
export interface BallDef {
  kind: 'ball';
  id: string;
  x: number;
  y: number;
  /** 半径 [m] */
  r: number;
  m: number;
  /** 初速度 [m/s] */
  vx: number;
  vy: number;
}

/** 箱（長方形）。(x, y) は中心、angle は傾き [°]（反時計回り正。運動中は変わらない） */
export interface BlockDef {
  kind: 'block';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  m: number;
  vx: number;
  vy: number;
}

export type BodyDef = BallDef | BlockDef;

/** 固定された台（壁・床・天井）。軸に平行な長方形、(x, y) は中心 */
export interface WallDef {
  kind: 'wall';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 固定された斜面（直角三角形の台）。(x, y) は底辺の中点、w は底辺の長さ、angle は傾斜角 [°]。
 * flip = false なら右側が高い（斜面は右上がり）、true なら左側が高い。
 */
export interface InclineDef {
  kind: 'incline';
  id: string;
  x: number;
  y: number;
  w: number;
  angle: number;
  flip: boolean;
}

/** 軽くなめらかな滑車（固定）。(x, y) は軸の位置、半径は PULLEY_RADIUS */
export interface PulleyDef {
  kind: 'pulley';
  id: string;
  x: number;
  y: number;
}

export type FixtureDef = WallDef | InclineDef | PulleyDef;

/** 軽いばね。k: ばね定数 [N/m]、L0: 自然長 [m] */
export interface SpringDef {
  kind: 'spring';
  id: string;
  a: Endpoint;
  b: Endpoint;
  k: number;
  L0: number;
}

/** 軽くて伸びない糸。via に滑車の id を指定すると、その滑車にかけた糸になる。L: 糸の長さ [m] */
export interface StringDef {
  kind: 'string';
  id: string;
  a: Endpoint;
  b: Endpoint;
  via: string | null;
  L: number;
}

export type JointDef = SpringDef | StringDef;

export interface SandboxDesign {
  bodies: BodyDef[];
  fixtures: FixtureDef[];
  joints: JointDef[];
}

/** 斜面の頂点（底辺の左端・右端・頂上の順） */
export type Point = [number, number];

export function inclineVertices(f: InclineDef): [Point, Point, Point] {
  const hgt = f.w * Math.tan((f.angle * Math.PI) / 180);
  const left = f.x - f.w / 2;
  const right = f.x + f.w / 2;
  return [[left, f.y], [right, f.y], f.flip ? [left, f.y + hgt] : [right, f.y + hgt]];
}

/** 物体の形（中心からの相対座標） */
export function bodyShape(b: BodyDef): Shape {
  return b.kind === 'ball' ? circleShape(b.r) : boxShape(b.w, b.h, (b.angle * Math.PI) / 180);
}

/** 固定物の形と中心（滑車も、物体がぶつかる円板として扱う） */
export function fixtureShape(f: FixtureDef): { shape: Shape; x: number; y: number } {
  if (f.kind === 'wall') return { shape: boxShape(f.w, f.h), x: f.x, y: f.y };
  if (f.kind === 'pulley') return { shape: circleShape(PULLEY_RADIUS), x: f.x, y: f.y };
  const v = inclineVertices(f);
  const cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
  const cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
  // 反時計回りにそろえる（flip で頂点の並びの向きが変わる）
  const pts = v.map(([x, y]) => ({ x: x - cx, y: y - cy }));
  const area =
    (pts[1]!.x - pts[0]!.x) * (pts[2]!.y - pts[0]!.y) -
    (pts[2]!.x - pts[0]!.x) * (pts[1]!.y - pts[0]!.y);
  return { shape: polygon(area > 0 ? pts : pts.reverse()), x: cx, y: cy };
}

// ---------------------------------------------------------------------------
// 計算用に変換した系（compile）
// ---------------------------------------------------------------------------

/** 拘束・ばねの端。body ≥ 0 なら物体の番号（x, y は使わない）、−1 なら固定点 (x, y) */
export interface Anchor {
  body: number;
  x: number;
  y: number;
}

export interface WorldBody {
  id: string;
  shape: Shape;
  m: number;
  /** 質量の逆数 1/m */
  w: number;
  hx: number;
  hy: number;
}

export interface WorldStatic {
  shape: Shape;
  x: number;
  y: number;
  hx: number;
  hy: number;
}

export interface WorldSpring {
  id: string;
  a: Anchor;
  b: Anchor;
  k: number;
  L0: number;
}

export interface WorldPulley {
  x: number;
  y: number;
  r: number;
  /** a 側から b 側へ糸が滑車に巻きつく向き（+1: 反時計回り, −1: 時計回り） */
  sigma: 1 | -1;
}

export interface WorldString {
  id: string;
  a: Anchor;
  b: Anchor;
  L: number;
  pulley: WorldPulley | null;
}

export interface SandboxWorld {
  g: number;
  mu: number;
  /** 動摩擦係数（μ′ ≤ μ にそろえた値） */
  muk: number;
  e: number;
  bodies: WorldBody[];
  statics: WorldStatic[];
  springs: WorldSpring[];
  strings: WorldString[];
  /** 初期状態 */
  x0: number[];
  y0: number[];
  vx0: number[];
  vy0: number[];
}

export interface SandboxState {
  /** 各物体の中心の位置 [m] と速度 [m/s]（並びは world.bodies と同じ） */
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  /** 摩擦で発生した熱の累計 [J] */
  qFriction: number;
  /** 衝突（e < 1）や糸が急に張ることで失われた力学的エネルギーの累計 [J] */
  qCollision: number;
}

function anchorPos(a: Anchor, xs: readonly number[], ys: readonly number[]): [number, number] {
  return a.body >= 0 ? [xs[a.body]!, ys[a.body]!] : [a.x, a.y];
}

/** 滑車にかけた糸の片側（物体から滑車に接する点まで） */
export interface PulleyLeg {
  /** 糸が滑車に接する点 */
  tx: number;
  ty: number;
  /** その点の角度 [rad]（滑車の中心から見て） */
  beta: number;
  /** 接点から物体までの長さ */
  len: number;
  /** 接点から物体へ向かう単位ベクトル（糸の長さを物体の位置で微分したもの） */
  ux: number;
  uy: number;
}

/**
 * 点 (px, py) から滑車への接線の接点。incoming = true なら「点 → 滑車」の向きに糸が進み、
 * 滑車を sigma の向きに回り込む側の接点を選ぶ（false なら「滑車 → 点」の側）。
 */
export function pulleyLeg(p: WorldPulley, px: number, py: number, incoming: boolean): PulleyLeg {
  const dx = px - p.x;
  const dy = py - p.y;
  const d = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx);
  if (d <= p.r * (1 + 1e-9)) {
    // 滑車の内側（通常は起こらない）: 半径方向に出ているとみなす
    return {
      tx: p.x + p.r * Math.cos(phi),
      ty: p.y + p.r * Math.sin(phi),
      beta: phi,
      len: 0,
      ux: d > 0 ? dx / d : 0,
      uy: d > 0 ? dy / d : -1,
    };
  }
  const alpha = Math.acos(p.r / d);
  let best: PulleyLeg | null = null;
  for (const beta of [phi + alpha, phi - alpha]) {
    const tx = p.x + p.r * Math.cos(beta);
    const ty = p.y + p.r * Math.sin(beta);
    // 接点での巻きつく向きの接線ベクトル
    const tanX = -Math.sin(beta) * p.sigma;
    const tanY = Math.cos(beta) * p.sigma;
    const along = incoming
      ? (tx - px) * tanX + (ty - py) * tanY
      : (px - tx) * tanX + (py - ty) * tanY;
    const len = Math.hypot(px - tx, py - ty);
    const leg = { tx, ty, beta, len, ux: (px - tx) / len, uy: (py - ty) / len };
    if (along > 0) return leg;
    best = leg;
  }
  return best!;
}

/** 滑車に巻きついている角度 [rad]（a 側の接点から b 側の接点まで sigma の向きに測る） */
export function wrapAngle(p: WorldPulley, a: PulleyLeg, b: PulleyLeg): number {
  const t = (p.sigma * (b.beta - a.beta)) % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

interface StringEval {
  /** C = （端から端までの糸の経路の長さ）− L。正なら伸びすぎ */
  C: number;
  /** C の a 端・b 端の位置による勾配 */
  gax: number;
  gay: number;
  gbx: number;
  gby: number;
}

/** 糸の経路の長さ（滑車にかけた糸は、接線部分 + 巻きついた弧） */
export function stringPathLength(
  str: Pick<WorldString, 'pulley'>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return evalString({ ...str, L: 0 }, ax, ay, bx, by).C;
}

function evalString(
  str: Pick<WorldString, 'pulley' | 'L'>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): StringEval {
  if (!str.pulley) {
    const dx = ax - bx;
    const dy = ay - by;
    const d = Math.hypot(dx, dy);
    const ux = d > 1e-12 ? dx / d : 0;
    const uy = d > 1e-12 ? dy / d : 1;
    return { C: d - str.L, gax: ux, gay: uy, gbx: -ux, gby: -uy };
  }
  const p = str.pulley;
  const la = pulleyLeg(p, ax, ay, true);
  const lb = pulleyLeg(p, bx, by, false);
  return {
    C: la.len + lb.len + p.r * wrapAngle(p, la, lb) - str.L,
    gax: la.ux,
    gay: la.uy,
    gbx: lb.ux,
    gby: lb.uy,
  };
}

/** 滑車に糸をかける向きを、配置から決める（糸は 2 本の側と反対側を回る） */
export function pulleyWinding(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const unit = (x: number, y: number) => {
    const d = Math.hypot(x, y) || 1;
    return [x / d, y / d] as const;
  };
  const [dax, day] = unit(ax - px, ay - py);
  const [dbx, dby] = unit(bx - px, by - py);
  // 糸が巻きつく側（滑車の中心から見た向き）
  let [sx, sy] = [-(dax + dbx), -(day + dby)];
  if (Math.hypot(sx, sy) < 1e-6) [sx, sy] = day <= 0 ? [-day, dax] : [day, -dax];
  const cross = dax * sy - day * sx;
  return cross >= 0 ? (1 as const) : (-1 as const);
}

/**
 * 配置を計算用の系に変換する。参照先のない糸・ばねや、両端が同じ物体・両端とも固定の糸は除く。
 * 糸の長さが端どうしの距離より短いときは、張った状態（距離に等しい長さ）にする。
 */
export function compile(design: SandboxDesign, params: SandboxParams): SandboxWorld {
  const index = new Map(design.bodies.map((b, i) => [b.id, i]));
  const pulleys = new Map(
    design.fixtures.filter((f): f is PulleyDef => f.kind === 'pulley').map((f) => [f.id, f]),
  );
  const bodies: WorldBody[] = design.bodies.map((b) => {
    const shape = bodyShape(b);
    const { hx, hy } = halfExtents(shape);
    return { id: b.id, shape, m: b.m, w: 1 / b.m, hx, hy };
  });
  const statics: WorldStatic[] = design.fixtures.map((f) => {
    const s = fixtureShape(f);
    return { ...s, ...halfExtents(s.shape) };
  });

  const resolve = (e: Endpoint): Anchor | null => {
    if ('body' in e) {
      const i = index.get(e.body);
      return i === undefined ? null : { body: i, x: 0, y: 0 };
    }
    if ('pulley' in e) {
      const p = pulleys.get(e.pulley);
      return p ? { body: -1, x: p.x, y: p.y } : null;
    }
    return { body: -1, x: e.x, y: e.y };
  };
  const x0 = design.bodies.map((b) => b.x);
  const y0 = design.bodies.map((b) => b.y);
  const valid = (a: Anchor | null, b: Anchor | null): [Anchor, Anchor] | null =>
    a && b && (a.body >= 0 || b.body >= 0) && a.body !== b.body ? [a, b] : null;
  // 端が同じ固定点（両端とも固定）の判定は body の比較で済む（両方 −1 なら除外）

  const springs: WorldSpring[] = [];
  const strings: WorldString[] = [];
  for (const j of design.joints) {
    const ends = valid(resolve(j.a), resolve(j.b));
    if (!ends) continue;
    const [a, b] = ends;
    if (j.kind === 'spring') {
      springs.push({ id: j.id, a, b, k: j.k, L0: j.L0 });
      continue;
    }
    const [ax, ay] = anchorPos(a, x0, y0);
    const [bx, by] = anchorPos(b, x0, y0);
    const pd = j.via ? pulleys.get(j.via) : undefined;
    const pulley: WorldPulley | null = pd
      ? { x: pd.x, y: pd.y, r: PULLEY_RADIUS, sigma: pulleyWinding(pd.x, pd.y, ax, ay, bx, by) }
      : null;
    const path = stringPathLength({ pulley }, ax, ay, bx, by);
    strings.push({ id: j.id, a, b, pulley, L: Math.max(j.L, path) });
  }

  return {
    g: params.g,
    mu: params.mu,
    muk: Math.min(params.muk, params.mu),
    e: params.e,
    bodies,
    statics,
    springs,
    strings,
    x0,
    y0,
    vx0: design.bodies.map((b) => b.vx),
    vy0: design.bodies.map((b) => b.vy),
  };
}

export function initialState(world: SandboxWorld): SandboxState {
  return {
    x: [...world.x0],
    y: [...world.y0],
    vx: [...world.vx0],
    vy: [...world.vy0],
    qFriction: 0,
    qCollision: 0,
  };
}

// ---------------------------------------------------------------------------
// 時間発展
// ---------------------------------------------------------------------------

/** ガウス＝ザイデル法の反復回数（位置・速度の各段階） */
const ITERATIONS = 16;
/** 接触の候補とするすき間 [m] */
const CONTACT_MARGIN = 2e-3;
/** 速度の段階で接触しているとみなすすき間 [m] */
const CONTACT_TOL = 1e-6;
/** これより速く近づいていたら衝突（反発係数を使う）とみなす [m/s]。遅ければ静かに接する */
const IMPACT_SPEED = 0.01;
/** 初めから重なっている物体を 1 ステップで引き離す距離 [m]（配置の誤りへの安全策） */
const RESOLVE_PER_STEP = 2e-5;
/** 糸がたるんでいるとみなす長さの余り [m] */
const SLACK_TOL = 1e-7;

/** 保存力（重力・ばね）による加速度 */
export function accelerations(
  world: SandboxWorld,
  xs: readonly number[],
  ys: readonly number[],
): { ax: number[]; ay: number[] } {
  const n = world.bodies.length;
  const ax = new Array<number>(n).fill(0);
  const ay = new Array<number>(n).fill(-world.g);
  for (const sp of world.springs) {
    const [x1, y1] = anchorPos(sp.a, xs, ys);
    const [x2, y2] = anchorPos(sp.b, xs, ys);
    const dx = x1 - x2;
    const dy = y1 - y2;
    const d = Math.hypot(dx, dy);
    if (d < 1e-12) continue;
    // a 端にはたらく力 F = −k(ℓ − ℓ₀) × (b から a への単位ベクトル)
    const f = (-sp.k * (d - sp.L0)) / d;
    if (sp.a.body >= 0) {
      const w = world.bodies[sp.a.body]!.w;
      ax[sp.a.body]! += f * dx * w;
      ay[sp.a.body]! += f * dy * w;
    }
    if (sp.b.body >= 0) {
      const w = world.bodies[sp.b.body]!.w;
      ax[sp.b.body]! -= f * dx * w;
      ay[sp.b.body]! -= f * dy * w;
    }
  }
  return { ax, ay };
}

interface Contact {
  a: number;
  /** 相手の物体の番号。固定物なら −1 */
  b: number;
  nx: number;
  ny: number;
  /** 検出したときのすき間と、そのときの両物体の位置（以後は平行移動から線形に計算する） */
  sep0: number;
  ax0: number;
  ay0: number;
  bx0: number;
  by0: number;
  /** ステップ初めのすき間（初めから重なっていたかどうか） */
  sStart: number;
  /** 衝突として扱うか（ステップ初めに速く近づいていた） */
  impact: boolean;
  /** 接触した瞬間に近づく速さ（ステップ内の加速度を一定とみなして求める） */
  u: number;
  /** 衝突の直前の接線方向の相対速度（半ステップ後の速度による） */
  vtStart: number;
  lamN: number;
  lamT: number;
  kineticPos: boolean;
  jn: number;
  jt: number;
  kineticVel: boolean;
}

/** 位置 (xs, ys) で接触している（すき間が CONTACT_MARGIN 未満の）組を探す */
function findContacts(world: SandboxWorld, xs: number[], ys: number[]): Contact[] {
  const out: Contact[] = [];
  const { bodies, statics } = world;
  const make = (a: number, b: number, g: { nx: number; ny: number; sep: number }): Contact => ({
    a,
    b,
    nx: g.nx,
    ny: g.ny,
    sep0: g.sep,
    ax0: xs[a]!,
    ay0: ys[a]!,
    bx0: b >= 0 ? xs[b]! : 0,
    by0: b >= 0 ? ys[b]! : 0,
    sStart: 0,
    impact: false,
    u: 0,
    vtStart: 0,
    lamN: 0,
    lamT: 0,
    kineticPos: false,
    jn: 0,
    jt: 0,
    kineticVel: false,
  });
  for (let i = 0; i < bodies.length; i++) {
    const A = bodies[i]!;
    const xa = xs[i]!;
    const ya = ys[i]!;
    for (let j = i + 1; j < bodies.length; j++) {
      const B = bodies[j]!;
      if (
        Math.abs(xa - xs[j]!) > A.hx + B.hx + CONTACT_MARGIN ||
        Math.abs(ya - ys[j]!) > A.hy + B.hy + CONTACT_MARGIN
      )
        continue;
      const g = collide(A.shape, xa, ya, B.shape, xs[j]!, ys[j]!);
      if (g.sep < CONTACT_MARGIN) out.push(make(i, j, g));
    }
    for (const S of statics) {
      if (
        Math.abs(xa - S.x) > A.hx + S.hx + CONTACT_MARGIN ||
        Math.abs(ya - S.y) > A.hy + S.hy + CONTACT_MARGIN
      )
        continue;
      const g = collide(A.shape, xa, ya, S.shape, S.x, S.y);
      if (g.sep < CONTACT_MARGIN) out.push(make(i, -1, g));
    }
  }
  return out;
}

interface StringWork {
  str: WorldString;
  /** ステップ初めの勾配（SHAKE はこの向きに沿って位置を直す） */
  gax: number;
  gay: number;
  gbx: number;
  gby: number;
  wa: number;
  wb: number;
  /** ステップ初めにたるんでいて、伸びる向きに速く動いていた（急に張る） */
  jerk: boolean;
  lam: number;
  j: number;
}

/**
 * 状態を dt だけ進める。
 *  1. v ← v + (dt/2)·a(x)                 （保存力で半ステップ加速）
 *  2. x′ ← x + dt·v                        （そのまま進める）
 *  3. 位置の拘束: 糸の伸び・めり込みを直し、静止摩擦・動摩擦で接線方向のずれを抑える
 *  4. v ← (x′ − x)/dt + (dt/2)·a(x′)       （直した位置と整合する速度にして、残り半ステップ加速）
 *  5. 速度の拘束: 糸を伸ばす速度・接触面に向かう速度を取り除き、摩擦の力積を加える。
 *     衝突は止めたあとで、反発係数 e に応じた速さで離れさせる
 */
export function step(world: SandboxWorld, s: SandboxState, dt: number): SandboxState {
  const { bodies, mu, muk, e } = world;
  const w = bodies.map((b) => b.w);
  const wOf = (i: number) => (i >= 0 ? w[i]! : 0);

  // 1. 半ステップの加速
  const a1 = accelerations(world, s.x, s.y);
  const vhx = s.vx.map((v, i) => v + 0.5 * dt * a1.ax[i]!);
  const vhy = s.vy.map((v, i) => v + 0.5 * dt * a1.ay[i]!);

  // 2. 進める
  const px = s.x.map((x, i) => x + dt * vhx[i]!);
  const py = s.y.map((y, i) => y + dt * vhy[i]!);

  // 3. 位置の拘束
  const contacts = findContacts(world, px, py);
  for (const c of contacts) {
    const { a, b, nx, ny } = c;
    const dax = px[a]! - s.x[a]!;
    const day = py[a]! - s.y[a]!;
    const dbx = b >= 0 ? px[b]! - s.x[b]! : 0;
    const dby = b >= 0 ? py[b]! - s.y[b]! : 0;
    c.sStart = c.sep0 - (nx * (dax - dbx) + ny * (day - dby));
    // 近づく速さ: ステップ初め u0、半ステップ後 uh。この間の加速度 an = 2(uh − u0)/Δt を一定とみなし、
    // すき間 sStart を進んで接触する瞬間の速さ √(u0² + 2·an·sStart) を求める（等加速度運動の式）
    const u0 = -(
      nx * (s.vx[a]! - (b >= 0 ? s.vx[b]! : 0)) +
      ny * (s.vy[a]! - (b >= 0 ? s.vy[b]! : 0))
    );
    const uh = -(nx * (vhx[a]! - (b >= 0 ? vhx[b]! : 0)) + ny * (vhy[a]! - (b >= 0 ? vhy[b]! : 0)));
    const an = (2 * (uh - u0)) / dt;
    c.u = Math.sqrt(Math.max(0, u0 * u0 + 2 * an * Math.max(0, c.sStart)));
    c.impact = u0 > IMPACT_SPEED && c.u > IMPACT_SPEED && c.sStart > -CONTACT_TOL;
    c.vtStart = -ny * (vhx[a]! - (b >= 0 ? vhx[b]! : 0)) + nx * (vhy[a]! - (b >= 0 ? vhy[b]! : 0));
  }

  const strings: StringWork[] = world.strings.map((str) => {
    const [ax, ay] = anchorPos(str.a, s.x, s.y);
    const [bx, by] = anchorPos(str.b, s.x, s.y);
    const ev = evalString(str, ax, ay, bx, by);
    const va = str.a.body >= 0 ? [s.vx[str.a.body]!, s.vy[str.a.body]!] : [0, 0];
    const vb = str.b.body >= 0 ? [s.vx[str.b.body]!, s.vy[str.b.body]!] : [0, 0];
    const cdot0 = ev.gax * va[0]! + ev.gay * va[1]! + ev.gbx * vb[0]! + ev.gby * vb[1]!;
    return {
      str,
      gax: ev.gax,
      gay: ev.gay,
      gbx: ev.gbx,
      gby: ev.gby,
      wa: wOf(str.a.body),
      wb: wOf(str.b.body),
      jerk: ev.C < -SLACK_TOL && cdot0 > IMPACT_SPEED,
      lam: 0,
      j: 0,
    };
  });

  for (let it = 0; it < ITERATIONS; it++) {
    let change = 0;
    for (const sw of strings) {
      const { str } = sw;
      const [ax, ay] = anchorPos(str.a, px, py);
      const [bx, by] = anchorPos(str.b, px, py);
      const ev = evalString(str, ax, ay, bx, by);
      if (ev.C <= 0 && sw.lam === 0) continue;
      // SHAKE: ステップ初めの勾配の向きに直す。C の変化率は新しい勾配との内積
      const denom =
        sw.wa * (ev.gax * sw.gax + ev.gay * sw.gay) + sw.wb * (ev.gbx * sw.gbx + ev.gby * sw.gby);
      if (!(denom > 1e-9 * (sw.wa + sw.wb))) continue;
      const next = Math.max(0, sw.lam + ev.C / denom);
      const dl = next - sw.lam;
      sw.lam = next;
      if (str.a.body >= 0) {
        px[str.a.body]! -= sw.wa * sw.gax * dl;
        py[str.a.body]! -= sw.wa * sw.gay * dl;
      }
      if (str.b.body >= 0) {
        px[str.b.body]! -= sw.wb * sw.gbx * dl;
        py[str.b.body]! -= sw.wb * sw.gby * dl;
      }
      change = Math.max(change, Math.abs(ev.C));
    }
    for (const c of contacts) {
      const { a, b, nx, ny } = c;
      const wa = w[a]!;
      const wb = wOf(b);
      const W = wa + wb;
      const sep =
        c.sep0 +
        nx * (px[a]! - c.ax0 - (b >= 0 ? px[b]! - c.bx0 : 0)) +
        ny * (py[a]! - c.ay0 - (b >= 0 ? py[b]! - c.by0 : 0));
      const target = Math.min(0, c.sStart + RESOLVE_PER_STEP);
      if (sep >= target && c.lamN === 0) continue;
      const nextN = Math.max(0, c.lamN + (target - sep) / W);
      const dn = nextN - c.lamN;
      c.lamN = nextN;
      // 摩擦: ステップ初めからの接線方向の相対的なずれを打ち消す（静止摩擦）か、μ′N で減らす（動摩擦）
      const tx = -ny;
      const ty = nx;
      // （法線方向の補正は接線方向のずれを変えないので、補正前の位置で測ってよい）
      const rel =
        tx * (px[a]! - s.x[a]! - (b >= 0 ? px[b]! - s.x[b]! : 0)) +
        ty * (py[a]! - s.y[a]! - (b >= 0 ? py[b]! - s.y[b]! : 0));
      const full = c.lamT - rel / W;
      let nextT: number;
      if (Math.abs(full) <= mu * c.lamN) {
        nextT = full;
        c.kineticPos = false;
      } else {
        nextT = Math.sign(full) * muk * c.lamN;
        c.kineticPos = true;
      }
      const dtl = nextT - c.lamT;
      c.lamT = nextT;
      px[a]! += wa * (nx * dn + tx * dtl);
      py[a]! += wa * (ny * dn + ty * dtl);
      if (b >= 0) {
        px[b]! -= wb * (nx * dn + tx * dtl);
        py[b]! -= wb * (ny * dn + ty * dtl);
      }
      change = Math.max(change, Math.abs(dn) * W, Math.abs(dtl) * W);
    }
    if (change < 1e-13) break;
  }

  // 4. 位置と整合する速度にして、残り半ステップ加速
  const a2 = accelerations(world, px, py);
  const vx = px.map((x, i) => (x - s.x[i]!) / dt + 0.5 * dt * a2.ax[i]!);
  const vy = py.map((y, i) => (y - s.y[i]!) / dt + 0.5 * dt * a2.ay[i]!);

  // 5. 速度の拘束
  const active = contacts.filter(
    (c) =>
      c.lamN > 0 ||
      c.sep0 +
        c.nx * (px[c.a]! - c.ax0 - (c.b >= 0 ? px[c.b]! - c.bx0 : 0)) +
        c.ny * (py[c.a]! - c.ay0 - (c.b >= 0 ? py[c.b]! - c.by0 : 0)) <=
        CONTACT_TOL,
  );
  const taut = strings.filter((sw) => {
    const [ax, ay] = anchorPos(sw.str.a, px, py);
    const [bx, by] = anchorPos(sw.str.b, px, py);
    return evalString(sw.str, ax, ay, bx, by).C >= -SLACK_TOL;
  });
  const tautGrad = taut.map((sw) => {
    const [ax, ay] = anchorPos(sw.str.a, px, py);
    const [bx, by] = anchorPos(sw.str.b, px, py);
    return evalString(sw.str, ax, ay, bx, by);
  });

  const solveVelocities = (restitution: boolean) => {
    for (let it = 0; it < ITERATIONS; it++) {
      let change = 0;
      taut.forEach((sw, k) => {
        const g = tautGrad[k]!;
        const ia = sw.str.a.body;
        const ib = sw.str.b.body;
        let cdot = 0;
        if (ia >= 0) cdot += g.gax * vx[ia]! + g.gay * vy[ia]!;
        if (ib >= 0) cdot += g.gbx * vx[ib]! + g.gby * vy[ib]!;
        const denom = sw.wa * (g.gax ** 2 + g.gay ** 2) + sw.wb * (g.gbx ** 2 + g.gby ** 2);
        if (!(denom > 0)) return;
        const next = Math.max(0, sw.j + cdot / denom);
        const dj = next - sw.j;
        sw.j = next;
        if (ia >= 0) {
          vx[ia]! -= sw.wa * g.gax * dj;
          vy[ia]! -= sw.wa * g.gay * dj;
        }
        if (ib >= 0) {
          vx[ib]! -= sw.wb * g.gbx * dj;
          vy[ib]! -= sw.wb * g.gby * dj;
        }
        change = Math.max(change, Math.abs(dj) * denom);
      });
      for (const c of active) {
        const { a, b, nx, ny } = c;
        const wa = w[a]!;
        const wb = wOf(b);
        const W = wa + wb;
        const rvx = vx[a]! - (b >= 0 ? vx[b]! : 0);
        const rvy = vy[a]! - (b >= 0 ? vy[b]! : 0);
        const vn = rvx * nx + rvy * ny;
        const target = restitution && c.impact ? e * c.u : 0;
        const nextN = Math.max(0, c.jn + (target - vn) / W);
        const dn = nextN - c.jn;
        c.jn = nextN;
        const tx = -ny;
        const ty = nx;
        const vt = rvx * tx + rvy * ty;
        const full = c.jt - vt / W;
        let nextT: number;
        if (Math.abs(full) <= mu * c.jn) {
          nextT = full;
          c.kineticVel = false;
        } else {
          nextT = Math.sign(full) * muk * c.jn;
          c.kineticVel = true;
        }
        const dtj = nextT - c.jt;
        c.jt = nextT;
        vx[a]! += wa * (nx * dn + tx * dtj);
        vy[a]! += wa * (ny * dn + ty * dtj);
        if (b >= 0) {
          vx[b]! -= wb * (nx * dn + tx * dtj);
          vy[b]! -= wb * (ny * dn + ty * dtj);
        }
        change = Math.max(change, Math.abs(dn) * W, Math.abs(dtj) * W);
      }
      if (change < 1e-13) break;
    }
  };

  // 5a. まず接触面に向かう速度・糸を伸ばす速度をすべて止める（完全非弾性）
  solveVelocities(false);
  // 5b. 衝突したものは反発係数に応じて離れさせる
  if (e > 0 && active.some((c) => c.impact)) solveVelocities(true);

  // 6. 失われたエネルギーの記録
  let qFriction = s.qFriction;
  let qCollision = s.qCollision;
  for (const c of contacts) {
    const tx = -c.ny;
    const ty = c.nx;
    if (c.impact && (c.kineticPos || c.kineticVel)) {
      // 衝突中の摩擦は力積が一瞬にはたらくので、仕事 = 力積 × 衝突の前後の平均の滑る速さ
      const vtAfter =
        tx * (vx[c.a]! - (c.b >= 0 ? vx[c.b]! : 0)) + ty * (vy[c.a]! - (c.b >= 0 ? vy[c.b]! : 0));
      const impulse = c.lamT / dt + c.jt;
      qFriction += Math.max(0, (-impulse * (c.vtStart + vtAfter)) / 2);
    } else if (c.kineticPos || c.kineticVel) {
      // 動摩擦の仕事 = 摩擦力 × 滑った距離。ステップ前半（位置の段階）と後半（速度の段階）の
      // 力積の和 ÷ Δt がこのステップの摩擦力、ステップ中の接線方向の相対変位が滑った距離
      const slip =
        tx * (px[c.a]! - s.x[c.a]! - (c.b >= 0 ? px[c.b]! - s.x[c.b]! : 0)) +
        ty * (py[c.a]! - s.y[c.a]! - (c.b >= 0 ? py[c.b]! - s.y[c.b]! : 0));
      const impulse = (c.kineticPos ? c.lamT / dt : 0) + (c.kineticVel ? c.jt : 0);
      qFriction += Math.max(0, (-impulse * slip) / dt);
    }
  }
  // 衝突（e < 1）や糸が急に張ることで失われたエネルギー: それが起きたステップで減った力学的エネルギーから、
  // そのステップの摩擦熱を除いたもの（複数の接触や糸が同時にはたらいても正しく数えられる）。
  // 接触した瞬間の速さを等加速度の式で求めているので、e = 1 なら力学的エネルギーは減らない
  if (contacts.some((c) => c.impact) || strings.some((sw) => sw.jerk)) {
    const before = mechanicalEnergy(world, s.x, s.y, s.vx, s.vy);
    const after = mechanicalEnergy(world, px, py, vx, vy);
    qCollision += Math.max(0, before - after - (qFriction - s.qFriction));
  }

  return { x: px, y: py, vx, vy, qFriction, qCollision };
}

// ---------------------------------------------------------------------------
// 物理量
// ---------------------------------------------------------------------------

export interface Energies {
  /** 運動エネルギーの和 ½mv² [J] */
  kinetic: number;
  /** 重力による位置エネルギーの和 mgy [J]（y = 0 が基準） */
  gravity: number;
  /** 弾性エネルギーの和 ½k(ℓ − ℓ₀)² [J] */
  elastic: number;
  /** 位置エネルギーの和 [J] */
  potential: number;
  /** 力学的エネルギー E = K + U [J] */
  total: number;
  /** 摩擦熱 [J] */
  friction: number;
  /** 衝突などで失われたエネルギー [J] */
  collision: number;
  /** 失われた力学的エネルギーの合計 Q [J] */
  heat: number;
  /** E + Q（保存される）[J] */
  budget: number;
}

export function springLength(sp: WorldSpring, s: SandboxState): number {
  const [x1, y1] = anchorPos(sp.a, s.x, s.y);
  const [x2, y2] = anchorPos(sp.b, s.x, s.y);
  return Math.hypot(x1 - x2, y1 - y2);
}

/** 糸の経路の長さ（張っていれば L に等しく、たるんでいれば L より短い） */
export function stringLength(str: WorldString, s: SandboxState): number {
  const [ax, ay] = anchorPos(str.a, s.x, s.y);
  const [bx, by] = anchorPos(str.b, s.x, s.y);
  return stringPathLength(str, ax, ay, bx, by);
}

export function anchorPosition(a: Anchor, s: SandboxState): [number, number] {
  return anchorPos(a, s.x, s.y);
}

export function bodyKinetic(world: SandboxWorld, s: SandboxState, i: number): number {
  return 0.5 * world.bodies[i]!.m * (s.vx[i]! ** 2 + s.vy[i]! ** 2);
}

function mechanicalEnergy(
  world: SandboxWorld,
  xs: readonly number[],
  ys: readonly number[],
  vxs: readonly number[],
  vys: readonly number[],
): number {
  return energies(world, {
    x: [...xs],
    y: [...ys],
    vx: [...vxs],
    vy: [...vys],
    qFriction: 0,
    qCollision: 0,
  }).total;
}

export function energies(world: SandboxWorld, s: SandboxState): Energies {
  let kinetic = 0;
  let gravity = 0;
  world.bodies.forEach((b, i) => {
    kinetic += bodyKinetic(world, s, i);
    gravity += b.m * world.g * s.y[i]!;
  });
  let elastic = 0;
  for (const sp of world.springs) elastic += 0.5 * sp.k * (springLength(sp, s) - sp.L0) ** 2;
  const total = kinetic + gravity + elastic;
  const heat = s.qFriction + s.qCollision;
  return {
    kinetic,
    gravity,
    elastic,
    potential: gravity + elastic,
    total,
    friction: s.qFriction,
    collision: s.qCollision,
    heat,
    budget: total + heat,
  };
}

/** 運動量の和 [kg·m/s] */
export function momentum(world: SandboxWorld, s: SandboxState): { px: number; py: number } {
  let px = 0;
  let py = 0;
  world.bodies.forEach((b, i) => {
    px += b.m * s.vx[i]!;
    py += b.m * s.vy[i]!;
  });
  return { px, py };
}

/** 物体が表示範囲から大きく外れたか（運動を終える） */
export function outOfBounds(s: SandboxState): boolean {
  return s.x.some(
    (x, i) =>
      x < WORLD.xMin - 1 ||
      x > WORLD.xMax + 1 ||
      s.y[i]! < WORLD.yMin - 1 ||
      s.y[i]! > WORLD.yMax + 20,
  );
}

export function isBroken(s: SandboxState): boolean {
  return !s.x.every(Number.isFinite) || !s.y.every(Number.isFinite) || !s.vx.every(Number.isFinite);
}
