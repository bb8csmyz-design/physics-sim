import type { Disposer } from '@/core/dom';
import { h } from '@/core/dom';
import { icon } from '@/ui/icons';
import { fieldInfo } from '@/units/fields';
import { parseHashQuery, presetFromQuery } from '@/router';
import type { UnitEntry } from '@/units/types';

export async function renderUnit(
  outlet: HTMLElement,
  entry: UnitEntry,
  disposer: Disposer,
  isCurrent: () => boolean,
): Promise<void> {
  const field = fieldInfo(entry.field);
  document.title = `${entry.meta.title}｜物理シミュレーション学習`;
  const body = h('div', { class: 'unit-body' }, h('p', { class: 'loading' }, '読み込み中…'));
  outlet.append(
    h(
      'nav',
      { class: 'breadcrumb', 'aria-label': 'パンくずリスト' },
      h('a', { href: '#/' }, icon('back'), 'トップ'),
      h('span', { 'aria-hidden': 'true' }, '/'),
      h('a', { href: '#/', dataset: { scrollField: entry.field } }, field.name),
    ),
    h(
      'header',
      { class: 'unit-header', dataset: { field: entry.field } },
      h('h1', { tabindex: -1 }, entry.meta.title),
      h('p', { class: 'lead' }, entry.meta.summary),
      h(
        'div',
        { class: 'unit-header-row' },
        h('span', { class: 'badge' }, entry.meta.level),
        h(
          'a',
          { class: 'btn btn-small practice-link', href: `#/practice/${entry.field}/${entry.slug}` },
          icon('quiz'),
          '演習問題に挑戦',
        ),
      ),
    ),
    body,
  );

  try {
    const mod = await entry.load();
    if (!isCurrent()) return; // 読み込み中に別ページへ移動した
    body.replaceChildren();
    // URL のクエリ（p.<key>=値 など）で初期条件を指定できる（演習問題の答え合わせから開くとき）
    const preset = presetFromQuery(parseHashQuery(location.hash));
    mod.mount(body, { meta: entry.meta, disposer, ...(preset ? { preset } : {}) });
  } catch (err) {
    console.error(err);
    if (!isCurrent()) return;
    body.replaceChildren(
      h(
        'div',
        { class: 'error-box', role: 'alert' },
        h('p', null, 'この単元を読み込めませんでした。'),
        h(
          'p',
          { class: 'muted' },
          navigator.onLine
            ? 'ページを再読み込みしてみてください。'
            : 'オフラインのため読み込めません。一度オンラインで開くと、以後はオフラインでも使えます。',
        ),
        h(
          'button',
          { type: 'button', class: 'btn', onclick: () => location.reload() },
          '再読み込み',
        ),
      ),
    );
  }
}

export function renderNotFound(outlet: HTMLElement): void {
  document.title = 'ページが見つかりません｜物理シミュレーション学習';
  outlet.append(
    h(
      'section',
      { class: 'not-found' },
      h('h1', { tabindex: -1 }, 'ページが見つかりません'),
      h('p', null, 'URL が間違っているか、単元が移動した可能性があります。'),
      h('a', { class: 'btn btn-primary', href: '#/' }, 'トップページへ'),
    ),
  );
}
