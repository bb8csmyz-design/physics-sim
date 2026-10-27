/**
 * 解説セクションの部品。本文中の $...$ は KaTeX でインライン数式になる。
 *
 *   theory(
 *     section('運動方程式', p('ばねの弾性力 $F=-kx$ より'), eq('ma = -kx')),
 *     section('考えてみよう', question('質量を 4 倍にすると周期は？', p('2 倍になる。'))),
 *   )
 */
import { h } from '@/core/dom';
import { richText, tex } from './math';

export function theory(...sections: HTMLElement[]): HTMLElement {
  return h(
    'article',
    { class: 'theory', 'aria-labelledby': 'theory-title' },
    h('h2', { class: 'theory-title', id: 'theory-title' }, '解説'),
    sections,
  );
}

export function section(title: string, ...blocks: Node[]): HTMLElement {
  return h('section', { class: 'theory-section' }, h('h3', null, title), blocks);
}

/** 段落 */
export function p(text: string): HTMLElement {
  return h('p', null, richText(text));
}

/** ディスプレイ数式（別行・中央） */
export function eq(source: string): HTMLElement {
  return tex(source, true);
}

/** 箇条書き */
export function ul(...items: string[]): HTMLElement {
  return h(
    'ul',
    null,
    items.map((t) => h('li', null, richText(t))),
  );
}

/** 強調ボックス（入試で問われやすいポイントなど） */
export function note(title: string, ...blocks: Node[]): HTMLElement {
  return h('aside', { class: 'note' }, h('p', { class: 'note-title' }, title), blocks);
}

/** 折りたたみ式の問い（答えはクリックで表示） */
export function question(q: string, ...answer: Node[]): HTMLElement {
  return h(
    'details',
    { class: 'question' },
    h('summary', null, richText(q)),
    h('div', { class: 'answer' }, answer),
  );
}
