/**
 * 単元フォルダの規約（CLAUDE.md「単元の追加手順」）が守られているかを検査する。
 * 新しい単元を追加したときに、必要なファイルの置き忘れをここで検出する。
 */
import { describe, expect, it } from 'vitest';
import type { ExerciseTemplate } from '@/core/exercise';
import { FIELDS } from './fields';
import type { UnitMeta } from './types';

const metas = import.meta.glob<{ meta: UnitMeta }>('./*/*/meta.ts', { eager: true });
const exercises = import.meta.glob<{ EXERCISES: readonly ExerciseTemplate[] }>(
  './*/*/exercises.ts',
  { eager: true },
);
const allFiles = Object.keys(import.meta.glob('./*/*/*.ts'));
const unitDirs = [...new Set(allFiles.map((f) => f.split('/').slice(0, 3).join('/')))];
const fieldIds = FIELDS.map((f) => f.id as string);

describe('単元フォルダの構成', () => {
  it('単元が 1 つ以上ある', () => {
    expect(unitDirs.length).toBeGreaterThan(0);
  });

  for (const dir of unitDirs) {
    const [, field, slug] = dir.split('/') as [string, string, string];

    describe(dir, () => {
      it('分野フォルダ名が FIELDS に登録された id である', () => {
        expect(fieldIds).toContain(field);
      });

      it('単元フォルダ名が kebab-case', () => {
        expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      });

      it('必須ファイル meta.ts / index.ts / model.ts / model.test.ts / exercises.ts / exercises.test.ts がある', () => {
        for (const f of [
          'meta.ts',
          'index.ts',
          'model.ts',
          'model.test.ts',
          'exercises.ts',
          'exercises.test.ts',
        ]) {
          expect(allFiles, `${dir}/${f} がない`).toContain(`${dir}/${f}`);
        }
      });

      it('演習問題が 3 パターン以上ある（exercises.ts の EXERCISES）', () => {
        const ex = exercises[`${dir}/exercises.ts`]?.EXERCISES;
        expect(
          ex,
          'exercises.ts は `export const EXERCISES: readonly ExerciseTemplate[]` を持つこと',
        ).toBeDefined();
        expect(ex!.length).toBeGreaterThanOrEqual(3);
      });

      it('meta が正しく書かれている', () => {
        const meta = metas[`${dir}/meta.ts`]?.meta;
        expect(meta, 'meta.ts は `export const meta: UnitMeta` を持つこと').toBeDefined();
        expect(meta!.title.length).toBeGreaterThan(0);
        expect(meta!.summary.length).toBeGreaterThan(10);
        expect(['物理基礎', '物理', '発展']).toContain(meta!.level);
        expect(Number.isFinite(meta!.order)).toBe(true);
      });
    });
  }

  it('実装済みの単元名が「準備中」リスト（fields.ts の planned）に残っていない', () => {
    const titles = Object.values(metas).map((m) => m.meta.title);
    const planned = FIELDS.flatMap((f) => f.planned);
    for (const t of titles)
      expect(planned, `fields.ts の planned から「${t}」を削除すること`).not.toContain(t);
  });

  it('同じ分野の中で単元名と order が重複しない', () => {
    for (const field of fieldIds) {
      const ms = Object.entries(metas)
        .filter(([p]) => p.startsWith(`./${field}/`))
        .map(([, m]) => m.meta);
      expect(new Set(ms.map((m) => m.title)).size).toBe(ms.length);
      expect(new Set(ms.map((m) => m.order)).size).toBe(ms.length);
    }
  });
});
