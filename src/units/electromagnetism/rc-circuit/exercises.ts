/**
 * RC 回路（コンデンサーの充電）の演習問題。答え合わせは単元の初期状態（スイッチ a・電荷 0）から t = 0 で動かす。
 * 正解は model.ts の関数で求める。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import { capacitorEnergy, farads, ohms, timeConstant, type RcParams } from './model';

function pickCircuit(rng: Rng): RcParams {
  return {
    E: pickStep(rng, 1.5, 12, 0.5),
    R: pickStep(rng, 1, 10, 0.5),
    C: pickStep(rng, 100, 1000, 10),
  };
}

const SETUP = (p: RcParams) =>
  `起電力 $${num(p.E)}$ V の電池（内部抵抗は無視できる）、抵抗値 $${num(p.R)}$ kΩ の抵抗、電気容量 $${num(p.C)}$ μF のコンデンサー、スイッチを直列につないだ。はじめコンデンサーに電荷はなく、時刻 $t = 0$ でスイッチを閉じた。`;

const sim = (p: RcParams, hint: string) => ({ params: p, hint });

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'initial-current',
    title: 'スイッチを閉じた直後の電流',
    generate(rng) {
      const p = pickCircuit(rng);
      const I = (p.E / ohms(p)) * 1e3;
      return {
        statement: `${SETUP(p)}

スイッチを閉じた直後に回路を流れる電流 [mA] を有効数字 2 桁で求めよ。`,
        answer: numeric(I, 'mA'),
        solution: [
          '閉じた直後はコンデンサーの電荷が 0 なので、コンデンサーの電圧も 0（導線と同じ）。電池の電圧がすべて抵抗にかかる。',
          `$$I_0 = \\frac{E}{R} = \\frac{${num(p.E)}}{${num(p.R)} \\times 10^3} \\approx ${sig(I / 1e3)}\\ \\text{A} = ${sig(I)}\\ \\text{mA}$$`,
          'コンデンサーが充電されるにつれて電流は減り、最後は 0 になる。',
        ],
        sim: sim(
          p,
          '「この条件での値」の最初の電流 $E/R$ と、$t = 0$ での「現在の値」の電流を見よう。',
        ),
      };
    },
  },
  {
    id: 'time-constant',
    title: '時定数',
    generate(rng) {
      const p = pickCircuit(rng);
      const tau = timeConstant(p);
      return {
        statement: `${SETUP(p)}コンデンサーの電圧は $V = E(1 - e^{-t/\\tau})$ のように増えていく。

この式の時定数 $\\tau$ [s] を有効数字 2 桁で求めよ。`,
        answer: numeric(tau, 's'),
        solution: [
          '回路の式 $E = RI + \\dfrac{q}{C}$、$I = \\dfrac{dq}{dt}$ を解くと $q = CE(1 - e^{-t/RC})$ となり、時定数は $\\tau = RC$。',
          `$$\\tau = RC = ${num(p.R)} \\times 10^3 \\times ${num(p.C)} \\times 10^{-6} = ${sig(tau)}\\ \\text{s}$$`,
          '$t = \\tau$ でコンデンサーの電圧は $E(1 - e^{-1}) \\approx 0.63E$ になる。',
        ],
        sim: sim(
          p,
          '「この条件での値」の時定数 $\\tau$ を見よう。グラフで、電圧が最終値の約 63% になる時刻を読んでもよい。',
        ),
      };
    },
  },
  {
    id: 'half-time',
    title: '電圧が半分になるまでの時間',
    generate(rng) {
      const p = pickCircuit(rng);
      const t = timeConstant(p) * Math.LN2;
      return {
        statement: `${SETUP(p)}

コンデンサーの電圧が $${num(p.E / 2)}$ V（電池の起電力の半分）になる時刻 $t$ [s] を有効数字 2 桁で求めよ。必要なら $\\log_e 2 = 0.69$ を用いよ。`,
        answer: numeric(t, 's'),
        solution: [
          `コンデンサーの電圧は $V = E(1 - e^{-t/RC})$。時定数は $RC = ${sig(timeConstant(p))}$ s。`,
          '$V = E/2$ とおくと $e^{-t/RC} = \\dfrac{1}{2}$ より',
          `$$t = RC\\log_e 2 \\approx ${sig(timeConstant(p))} \\times 0.69 \\approx ${sig(t)}\\ \\text{s}$$`,
        ],
        sim: sim(
          p,
          '一時停止とコマ送りで、コンデンサーの電圧が $E/2$ になる時刻を探そう（「現在の値」と時刻表示）。',
        ),
      };
    },
  },
  {
    id: 'joule-heat',
    title: '充電の間に発生するジュール熱',
    generate(rng) {
      const p = pickCircuit(rng);
      const Q = capacitorEnergy(p, farads(p) * p.E) * 1e3; // 充電後の静電エネルギーと等しい
      return {
        statement: `${SETUP(p)}十分に時間がたつと、コンデンサーの充電が終わった。

スイッチを閉じてから充電が終わるまでに、抵抗で発生したジュール熱の総量 [mJ] を有効数字 2 桁で求めよ。`,
        answer: numeric(Q, 'mJ'),
        solution: [
          `充電後の電気量は $Q = CE$。電池がした仕事は $W = QE = CE^2$。`,
          `コンデンサーに蓄えられた静電エネルギーは $U = \\frac{1}{2}CE^2$。エネルギー保存より、残りがジュール熱になる:`,
          `$$J = CE^2 - \\frac{1}{2}CE^2 = \\frac{1}{2}CE^2 = \\frac{1}{2} \\times ${num(p.C)} \\times 10^{-6} \\times ${num(p.E)}^2 \\approx ${sig(Q)} \\times 10^{-3}\\ \\text{J}$$`,
          '抵抗値によらず、電池の仕事のちょうど半分が熱になる（抵抗値は充電の速さだけを変える）。',
        ],
        sim: sim(
          p,
          '再生して十分に時間がたったときの、エネルギーのグラフや「現在の値」のジュール熱と静電エネルギーを比べよう。',
        ),
      };
    },
  },
];
