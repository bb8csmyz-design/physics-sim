/**
 * 現在値パネル。物理量の名前・記号・値・単位を一覧表示する。
 */
import { h, symbol } from '@/core/dom';
import { formatFixed, formatSig } from '@/core/format';
import { quantityCssVar, type Quantity } from '@/core/theme';

export interface ValueSpec<K extends string = string> {
  key: K;
  label: string;
  symbol?: string;
  unit?: string;
  /** 小数点以下の桁数。省略時は有効数字 3 桁 */
  digits?: number;
  /** 色見本を付ける（グラフの線の色と対応させる） */
  quantity?: Quantity;
}

export interface ValuePanel<K extends string> {
  readonly element: HTMLElement;
  /** 数値は digits に従って整形する。文字列（「1 周する」などの判定）はそのまま表示する */
  update(values: Partial<Record<K, number | string>>): void;
}

export function createValuePanel<K extends string>(specs: readonly ValueSpec<K>[]): ValuePanel<K> {
  const outputs = new Map<K, HTMLElement>();
  const rows = specs.map((s) => {
    const out = h('span', { class: 'value-num' }, '—');
    outputs.set(s.key, out);
    return h(
      'div',
      { class: 'value-row' },
      h(
        'dt',
        null,
        s.quantity
          ? h('span', { class: 'swatch', style: { '--swatch': quantityCssVar(s.quantity) } })
          : null,
        s.label,
        s.symbol ? [' ', symbol(s.symbol)] : null,
      ),
      h('dd', null, out, s.unit ? h('span', { class: 'unit' }, s.unit) : null),
    );
  });
  return {
    element: h('dl', { class: 'value-panel', 'aria-live': 'off' }, rows),
    update(values) {
      for (const s of specs) {
        const v = values[s.key];
        if (v === undefined) continue;
        outputs.get(s.key)!.textContent =
          typeof v === 'string'
            ? v
            : s.digits === undefined
              ? formatSig(v, 3)
              : formatFixed(v, s.digits);
      }
    },
  };
}
