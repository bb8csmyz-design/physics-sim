/**
 * パラメータ定義の型（UI に依存しない）。単元の model.ts で宣言し、
 * UI（ui/params.ts）とテスト（範囲の端での検証）の両方から使う。
 */

export interface ParamSpec<K extends string = string> {
  key: K;
  /** 日本語の名前（例: '質量'） */
  label: string;
  /** 記号（例: 'm', 'v_0'）。'_' 以降は添字 */
  symbol?: string;
  /** 単位（例: 'kg', 'N/m'）。無次元なら省略 */
  unit?: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** 表示桁数（省略時は step から決める） */
  digits?: number;
  /** 補足説明（スライダーの下に小さく表示） */
  hint?: string;
}

export type ParamValues<K extends string> = Record<K, number>;

export function defaultParams<K extends string>(specs: readonly ParamSpec<K>[]): ParamValues<K> {
  return Object.fromEntries(specs.map((s) => [s.key, s.default])) as ParamValues<K>;
}

/**
 * 各パラメータを {min, default, max} から選んだ全組み合わせ（3^n 通り）。
 * 「パラメータ範囲の端でも物理的に正しい」ことをテストするのに使う。
 */
export function paramCorners<K extends string>(specs: readonly ParamSpec<K>[]): ParamValues<K>[] {
  let combos: Partial<ParamValues<K>>[] = [{}];
  for (const s of specs) {
    const choices = [...new Set([s.min, s.default, s.max])];
    combos = combos.flatMap((c) => choices.map((v) => ({ ...c, [s.key]: v })));
  }
  return combos as ParamValues<K>[];
}
