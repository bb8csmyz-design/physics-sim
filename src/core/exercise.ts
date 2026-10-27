/**
 * 演習問題（大学入試風の数値ランダム問題）の型と、出題・採点の共通処理。UI に依存しない。
 *
 * 単元フォルダの exercises.ts で `export const EXERCISES: readonly ExerciseTemplate[]` を宣言する
 * （1 単元あたり 3 パターン以上）。各パターンの generate(rng) はシード付き乱数から 1 問を作る:
 *
 *   generate(rng) {
 *     const m = pickStep(rng, 0.5, 3, 0.5);           // スライダーの刻みに乗る値を選ぶ
 *     const T = period({ ...p, m });                  // 正解は model.ts の関数で求める
 *     return {
 *       statement: `質量 $${num(m)}$ kg の物体を…。周期 $T$ を求めよ。`,
 *       answer: numeric(T, 's'),
 *       solution: ['周期の公式より', '$$T = 2\\pi\\sqrt{m/k}$$', …],
 *       sim: { params: { m, k, x0, v0 }, hint: '「この条件での値」の周期を見よう。' },
 *     };
 *   }
 *
 * 同じシードからは同じ問題ができる（URL で問題を共有・再読み込みできる）。
 */
import { Rng, seedRng } from './random';

/** 数値で答える問題の正解 */
export interface NumericAnswer {
  kind: 'numeric';
  /** 正解の値（SI 単位系、または unit で示した単位での値） */
  value: number;
  /** 単位（表示用。無次元なら省略） */
  unit?: string;
  /** 答える有効数字の桁数（既定 2）。正解の表示と、丸めによる誤差の許容に使う */
  sig?: number;
  /**
   * 相対誤差の許容（既定 0.02）。途中で g = 9.8, √2 ≈ 1.41 などと丸めて計算しても正解になるように、
   * 有効数字 2 桁の丸め誤差と同程度にしている
   */
  relTol?: number;
  /** 整数で答える問題（本数・次数など）。ちょうど一致したときだけ正解 */
  integer?: boolean;
}

/** 選択肢から選ぶ問題の正解 */
export interface ChoiceAnswer {
  kind: 'choice';
  /** 選択肢（$...$ で数式を書ける） */
  options: readonly string[];
  /** 正しい選択肢の番号（0 始まり） */
  correct: number;
}

export type ExerciseAnswer = NumericAnswer | ChoiceAnswer;

/** 答え合わせ用に、問題の条件で単元のシミュレーションを開くための設定 */
export interface SimPreset {
  /** スライダーの値（キーは単元の PARAMS の key。値はスライダーの刻みに乗せる） */
  params: Readonly<Record<string, number>>;
  /** 択一の切り替え（レンズの種類・スイッチの位置など）。キーは単元が決める */
  choices?: Readonly<Record<string, string>>;
  /** 単元固有の状態（サンドボックスの配置など。単元が解釈する文字列） */
  state?: string;
  /** シミュレーションのどこを見れば答えを確かめられるか */
  hint: string;
}

/** 生成された 1 問 */
export interface Exercise {
  /** 問題文（$...$ で数式。空行 '\n\n' で段落を分ける） */
  statement: string;
  answer: ExerciseAnswer;
  /**
   * 解説（解き方）。1 要素が 1 段落。'$$...$$' だけの要素は別行の数式として表示する
   */
  solution: readonly string[];
  sim: SimPreset;
  /**
   * 問題文で与えた値のうち sim.params に現れないもの（「x = 0.1 m の位置での速さ」の x など）。
   * 表示には使わず、テストで正解をシミュレーションと照らし合わせるのに使う
   */
  given?: Readonly<Record<string, number>>;
}

/** 出題パターン */
export interface ExerciseTemplate {
  /** パターンの識別子（英小文字と '-'。記録と URL に使うので変えない） */
  id: string;
  /** パターン名（例: '周期を求める'） */
  title: string;
  generate(rng: Rng): Exercise;
}

/** 数値の正解を作る */
export function numeric(
  value: number,
  unit?: string,
  opt: { sig?: number; relTol?: number; integer?: boolean } = {},
): NumericAnswer {
  return { kind: 'numeric', value, ...(unit ? { unit } : {}), ...opt };
}

