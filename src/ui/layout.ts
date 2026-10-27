/**
 * 単元ページの標準レイアウト。全単元でこれを使い、セクションの並びと見出しを統一する。
 *
 *  PC（幅 960px 以上）:
 *  ┌──────────────────────────────┬─────────────────┐
 *  │ シミュレーション (stage)         │ パラメータ (params) │
 *  │  └ 再生コントロール (playback)   │ 表示 (options)     │
 *  ├──────────────────────────────┼─────────────────┤
 *  │ グラフ (graphs)                │ 現在の値 (values)   │
 *  ├──────────────────────────────┴─────────────────┤
 *  │ 解説 (theory)                                    │
 *  └────────────────────────────────────────────────┘
 *  スマホでは 1 列: stage(+playback) → params → options → graphs → values → theory
 *  時間グラフが意味を持たない単元（光学など）は graphs を省略でき、PC では values が stage の横に入る。
 *  演習ページに埋め込んだとき（root が [data-sim-embedded] の中にあるとき）は解説を省く。
 */
import { h } from '@/core/dom';

export interface SimulationLayoutParts {
  /** シミュレーションの描画（Canvas など） */
  stage: HTMLElement;
  /** 再生コントロール（createPlaybackControls） */
  playback: HTMLElement;
  /** 時刻表示など、再生コントロールの横に出すもの */
  status?: HTMLElement;
  /** パラメータスライダー（createParamPanel） */
  params: HTMLElement;
  /** 表示切り替えのトグル類 */
  options?: HTMLElement;
  /** 現在値パネル（createValuePanel） */
  values?: HTMLElement;
  /** 時間グラフ（createGraphTabs） */
  graphs?: HTMLElement;
  /** 解説（ui/theory.ts の section() を並べたもの） */
  theory?: HTMLElement;
}

function panel(title: string, area: string, ...content: (HTMLElement | null | undefined)[]) {
  return h(
    'section',
    { class: 'panel', style: { gridArea: area }, 'aria-label': title },
    h('h2', { class: 'panel-title' }, title),
    content.filter(Boolean) as HTMLElement[],
  );
}

export function mountSimulationLayout(root: HTMLElement, parts: SimulationLayoutParts): void {
  root.append(
    h(
      'div',
      { class: parts.graphs ? 'sim-layout' : 'sim-layout no-graphs' },
      h(
        'section',
        {
          class: 'panel panel-stage',
          style: { gridArea: 'stage' },
          'aria-label': 'シミュレーション',
        },
        parts.stage,
        h('div', { class: 'stage-bar' }, parts.playback, parts.status ?? null),
      ),
      panel('パラメータ', 'params', parts.params),
      parts.values ? panel('現在の値', 'values', parts.values) : null,
      parts.graphs ? panel('グラフ', 'graphs', parts.graphs) : null,
      parts.options ? panel('表示', 'options', parts.options) : null,
    ),
    parts.theory && !root.closest('[data-sim-embedded]') ? parts.theory : '',
  );
}
