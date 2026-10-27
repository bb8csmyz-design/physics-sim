/**
 * 鉛直ばね振り子の演習問題。正解は model.ts の関数で求める。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import { G_ACCEL } from '@/core/physics/constants';
import type { Rng } from '@/core/random';
import {
  amplitude,
  angularFrequency,
  equilibriumStretch,
  period,
  type VSpringParams,
} from './model';

const g = num(G_ACCEL);

function pickSystem(rng: Rng): { m: number; k: number } {
  return { m: pickStep(rng, 0.1, 1, 0.05), k: pickStep(rng, 10, 100, 1) };
}

const SETUP = (m: number, k: number) =>
  `ばね定数 $${num(k)}$ N/m の軽いばねの上端を天井に固定し、下端に質量 $${num(m)}$ kg の小物体をつるした。重力加速度の大きさを $${g}$ m/s² とする。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'equilibrium-stretch',
    title: 'つりあいの位置でのばねの伸び',
    generate(rng) {
      const { m, k } = pickSystem(rng);
      const p: VSpringParams = { m, k, x0: 0, v0: 0 };
      const d = equilibriumStretch(p);
      return {
        statement: `${SETUP(m, k)}物体は静止してつりあった。

このときのばねの自然長からの伸び $d$ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(d, 'm'),
        solution: [
          '物体にはたらく力は、重力 $mg$（下向き）とばねの弾性力 $kd$（上向き）。つりあいの式 $kd = mg$ より',
          `$$d = \\frac{mg}{k} = \\frac{${num(m)} \\times ${g}}{${num(k)}} \\approx ${sig(d)}\\ \\text{m}$$`,
        ],
        sim: {
          params: p,
          hint: '物体はつりあいの位置で静止している。「現在の値」のばねの伸び（「この条件での値」のつりあいの伸び $d$）を見よう。',
        },
      };
    },
  },
  {
    id: 'max-stretch',
    title: 'ばねの伸びの最大値',
    generate(rng) {
      const { m, k } = pickSystem(rng);
      const A = pickStep(rng, 0.05, 0.3, 0.01);
      const p: VSpringParams = { m, k, x0: -A, v0: 0 };
      const d = equilibriumStretch(p);
      return {
        statement: `${SETUP(m, k)}物体をつりあいの位置から鉛直下向きに $${num(A)}$ m だけ引き下げて静かに放すと、物体は鉛直方向に単振動をした。

振動の間のばねの自然長からの伸びの最大値 [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(d + A, 'm'),
        solution: [
          `つりあいの位置でのばねの伸びは $d = mg/k \\approx ${sig(d)}$ m。`,
          '鉛直ばね振り子も、つりあいの位置を中心とする単振動になる（重力は振動の中心をずらすだけ）。静かに放した位置が振動の端なので、振幅は引き下げた距離に等しい。',
          `伸びが最大になるのは最下点で、$$d + A \\approx ${sig(d)} + ${num(A)} = ${sig(d + A)}\\ \\text{m}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の「最下点でのばねの伸び」を見よう。再生して最下点に来たときの「現在の値」のばねの伸びとも一致する。',
        },
      };
    },
  },
  {
    id: 'period-from-stretch',
    title: 'つりあいの伸びから周期を求める',
    generate(rng) {
      const { m, k } = pickSystem(rng);
      const p: VSpringParams = { m, k, x0: -pickStep(rng, 0.05, 0.2, 0.01), v0: 0 };
      const d = equilibriumStretch(p);
      const T = period(p);
      return {
        statement: `軽いばねの上端を天井に固定し、下端に小物体をつるすと、ばねは自然長から $${sig(d)}$ m だけ伸びてつりあった。この物体をつりあいの位置から少し引き下げて静かに放すと、物体は鉛直方向に単振動をした。重力加速度の大きさを $${g}$ m/s² とする。

この単振動の周期 $T$ [s] を有効数字 2 桁で求めよ。`,
        answer: numeric(T, 's'),
        solution: [
          'ばね定数を $k$、質量を $m$ とすると、つりあいの式は $kd = mg$。よって $\\dfrac{m}{k} = \\dfrac{d}{g}$。',
          `$$T = 2\\pi\\sqrt{\\frac{m}{k}} = 2\\pi\\sqrt{\\frac{d}{g}} = 2\\pi\\sqrt{\\frac{${sig(d)}}{${g}}} \\approx ${sig(T)}\\ \\text{s}$$`,
          '$m$ と $k$ が別々にわからなくても、つりあいの伸びから周期が決まる。',
        ],
        sim: {
          params: p,
          hint: `「この条件での値」のつりあいの伸び $d$ と周期 $T$ を見よう（この条件は $m = ${num(m)}$ kg, $k = ${num(k)}$ N/m）。$m$ と $k$ を同じ比で変えても周期は変わらない。`,
        },
      };
    },
  },
  {
    id: 'max-speed',
    title: '最大の速さ',
    generate(rng) {
      const { m, k } = pickSystem(rng);
      const A = pickStep(rng, 0.05, 0.3, 0.01);
      const p: VSpringParams = { m, k, x0: -A, v0: 0 };
      const v = amplitude(p) * angularFrequency(p);
      return {
        statement: `${SETUP(m, k)}物体をつりあいの位置から鉛直下向きに $${num(A)}$ m だけ引き下げて静かに放した。

物体の速さの最大値 [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          'つりあいの位置を中心とし、振幅 $A$（引き下げた距離）、角振動数 $\\omega = \\sqrt{k/m}$ の単振動になる。速さはつりあいの位置で最大:',
          `$$v_{\\max} = A\\omega = ${num(A)} \\times \\sqrt{\\frac{${num(k)}}{${num(m)}}} \\approx ${sig(v)}\\ \\text{m/s}$$`,
          '重力の位置エネルギーも含めた力学的エネルギー保存で解いても同じ結果になる（つりあいの位置を基準にすると、弾性エネルギーと重力の位置エネルギーの和は $\\frac{1}{2}kx^2$ + 定数）。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の最大の速さ $A\\omega$ を見よう。再生してつりあいの位置（$x = 0$）を通るときの速度とも一致する。',
        },
      };
    },
  },
];
