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

/**
 * 「t = 1.23 s」の時刻表示。render のたびに update(t) を呼ぶ。
 * - unit: 時刻の単位。光の波のように周期 T を単位にするときは 'T'（update には t/T を渡す）。
 *   'ms' / 'ns' なら update に秒で渡した t をミリ秒・ナノ秒にして表示する（速い回路や電子の運動など）
 * - note: 補足（「1/50 倍のスロー再生」など、実時間と進み方が違うことを示す）。setNote で変えられる
 */
export function createTimeReadout(
  digits = 2,
  opts: { unit?: 's' | 'ms' | 'ns' | 'T'; note?: string } = {},
): { element: HTMLElement; update(t: number): void; setNote(note: string): void } {
  const unit = opts.unit ?? 's';
  const value = h('span', { class: 'num' });
  const note = h('span', { class: 'time-note' }, opts.note ?? '');
  const element = h(
    'div',
    { class: 'time-readout' },
    h('var', null, 't'),
    ' = ',
    value,
    ' ',
    unit === 'T' ? h('var', null, 'T') : unit,
    note,
  );
  return {
    element,
    update(t) {
      value.textContent = formatFixed(t * (unit === 'ms' ? 1e3 : unit === 'ns' ? 1e9 : 1), digits);
    },
    setNote(text) {
      note.textContent = text;
    },
  };
}
