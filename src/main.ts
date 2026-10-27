import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { registerSW } from 'virtual:pwa-register';
import { Disposer, h } from '@/core/dom';
import {
  getThemePreference,
  initTheme,
  onThemeChange,
  setThemePreference,
  type ThemePreference,
} from '@/core/theme';
import { renderHome } from '@/pages/home';
import { renderNotFound, renderUnit } from '@/pages/unitPage';
import { onRouteChange } from '@/router';
import { icon } from '@/ui/icons';
import { showToast } from '@/ui/toast';
import { findUnit } from '@/units/registry';

initTheme();

// --- ヘッダーのテーマ切り替え ---
const THEME_LABEL: Record<ThemePreference, string> = {
  system: '自動',
  light: 'ライト',
  dark: 'ダーク',
};
const THEME_ICON = { system: 'auto', light: 'sun', dark: 'moon' } as const;
const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};
const themeBtn = document.getElementById('theme-toggle') as HTMLButtonElement;
const syncThemeButton = () => {
  const pref = getThemePreference();
  themeBtn.replaceChildren(
    icon(THEME_ICON[pref]),
    h('span', { class: 'theme-label' }, THEME_LABEL[pref]),
  );
  themeBtn.setAttribute('aria-label', `テーマ: ${THEME_LABEL[pref]}（クリックで切り替え）`);
};
themeBtn.addEventListener('click', () => setThemePreference(NEXT_THEME[getThemePreference()]));
onThemeChange(syncThemeButton);
syncThemeButton();

// --- ルーティング ---
const outlet = document.getElementById('app')!;
let disposer = new Disposer();
let generation = 0;

onRouteChange((route) => {
  disposer.dispose();
  disposer = new Disposer();
  const gen = ++generation;
  outlet.replaceChildren();
  window.scrollTo(0, 0);

  if (route.name === 'home') {
    renderHome(outlet);
    const field = sessionStorage.getItem('scroll-to-field');
    if (field) {
      sessionStorage.removeItem('scroll-to-field');
      document.getElementById(`field-${field}`)?.scrollIntoView({ block: 'start' });
    }
  } else if (route.name === 'unit') {
    const entry = findUnit(route.field, route.slug);
    if (entry) void renderUnit(outlet, entry, disposer, () => gen === generation);
    else renderNotFound(outlet);
  } else {
    renderNotFound(outlet);
  }
  outlet.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
});

// パンくずの分野リンク: トップに戻ったあと該当分野までスクロールする
document.addEventListener('click', (ev) => {
  const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>('a[data-scroll-field]');
  if (a?.dataset.scrollField) sessionStorage.setItem('scroll-to-field', a.dataset.scrollField);
});

// --- PWA（Service Worker） ---
const updateSW = registerSW({
  onNeedRefresh() {
    showToast('新しいバージョンがあります。', { label: '更新', run: () => void updateSW(true) });
  },
  onOfflineReady() {
    showToast('オフラインでも使えるようになりました。');
  },
});
