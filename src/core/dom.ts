/**
 * 小さな DOM ヘルパー。UI フレームワークは使わず、素の DOM を型付きで組み立てる。
 *
 *   h('button', { class: 'btn', onclick: () => ... }, '再生')
 */

type Child = Node | string | number | null | undefined | false;
type Children = Child | readonly Children[];

type EventHandlers = {
  [K in keyof HTMLElementEventMap as `on${K}`]?: (ev: HTMLElementEventMap[K]) => void;
};

export type Props = EventHandlers & {
  class?: string | Record<string, boolean>;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
  dataset?: Record<string, string>;
  [attr: string]: unknown;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Children[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

export function append(parent: Node, children: Children): void {
  if (children === null || children === undefined || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children as readonly Children[]) append(parent, c);
  } else if (children instanceof Node) {
    parent.appendChild(children);
  } else {
    parent.appendChild(document.createTextNode(String(children)));
  }
}

function applyProps(el: HTMLElement, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      el.className =
        typeof value === 'string'
          ? value
          : Object.entries(value as Record<string, boolean>)
              .filter(([, on]) => on)
              .map(([c]) => c)
              .join(' ');
    } else if (key === 'style') {
      for (const [k, v] of Object.entries(value as Record<string, string>)) {
        if (k.startsWith('--')) el.style.setProperty(k, v);
        else (el.style as unknown as Record<string, string>)[k] = v;
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

/**
 * 物理量の記号を描画する。'v_0' → <var>v</var><sub>0</sub>、'x' → <var>x</var>
 * 添字は立体（ローマン体）。数式全体が必要なら ui/math.ts の tex() を使う。
 */
export function symbol(sym: string): HTMLElement {
  const [base = '', sub] = sym.split('_');
  return h('span', { class: 'sym' }, h('var', null, base), sub ? h('sub', null, sub) : null);
}

/** 後片付け処理をまとめて実行するための入れ物 */
export class Disposer {
  private fns: (() => void)[] = [];
  add(fn: () => void): void {
    this.fns.push(fn);
  }
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (ev: WindowEventMap[K]) => void,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    fn: (ev: DocumentEventMap[K]) => void,
  ): void;
  listen(target: EventTarget, type: string, fn: (ev: Event) => void): void {
    target.addEventListener(type, fn);
    this.add(() => target.removeEventListener(type, fn));
  }
  dispose(): void {
    for (const fn of this.fns.splice(0).reverse()) fn();
  }
}
