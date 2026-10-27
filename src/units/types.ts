import type { Disposer } from '@/core/dom';
import type { ExerciseTemplate } from '@/core/exercise';

/** 分野。フォルダ名 src/units/<FieldId>/ と一致させる */
export type FieldId = 'mechanics' | 'thermal' | 'waves' | 'electromagnetism' | 'atomic';

/** 学習段階（高校の科目区分） */
export type Level = '物理基礎' | '物理' | '発展';

/** 単元のメタ情報。src/units/<分野>/<単元>/meta.ts で `export const meta: UnitMeta` として定義する */
export interface UnitMeta {
  /** 単元名（例: 'ばねの単振動'） */
  title: string;
  /** 一覧に出す 1〜2 文の説明 */
  summary: string;
  level: Level;
  /** 分野内での並び順（小さいほど先。教科書の順序に合わせる） */
  order: number;
  /** 検索・関連付け用のキーワード */
  keywords?: readonly string[];
}

/**
 * 単元を開くときの初期条件（演習問題の答え合わせ・URL での共有に使う）。
 * 単元は params を createParamPanel の第 3 引数に、choices を presetChoice() で択一の初期値に渡す。
 */
export interface UnitPreset {
  /** スライダーの初期値（キーは PARAMS の key。範囲外・刻み外の値は丸める） */
  params?: Readonly<Record<string, number>>;
  /** 択一の切り替えの初期値（キーは単元が決める） */
  choices?: Readonly<Record<string, string>>;
  /** 単元固有の状態（サンドボックスの配置など） */
  state?: string;
}

export interface UnitContext {
  meta: UnitMeta;
  /** ページ離脱時に呼ばれる後片付け。イベント登録・アニメーション停止などはここに登録する */
  disposer: Disposer;
  /** 初期条件（指定がなければ既定値で開く） */
  preset?: UnitPreset;
}

/** 単元本体。src/units/<分野>/<単元>/index.ts で `export default` する */
export interface UnitModule {
  mount(root: HTMLElement, ctx: UnitContext): void;
}

export interface UnitEntry {
  field: FieldId;
  /** フォルダ名（URL にも使う。kebab-case） */
  slug: string;
  meta: UnitMeta;
  /** ルーティング用のハッシュ（例: '#/mechanics/spring-oscillation'） */
  href: string;
  load: () => Promise<UnitModule>;
  /** 演習問題（exercises.ts の EXERCISES）を読み込む */
  loadExercises: () => Promise<readonly ExerciseTemplate[]>;
}
