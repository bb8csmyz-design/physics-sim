/**
 * 電気振動（LC 回路）の演習問題。正解は model.ts の関数で求める。
 */
import { num, numeric, pickOne, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import { energies, frequency, initialState, maxCurrent, period, type LcParams } from './model';

function pickCircuit(rng: Rng): LcParams {
  return {
    L: pickStep(rng, 10, 100, 1),
    C: pickStep(rng, 10, 100, 1),
    V0: pickStep(rng, 2, 12, 0.5),
  };
}

const SETUP = (p: LcParams) =>
  `電気容量 $${num(p.C)}$ μF のコンデンサーを $${num(p.V0)}$ V に充電し、時刻 $t = 0$ に自己インダクタンス $${num(p.L)}$ mH のコイル（抵抗は無視できる）につないだところ、回路に電気振動が起こった。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'period',
    title: '電気振動の周期・周波数',
    generate(rng) {
      const p = pickCircuit(rng);
      const askFreq = rng.uniform() < 0.5;
      const T = period(p);
      const f = frequency(p);
      return {
        statement: `${SETUP(p)}

この電気振動の${askFreq ? '周波数（固有周波数）$f$ [Hz]' : '周期 $T$ [ms]'}を有効数字 2 桁で求めよ。`,
        answer: askFreq ? numeric(f, 'Hz') : numeric(T * 1e3, 'ms'),
        solution: [
          'コイルの電圧とコンデンサーの電圧が等しいことから $L\\dfrac{d^2q}{dt^2} = -\\dfrac{q}{C}$。ばねの単振動（$m \\leftrightarrow L$, $k \\leftrightarrow 1/C$）と同じ形なので、角周波数は $\\omega = \\dfrac{1}{\\sqrt{LC}}$。',
          `$$T = 2\\pi\\sqrt{LC} = 2\\pi\\sqrt{${num(p.L)} \\times 10^{-3} \\times ${num(p.C)} \\times 10^{-6}} \\approx ${sig(T * 1e3)} \\times 10^{-3}\\ \\text{s}$$`,
          askFreq
            ? `$$f = \\frac{1}{T} \\approx ${sig(f)}\\ \\text{Hz}$$`
            : '振動の周期はコンデンサーの最初の電圧によらない。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の周期と固有周波数を見よう。電気量のグラフで山から山までの時間を読んでもよい。',
        },
        given: { askFreq: askFreq ? 1 : 0 },
      };
    },
  },
  {
    id: 'max-current',
    title: '電流の最大値',
    generate(rng) {
      const p = pickCircuit(rng);
      const I0 = maxCurrent(p) * 1e3;
      return {
        statement: `${SETUP(p)}

回路を流れる電流の最大値 [mA] を有効数字 2 桁で求めよ。`,
        answer: numeric(I0, 'mA'),
        solution: [
          '電流が最大のとき、コンデンサーの電気量は 0 で、エネルギーはすべてコイルにある。エネルギー保存より',
          '$$\\frac{1}{2}CV_0^{\\,2} = \\frac{1}{2}LI_0^{\\,2} \\quad\\Longrightarrow\\quad I_0 = V_0\\sqrt{\\frac{C}{L}}$$',
          `$$I_0 = ${num(p.V0)} \\times \\sqrt{\\frac{${num(p.C)} \\times 10^{-6}}{${num(p.L)} \\times 10^{-3}}} \\approx ${sig(I0)} \\times 10^{-3}\\ \\text{A}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の電流の最大値 $I_0$ と、電流のグラフの山の高さを見よう。',
        },
      };
    },
  },
  {
    id: 'energy-split',
    title: 'エネルギーの配分',
    generate(rng) {
      const p = pickCircuit(rng);
      const frac = pickOne(rng, [0.5, 0.25, 0.75]);
      const qText = frac === 0.5 ? '\\frac{1}{2}' : frac === 0.25 ? '\\frac{1}{4}' : '\\frac{3}{4}';
      const total = energies(p, initialState(p)).total;
      const UB = total * (1 - frac * frac);
      return {
        statement: `${SETUP(p)}

コンデンサーの電気量が最初の $${qText}$ 倍になった瞬間に、コイルに蓄えられているエネルギー [mJ] を有効数字 2 桁で求めよ。`,
        answer: numeric(UB * 1e3, 'mJ'),
        solution: [
          `はじめのエネルギーはすべてコンデンサーの静電エネルギー $\\dfrac{1}{2}CV_0^{\\,2} = \\dfrac{1}{2} \\times ${num(p.C)} \\times 10^{-6} \\times ${num(p.V0)}^2 \\approx ${sig(total * 1e3)} \\times 10^{-3}$ J。`,
          `静電エネルギーは $\\dfrac{q^2}{2C}$ なので、電気量が $${qText}$ 倍のとき静電エネルギーは $(${qText})^2$ 倍。抵抗がないのでエネルギーの和は保存され、残りがコイルのエネルギー:`,
          `$$U_L = \\left(1 - \\left(${qText}\\right)^2\\right) \\times ${sig(total * 1e3)} \\approx ${sig(UB * 1e3)}\\ \\text{mJ}$$`,
        ],
        sim: {
          params: p,
          hint: '一時停止とコマ送りで電気量が指定の値になる瞬間を探し、「現在の値」のコイルのエネルギーを読もう。エネルギーのグラフで和が一定であることも確かめよう。',
        },
        given: { frac },
      };
    },
  },
];
