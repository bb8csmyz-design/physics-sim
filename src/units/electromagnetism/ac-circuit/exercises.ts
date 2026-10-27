/**
 * 交流回路（RLC 直列回路）の演習問題。答え合わせは単元の既定（定常状態から）で動かす。
 * 正解は model.ts の関数で求める。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import {
  averagePower,
  capacitiveReactance,
  impedance,
  inductiveReactance,
  resonanceFrequency,
  rmsCurrent,
  type AcParams,
} from './model';

function pickCircuit(rng: Rng): AcParams {
  return {
    Ve: pickStep(rng, 10, 100, 10),
    f: pickStep(rng, 20, 100, 10),
    R: pickStep(rng, 10, 100, 5),
    L: pickStep(rng, 50, 500, 50),
    C: pickStep(rng, 20, 500, 20),
  };
}

const SETUP = (p: AcParams) =>
  `抵抗値 $${num(p.R)}$ Ω の抵抗、自己インダクタンス $${num(p.L)}$ mH のコイル、電気容量 $${num(p.C)}$ μF のコンデンサーを直列につなぎ、実効値 $${num(p.Ve)}$ V、周波数 $${num(p.f)}$ Hz の交流電源に接続した。`;

const REACTANCES = (p: AcParams) =>
  `$\\omega = 2\\pi f \\approx ${num(2 * Math.PI * p.f, 1)}$ rad/s。誘導リアクタンス $X_L = \\omega L \\approx ${num(inductiveReactance(p), 1)}$ Ω、容量リアクタンス $X_C = \\dfrac{1}{\\omega C} \\approx ${num(capacitiveReactance(p), 1)}$ Ω。`;

const Z_EQ = (p: AcParams) =>
  `$$Z = \\sqrt{R^2 + (X_L - X_C)^2} = \\sqrt{${num(p.R)}^2 + (${num(inductiveReactance(p), 1)} - ${num(capacitiveReactance(p), 1)})^2} \\approx ${num(impedance(p), 1)}\\ \\Omega$$`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'impedance',
    title: 'インピーダンス',
    generate(rng) {
      const p = pickCircuit(rng);
      const Z = impedance(p);
      return {
        statement: `${SETUP(p)}

この回路のインピーダンス $Z$ [Ω] を有効数字 2 桁で求めよ。`,
        answer: numeric(Z, 'Ω'),
        solution: [
          REACTANCES(p),
          'コイルの電圧は電流より位相が $\\pi/2$ 進み、コンデンサーの電圧は $\\pi/2$ 遅れるので、2 つは打ち消し合う向きにはたらく。',
          Z_EQ(p),
        ],
        sim: {
          params: p,
          hint: '「この条件での値」のリアクタンスとインピーダンス $Z$ を見よう。電流の最大値は $V_0/Z$ になっている。',
        },
      };
    },
  },
  {
    id: 'rms-current',
    title: '電流の実効値',
    generate(rng) {
      const p = pickCircuit(rng);
      const Ie = rmsCurrent(p);
      return {
        statement: `${SETUP(p)}

回路を流れる電流の実効値 $I_e$ [A] を有効数字 2 桁で求めよ。`,
        answer: numeric(Ie, 'A'),
        solution: [
          REACTANCES(p),
          Z_EQ(p),
          `$$I_e = \\frac{V_e}{Z} = \\frac{${num(p.Ve)}}{${num(impedance(p), 1)}} \\approx ${sig(Ie)}\\ \\text{A}$$`,
        ],
        sim: {
          params: p,
          hint: '電流のグラフの山の高さ（最大値 $I_0$）を読み、$I_e = I_0/\\sqrt{2}$ を確かめよう。「この条件での値」にも実効値が出ている。',
        },
      };
    },
  },
  {
    id: 'resonance',
    title: '共振周波数',
    generate(rng) {
      const p = pickCircuit(rng);
      const f0 = resonanceFrequency(p);
      return {
        statement: `抵抗値 $${num(p.R)}$ Ω の抵抗、自己インダクタンス $${num(p.L)}$ mH のコイル、電気容量 $${num(p.C)}$ μF のコンデンサーを直列につなぎ、実効値 $${num(p.Ve)}$ V の交流電源に接続した。電源の周波数を変えていくと、ある周波数 $f_0$ で電流の実効値が最大になった。

$f_0$ [Hz] を有効数字 2 桁で求めよ。`,
        answer: numeric(f0, 'Hz'),
        solution: [
          '$Z = \\sqrt{R^2 + (\\omega L - 1/\\omega C)^2}$ が最小、つまり $\\omega L = \\dfrac{1}{\\omega C}$ のとき電流が最大になる（共振）。',
          `$$f_0 = \\frac{1}{2\\pi\\sqrt{LC}} = \\frac{1}{2\\pi\\sqrt{${num(p.L)} \\times 10^{-3} \\times ${num(p.C)} \\times 10^{-6}}} \\approx ${sig(f0)}\\ \\text{Hz}$$`,
          '共振のときインピーダンスは $R$ に等しく、電流と電圧は同位相になる。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の共振周波数を見よう。周波数のスライダーを共振周波数に近づけると、電流が大きくなり、電圧との位相のずれ $\\varphi$ が 0 に近づく。',
        },
      };
    },
  },
  {
    id: 'power',
    title: '平均の消費電力',
    generate(rng) {
      const p = pickCircuit(rng);
      const P = averagePower(p);
      return {
        statement: `${SETUP(p)}

この回路で消費される電力の時間平均 $\\overline{P}$ [W] を有効数字 2 桁で求めよ。`,
        answer: numeric(P, 'W'),
        solution: [
          REACTANCES(p),
          Z_EQ(p),
          `電流の実効値は $I_e = V_e/Z \\approx ${sig(rmsCurrent(p))}$ A。コイルとコンデンサーは電力を消費しない（1 周期の平均が 0）ので、抵抗のジュール熱だけを考える:`,
          `$$\\overline{P} = I_e^{\\,2}R = ${sig(rmsCurrent(p))}^2 \\times ${num(p.R)} \\approx ${sig(P)}\\ \\text{W}$$`,
          '力率を使って $\\overline{P} = V_eI_e\\cos\\varphi$（$\\cos\\varphi = R/Z$）と求めても同じ。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の平均の消費電力と力率を見よう。瞬間の電力のグラフの平均がこの値になる。',
        },
      };
    },
  },
];
