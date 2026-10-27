import { describe, expect, it } from 'vitest';
import { parseHash } from './router';

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

  it('それ以外は notFound', () => {
    expect(parseHash('#/foo').name).toBe('notFound');
    expect(parseHash('#/a/b/c').name).toBe('notFound');
  });
});
