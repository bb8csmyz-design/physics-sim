/**
 * サンプルの配置（「サンプルを読み込む」で選ぶ）。テストでも各サンプルの物理を確かめる。
 */
import { defaultParams } from '@/core/params';
import { pointOnSlope, retension } from './design';
import {
  PARAMS,
  PULLEY_RADIUS,
  type SandboxDesign,
  type SandboxParams,
  type WallDef,
} from './model';

export interface Preset {
  id: string;
  label: string;
  params: SandboxParams;
  design: SandboxDesign;
}

/** 既定の床（上面が y = 0） */
export function defaultFloor(): WallDef {
  return { kind: 'wall', id: 'w1', x: 3.2, y: -0.1, w: 6.4, h: 0.2 };
}

/** 左右の端の壁 */
function sideWalls(): WallDef[] {
  return [
    { kind: 'wall', id: 'w2', x: 0.1, y: 0.6, w: 0.2, h: 1.2 },
    { kind: 'wall', id: 'w3', x: 6.3, y: 0.6, w: 0.2, h: 1.2 },
  ];
}

function params(p: Partial<SandboxParams>): SandboxParams {
  return { ...defaultParams(PARAMS), ...p };
}

/** 糸の長さを張った状態にそろえてから返す */
function design(d: SandboxDesign): SandboxDesign {
  retension(d);
  return d;
}

