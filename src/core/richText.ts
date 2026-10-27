/**
 * 本文中の $...$ 数式の区切り（KaTeX に依存しない部分。表示は ui/math.ts の richText()）。
 * 演習問題の数式が KaTeX で読めるかをテストで検査するのにも使う。
 */

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

/**
 * 段落の中の '$$...$$'（別行の数式）を取り出す。'text' の部分は $...$ を含む文、'display' は数式の中身
 * （「…より $$x = 1$$ となる」→ text・display・text）
 */
export function splitDisplayMath(text: string): { kind: 'text' | 'display'; value: string }[] {
  return text
    .split(/\$\$([\s\S]+?)\$\$/)
    .map((value, i) => ({ kind: i % 2 === 1 ? ('display' as const) : ('text' as const), value }))
    .filter((p) => p.kind === 'display' || p.value.trim() !== '');
}
