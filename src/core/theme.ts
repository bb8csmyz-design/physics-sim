/**
 * テーマ（ライト/ダーク）管理。
 *
 * - 設定値: 'system' | 'light' | 'dark'（localStorage に保存）
 * - 実際の配色は <html data-theme="light|dark"> で切り替え、色は CSS 変数で定義する
 * - Canvas 描画は getPalette() で CSS 変数の値を読む。テーマが変わったら onThemeChange で再描画する
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'physics-sim:theme';
const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: dark)');
let cachedPalette: Palette | null = null;

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage が使えない環境（プライベートモード等）は system 扱い
  }
  return 'system';
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // 保存できなくても表示は切り替える
  }
  applyTheme();
}

export function resolvedTheme(): ResolvedTheme {
  const pref = getThemePreference();
  if (pref === 'system') return media.matches ? 'dark' : 'light';
  return pref;
}

function applyTheme(): void {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  cachedPalette = null;
  for (const fn of listeners) fn();
}

export function initTheme(): void {
  applyTheme();
  media.addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme();
  });
}

/** テーマ変更時に呼ばれる関数を登録する。戻り値で解除 */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Canvas 用パレット
// ---------------------------------------------------------------------------

/**
 * 物理量ごとの色。全単元で統一する（CLAUDE.md「UI の統一ルール」）。
 * 新しい物理量の色が必要になったら、ここと styles/tokens.css の両方に追加する。
 */
export const QUANTITY_COLORS = [
  'position',
  'velocity',
  'acceleration',
  'force',
  'kinetic',
  'potential',
  'energy',
  'time',
  'electric',
  'magnetic',
  'current',
  'heat',
] as const;
export type Quantity = (typeof QUANTITY_COLORS)[number];

export interface Palette {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  grid: string;
  axis: string;
  accent: string;
  /** 物体（ブロック・小球など）の塗り */
  body: string;
  bodyStroke: string;
  /** 壁・床などの固定物 */
  fixture: string;
  /** 光を映すスクリーン（暗い幕） */
  screen: string;
  quantity: Record<Quantity, string>;
}

function cssVar(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim();
}

export function getPalette(): Palette {
  if (cachedPalette) return cachedPalette;
  const s = getComputedStyle(document.documentElement);
  const quantity = {} as Record<Quantity, string>;
  for (const q of QUANTITY_COLORS) quantity[q] = cssVar(s, `--q-${q}`);
  cachedPalette = {
    bg: cssVar(s, '--sim-bg'),
    surface: cssVar(s, '--surface'),
    fg: cssVar(s, '--fg'),
    muted: cssVar(s, '--fg-muted'),
    grid: cssVar(s, '--sim-grid'),
    axis: cssVar(s, '--sim-axis'),
    accent: cssVar(s, '--accent'),
    body: cssVar(s, '--sim-body'),
    bodyStroke: cssVar(s, '--sim-body-stroke'),
    fixture: cssVar(s, '--sim-fixture'),
    screen: cssVar(s, '--sim-screen'),
    quantity,
  };
  return cachedPalette;
}

/** CSS で物理量の色を参照するための変数名（例: var(--q-velocity)） */
export function quantityCssVar(q: Quantity): string {
  return `var(--q-${q})`;
}
