import { describe, expect, it } from 'vitest';
import { parseHash, parseHashQuery, presetFromQuery, presetToQuery } from './router';

describe('parseHash', () => {
  it('トップページ', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
  });

  it('単元ページ（末尾スラッシュ可）', () => {
    const r = { name: 'unit', field: 'mechanics', slug: 'spring-oscillation' };
    expect(parseHash('#/mechanics/spring-oscillation')).toEqual(r);
    expect(parseHash('#/mechanics/spring-oscillation/')).toEqual(r);
  });

  it('? 以降のクエリは単元の状態として無視する（単元側で parseHashQuery で読む）', () => {
    const r = { name: 'unit', field: 'mechanics', slug: 'sandbox' };
    expect(parseHash('#/mechanics/sandbox?s=eyJhIjoxfQ')).toEqual(r);
    expect(parseHash('#/mechanics/sandbox/?s=a-b_c')).toEqual(r);
    expect(parseHashQuery('#/mechanics/sandbox?s=a-b_c').get('s')).toBe('a-b_c');
    expect(parseHashQuery('#/mechanics/sandbox').get('s')).toBeNull();
  });

  it('演習モード', () => {
    expect(parseHash('#/practice')).toEqual({ name: 'practice' });
    expect(parseHash('#/practice/waves/lens?q=image&seed=3')).toEqual({
      name: 'practiceUnit',
      field: 'waves',
      slug: 'lens',
    });
  });

  it('それ以外は notFound', () => {
    expect(parseHash('#/foo').name).toBe('notFound');
    expect(parseHash('#/a/b/c').name).toBe('notFound');
  });
});

describe('単元の初期条件のクエリ', () => {
  it('往復できる', () => {
    const preset = { params: { m: 1.5, x0: -0.2 }, choices: { kind: 'string' }, state: 'abc' };
    const q = presetToQuery(preset);
    expect(presetFromQuery(new URLSearchParams(q))).toEqual(preset);
  });

  it('指定がなければ undefined、数値でない値は無視', () => {
    expect(presetFromQuery(new URLSearchParams('s=abc'))).toBeUndefined();
    expect(presetFromQuery(new URLSearchParams('p.m=abc&p.k=2'))).toEqual({
      params: { k: 2 },
      choices: {},
    });
  });
});