/**
 * 選択肢の正解を作る。correct を先頭に置いた options を渡すと、乱数で並べ替えて返す
 * （正解がいつも同じ位置にならないように）。
 */
export function choice(rng: Rng, correct: string, ...wrong: string[]): ChoiceAnswer {
  const options = shuffle(rng, [correct, ...wrong]);
  return { kind: 'choice', options, correct: options.indexOf(correct) };
}

/**
 * 並び順を固定した選択肢（「増加する / 減少する / 変わらない」のように順序に意味があるもの）
 */
export function fixedChoice(options: readonly string[], correct: number): ChoiceAnswer {
  return { kind: 'choice', options, correct };
}

// ---------------------------------------------------------------------------
// 出題用の乱数

/** 問題を作る。seed が同じなら同じ問題になる */
export function generateExercise(template: ExerciseTemplate, seed: number): Exercise {
  return template.generate(new Rng(seedRng(seed)));
}

/** [min, max] の範囲で step の倍数（スライダーの刻み）になる値を一様に選ぶ */
export function pickStep(rng: Rng, min: number, max: number, step: number): number {
  const n = Math.round((max - min) / step);
  const i = Math.min(n, Math.floor(rng.uniform() * (n + 1)));
  return roundTo(min + i * step, step);
}

/** 配列から 1 つ選ぶ */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickOne: 空の配列');
  return items[Math.min(items.length - 1, Math.floor(rng.uniform() * items.length))]!;
}

/** 整数 [min, max] を一様に選ぶ */
export function pickInt(rng: Rng, min: number, max: number): number {
  return min + Math.min(max - min, Math.floor(rng.uniform() * (max - min + 1)));
}

/** 並べ替えた新しい配列（Fisher–Yates） */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng.uniform() * (i + 1)));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 打ち消し合って 0 になるはずの値の丸め誤差（1e-16 など）を 0 にする。scale はその量の典型的な大きさ
 * （正解が 1e-16 と表示されて「0」が不正解になるのを防ぐ）
 */
export function snapZero(value: number, scale: number): number {
  return Math.abs(value) < 1e-9 * Math.abs(scale) ? 0 : value;
}

/** step の倍数に丸める（0.1 + 0.2 のような浮動小数点の端数を消す） */
export function roundTo(value: number, step: number): number {
  const digits = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  return Number((Math.round(value / step) * step).toFixed(Math.min(12, digits + 2)));
}

// ---------------------------------------------------------------------------
// 問題文に書く数値

/**
 * 問題文（TeX）に書く数値。digits を省略すると、値に必要な最小の桁数で書く（1.50 → '1.5'）。
 * 1e-3 未満・1e5 以上は 'a \times 10^{n}' の形にする（sig 桁）。
 */
export function num(value: number, digits?: number, sig = 2): string {
  if (!Number.isFinite(value)) return '?';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) {
    let exp = Math.floor(Math.log10(abs));
    let mant = Number((value / 10 ** exp).toFixed(sig - 1));
    if (Math.abs(mant) >= 10) {
      mant /= 10;
      exp += 1;
    }
    return `${trimZeros(mant.toFixed(sig - 1))} \\times 10^{${exp}}`;
  }
  if (digits !== undefined) return value.toFixed(digits);
  return trimZeros(value.toFixed(6));
}

/**
 * 解説（TeX）に書く計算結果の数値を有効数字 n 桁で（既定 3 桁）。末尾の 0 も桁として残す
 * （1562.3 → '1.56 \\times 10^{3}'、0.1724 → '0.172'、2 → '2.00'）
 */
