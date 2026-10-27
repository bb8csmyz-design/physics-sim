/**
 * 演習モードのページ。
 *  - renderPracticeHome: 成績の一覧（全体の正答率・苦手単元・単元ごとの成績）
 *  - renderPracticeUnit: 単元の演習問題（出題 → 採点 → 解説 → 問題の条件でのシミュレーション）
 *
 * 問題はパターン（q）とシード（seed）で決まり、URL（#/practice/<分野>/<単元>?q=...&seed=...）に残すので
 * 再読み込みしても同じ問題になる。KaTeX を使うので main.ts から遅延読み込みする。
 */
import type { Disposer } from '@/core/dom';
import { h } from '@/core/dom';
import { generateExercise, type ExerciseTemplate } from '@/core/exercise';
import {
  accuracy,
  clearRecords,
  loadRecords,
  recordResult,
  totals,
  unitKey,
  unitStatus,
  weakUnits,
  WEAK_MIN_ATTEMPTS,
  type PracticeRecords,
  type Tally,
  type UnitRecord,
  type UnitStatus,
} from '@/core/practiceRecords';
import { parseHashQuery, presetToQuery } from '@/router';
import { createExerciseView } from '@/ui/exercise';
import { icon } from '@/ui/icons';
import { richText } from '@/ui/math';
import { showToast } from '@/ui/toast';
import { FIELDS, fieldInfo } from '@/units/fields';
import { UNITS, findUnit, unitsOf } from '@/units/registry';
import type { UnitEntry } from '@/units/types';

const STATUS_LABEL: Record<UnitStatus, string> = {
  untried: '未挑戦',
  learning: '練習中',
  weak: '苦手',
  good: '得意',
};

/** 「次の問題」の出し方: 同じ単元 / 苦手単元から / 全単元から */
type NextSet = 'unit' | 'weak' | 'all';

