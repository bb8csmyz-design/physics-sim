/**
 * 数式表示（KaTeX）。
 *
 * - tex('F = -kx')                 … インライン数式の要素
 * - tex('T = 2\\pi\\sqrt{m/k}', true) … ディスプレイ数式（中央寄せ・別行）
 * - richText('ばね定数 $k$ が大きいほど…') … 文中の $...$ をインライン数式にした段落の中身
 *
 * KaTeX は単元ページでのみ読み込まれる（トップページを軽く保つため、このファイルは単元からだけ import する）。
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { h } from '@/core/dom';
import { parseRichText } from '@/core/richText';

export { parseRichText };

export function tex(source: string, display = false): HTMLElement {
  const el = h(display ? 'div' : 'span', { class: display ? 'math-display' : 'math-inline' });
  katex.render(source, el, {
    displayMode: display,
    throwOnError: false,
    output: 'htmlAndMathml',
    strict: 'ignore',
  });
  return el;
}

export function richText(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const part of parseRichText(text)) {
    frag.append(part.kind === 'math' ? tex(part.value) : document.createTextNode(part.value));
  }
  return frag;
}
