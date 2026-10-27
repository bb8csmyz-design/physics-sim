/**
 * 2 つの波源による水面波の干渉の演習問題。長さは問題文では cm、スライダーは m で渡す。
 * 正解は model.ts の関数（経路差・lineCount）で求める。
 */
import {
  choice,
  num,
  numeric,
  pickOne,
  pickStep,
  roundTo,
  sig,
  type ExerciseTemplate,
} from '@/core/exercise';
import {
  FREQUENCY,
  interferenceKind,
  lineCount,
  type InterferenceParams,
  type SourcePhase,
} from './model';

const PHASE_TEXT: Record<SourcePhase, string> = { same: '同位相', opposite: '逆位相' };
const cm = (m: number) => num(roundTo(m * 100, 0.01));

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'point-judge',
    title: '点が強め合うか弱め合うか',
    generate(rng) {
      const phase = pickOne(rng, ['same', 'opposite'] as const);
      // 経路差は 0.01 m の倍数なので、λ = 0.01, 0.02 m なら経路差は半波長の整数倍になる
      const lambda = pickOne(rng, [0.01, 0.02, 0.02]);
      const d = pickStep(rng, 0.06, 0.1, 0.01);
      // 線分 S₁S₂ 上の点（y = 0）。中点からの距離 x なら経路差は 2|x|（0.01 m の倍数）
      const xP = pickStep(rng, 0.005, roundTo(d / 2 - 0.01, 0.005), 0.005);
      const p: InterferenceParams = { d, lambda, xP, yP: 0 };
      const r1 = d / 2 + xP;
      const r2 = d / 2 - xP;
      const kind = interferenceKind(p, phase, xP, 0, 1e-6);
      const ratio = (r1 - r2) / lambda;
      return {
        statement: `水面上で $${cm(d)}$ cm 離れた 2 点 S₁, S₂ から、波長 $${cm(lambda)}$ cm の波が${PHASE_TEXT[phase]}で同じ振幅で出ている。線分 S₁S₂ 上の点 P は、S₁ から $${cm(r1)}$ cm、S₂ から $${cm(r2)}$ cm の位置にある。

点 P での水面の振動として正しいものを選べ。`,
        answer: choice(
          rng,
          kind === 'constructive' ? '強め合い、大きく振動する' : '弱め合い、ほとんど振動しない',
          kind === 'constructive' ? '弱め合い、ほとんど振動しない' : '強め合い、大きく振動する',
          '1 つの波源だけのときと同じ振幅で振動する',
        ),
        solution: [
          `経路差は $|S_1P - S_2P| = ${cm(r1)} - ${cm(r2)} = ${cm(r1 - r2)}$ cm で、波長の $${num(ratio)}$ 倍。`,
          phase === 'same'
            ? '同位相の波源では、経路差が波長の整数倍なら強め合い、半整数倍（整数 + ½）なら弱め合う。'
            : '逆位相の波源では条件が入れかわり、経路差が波長の整数倍なら弱め合い、半整数倍なら強め合う。',
          `よって点 P では${kind === 'constructive' ? '強め合う' : '弱め合う'}。`,
        ],
        sim: {
          params: p,
          choices: { phase },
          hint: '点 P の位置は問題の条件にしてある。「現在の値」の経路差 / 波長 と「点 P では」の判定、点 P の変位のグラフの振幅を見よう。',
        },
        given: { constructive: kind === 'constructive' ? 1 : 0 },
      };
    },
  },
  {
    id: 'line-count',
    title: '強め合う線・弱め合う線の本数',
    generate(rng) {
      const phase = pickOne(rng, ['same', 'opposite'] as const);
      const lineKind = pickOne(rng, ['constructive', 'destructive'] as const);
      let d: number;
      let lambda: number;
      do {
        d = pickStep(rng, 0.03, 0.1, 0.005);
        lambda = pickStep(rng, 0.01, 0.04, 0.002);
        // 線がちょうど波源を通る（d が λ/2 の整数倍）条件は数え方があいまいになるので避ける
      } while (Math.abs((2 * d) / lambda - Math.round((2 * d) / lambda)) < 0.05);
      const p: InterferenceParams = { d, lambda, xP: 0, yP: 0.08 };
      const n = lineCount(p, phase, lineKind);
      const name =
        lineKind === 'constructive'
          ? '強め合う点を連ねた線（腹線）'
          : '弱め合う点を連ねた線（節線）';
      return {
        statement: `水面上で $${cm(d)}$ cm 離れた 2 点 S₁, S₂ から、波長 $${cm(lambda)}$ cm の波が${PHASE_TEXT[phase]}で同じ振幅で出ている。

線分 S₁S₂ と交わる、${name}は何本あるか。`,
        answer: numeric(n, '本', { integer: true }),
        solution: [
          `線分 S₁S₂ 上の点では経路差 $r_1 - r_2$ が $-d$ から $d$ まで変わる（$d = ${cm(d)}$ cm）。`,
          (lineKind === 'constructive') === (phase === 'same')
            ? `${name}は $r_1 - r_2 = m\\lambda$（$m$ は整数）。$|m\\lambda| < d$ より $|m| < ${sig(d / lambda)}$。`
            : `${name}は $r_1 - r_2 = (m + \\frac{1}{2})\\lambda$（$m$ は整数）。$|(m + \\frac{1}{2})\\lambda| < d$ より $|m + \\frac{1}{2}| < ${sig(d / lambda)}$。`,
          `これを満たす $m$ は ${n} 個なので、${n} 本。`,
        ],
        sim: {
          params: p,
          choices: { phase },
          hint: '表示の「強め合う線・弱め合う線」で線を数え、「現在の値」の本数と比べよう。',
        },
      };
    },
  },
  {
    id: 'wave-speed',
    title: '強め合う点の間隔から波の速さ',
    generate(rng) {
      const lambda = pickStep(rng, 0.01, 0.04, 0.002);
      const d = pickStep(rng, 0.05, 0.1, 0.005);
      const phase = pickOne(rng, ['same', 'opposite'] as const);
      const p: InterferenceParams = { d, lambda, xP: 0, yP: 0 };
      const v = FREQUENCY * lambda;
      return {
        statement: `水面上の 2 点 S₁, S₂ にある波源を、振動数 $${FREQUENCY}$ Hz で${PHASE_TEXT[phase]}に振動させた。線分 S₁S₂ 上を調べると、大きく振動する点が $${cm(lambda / 2)}$ cm 間隔で並んでいた。

水面を伝わる波の速さ $v$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          '線分 S₁S₂ 上では、S₁ から S₂ へ進む波と S₂ から S₁ へ進む波が重なって定常波ができる。隣り合う腹（大きく振動する点）の間隔は半波長 $\\lambda/2$。',
          `$\\lambda = 2 \\times ${cm(lambda / 2)} = ${cm(lambda)}$ cm $= ${num(lambda)}$ m。`,
          `$$v = f\\lambda = ${FREQUENCY} \\times ${num(lambda)} = ${sig(v)}\\ \\text{m/s}$$`,
          '腹の間隔は波源の位相（同位相か逆位相か）によらない。',
        ],
        sim: {
          params: p,
          choices: { phase },
          hint: '「現在の値」の波の速さを見よう。画面で、S₁S₂ の間の強め合う線が半波長ごとに並ぶことを確かめよう。',
        },
      };
    },
  },
];
