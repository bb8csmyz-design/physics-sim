/**
 * 演習問題 1 問の表示（問題文・解答欄・採点結果・解説）。出題と採点の計算は core/exercise.ts。
 *
 *   const view = createExerciseView(exercise, (result) => { 記録する・答え合わせを表示する });
 *   root.append(view.element);
 */
import { h } from '@/core/dom';
import {
  formatAnswerValue,
  grade,
  type Exercise,
  type ExerciseAnswer,
  type NumericAnswer,
} from '@/core/exercise';
import { splitDisplayMath } from '@/core/richText';
import { richText, tex } from './math';

/** 選択肢の記号（入試の慣例） */
const CHOICE_MARKS = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク'];

export interface GradedResult {
  correct: boolean;
  /** 「わからない」で解答を見たとき true（不正解として扱う） */
  gaveUp: boolean;
}

export interface ExerciseView {
  readonly element: HTMLElement;
  /** 採点済みなら true */
  readonly graded: boolean;
  focus(): void;
}

/**
 * 問題文・解説の段落。段落の中の '$$...$$' は別行の数式にする
 * （「…より $$x = 1$$ となる」は 段落・数式・段落 の 3 つに分かれる）
 */
export function richParagraphs(paragraphs: readonly string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const text of paragraphs) {
    for (const part of splitDisplayMath(text)) {
      out.push(
        part.kind === 'display' ? tex(part.value, true) : h('p', null, richText(part.value.trim())),
      );
    }
  }
  return out;
}

let viewCount = 0;

export function createExerciseView(
  ex: Exercise,
  onGraded: (result: GradedResult) => void,
): ExerciseView {
  const id = `exercise-${++viewCount}`;
  const a = ex.answer;
  let graded = false;

  const feedback = h('div', { class: 'exercise-feedback', 'aria-live': 'polite' });
  const solution = h('div', { class: 'exercise-solution', hidden: true });

  // --- 解答欄 ---
  let readInput: () => string | number | null;
  let lock: () => void;
  let focusInput: () => void;
  let field: HTMLElement;
  if (a.kind === 'numeric') {
    const input = h('input', {
      id: `${id}-input`,
      class: 'answer-input',
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-describedby': `${id}-help`,
    });
    readInput = () => input.value;
    lock = () => (input.readOnly = true);
    focusInput = () => input.focus();
    field = h(
      'div',
      { class: 'answer-field' },
      h('label', { for: input.id, class: 'answer-label' }, '解答'),
      h(
        'div',
        { class: 'answer-input-row' },
        input,
        a.unit ? h('span', { class: 'unit answer-unit' }, a.unit) : null,
      ),
      h(
        'p',
        { class: 'answer-help', id: `${id}-help` },
        a.integer
          ? '整数で入力'
          : `有効数字 ${a.sig ?? 2} 桁で入力（1.2e-3 や 1.2×10^-3、分数 3/4 の形も可）`,
      ),
    );
  } else {
    const radios = a.options.map((opt, i) =>
      h(
        'label',
        { class: 'choice-option' },
        h('input', { type: 'radio', name: `${id}-choice`, value: String(i) }),
        h(
          'span',
          { class: 'choice-mark', 'aria-hidden': 'true' },
          CHOICE_MARKS[i] ?? String(i + 1),
        ),
        h('span', { class: 'choice-text' }, richText(opt)),
      ),
    );
    const inputs = radios.map((r) => r.querySelector('input')!);
    readInput = () => {
      const i = inputs.findIndex((x) => x.checked);
      return i >= 0 ? i : null;
    };
    lock = () => inputs.forEach((x) => (x.disabled = true));
    focusInput = () => inputs[0]?.focus();
    field = h(
      'fieldset',
      { class: 'choice-list' },
      h('legend', { class: 'answer-label' }, '解答（1 つ選ぶ）'),
      radios,
    );
  }

  const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, '採点する');
  const giveUpBtn = h(
    'button',
    { type: 'button', class: 'btn btn-ghost', onclick: () => finish(false, true, null) },
    'わからない（解答を見る）',
  );

  const buttons = h('div', { class: 'btn-row' }, submitBtn, giveUpBtn);
  const form = h(
    'form',
    {
      class: 'answer-form',
      novalidate: true,
      onsubmit: (ev: SubmitEvent) => {
        ev.preventDefault();
        if (graded) return;
        const input = readInput();
        if (input === null || input === '') {
          showMessage(
            a.kind === 'choice' ? '選択肢を 1 つ選んでください。' : '解答を入力してください。',
          );
          return;
        }
        const r = grade(a, input);
        if (r.status === 'invalid') {
          showMessage('数値として読み取れませんでした。例: 0.95、−1.5、2.4e-3');
          focusInput();
          return;
        }
        finish(r.status === 'correct', false, input);
      },
    },
    field,
    buttons,
  );

  function showMessage(text: string) {
    feedback.replaceChildren(h('p', { class: 'exercise-message', role: 'alert' }, text));
  }

  function finish(correct: boolean, gaveUp: boolean, input: string | number | null) {
    graded = true;
    lock();
    buttons.hidden = true;
    feedback.replaceChildren(resultBox(a, correct, gaveUp, input));
    solution.hidden = false;
    onGraded({ correct, gaveUp });
    feedback.querySelector<HTMLElement>('.result-title')?.focus();
  }

  solution.append(h('h3', { class: 'exercise-subtitle' }, '解説'), ...richParagraphs(ex.solution));

  const element = h(
    'div',
    { class: 'exercise' },
    h('div', { class: 'exercise-statement' }, richParagraphs(ex.statement.split(/\n\s*\n/))),
    form,
    feedback,
    solution,
  );

  return {
    element,
    get graded() {
      return graded;
    },
    focus: focusInput,
  };
}

function answerText(a: ExerciseAnswer): Node {
  if (a.kind === 'choice') {
    return h(
      'span',
      null,
      `${CHOICE_MARKS[a.correct] ?? a.correct + 1} `,
      richText(a.options[a.correct] ?? ''),
    );
  }
  return numericText(a);
}

function numericText(a: NumericAnswer): Node {
  return h(
    'span',
    { class: 'answer-value' },
    formatAnswerValue(a),
    a.unit ? h('span', { class: 'unit' }, a.unit) : null,
  );
}

function resultBox(
  a: ExerciseAnswer,
  correct: boolean,
  gaveUp: boolean,
  input: string | number | null,
): HTMLElement {
  const title = correct ? '正解' : gaveUp ? '解答' : '不正解';
  const yours =
    input === null
      ? null
      : a.kind === 'choice'
        ? `あなたの解答: ${CHOICE_MARKS[input as number] ?? ''}`
        : `あなたの解答: ${String(input).trim()}`;
  return h(
    'div',
    { class: { result: true, 'is-correct': correct, 'is-wrong': !correct } },
    h(
      'p',
      { class: 'result-title', tabindex: -1 },
      h('span', { class: 'result-mark', 'aria-hidden': 'true' }, correct ? '○' : '×'),
      title,
    ),
    h('p', { class: 'result-answer' }, '正解: ', answerText(a)),
    yours && !correct ? h('p', { class: 'result-yours' }, yours) : null,
  );
}
