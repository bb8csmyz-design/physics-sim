/**
 * 単元の自動登録。
 *
 * src/units/<分野>/<単元>/meta.ts と index.ts を置くだけで一覧とルーティングに載る（手で登録しない）。
 * - meta.ts はトップページ表示に必要なので即時読み込み
 * - index.ts（シミュレーション本体）は単元を開いたときに遅延読み込み（コード分割）
 */
import { FIELDS } from './fields';
import type { FieldId, UnitEntry, UnitMeta, UnitModule } from './types';

const metaModules = import.meta.glob<{ meta: UnitMeta }>('./*/*/meta.ts', { eager: true });
const unitLoaders = import.meta.glob<{ default: UnitModule }>('./*/*/index.ts');

const FIELD_IDS = new Set<string>(FIELDS.map((f) => f.id));

function buildEntries(): UnitEntry[] {
  const entries: UnitEntry[] = [];
  for (const [path, mod] of Object.entries(metaModules)) {
    const m = /^\.\/([^/]+)\/([^/]+)\/meta\.ts$/.exec(path);
    if (!m) continue;
    const [, field, slug] = m as unknown as [string, string, string];
    if (!FIELD_IDS.has(field)) {
      console.error(`未知の分野フォルダ: ${path}`);
      continue;
    }
    const loader = unitLoaders[`./${field}/${slug}/index.ts`];
    if (!loader) {
      console.error(`index.ts がない単元: ${path}`);
      continue;
    }
    entries.push({
      field: field as FieldId,
      slug,
      meta: mod.meta,
      href: `#/${field}/${slug}`,
      load: async () => (await loader()).default,
    });
  }
  return entries.sort((a, b) => a.meta.order - b.meta.order || a.slug.localeCompare(b.slug));
}

export const UNITS: readonly UnitEntry[] = buildEntries();

export function unitsOf(field: FieldId): UnitEntry[] {
  return UNITS.filter((u) => u.field === field);
}

export function findUnit(field: string, slug: string): UnitEntry | undefined {
  return UNITS.find((u) => u.field === field && u.slug === slug);
}
