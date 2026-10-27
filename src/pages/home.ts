import { h } from '@/core/dom';
import { FIELDS } from '@/units/fields';
import { unitsOf } from '@/units/registry';
import type { UnitEntry } from '@/units/types';

export function renderHome(outlet: HTMLElement): void {
  document.title = '物理シミュレーション学習';
  const nav = h(
    'nav',
    { class: 'field-nav', 'aria-label': '分野' },
    FIELDS.map((f) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          dataset: { field: f.id },
          onclick: () =>
            document
              .getElementById(`field-${f.id}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        },
        f.name,
        h('span', { class: 'chip-count' }, String(unitsOf(f.id).length)),
      ),
    ),
  );

  outlet.append(
    h(
      'section',
      { class: 'hero' },
      h('h1', { tabindex: -1 }, '動かして確かめる高校物理'),
      h(
        'p',
        { class: 'lead' },
        '高校物理〜大学入試レベルの現象を、パラメータを変えながらシミュレーションで観察できます。グラフ・数式・解説とあわせて、公式の「なぜ」をつかみましょう。',
      ),
      nav,
    ),
    ...FIELDS.map((f) => {
      const units = unitsOf(f.id);
      return h(
        'section',
        {
          class: 'field',
          id: `field-${f.id}`,
          dataset: { field: f.id },
          'aria-labelledby': `field-${f.id}-title`,
        },
        h(
          'header',
          { class: 'field-header' },
          h('h2', { id: `field-${f.id}-title` }, f.name),
          h('p', null, f.description),
        ),
        units.length ? h('ul', { class: 'unit-grid' }, units.map(unitCard)) : null,
        f.planned.length
          ? h(
              'div',
              { class: 'planned' },
              h('span', { class: 'planned-label' }, '準備中'),
              h(
                'ul',
                { class: 'planned-list' },
                f.planned.map((title) => h('li', null, title)),
              ),
            )
          : null,
      );
    }),
  );
}

function unitCard(u: UnitEntry): HTMLElement {
  return h(
    'li',
    null,
    h(
      'a',
      { class: 'unit-card', href: u.href },
      h('span', { class: 'unit-title' }, u.meta.title),
      h('span', { class: 'unit-summary' }, u.meta.summary),
      h('span', { class: 'badge' }, u.meta.level),
    ),
  );
}