function practiceHref(
  u: { field: string; slug: string },
  q: { q?: string; seed?: number; only?: string | null; set?: NextSet } = {},
): string {
  const sp = new URLSearchParams();
  if (q.q) sp.set('q', q.q);
  if (q.seed !== undefined) sp.set('seed', String(q.seed));
  if (q.only) sp.set('only', q.only);
  if (q.set && q.set !== 'unit') sp.set('set', q.set);
  const s = sp.toString();
  return `#/practice/${u.field}/${u.slug}${s ? `?${s}` : ''}`;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

function randomItem<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function percent(t: Tally | undefined): string {
  const a = accuracy(t);
  return a === null ? '—' : `${Math.round(a * 100)}%`;
}

function entryOfKey(key: string): UnitEntry | undefined {
  return UNITS.find((u) => unitKey(u.field, u.slug) === key);
}

/** 苦手単元（なければ全単元）から 1 つ選ぶ */
function pickUnit(set: 'weak' | 'all', records: PracticeRecords): UnitEntry | undefined {
  if (set === 'weak') {
    const weak = weakUnits(records)
      .map(entryOfKey)
      .filter((u): u is UnitEntry => !!u);
    if (weak.length) return randomItem(weak);
  }
  return randomItem(UNITS);
}

function breadcrumb(...links: [string, string, string?][]): HTMLElement {
  const items: (HTMLElement | string)[] = [];
  links.forEach(([label, href, scrollField], i) => {
    if (i > 0) items.push(h('span', { 'aria-hidden': 'true' }, '/'));
    items.push(
      h(
        'a',
        { href, ...(scrollField ? { dataset: { scrollField } } : {}) },
        i === 0 ? icon('back') : null,
        label,
      ),
    );
  });
  return h('nav', { class: 'breadcrumb', 'aria-label': 'パンくずリスト' }, items);
}

function statusBadge(status: UnitStatus): HTMLElement {
  return h('span', { class: `status-badge status-${status}` }, STATUS_LABEL[status]);
}

function meter(t: Tally | undefined, label: string): HTMLElement {
  const a = accuracy(t) ?? 0;
  return h(
    'span',
    {
      class: 'meter',
      role: 'img',
      'aria-label': label,
    },
    h('span', { class: 'meter-fill', style: { width: `${(a * 100).toFixed(1)}%` } }),
  );
}

function recentMarks(r: UnitRecord | undefined): HTMLElement | null {
  if (!r || r.recent.length === 0) return null;
  return h(
    'span',
    {
      class: 'recent-marks',
      'aria-label': `直近 ${r.recent.length} 問: 正解 ${r.recent.filter(Boolean).length} 問`,
    },
    r.recent.map((ok) => h('span', { class: ok ? 'is-correct' : 'is-wrong' }, ok ? '○' : '×')),
  );
}

// ---------------------------------------------------------------------------
// 成績の一覧

export function renderPracticeHome(outlet: HTMLElement, _disposer: Disposer): void {
  document.title = '演習モード｜物理シミュレーション学習';
  const records = loadRecords();
  const tot = totals(records);
  const weak = weakUnits(records)
    .map(entryOfKey)
    .filter((u): u is UnitEntry => !!u);
  const tried = Object.values(records.units).filter((r) => r.attempts > 0).length;

  const randomUnit = randomItem(UNITS);
  const actions = h(
    'div',
    { class: 'btn-row' },
    weak.length
      ? h(
          'a',
          { class: 'btn btn-primary', href: practiceHref(randomItem(weak)!, { set: 'weak' }) },
          icon('quiz'),
          '苦手単元から出題',
        )
      : null,
    randomUnit
      ? h(
          'a',
          {
            class: weak.length ? 'btn' : 'btn btn-primary',
            href: practiceHref(randomUnit, { set: 'all' }),
          },
          weak.length ? null : icon('quiz'),
          '全単元からランダムに出題',
        )
      : null,
  );

  const stat = (label: string, value: string, sub?: string) =>
    h(
      'div',
      { class: 'stat' },
      h('span', { class: 'stat-label' }, label),
      h('span', { class: 'stat-value' }, value),
      sub ? h('span', { class: 'stat-sub' }, sub) : null,
    );

  const summary = h(
    'section',
    { class: 'panel practice-summary', 'aria-label': '全体の成績' },
    h(
      'div',
      { class: 'stat-row' },
      stat('解いた問題', `${tot.attempts}`, '問'),
      stat('正答率', percent(tot), tot.attempts ? `${tot.correct} / ${tot.attempts}` : undefined),
      stat('挑戦した単元', `${tried}`, `/ ${UNITS.length}`),
      stat('苦手な単元', `${weak.length}`),
    ),
    actions,
  );

  const weakSection = weak.length
    ? h(
        'section',
        { class: 'practice-section', 'aria-labelledby': 'weak-title' },
        h('h2', { id: 'weak-title' }, '苦手な単元'),
        h(
          'p',
          { class: 'muted' },
          `${WEAK_MIN_ATTEMPTS} 問以上解いて、正答率（直近の結果を重く見たもの）が低い単元です。解説とシミュレーションで確かめてから、もう一度挑戦しましょう。`,
        ),
        h(
          'ul',
          { class: 'practice-list' },
          weak.map((u) => unitRow(u, records.units[unitKey(u.field, u.slug)], 'weak')),
        ),
      )
    : null;

  const fields = FIELDS.map((f) => {
    const units = unitsOf(f.id);
    if (!units.length) return null;
    const ft = units.reduce<Tally>(
      (acc, u) => {
        const r = records.units[unitKey(u.field, u.slug)];
        return {
          attempts: acc.attempts + (r?.attempts ?? 0),
          correct: acc.correct + (r?.correct ?? 0),
        };
      },
      { attempts: 0, correct: 0 },
    );
    return h(
      'section',
      { class: 'practice-section', dataset: { field: f.id }, 'aria-labelledby': `pf-${f.id}` },
      h(
        'h2',
        { id: `pf-${f.id}`, class: 'practice-field-title' },
        f.name,
        h(
          'span',
          { class: 'practice-field-stat' },
          ft.attempts ? `正答率 ${percent(ft)}（${ft.correct}/${ft.attempts}）` : '未挑戦',
        ),
      ),
      h(
        'ul',
        { class: 'practice-list' },
        units.map((u) => unitRow(u, records.units[unitKey(u.field, u.slug)])),
      ),
    );
  });

  const clearBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost btn-small',
      onclick: () => {
        if (!confirm('演習の記録をすべて消去します。よろしいですか？')) return;
        clearRecords();
        outlet.replaceChildren();
        renderPracticeHome(outlet, _disposer);
        showToast('演習の記録を消去しました。');
      },
    },
    '記録を消去',
  );

  outlet.append(
    breadcrumb(['トップ', '#/']),
    h(
      'header',
      { class: 'unit-header practice-header' },
      h('h1', { tabindex: -1 }, '演習モード'),
      h(
        'p',
        { class: 'lead' },
        '各単元の大学入試風の問題を、数値を変えて何度でも解けます。採点のあとは解説を読み、問題と同じ条件のシミュレーションを動かして答えを確かめましょう。',
      ),
    ),
    summary,
    weakSection ?? '',
    ...fields.map((f) => f ?? ''),
    h(
      'footer',
      { class: 'practice-footer' },
      h(
        'p',
        { class: 'muted' },
        '記録はこの端末のブラウザ内にだけ保存されます（送信はされません）。',
      ),
      tot.attempts ? clearBtn : null,
    ),
  );
}

