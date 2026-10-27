/**
 * ハッシュによるルーティング（GitHub Pages ではサーバー側の書き換えができないため）。
 *   #/                     トップページ
 *   #/<分野>/<単元>         単元ページ
 *   #/<分野>/<単元>?<クエリ> 単元ページ（クエリは単元の状態の共有用。例: サンドボックスの配置）
 */

export type Route =
  | { name: 'home' }
  | { name: 'unit'; field: string; slug: string }
  | { name: 'notFound'; path: string };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const q = raw.indexOf('?');
  const path = decodeURIComponent(q >= 0 ? raw.slice(0, q) : raw).replace(/\/+$/, '');
  if (path === '' || path === '/') return { name: 'home' };
  const m = /^\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(path);
  if (m) return { name: 'unit', field: m[1]!, slug: m[2]! };
  return { name: 'notFound', path };
}

/** ハッシュの ? 以降のクエリ（'#/mechanics/sandbox?s=abc' → s=abc） */
export function parseHashQuery(hash: string): URLSearchParams {
  const q = hash.indexOf('?');
  return new URLSearchParams(q >= 0 ? hash.slice(q + 1) : '');
}

export function onRouteChange(fn: (route: Route) => void): void {
  window.addEventListener('hashchange', () => fn(parseHash(location.hash)));
  fn(parseHash(location.hash));
}
