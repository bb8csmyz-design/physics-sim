/**
 * ハッシュによるルーティング（GitHub Pages ではサーバー側の書き換えができないため）。
 *   #/                     トップページ
 *   #/<分野>/<単元>         単元ページ
 */

export type Route =
  | { name: 'home' }
  | { name: 'unit'; field: string; slug: string }
  | { name: 'notFound'; path: string };

export function parseHash(hash: string): Route {
  const path = decodeURIComponent(hash.replace(/^#/, '')).replace(/\/+$/, '');
  if (path === '' || path === '/') return { name: 'home' };
  const m = /^\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(path);
  if (m) return { name: 'unit', field: m[1]!, slug: m[2]! };
  return { name: 'notFound', path };
}

export function onRouteChange(fn: (route: Route) => void): void {
  window.addEventListener('hashchange', () => fn(parseHash(location.hash)));
  fn(parseHash(location.hash));
}