function unitRow(u: UnitEntry, r: UnitRecord | undefined, set?: NextSet): HTMLElement {
  const status = unitStatus(r);
  return h(
    'li',
    { dataset: { field: u.field } },
    h(
      'a',
      { class: 'practice-row', href: practiceHref(u, set ? { set } : {}) },
      h(
        'span',
        { class: 'practice-row-head' },
        h('span', { class: 'practice-row-title' }, u.meta.title),
        statusBadge(status),
      ),
      h(
        'span',
        { class: 'practice-row-stats' },
        meter(r, `正答率 ${percent(r)}`),
        h(
          'span',
          { class: 'practice-row-text' },
          r?.attempts ? `${percent(r)}（${r.correct}/${r.attempts}）` : '—',
        ),
        recentMarks(r),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// 単元の演習問題

export async function renderPracticeUnit(
  outlet: HTMLElement,
  field: string,
  slug: string,
  disposer: Disposer,
  isCurrent: () => boolean,
): Promise<void> {
  const entry = findUnit(field, slug);
  if (!entry) {
    outlet.append(
      h(
        'section',
        { class: 'not-found' },
        h('h1', { tabindex: -1 }, '単元が見つかりません'),
        h('a', { class: 'btn btn-primary', href: '#/practice' }, '演習モードへ'),
      ),
    );
    return;
  }
  const finfo = fieldInfo(entry.field);
  document.title = `演習: ${entry.meta.title}｜物理シミュレーション学習`;
  const query = parseHashQuery(location.hash);
  const setParam = query.get('set');
  const set: NextSet = setParam === 'weak' || setParam === 'all' ? setParam : 'unit';

  const body = h('div', { class: 'practice-body' }, h('p', { class: 'loading' }, '読み込み中…'));
  outlet.append(
    breadcrumb(['トップ', '#/'], ['演習モード', '#/practice'], [finfo.name, '#/', entry.field]),
    h(
      'header',
      { class: 'unit-header', dataset: { field: entry.field } },
      h('h1', { tabindex: -1 }, entry.meta.title, h('span', { class: 'practice-h1-tag' }, '演習')),
      h(
        'div',
        { class: 'unit-header-row' },
        h('span', { class: 'badge' }, entry.meta.level),
        set === 'weak'
          ? h('span', { class: 'status-badge status-weak' }, '苦手単元から出題中')
          : set === 'all'
            ? h('span', { class: 'status-badge status-learning' }, '全単元からランダムに出題中')
            : null,
        h('a', { class: 'btn btn-small', href: entry.href }, '単元のシミュレーションへ'),
      ),
    ),
    body,
  );

  let templates: readonly ExerciseTemplate[];
  try {
    templates = await entry.loadExercises();
  } catch (err) {
    console.error(err);
    if (!isCurrent()) return;
    body.replaceChildren(
      h(
        'div',
        { class: 'error-box', role: 'alert' },
        h('p', null, '問題を読み込めませんでした。'),
        h(
          'button',
          { type: 'button', class: 'btn', onclick: () => location.reload() },
          '再読み込み',
        ),
      ),
    );
    return;
  }
  if (!isCurrent()) return;
  if (!templates.length) {
    body.replaceChildren(h('p', { class: 'muted' }, 'この単元の演習問題は準備中です。'));
    return;
  }

  // --- 出題するパターンとシード（URL になければ選んで URL に書き戻す） ---
  const only = templates.find((t) => t.id === query.get('only'))?.id ?? null;
  const template =
    templates.find((t) => t.id === query.get('q')) ??
    templates.find((t) => t.id === only) ??
    randomItem(templates)!;
  const seedParam = Number(query.get('seed'));
  const seed =
    Number.isInteger(seedParam) && seedParam > 0 && seedParam < 2 ** 32 ? seedParam : randomSeed();
  history.replaceState(null, '', practiceHref(entry, { q: template.id, seed, only, set }));

  const exercise = generateExercise(template, seed);
  const key = unitKey(entry.field, entry.slug);

  // --- 次の問題 ---
  const nextHref = (): string => {
    if (set !== 'unit') {
      const u = pickUnit(set, loadRecords()) ?? entry;
      return practiceHref(u, { set });
    }
    const pool = only ? templates.filter((t) => t.id === only) : templates;
    const others = pool.length > 1 ? pool.filter((t) => t.id !== template.id) : pool;
    return practiceHref(entry, { q: randomItem(others)!.id, seed: randomSeed(), only, set });
  };
  const nextBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onclick: () => {
        location.hash = nextHref();
      },
    },
    '次の問題',
  );

  // --- 出題パターンの選択 ---
  const patternSelect = h(
    'select',
    {
      class: 'select',
      id: 'pattern-select',
      onchange: () => {
        const v = patternSelect.value;
        const t = templates.find((x) => x.id === v);
        location.hash = practiceHref(entry, {
          q: (t ?? randomItem(templates)!).id,
          seed: randomSeed(),
          only: t ? t.id : null,
        });
      },
    },
    h('option', { value: '' }, 'おまかせ（ランダム）'),
    templates.map((t) => h('option', { value: t.id }, t.title)),
  );
  patternSelect.value = only ?? '';

  // --- 答え合わせ（採点後に表示） ---
  const check = h('section', {
    class: 'practice-check',
    hidden: true,
    'aria-labelledby': 'check-title',
  });
  const stats = h('div', { class: 'practice-stats' });
  const renderStats = () => stats.replaceChildren(unitStats(templates, loadRecords().units[key]));
  renderStats();

  const view = createExerciseView(exercise, ({ correct }) => {
    if (!recordResult(key, template.id, correct)) {
      showToast('この端末では記録を保存できませんでした（プライベートモードなど）。');
    }
    renderStats();
    // 問題の直後にも「次の問題」と答え合わせへの案内を置く（下までスクロールしなくてよいように）
    view.element.append(
      h(
        'div',
        { class: 'btn-row exercise-next' },
        h(
          'button',
          { type: 'button', class: 'btn btn-primary', onclick: () => (location.hash = nextHref()) },
          '次の問題',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: () => check.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          },
          'シミュレーションで確かめる ↓',
        ),
      ),
    );
    void showCheck();
  });

  async function showCheck() {
    const preset = {
      params: exercise.sim.params,
      ...(exercise.sim.choices ? { choices: exercise.sim.choices } : {}),
      ...(exercise.sim.state !== undefined ? { state: exercise.sim.state } : {}),
    };
    const host = h(
      'div',
      { class: 'practice-sim', dataset: { simEmbedded: '' } },
      h('p', { class: 'loading' }, 'シミュレーションを読み込み中…'),
    );
    check.hidden = false;
    check.replaceChildren(
      h('h2', { id: 'check-title' }, 'シミュレーションで確かめる'),
      h('p', { class: 'practice-hint' }, richText(exercise.sim.hint)),
      host,
      h(
        'div',
        { class: 'btn-row' },
        nextBtn,
        h(
          'a',
          { class: 'btn', href: `${entry!.href}?${presetToQuery(preset)}` },
          'この条件で単元ページを開く',
        ),
      ),
    );
    try {
      const mod = await entry!.load();
      if (!isCurrent()) return;
      host.replaceChildren();
      mod.mount(host, { meta: entry!.meta, disposer, preset });
    } catch (err) {
      console.error(err);
      if (!isCurrent()) return;
      host.replaceChildren(h('p', { class: 'muted' }, 'シミュレーションを読み込めませんでした。'));
    }
  }

  body.replaceChildren(
    h(
      'div',
      { class: 'practice-layout' },
      h(
        'section',
        { class: 'panel practice-problem', 'aria-labelledby': 'problem-title' },
        h(
          'div',
          { class: 'practice-problem-head' },
          h('h2', { id: 'problem-title' }, '問題'),
          h('span', { class: 'badge' }, template.title),
        ),
        view.element,
      ),
      h(
        'aside',
        { class: 'panel practice-side', 'aria-label': '出題の設定と成績' },
        h('label', { class: 'slider-label', for: 'pattern-select' }, '出題パターン'),
        patternSelect,
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: () => {
              location.hash = nextHref();
            },
          },
          '別の問題にする',
        ),
        h('h3', { class: 'panel-subtitle' }, 'この単元の成績'),
        stats,
        h('a', { class: 'btn btn-ghost btn-small', href: '#/practice' }, '成績の一覧へ'),
      ),
    ),
    check,
  );
}

function unitStats(templates: readonly ExerciseTemplate[], r: UnitRecord | undefined): HTMLElement {
  return h(
    'div',
    null,
    h(
      'p',
      { class: 'practice-stats-total' },
      statusBadge(unitStatus(r)),
      r?.attempts ? ` 正答率 ${percent(r)}（${r.correct}/${r.attempts}）` : ' まだ解いていません',
    ),
    recentMarks(r),
    h(
      'ul',
      { class: 'pattern-stats' },
      templates.map((t) => {
        const tr = r?.templates[t.id];
        return h(
          'li',
          null,
          h('span', null, t.title),
          h(
            'span',
            { class: 'pattern-stats-value' },
            tr?.attempts ? `${percent(tr)}（${tr.correct}/${tr.attempts}）` : '—',
          ),
        );
      }),
    ),
  );
}
