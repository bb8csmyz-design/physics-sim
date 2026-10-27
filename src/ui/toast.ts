/** 画面下部に出る短い通知。action を渡すとボタン付きになる */
import { h } from '@/core/dom';

export function showToast(
  message: string,
  action?: { label: string; run: () => void },
  durationMs = action ? 0 : 5000,
): void {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const close = () => el.remove();
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', null, message),
    action
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary btn-small',
            onclick: () => {
              close();
              action.run();
            },
          },
          action.label,
        )
      : null,
    h(
      'button',
      { type: 'button', class: 'btn btn-ghost btn-small', onclick: close, 'aria-label': '閉じる' },
      '×',
    ),
  );
  region.append(el);
  if (durationMs > 0) setTimeout(close, durationMs);
}
