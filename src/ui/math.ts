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

/** '$...$' を区切りとしてテキストと数式を交互に並べる。'\\$' でドル記号そのもの */
export function parseRichText(text: string): { kind: 'text' | 'math'; value: string }[] {
  const parts: { kind: 'text' | 'math'; value: string }[] = [];
  let buf = '';
  let inMath = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\' && text[i + 1] === '$') {
      buf += '$';
      i++;
    } else if (c === '$') {
      if (buf) parts.push({ kind: inMath ? 'math' : 'text', value: buf });
      buf = '';
      inMath = !inMath;
    } else {
      buf += c;
    }
  }
  if (buf) parts.push({ kind: inMath ? 'math' : 'text', value: buf });
  return parts;
}

export function richText(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const part of parseRichText(text)) {
    frag.append(part.kind === 'math' ? tex(part.value) : document.createTextNode(part.value));
  }
  return frag;
}
