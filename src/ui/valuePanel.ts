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
  /** 数値は書式を整えて表示する。文字列（「実像・倒立」「1 周する」などの判定）はそのまま表示する */
  update(values: Partial<Record<K, number | string>>): void;
}

export function createValuePanel<K extends string>(specs: readonly ValueSpec<K>[]): ValuePanel<K> {
  const outputs = new Map<K, HTMLElement>();
  const units = new Map<K, HTMLElement>();
  const rows = specs.map((s) => {
    const out = h('span', { class: 'value-num' }, '—');
    outputs.set(s.key, out);
    const unit = s.unit ? h('span', { class: 'unit' }, s.unit) : null;
    if (unit) units.set(s.key, unit);
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
      h('dd', null, out, unit),
    );
  });
  return {
    element: h('dl', { class: 'value-panel', 'aria-live': 'off' }, rows),
    update(values) {
      for (const s of specs) {
        const v = values[s.key];
        if (v === undefined) continue;
        // 文字列（「全反射」など）には単位を付けない
        const unit = units.get(s.key);
        if (unit) unit.hidden = typeof v === 'string';
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

export interface TableColumn<C extends string = string> {
  key: C;
  /** 列見出し（例: '吸収した熱量'）。記号だけで分かるなら空文字でもよい */
  label: string;
  symbol?: string;
  unit?: string;
  /** 小数点以下の桁数。省略時は有効数字 3 桁 */
  digits?: number;
  quantity?: Quantity;
}

export interface TableRow<R extends string = string> {
  key: R;
  /** 行見出し（例: 'A→B 定積変化'） */
  label: string;
  /** 合計行として太字で表示する */
  total?: boolean;
}

export interface ValueTable<R extends string, C extends string> {
  readonly element: HTMLElement;
  update(values: Partial<Record<R, Partial<Record<C, number>>>>): void;
  /** 行を強調表示する（現在進行中の過程など）。null で解除 */
  setActive(row: R | null): void;
}

/**
 * 値の表。行 = 過程や状態（A→B, B→C, …）、列 = 物理量（Q, W, ΔU など）。
 * 過程ごとの値を比べたいときに使う（1 列だけなら createValuePanel を使う）。
 */
export function createValueTable<R extends string, C extends string>(
  columns: readonly TableColumn<C>[],
  rows: readonly TableRow<R>[],
  caption?: string,
): ValueTable<R, C> {
  const cells = new Map<R, Map<C, HTMLElement>>();
  const rowEls = new Map<R, HTMLElement>();
  const head = h(
    'tr',
    null,
    h('th', { scope: 'col' }, ''),
    columns.map((c) =>
      h(
        'th',
        { scope: 'col' },
        c.quantity
          ? h('span', { class: 'swatch', style: { '--swatch': quantityCssVar(c.quantity) } })
          : null,
        c.label,
        c.symbol ? [c.label ? ' ' : '', symbol(c.symbol)] : null,
        c.unit ? h('span', { class: 'unit' }, ` [${c.unit}]`) : null,
      ),
    ),
  );
  const body = rows.map((r) => {
    const m = new Map<C, HTMLElement>();
    cells.set(r.key, m);
    const tr = h(
      'tr',
      { class: { 'is-total': !!r.total } },
      h('th', { scope: 'row' }, r.label),
      columns.map((c) => {
        const td = h('td', null, '—');
        m.set(c.key, td);
        return td;
      }),
    );
    rowEls.set(r.key, tr);
    return tr;
  });
  return {
    element: h(
      'div',
      { class: 'value-table-wrap' },
      h(
        'table',
        { class: 'value-table' },
        caption ? h('caption', { class: 'visually-hidden' }, caption) : null,
        h('thead', null, head),
        h('tbody', null, body),
      ),
    ),
    update(values) {
      for (const r of rows) {
        const rv = values[r.key];
        if (!rv) continue;
        for (const c of columns) {
          const v = rv[c.key];
          if (v === undefined) continue;
          cells.get(r.key)!.get(c.key)!.textContent =
            c.digits === undefined ? formatSig(v, 3) : formatFixed(v, c.digits);
        }
      }
    },
    setActive(row) {
      for (const [k, tr] of rowEls) tr.classList.toggle('is-active', k === row);
    },
  };
}
