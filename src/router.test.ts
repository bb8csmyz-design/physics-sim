import { describe, expect, it } from 'vitest';
import { parseHash, parseHashQuery } from './router';

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

  it('それ以外は notFound', () => {
    expect(parseHash('#/foo').name).toBe('notFound');
    expect(parseHash('#/a/b/c').name).toBe('notFound');
  });
});
