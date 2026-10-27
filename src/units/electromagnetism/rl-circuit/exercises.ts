/**
 * RL 回路（コイルの自己誘導）の演習問題。答え合わせは単元の初期状態（スイッチ a・電流 0）から
 * t = 0 で動かす。正解は model.ts の関数で求める。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import { coilEnergy, henries, timeConstant, type RlParams } from './model';

function pickCircuit(rng: Rng): RlParams {
  return {
    E: pickStep(rng, 1.5, 12, 0.5),
    R: pickStep(rng, 10, 100, 1),
    L: pickStep(rng, 100, 1000, 10),
  };
}

const SETUP = (p: RlParams) =>
  `起電力 $${num(p.E)}$ V の電池（内部抵抗は無視できる）、抵抗値 $${num(p.R)}$ Ω の抵抗、自己インダクタンス $${num(p.L)}$ mH のコイル（抵抗は無視できる）、スイッチを直列につなぎ、時刻 $t = 0$ でスイッチを閉じた。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'steady-current',
    title: '十分に時間がたったときの電流',
    generate(rng) {
      const p = pickCircuit(rng);
      const I = (p.E / p.R) * 1e3;
      return {
        statement: `${SETUP(p)}

十分に時間がたったときに回路を流れる電流 [mA] を有効数字 2 桁で求めよ。`,
        answer: numeric(I, 'mA'),
        solution: [
          '十分に時間がたつと電流が一定になり、$\\dfrac{dI}{dt} = 0$ なのでコイルの自己誘導起電力は 0（コイルはただの導線と同じ）。',
          `$$I = \\frac{E}{R} = \\frac{${num(p.E)}}{${num(p.R)}} \\approx ${sig(I / 1e3)}\\ \\text{A} = ${sig(I)}\\ \\text{mA}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の十分後の電流 $E/R$ を見よう。再生すると、電流がこの値にゆっくり近づく。',
        },
      };
    },
  },
  {
    id: 'initial-rate',
    title: '閉じた直後の電流の増え方',
    generate(rng) {
      const p = pickCircuit(rng);
      const rate = p.E / henries(p);
      return {
        statement: `${SETUP(p)}

スイッチを閉じた直後の、電流の時間変化の割合 $\\dfrac{\\Delta I}{\\Delta t}$ [A/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(rate, 'A/s'),
        solution: [
          '閉じた直後は電流が 0 なので抵抗の電圧も 0。電池の電圧はすべてコイルの自己誘導起電力とつりあう: $E = L\\dfrac{\\Delta I}{\\Delta t}$。',
          `$$\\frac{\\Delta I}{\\Delta t} = \\frac{E}{L} = \\frac{${num(p.E)}}{${num(p.L)} \\times 10^{-3}} \\approx ${sig(rate)}\\ \\text{A/s}$$`,
          'コイルは電流の急な変化を妨げるので、電流は 0 から連続的に増え始める。',
        ],
        sim: {
          params: p,
          hint: '電流のグラフの $t = 0$ での傾きを見よう。閉じた直後はコイルの電圧が $E$ に等しい（「現在の値」）。',
        },
      };
    },
  },
  {
    id: 'time-constant',
    title: '時定数',
    generate(rng) {
      const p = pickCircuit(rng);
      const tau = timeConstant(p) * 1e3;
      return {
        statement: `${SETUP(p)}電流は $I = \\dfrac{E}{R}(1 - e^{-t/\\tau})$ のように増えていく。

時定数 $\\tau$ [ms] を有効数字 2 桁で求めよ。`,
        answer: numeric(tau, 'ms'),
        solution: [
          '回路の式 $E = RI + L\\dfrac{dI}{dt}$ を解くと $I = \\dfrac{E}{R}(1 - e^{-Rt/L})$ となり、時定数は $\\tau = \\dfrac{L}{R}$。',
          `$$\\tau = \\frac{L}{R} = \\frac{${num(p.L)} \\times 10^{-3}}{${num(p.R)}} \\approx ${sig(tau / 1e3)}\\ \\text{s} = ${sig(tau)}\\ \\text{ms}$$`,
          '自己インダクタンスが大きいほど、抵抗が小さいほど、電流はゆっくり増える。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の時定数を見よう。グラフで電流が最終値の約 63% になる時刻を読んでもよい。',
        },
      };
    },
  },
  {
    id: 'coil-energy',
    title: 'コイルに蓄えられるエネルギー',
    generate(rng) {
      const p = pickCircuit(rng);
      const I = p.E / p.R;
      const U = coilEnergy(p, I) * 1e3;
      return {
        statement: `${SETUP(p)}十分に時間がたち、電流が一定になった。

このときコイルに蓄えられているエネルギー [mJ] を有効数字 2 桁で求めよ。`,
        answer: numeric(U, 'mJ'),
        solution: [
          `十分に時間がたったときの電流は $I = E/R = ${sig(I)}$ A。`,
          `$$U = \\frac{1}{2}LI^2 = \\frac{1}{2} \\times ${num(p.L)} \\times 10^{-3} \\times ${sig(I)}^2 \\approx ${sig(U)} \\times 10^{-3}\\ \\text{J}$$`,
          'このエネルギーは、電流が増える間に電池が自己誘導起電力にさからってした仕事が蓄えられたもの。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の十分後のエネルギー $LI^2/2$ を見よう。エネルギーのグラフでコイルのエネルギーがこの値に近づく。',
        },
      };
    },
  },
];
