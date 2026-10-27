import { describe, expect, it, vi } from 'vitest';

// math.ts は KaTeX の CSS を import するので、パーサだけをテストするためにモックする
vi.mock('katex/dist/katex.min.css', () => ({}));
const { parseRichText } = await import('./math');

describe('parseRichText', () => {
  it('テキストと $...$ の数式を分ける', () => {
    expect(parseRichText('力 $F=-kx$ がはたらく')).toEqual([
      { kind: 'text', value: '力 ' },
      { kind: 'math', value: 'F=-kx' },
      { kind: 'text', value: ' がはたらく' },
    ]);
  });

  it('\\$ はドル記号として扱う', () => {
    expect(parseRichText('価格 \\$5')).toEqual([{ kind: 'text', value: '価格 $5' }]);
  });
});
