import type { FieldId } from './types';

export interface FieldInfo {
  id: FieldId;
  name: string;
  description: string;
  /**
   * まだ実装していない単元の予定（トップページに「準備中」として表示する）。
   * 単元を実装したら、ここから削除すること（テストで重複を検出する）。
   */
  planned: readonly string[];
}

/** 分野の一覧（表示順） */
export const FIELDS: readonly FieldInfo[] = [
  {
    id: 'mechanics',
    name: '力学',
    description: '物体の運動と力、エネルギー・運動量の保存',
    planned: ['等加速度直線運動', '等速円運動'],
  },
  {
    id: 'thermal',
    name: '熱',
    description: '熱と温度、気体の状態変化と熱力学',
    planned: ['気体分子運動論', '理想気体の状態変化と p-V 図', '熱サイクルと熱効率', '熱量と比熱'],
  },
  {
    id: 'waves',
    name: '波動',
    description: '波の伝わり方、音と光の性質',
    planned: ['横波と縦波・波の式', '重ね合わせと定常波', '薄膜の干渉'],
  },
  {
    id: 'electromagnetism',
    name: '電磁気',
    description: '電場と磁場、回路、電磁誘導',
    planned: ['コンデンサー', '直流回路とキルヒホッフの法則'],
  },
  {
    id: 'atomic',
    name: '原子',
    description: '光と電子の粒子性・波動性、原子と原子核',
    planned: [
      '光電効果',
      'コンプトン効果',
      'ボーアの水素原子模型',
      '物質波と電子線回折',
      '放射性崩壊と半減期',
    ],
  },
];

export function fieldInfo(id: FieldId): FieldInfo {
  const f = FIELDS.find((x) => x.id === id);
  if (!f) throw new Error(`未知の分野: ${id}`);
  return f;
}
