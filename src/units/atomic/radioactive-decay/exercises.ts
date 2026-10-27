/**
 * 放射性崩壊と半減期の演習問題。正解は N = N₀(1/2)^{t/T}、A = λN（model.ts）で求める。
 */
import { num, numeric, pickInt, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import { expectedActivity, expectedRemaining, type DecayParams } from './model';

const FRAC: Record<number, string> = {
  1: '\\frac{1}{2}',
  2: '\\frac{1}{4}',
  3: '\\frac{1}{8}',
  4: '\\frac{1}{16}',
};

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'remaining',
    title: '残っている原子核の数',
    generate(rng) {
      const k = pickInt(rng, 1, 4);
      const p: DecayParams = { T: pickStep(rng, 2, 10, 0.5), N0: pickStep(rng, 400, 2000, 400) };
      const t = k * p.T;
      const N = expectedRemaining(p, t);
      return {
        statement: `半減期 $${num(p.T)}$ s の放射性原子核が $${p.N0}$ 個ある。

$${num(t)}$ s 後に崩壊せずに残っている原子核の数（期待値）を求めよ。`,
        answer: numeric(N, '個'),
        solution: [
          '半減期ごとに、残っている原子核の数は半分になる: $N = N_0\\left(\\dfrac{1}{2}\\right)^{t/T}$。',
          `$t/T = ${num(t)}/${num(p.T)} = ${k}$ なので $$N = ${p.N0} \\times \\left(\\frac{1}{2}\\right)^{${k}} = ${num(N)}\\ \\text{個}$$`,
          '個々の原子核がいつ崩壊するかは確率的なので、実際の数はこの値のまわりにばらつく。',
        ],
        sim: {
          params: p,
          hint: `再生して $t = ${num(t)}$ s（$t/T = ${k}$）のときの残っている数を読もう。「この条件での値」の理論値と比べ、ばらつきも確かめよう。`,
        },
        given: { t },
      };
    },
  },
  {
    id: 'half-life',
    title: '測定から半減期を求める',
    generate(rng) {
      const k = pickInt(rng, 2, 4);
      const p: DecayParams = { T: pickStep(rng, 1, 5, 0.5), N0: 1600 };
      const t = k * p.T;
      const N = expectedRemaining(p, t);
      return {
        statement: `ある放射性原子核が $${p.N0}$ 個あった。$${num(t)}$ s 後に崩壊せずに残っている原子核は $${num(N)}$ 個に減っていた。

この原子核の半減期 $T$ [s] を有効数字 2 桁で求めよ。`,
        answer: numeric(p.T, 's'),
        solution: [
          `残っている割合は $\\dfrac{${num(N)}}{${p.N0}} = ${FRAC[k]} = \\left(\\dfrac{1}{2}\\right)^{${k}}$。`,
          `$N = N_0\\left(\\dfrac{1}{2}\\right)^{t/T}$ と比べて $\\dfrac{t}{T} = ${k}$。よって $$T = \\frac{${num(t)}}{${k}} = ${num(p.T)}\\ \\text{s}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の T 後・2T 後・3T 後の残りを見よう。グラフで残りの数が半分になる時間の間隔が一定であることも確かめよう。',
        },
      };
    },
  },
  {
    id: 'elapsed-time',
    title: '残っている割合から経過時間を求める',
    generate(rng) {
      const k = pickInt(rng, 1, 4);
      const p: DecayParams = { T: pickStep(rng, 1, 20, 0.5), N0: 1600 };
      return {
        statement: `半減期 $${num(p.T)}$ s の放射性原子核の集まりがある。崩壊せずに残っている原子核の数が、はじめの $${FRAC[k]}$ になるのは、何 s 後か。有効数字 2 桁で求めよ。`,
        answer: numeric(k * p.T, 's'),
        solution: [
          `$${FRAC[k]} = \\left(\\dfrac{1}{2}\\right)^{${k}}$ なので、半減期の ${k} 倍の時間がたったとき。`,
          `$$t = ${k} \\times ${num(p.T)} = ${num(k * p.T)}\\ \\text{s}$$`,
          '年代測定（炭素 14 など）は、この関係を使って経過時間を求めている。',
        ],
        sim: {
          params: p,
          hint: `「経過時間 ÷ 半減期」が ${k} になったときの「残っている割合」を見よう（およそ ${num(100 / 2 ** k)}%）。`,
        },
        given: { k },
      };
    },
  },
  {
    id: 'activity',
    title: '放射能（崩壊の割合）',
    generate(rng) {
      const p: DecayParams = { T: pickStep(rng, 2, 20, 0.5), N0: pickStep(rng, 400, 2000, 100) };
      const A = expectedActivity(p, 0);
      return {
        statement: `半減期 $${num(p.T)}$ s の放射性原子核が $${p.N0}$ 個ある。1 個の原子核が単位時間あたりに崩壊する確率（崩壊定数）は $\\lambda = \\dfrac{\\log_e 2}{T}$ で、$\\log_e 2 = 0.69$ とする。

はじめの 1 秒あたりの崩壊数（放射能）[Bq] を有効数字 2 桁で求めよ。`,
        answer: numeric(A, 'Bq'),
        solution: [
          `崩壊定数は $\\lambda = \\dfrac{0.69}{${num(p.T)}} \\approx ${sig(Math.LN2 / p.T)}$ /s。`,
          `放射能は「残っている数 × 1 個が崩壊する確率」: $$A = \\lambda N_0 \\approx ${sig(Math.LN2 / p.T)} \\times ${p.N0} \\approx ${sig(A)}\\ \\text{Bq}$$`,
          '放射能も原子核の数と同じく、半減期ごとに半分になる。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の初めの放射能を見よう。再生直後の「現在の値」の放射能（測定値）も、ばらつきながらこの値に近い。',
        },
      };
    },
  },
];
