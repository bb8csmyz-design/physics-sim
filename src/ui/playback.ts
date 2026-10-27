/**
 * 再生 / 一時停止 / リセット / コマ送り / 再生速度 のコントロール。
 * キーボード: Space = 再生/一時停止, R = リセット, → = コマ送り（入力欄にフォーカスがないとき）
 */
import type { Disposer } from '@/core/dom';
import { h } from '@/core/dom';
import { formatFixed } from '@/core/format';
import type { SimulationRunner } from '@/core/sim/runner';
import { icon } from './icons';

export interface PlaybackOptions {
  /** 選べる再生速度（既定: 0.25, 0.5, 1, 2） */
  speeds?: readonly number[];
  /** コマ送り 1 回で進めるシミュレーション時間 [s]（既定: dt × 10） */
  stepDuration?: number;
}

export function createPlaybackControls<S>(
  runner: SimulationRunner<S>,
  disposer: Disposer,
  opts: PlaybackOptions = {},
): HTMLElement {
  const speeds = opts.speeds ?? [0.25, 0.5, 1, 2];
  const stepDuration = opts.stepDuration ?? runner.dt * 10;

  const playIcon = h('span', { class: 'btn-icon' });
  const playLabel = h('span', null);
  const playBtn = h(
    'button',
    { type: 'button', class: 'btn btn-primary playback-play', onclick: () => runner.toggle() },
    playIcon,
    playLabel,
  );
  const resetBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => runner.reset(),
      title: 'リセット (R)',
      'aria-label': 'リセット',
    },
    icon('reset'),
    h('span', { class: 'btn-label-wide' }, 'リセット'),
  );
  const stepBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-icon-only',
      onclick: () => runner.advance(stepDuration),
      title: 'コマ送り (→)',
      'aria-label': 'コマ送り',
    },
    icon('step'),
  );

  const speedSelect = h(
    'select',
    {
      class: 'select',
      'aria-label': '再生速度',
      onchange: () => runner.setSpeed(Number(speedSelect.value)),
    },
    speeds.map((s) => h('option', { value: s }, `×${s}`)),
  );
  speedSelect.value = String(runner.speed);

  const sync = () => {
    playIcon.replaceChildren(icon(runner.playing ? 'pause' : 'play'));
    playLabel.textContent = runner.playing ? '一時停止' : '再生';
    playBtn.title = `${playLabel.textContent} (Space)`;
    playBtn.setAttribute('aria-pressed', String(runner.playing));
  };
  sync();
  disposer.add(runner.on(sync));

  disposer.listen(document, 'keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    if (t && t.closest('input, textarea, select, button, [contenteditable="true"]')) return;
    if (ev.key === ' ') {
      ev.preventDefault();
      runner.toggle();
    } else if (ev.key === 'r' || ev.key === 'R') {
      runner.reset();
    } else if (ev.key === 'ArrowRight') {
      runner.advance(stepDuration);
    }
  });

  return h(
    'div',
    { class: 'playback', role: 'group', 'aria-label': '再生コントロール' },
    playBtn,
    resetBtn,
    stepBtn,
    h(
      'label',
      { class: 'playback-speed' },
      h('span', { class: 'btn-label-wide' }, '速度'),
      speedSelect,
    ),
  );
}

export interface TimeReadoutOptions {
  /** 小数点以下の桁数（既定 2） */
  digits?: number;
  /** 表示単位。'ms' なら t × 1000 をミリ秒で表示する（速い現象をスロー再生する単元用） */
  unit?: 's' | 'ms';
  /** 時刻の後ろに小さく添える注記（例: 'スロー再生 1/500'） */
  note?: string;
}

/** 「t = 1.23 s」の時刻表示。render のたびに update(t) を呼ぶ。t は常に秒で渡す */
export function createTimeReadout(opts: number | TimeReadoutOptions = 2): {
  element: HTMLElement;
  update(t: number): void;
} {
  const o = typeof opts === 'number' ? { digits: opts } : opts;
  const digits = o.digits ?? 2;
  const unit = o.unit ?? 's';
  const value = h('span', { class: 'num' });
  const element = h(
    'div',
    { class: 'time-readout' },
    h('var', null, 't'),
    ' = ',
    value,
    ` ${unit}`,
    o.note ? h('span', { class: 'unit time-note' }, o.note) : null,
  );
  return {
    element,
    update(t) {
      value.textContent = formatFixed(unit === 'ms' ? t * 1000 : t, digits);
    },
  };
}
