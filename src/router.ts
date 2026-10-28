/**
 * ハッシュによるルーティング（GitHub Pages ではサーバー側の書き換えができないため）。
 *   #/                     トップページ
 *   #/<分野>/<単元>         単元ページ
 *   #/<分野>/<単元>?<クエリ> 単元ページ（クエリは単元の状態の共有用。例: サンドボックスの配置、
 *                           演習問題の条件 p.<key>=値 / c.<key>=択一 / st=単元固有の状態）
 *   #/practice             演習モード（成績の一覧・苦手単元）
 *   #/practice/<分野>/<単元>?q=<パターン>&seed=<シード>  単元の演習問題
 */
import type { UnitPreset } from '@/units/types';

export type Route =
  | { name: 'home' }
  | { name: 'unit'; field: string; slug: string }
  | { name: 'practice' }
  | { name: 'practiceUnit'; field: string; slug: string }
  | { name: 'notFound'; path: string };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const q = raw.indexOf('?');
  const rawPath = q >= 0 ? raw.slice(0, q) : raw;
  let path: string;
  try {
    path = decodeURIComponent(rawPath).replace(/\/+$/, '');
  } catch {
    // '%' のあとが壊れた URL（手入力など）は、例外で画面が真っ白にならないよう「見つかりません」にする
    return { name: 'notFound', path: rawPath };
  }
  if (path === '' || path === '/') return { name: 'home' };
  if (path === '/practice') return { name: 'practice' };
  const pm = /^\/practice\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(path);
  if (pm) return { name: 'practiceUnit', field: pm[1]!, slug: pm[2]! };
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

/** 単元を開くときの初期条件をクエリにする（{ params: { m: 1 } } → 'p.m=1'） */
export function presetToQuery(preset: UnitPreset): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(preset.params ?? {})) q.set(`p.${k}`, String(v));
  for (const [k, v] of Object.entries(preset.choices ?? {})) q.set(`c.${k}`, v);
  if (preset.state !== undefined) q.set('st', preset.state);
  return q.toString();
}

/** クエリから初期条件を読む。指定がなければ undefined */
export function presetFromQuery(q: URLSearchParams): UnitPreset | undefined {
  const params: Record<string, number> = {};
  const choices: Record<string, string> = {};
  let state: string | undefined;
  let found = false;
  for (const [k, v] of q) {
    if (k.startsWith('p.') && v.trim() !== '' && Number.isFinite(Number(v))) {
      params[k.slice(2)] = Number(v);
      found = true;
    } else if (k.startsWith('c.')) {
      choices[k.slice(2)] = v;
      found = true;
    } else if (k === 'st') {
      state = v;
      found = true;
    }
  }
  if (!found) return undefined;
  return { params, choices, ...(state !== undefined ? { state } : {}) };
}
