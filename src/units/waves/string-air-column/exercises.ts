/**
 * 弦と気柱の固有振動の演習問題。正解は model.ts の frequency で求める。
 * 答え合わせは「振動するもの」（choices.kind）とスライダーで指定する。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import { frequency, type ResonatorKind, type ResonatorParams } from './model';

const sim = (kind: ResonatorKind, p: ResonatorParams, hint: string) => ({
  params: p,
  choices: { kind },
  hint,
});

const ORDINAL = ['', '基本振動', '2 倍振動', '3 倍振動', '4 倍振動', '5 倍振動'];

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'string',
    title: '弦の固有振動数',
    generate(rng) {
      const p: ResonatorParams = {
        L: pickStep(rng, 0.3, 1, 0.05),
        v: pickStep(rng, 100, 400, 10),
        n: pickStep(rng, 1, 4, 1),
        dx: 0,
        xr: 0.25,
      };
      const f = frequency('string', p);
      return {
        statement: `長さ $${num(p.L)}$ m の弦の両端を固定して張った。弦を伝わる横波の速さは $${p.v}$ m/s である。

弦に腹が ${p.n} 個の定常波（${ORDINAL[p.n]}）ができたときの振動数 $f$ [Hz] を有効数字 2 桁で求めよ。`,
        answer: numeric(f, 'Hz'),
        solution: [
          `両端が節で、腹が ${p.n} 個の定常波では、弦の長さに半波長が ${p.n} 個入る: $L = ${p.n} \\times \\dfrac{\\lambda}{2}$。`,
          `$$\\lambda = \\frac{2L}{${p.n}} = ${sig((2 * p.L) / p.n)}\\ \\text{m}, \\qquad f = \\frac{v}{\\lambda} = \\frac{${p.n}v}{2L} \\approx ${sig(f)}\\ \\text{Hz}$$`,
        ],
        sim: sim(
          'string',
          p,
          '「この条件での値」の固有振動数 $f$ と波長を見よう。画面の腹の数が問題の条件と同じであることも確かめよう。',
        ),
      };
    },
  },
  {
    id: 'closed-pipe',
    title: '閉管の固有振動数',
    generate(rng) {
      const p: ResonatorParams = {
        L: pickStep(rng, 0.3, 1, 0.05),
        v: 340,
        n: pickStep(rng, 1, 3, 1),
        dx: 0,
        xr: 0.25,
      };
      const m = 2 * p.n - 1;
      const f = frequency('closed', p);
      return {
        statement: `長さ $${num(p.L)}$ m の、一端が閉じ他端が開いた管（閉管）がある。音速を $${p.v}$ m/s とし、開口端補正は無視できるものとする。

この閉管の気柱の、振動数の低いほうから ${p.n} 番目の固有振動の振動数 [Hz] を有効数字 2 桁で求めよ。`,
        answer: numeric(f, 'Hz'),
        solution: [
          '閉管では閉じた端が変位の節、開いた端が変位の腹になる。管の長さには $\\dfrac{\\lambda}{4}$ の奇数倍が入る: $L = (2n - 1)\\dfrac{\\lambda}{4}$。',
          `${p.n} 番目の固有振動は $2n - 1 = ${m}$（${m === 1 ? '基本振動' : `${m} 倍振動`}）で、$\\lambda = \\dfrac{4L}{${m}} = ${sig((4 * p.L) / m)}$ m。`,
          `$$f = \\frac{v}{\\lambda} = \\frac{${m}v}{4L} = \\frac{${m} \\times ${p.v}}{4 \\times ${num(p.L)}} \\approx ${sig(f)}\\ \\text{Hz}$$`,
          '閉管には基本振動の奇数倍の振動だけが現れる。',
        ],
        sim: sim(
          'closed',
          p,
          '「この条件での値」の固有振動数と振動の種類を見よう。振動の番号 $n$ を変えると、基本振動の 1, 3, 5 倍になることを確かめよう。',
        ),
      };
    },
  },
  {
    id: 'open-pipe',
    title: '開管の固有振動（開口端補正あり）',
    generate(rng) {
      const p: ResonatorParams = {
        L: pickStep(rng, 0.3, 1, 0.05),
        v: pickStep(rng, 330, 350, 10),
        n: pickStep(rng, 1, 3, 1),
        dx: pickStep(rng, 0.005, 0.02, 0.005),
        xr: 0.25,
      };
      const f = frequency('open', p);
      return {
        statement: `長さ $${num(p.L)}$ m の両端が開いた管（開管）がある。音速を $${p.v}$ m/s、開口端補正（腹の位置が管口から外側にずれる距離）を管の両端それぞれ $${num(p.dx * 100)}$ cm とする。

この開管の気柱の${ORDINAL[p.n]}の振動数 [Hz] を有効数字 2 桁で求めよ。`,
        answer: numeric(f, 'Hz'),
        solution: [
          `開管では両端の外側 $\\Delta x$ の位置が変位の腹になる。腹から腹までの長さ $L + 2\\Delta x = ${sig(p.L + 2 * p.dx)}$ m に半波長が ${p.n} 個入る。`,
          `$$\\lambda = \\frac{2(L + 2\\Delta x)}{${p.n}} \\approx ${sig((2 * (p.L + 2 * p.dx)) / p.n)}\\ \\text{m}, \\qquad f = \\frac{v}{\\lambda} \\approx ${sig(f)}\\ \\text{Hz}$$`,
          '開口端補正を無視すると振動数は少し大きく計算される。',
        ],
        sim: sim(
          'open',
          p,
          '「この条件での値」の固有振動数を見よう。開口端補正のスライダーを 0 にすると、振動数が少し上がることを確かめよう。',
        ),
      };
    },
  },
  {
    id: 'resonance-tube',
    title: '気柱共鳴の実験から音速を求める',
    generate(rng) {
      const v = pickStep(rng, 330, 350, 10);
      const L1 = pickStep(rng, 0.3, 0.32, 0.01);
      const dx = pickStep(rng, 0.005, 0.02, 0.001);
      const lambda = 4 * (L1 + dx);
      const f = v / lambda;
      const fText = Number(f.toPrecision(3));
      const L2 = 3 * L1 + 2 * dx; // 3λ/4 − Δx
      const answer = 2 * (L2 - L1) * fText;
      const p: ResonatorParams = { L: L1, v, n: 1, dx, xr: 0.25 };
      return {
        statement: `水を入れた細長いガラス管の上端の近くで、振動数 $${fText}$ Hz のおんさを鳴らしながら水面を管口から下げていった。管口から水面までの距離が $${num(L1 * 100, 1)}$ cm のときに 1 回目の共鳴が起こり、$${num(L2 * 100, 1)}$ cm のときに 2 回目の共鳴が起こった。

音速 $V$ [m/s] を有効数字 3 桁で求めよ。`,
        answer: numeric(answer, 'm/s', { sig: 3, relTol: 0.005 }),
        solution: [
          '水面が閉口端（節）、管口の少し外側が腹の閉管と考えられる。隣り合う共鳴の位置の差は半波長に等しい（開口端補正が打ち消し合う）。',
          `$$\\frac{\\lambda}{2} = ${num(L2 * 100, 1)} - ${num(L1 * 100, 1)} = ${num((L2 - L1) * 100, 1)}\\ \\text{cm} \\quad\\Longrightarrow\\quad \\lambda = ${sig(2 * (L2 - L1))}\\ \\text{m}$$`,
          `$$V = f\\lambda = ${fText} \\times ${sig(2 * (L2 - L1))} \\approx ${sig(answer, 4)}\\ \\text{m/s}$$`,
          `開口端補正は $\\Delta x = \\dfrac{\\lambda}{4} - L_1 \\approx ${num(dx * 100, 2)}$ cm と求められる。`,
        ],
        sim: sim(
          'closed',
          p,
          `1 回目の共鳴（閉管の基本振動）の条件にしてある。「この条件での値」の固有振動数がおんさの振動数と一致することを確かめよう。長さを $${num(L2)}$ m、振動の番号を 2（3 倍振動）にしても同じ振動数になる。`,
        ),
        given: { L2, f: fText },
      };
    },
  },
];