const BUILDERS: readonly (() => Preset)[] = [
  () => {
    const inc = {
      kind: 'incline' as const,
      id: 'i1',
      x: 2.0,
      y: 0,
      w: 3.2,
      angle: 30,
      flip: true,
    };
    // 左が高い斜面の、下端から 2.2 m の位置に置く（すべり降りて床の上を右へ進み、摩擦で止まる）
    const c = pointOnSlope(inc, 2.2, 0.3);
    return {
      id: 'incline',
      label: '斜面をすべる物体（摩擦あり）',
      params: params({ mu: 0.3, muk: 0.2, e: 0 }),
      design: design({
        bodies: [
          {
            kind: 'block',
            id: 'A',
            x: c.x,
            y: c.y,
            w: 0.3,
            h: 0.3,
            angle: -30,
            m: 1,
            vx: 0,
            vy: 0,
          },
        ],
        fixtures: [defaultFloor(), inc, sideWalls()[1]!],
        joints: [],
      }),
    };
  },
  () => ({
    id: 'pendulum',
    label: '単振り子',
    params: params({}),
    design: design({
      bodies: [
        {
          kind: 'ball',
          id: 'A',
          x: 4.0,
          y: 3.2 - 1.6 * Math.cos(Math.PI / 6),
          r: 0.12,
          m: 1,
          vx: 0,
          vy: 0,
        },
      ],
      fixtures: [defaultFloor()],
      joints: [
        { kind: 'string', id: 'c1', a: { body: 'A' }, b: { x: 3.2, y: 3.2 }, via: null, L: 1.6 },
      ],
    }),
  }),
  () => ({
    id: 'spring',
    label: 'ばね振り子（水平・摩擦なし）',
    params: params({ mu: 0, muk: 0 }),
    design: design({
      bodies: [
        { kind: 'block', id: 'A', x: 2.4, y: 0.15, w: 0.3, h: 0.3, angle: 0, m: 1, vx: 0, vy: 0 },
      ],
      fixtures: [defaultFloor(), { kind: 'wall', id: 'w2', x: 0.2, y: 0.6, w: 0.4, h: 1.2 }],
      joints: [
        { kind: 'spring', id: 's1', a: { x: 0.4, y: 0.15 }, b: { body: 'A' }, k: 20, L0: 1.6 },
      ],
    }),
  }),
  () => ({
    id: 'vertical-spring',
    label: '鉛直ばね振り子',
    params: params({}),
    design: design({
      bodies: [
        // つりあいの位置（自然長 + mg/k）より 0.3 m 下から放す
        {
          kind: 'ball',
          id: 'A',
          x: 3.2,
          y: 3.2 - (1.0 + (0.5 * 9.8) / 20) - 0.3,
          r: 0.12,
          m: 0.5,
          vx: 0,
          vy: 0,
        },
      ],
      fixtures: [defaultFloor(), { kind: 'wall', id: 'w2', x: 3.2, y: 3.3, w: 2.4, h: 0.2 }],
      joints: [
        { kind: 'spring', id: 's1', a: { x: 3.2, y: 3.2 }, b: { body: 'A' }, k: 20, L0: 1.0 },
      ],
    }),
  }),
  () => ({
    id: 'atwood',
    label: 'アトウッドの器械（滑車）',
    params: params({}),
    design: design({
      bodies: [
        {
          kind: 'block',
          id: 'A',
          x: 3.2 - PULLEY_RADIUS,
          y: 1.6,
          w: 0.24,
          h: 0.3,
          angle: 0,
          m: 2,
          vx: 0,
          vy: 0,
        },
        {
          kind: 'block',
          id: 'B',
          x: 3.2 + PULLEY_RADIUS,
          y: 2.0,
          w: 0.24,
          h: 0.3,
          angle: 0,
          m: 1,
          vx: 0,
          vy: 0,
        },
      ],
      fixtures: [
        defaultFloor(),
        { kind: 'wall', id: 'w2', x: 3.2, y: 3.3, w: 1.2, h: 0.2 },
        { kind: 'pulley', id: 'p1', x: 3.2, y: 3.0 },
      ],
      joints: [{ kind: 'string', id: 'c1', a: { body: 'A' }, b: { body: 'B' }, via: 'p1', L: 0 }],
    }),
  }),
  () => ({
    id: 'table',
    label: '机の上の物体と滑車',
    params: params({ mu: 0.3, muk: 0.2, e: 0 }),
    design: design({
      bodies: [
        {
          kind: 'block',
          id: 'A',
          x: 1.2,
          y: 1.6 + PULLEY_RADIUS,
          w: 0.3,
          h: 0.3,
          angle: 0,
          m: 2,
          vx: 0,
          vy: 0,
        },
        {
          kind: 'block',
          id: 'B',
          x: 3.77 + PULLEY_RADIUS,
          y: 1.0,
          w: 0.24,
          h: 0.3,
          angle: 0,
          m: 1,
          vx: 0,
          vy: 0,
        },
      ],
      fixtures: [
        defaultFloor(),
        { kind: 'wall', id: 'w2', x: 2.0, y: 0.8, w: 3.2, h: 1.6 },
        { kind: 'pulley', id: 'p1', x: 3.77, y: 1.6 },
      ],
      joints: [{ kind: 'string', id: 'c1', a: { body: 'A' }, b: { body: 'B' }, via: 'p1', L: 0 }],
    }),
  }),
  () => ({
    id: 'collision',
    label: '衝突と運動量保存',
    params: params({ mu: 0, muk: 0, e: 0.8 }),
    design: design({
      bodies: [
        { kind: 'block', id: 'A', x: 1.4, y: 0.15, w: 0.3, h: 0.3, angle: 0, m: 1, vx: 2, vy: 0 },
        { kind: 'block', id: 'B', x: 4.0, y: 0.2, w: 0.4, h: 0.4, angle: 0, m: 2, vx: -1, vy: 0 },
      ],
      fixtures: [defaultFloor(), ...sideWalls()],
      joints: [],
    }),
  }),
  () => ({
    id: 'bounce',
    label: '跳ね返るボール',
    params: params({ mu: 0.1, muk: 0.1, e: 0.8 }),
    design: design({
      bodies: [{ kind: 'ball', id: 'A', x: 1.0, y: 2.6, r: 0.12, m: 0.5, vx: 1.2, vy: 0 }],
      fixtures: [defaultFloor(), ...sideWalls()],
      joints: [],
    }),
  }),
  () => ({
    id: 'spring-pair',
    label: 'ばねでつながれた 2 物体',
    params: params({ mu: 0, muk: 0 }),
    design: design({
      bodies: [
        { kind: 'block', id: 'A', x: 2.0, y: 0.15, w: 0.3, h: 0.3, angle: 0, m: 1, vx: 1.5, vy: 0 },
        {
          kind: 'block',
          id: 'B',
          x: 3.0,
          y: 0.15,
          w: 0.3,
          h: 0.3,
          angle: 0,
          m: 1,
          vx: -0.5,
          vy: 0,
        },
      ],
      fixtures: [defaultFloor(), ...sideWalls()],
      joints: [{ kind: 'spring', id: 's1', a: { body: 'A' }, b: { body: 'B' }, k: 30, L0: 1.0 }],
    }),
  }),
  () => ({
    id: 'empty',
    label: '床だけ（自由に配置）',
    params: params({}),
    design: { bodies: [], fixtures: [defaultFloor()], joints: [] },
  }),
];

/** サンプルの一覧（呼ぶたびに新しいコピーを作る） */
export function presets(): Preset[] {
  return BUILDERS.map((b) => b());
}

export function preset(id: string): Preset {
  const p = presets().find((x) => x.id === id);
  if (!p) throw new Error(`未知のサンプル: ${id}`);
  return p;
}

/** ページを開いたときの配置 */
export const DEFAULT_PRESET = 'incline';
