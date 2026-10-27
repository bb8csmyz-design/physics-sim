import { describe, expect, it } from 'vitest';
import { splitDisplayMath } from './richText';

describe('splitDisplayMath', () => {
  it('段落の中の $$...$$ を別行の数式として取り出す', () => {
    expect(splitDisplayMath('よって $V$ は $$I = \\frac{V}{R}$$ となる')).toEqual([
      { kind: 'text', value: 'よって $V$ は ' },
      { kind: 'display', value: 'I = \\frac{V}{R}' },
      { kind: 'text', value: ' となる' },
    ]);
  });

  it('数式だけの段落・数式のない段落', () => {
    expect(splitDisplayMath('$$x = 1$$')).toEqual([{ kind: 'display', value: 'x = 1' }]);
    expect(splitDisplayMath('力 $F$')).toEqual([{ kind: 'text', value: '力 $F$' }]);
  });
});
