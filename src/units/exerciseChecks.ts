/**
 * 演習問題（exercises.ts）の共通の検査。各単元の exercises.test.ts の先頭で呼ぶ:
 *
 *   checkExercises(EXERCISES, PARAMS);
 *
 * 多数のシードで問題を作り、次を確かめる（物理として正しいかは各単元のテストで別に確かめる）:
 *  - パターンが 3 つ以上あり、id が重複しない
 *  - 正解が有限の値で、表示した正解（有効数字で丸めた値）を入力すると正解と採点される
 *  - 選択肢が重複せず、正解の番号が範囲内
 *  - 答え合わせのシミュレーションの条件が、単元のスライダーの範囲と刻みに乗っている
 *    （スライダーで丸められて、問題と違う条件で動くことがない）
 *  - 択一の切り替え（sim.choices）が、単元の受け付けるキーと値だけを、すべてのキーについて指定している
 *    （第 3 引数に単元の model.ts の PRESET_CHOICES を渡す。書き間違えると既定値のまま開いてしまうため）
 *  - 問題文・解説・選択肢の数式が KaTeX で読める
 *  - シードを変えると数値が変わる
 */
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import {
  formatAnswerValue,
  generateExercise,
  grade,
  type Exercise,
  type ExerciseTemplate,
} from '@/core/exercise';
import type { ParamSpec } from '@/core/params';
import { parseRichText, splitDisplayMath } from '@/core/richText';

/** 1 パターンあたりに試すシードの数 */
export const CHECK_SEEDS = 60;

/** シード 1..n で作った問題（各単元のテストで物理の検査に使う） */
export function sampleExercises(template: ExerciseTemplate, n = CHECK_SEEDS): Exercise[] {
  return Array.from({ length: n }, (_, i) => generateExercise(template, i + 1));
}

/** 数値問題の正解の値（選択問題なら例外） */
export function numericAnswer(ex: Exercise): number {
  if (ex.answer.kind !== 'numeric') throw new Error('数値で答える問題ではない');
  return ex.answer.value;
}

function texErrors(text: string): string[] {
  const errors: string[] = [];
  const sources: string[] = [];
  // 段落の中の $$...$$ は別行の数式（ui/exercise.ts の richParagraphs と同じ分け方）
  for (const part of splitDisplayMath(text)) {
    if (part.kind === 'display') {
      sources.push(part.value);
      continue;
    }
    // 閉じていない $ があると、残りが全部数式になってしまう
    const dollars = (part.value.replace(/\\\$/g, '').match(/\$/g) ?? []).length;
    if (dollars % 2 !== 0) errors.push(`$ が閉じていない: ${part.value}`);
    for (const p of parseRichText(part.value)) if (p.kind === 'math') sources.push(p.value);
  }
  for (const src of sources) {
    try {
      katex.renderToString(src, { throwOnError: true, strict: 'ignore' });
    } catch (e) {
      errors.push(`${(e as Error).message} … ${src}`);
    }
  }
  return errors;
}

export function checkExercises(
  templates: readonly ExerciseTemplate[],
  specs: readonly ParamSpec[] | ((ex: Exercise) => readonly ParamSpec[]),
  presetChoices: Readonly<Record<string, readonly string[]>> = {},
): void {
  describe('演習問題の共通の検査', () => {
    it('パターンが 3 つ以上あり、id と名前が重複しない', () => {
      expect(templates.length).toBeGreaterThanOrEqual(3);
      const ids = templates.map((t) => t.id);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(templates.map((t) => t.title)).size).toBe(templates.length);
    });

    for (const t of templates) {
      describe(`${t.title}（${t.id}）`, () => {
        const exercises = sampleExercises(t);

        it('正解が正しく作られ、表示した正解を入力すると正解になる', () => {
          for (const ex of exercises) {
            const a = ex.answer;
            if (a.kind === 'numeric') {
              expect(Number.isFinite(a.value), ex.statement).toBe(true);
              expect(grade(a, formatAnswerValue(a)).status, ex.statement).toBe('correct');
            } else {
              expect(a.options.length).toBeGreaterThanOrEqual(2);
              expect(new Set(a.options).size, a.options.join(' / ')).toBe(a.options.length);
              expect(a.correct).toBeGreaterThanOrEqual(0);
              expect(a.correct).toBeLessThan(a.options.length);
              expect(grade(a, a.correct).status).toBe('correct');
            }
            expect(ex.statement.length).toBeGreaterThan(10);
            expect(ex.solution.length).toBeGreaterThan(0);
            expect(ex.sim.hint.length).toBeGreaterThan(0);
          }
        });

        it('シミュレーションの条件がスライダーの範囲と刻みに乗っている', () => {
          for (const ex of exercises) {
            const sp = typeof specs === 'function' ? specs(ex) : specs;
            expect(Object.keys(ex.sim.params).sort(), ex.statement).toEqual(
              sp.map((s) => s.key).sort(),
            );
            for (const s of sp) {
              const v = ex.sim.params[s.key]!;
              expect(v, `${s.key}: ${ex.statement}`).toBeGreaterThanOrEqual(s.min - 1e-9);
              expect(v, `${s.key}: ${ex.statement}`).toBeLessThanOrEqual(s.max + 1e-9);
              const k = (v - s.min) / s.step;
              expect(
                Math.abs(k - Math.round(k)),
                `${s.key} = ${v} が刻み ${s.step} に乗らない`,
              ).toBeLessThan(1e-6);
            }
          }
        });

        it('択一の切り替えの指定が単元の選択肢に含まれ、すべてのキーを指定している', () => {
          const keys = Object.keys(presetChoices).sort();
          for (const ex of exercises) {
            const choices = ex.sim.choices ?? {};
            expect(Object.keys(choices).sort(), ex.statement).toEqual(keys);
            for (const [k, v] of Object.entries(choices)) {
              expect(presetChoices[k], `choices.${k} = ${v}`).toContain(v);
            }
          }
        });

        it('問題文・解説・選択肢の数式が KaTeX で読める', () => {
          for (const ex of exercises.slice(0, 10)) {
            const texts = [
              ...ex.statement.split(/\n\s*\n/),
              ...ex.solution,
              ex.sim.hint,
              ...(ex.answer.kind === 'choice' ? ex.answer.options : []),
            ];
            for (const text of texts) expect(texErrors(text)).toEqual([]);
          }
        });

        it('シードを変えると違う問題になる', () => {
          expect(new Set(exercises.map((ex) => ex.statement)).size).toBeGreaterThan(1);
        });
      });
    }
  });
}