export function sig(value: number, n = 3): string {
  if (!Number.isFinite(value)) return '?';
  const s = value.toPrecision(n);
  const m = /^(-?[\d.]+)e([+-]\d+)$/.exec(s);
  if (!m) return s;
  return `${m[1]} \\times 10^{${Number(m[2])}}`;
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// ---------------------------------------------------------------------------
// 採点

/**
 * 解答の文字列を数値にする。読めなければ null。
 * 受け付ける書き方: 1.5 / -0.25 / −0.25（全角マイナス）/ 全角数字 / 1.2e-3 / 1.2×10^-3 /
 * 1.2*10^(-3) / 1.2×10⁻³ / 3/4（分数）/ 1,200（桁区切り）/ 末尾の単位や空白（「0.95 m/s」）
 */
export function parseAnswer(input: string): number | null {
  // 上付き文字は NFKC で普通の数字になってしまうので、先に '^' の指数に直す（'10⁻³' → '10^-3'）
  let s = input.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map(fromSuperscript).join(''));
  s = s
    .normalize('NFKC') // 全角数字・記号を半角に（'１．５' → '1.5'）
    .replace(/[−‐‑–—ー]/g, '-')
    .replace(/\s+/g, '')
    .replace(/,(?=\d{3}(?!\d))/g, '')
    .replace(/(\d)[×xX*·・](?=10\^)/g, '$1*');
  const m =
    /^([+-]?(?:\d+\.?\d*|\.\d+))(?:[eE]([+-]?\d+)|\*10\^\(?([+-]?\d+)\)?)?(?:\/([+-]?(?:\d+\.?\d*|\.\d+)))?/.exec(
      s,
    );
  if (!m) return null;
  // 数値の後ろは単位だけ許す（「0.95m/s」は可、「1,5」「2-3」は読めない）
  const rest = s.slice(m[0].length);
  if (rest !== '' && !/^[a-zA-Zµμ°℃%Ω]/.test(rest)) return null;
  let v = Number(m[1]);
  const exp = m[2] ?? m[3];
  if (exp !== undefined) v *= 10 ** Number(exp);
  if (m[4] !== undefined) {
    const d = Number(m[4]);
    if (d === 0) return null;
    v /= d;
  }
  return Number.isFinite(v) ? v : null;
}

const SUPER_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function fromSuperscript(c: string): string {
  if (c === '⁻') return '-';
  const i = SUPER_DIGITS.indexOf(c);
  return i >= 0 ? String(i) : c;
}

/** 数値の解答が正解の範囲に入っているか */
export function isNumericCorrect(answer: NumericAnswer, input: number): boolean {
  const v = answer.value;
  const sig = answer.sig ?? 2;
  const rel = answer.relTol ?? 0.02;
  if (answer.integer) return input === v;
  if (v === 0) return Math.abs(input) < 1e-9;
  // 有効数字 sig 桁に丸めたときの最大の丸め誤差（最後の桁の半分）
  const halfUlp = 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(v))) - sig + 1);
  const tol = Math.max(rel * Math.abs(v), halfUlp * 1.000001);
  return Math.abs(input - v) <= tol;
}

export type GradeResult =
  | { status: 'correct' | 'wrong' }
  /** 数値として読めない（採点しない） */
  | { status: 'invalid' };

/** 採点する。数値問題は文字列、選択問題は選択肢の番号を渡す */
export function grade(answer: ExerciseAnswer, input: string | number): GradeResult {
  if (answer.kind === 'choice') {
    if (typeof input !== 'number') return { status: 'invalid' };
    return { status: input === answer.correct ? 'correct' : 'wrong' };
  }
  const x = typeof input === 'number' ? input : parseAnswer(input);
  if (x === null) return { status: 'invalid' };
  return { status: isNumericCorrect(answer, x) ? 'correct' : 'wrong' };
}

/** 有効数字 sig 桁の正解の表示（TeX ではなくプレーンテキスト。負号は U+2212） */
export function formatAnswerValue(answer: NumericAnswer): string {
  const v = answer.value;
  if (answer.integer) return v < 0 ? `−${-v}` : String(v);
  const sig = answer.sig ?? 2;
  if (v === 0) return '0';
  // 先に有効数字 sig 桁に丸めてから桁数を決める（0.996 → '1.0'。'1.00' にしない）
  const abs = Math.abs(Number(v.toPrecision(sig)));
  const exp = Math.floor(Math.log10(abs));
  if (abs >= 1e-3 && abs < 1e5) {
    const digits = Math.max(0, sig - 1 - exp);
    const s = v.toFixed(digits);
    return s.startsWith('-') ? '−' + s.slice(1) : s;
  }
  let e = exp;
  let mant = Number((v / 10 ** e).toFixed(sig - 1));
  if (Math.abs(mant) >= 10) {
    mant /= 10;
    e += 1;
  }
  const ms = mant.toFixed(sig - 1);
  const sup = [...String(e)].map((c) => (c === '-' ? '⁻' : SUPER_DIGITS[Number(c)]!)).join('');
  return `${ms.startsWith('-') ? '−' + ms.slice(1) : ms}×10${sup}`;
}
