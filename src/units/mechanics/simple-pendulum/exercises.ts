/**
 * 単振り子の演習問題。正解は model.ts の関数（周期の公式・エネルギー保存・円運動の運動方程式）で求める。
 */
import {
  choice,
  num,
  numeric,
  pickOne,
  pickStep,
  sig,
  type ExerciseTemplate,
} from '@/core/exercise';
import { G_ACCEL } from '@/core/physics/constants';
import { bottomSpeed, bottomTension, smallAnglePeriod, type PendulumParams } from './model';

const g = num(G_ACCEL);
const COS: Record<number, string> = { 30: '\\frac{\\sqrt{3}}{2}', 60: '\\frac{1}{2}', 90: '0' };

const SETUP = (p: PendulumParams) =>
  `長さ $${num(p.L)}$ m の軽い糸の一端を天井に固定し、他端に質量 $${num(p.m)}$ kg の小さなおもりをつけた。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'period',
    title: '単振り子の周期',
    generate(rng) {
      const p: PendulumParams = {
        L: pickStep(rng, 0.3, 2, 0.1),
        theta0: pickOne(rng, [3, 4, 5]),
        m: pickStep(rng, 0.1, 1, 0.1),
      };
      const T = smallAnglePeriod(p);
      return {
        statement: `${SETUP(p)}糸が鉛直と $${p.theta0}^\\circ$ の角をなす位置でおもりを静かに放すと、おもりは鉛直面内で小さく振動した。重力加速度の大きさを $${g}$ m/s² とする。

この振動の周期 $T$ [s] を有効数字 2 桁で求めよ。`,
        answer: numeric(T, 's'),
        solution: [
          '振れ角 $\\theta$ が小さいとき、接線方向の力は $-mg\\sin\\theta \\approx -mg\\theta = -\\dfrac{mg}{L}x$（$x = L\\theta$ は最下点からの弧の長さ）。復元力が変位に比例するので単振動になる。',
          `$$T = 2\\pi\\sqrt{\\frac{L}{g}} = 2\\pi\\sqrt{\\frac{${num(p.L)}}{${g}}} \\approx ${sig(T)}\\ \\text{s}$$`,
          '周期はおもりの質量や（小さい）振れ角によらない（振り子の等時性）。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の周期の公式と厳密な周期を比べよう。振れ角が小さいので、ずれは 0.1% 未満。振れ角を大きくするとずれが増える。',
        },
      };
    },
  },
  {
    id: 'bottom-speed',
    title: '最下点での速さ',
    generate(rng) {
      const p: PendulumParams = {
        L: pickStep(rng, 0.3, 2, 0.1),
        theta0: pickOne(rng, [30, 60, 90]),
        m: pickStep(rng, 0.1, 1, 0.1),
      };
      const v = bottomSpeed(p);
      return {
        statement: `${SETUP(p)}糸がたるまないようにして、糸が鉛直と $${p.theta0}^\\circ$ の角をなす位置からおもりを静かに放した。重力加速度の大きさを $${g}$ m/s² とする。

おもりが最下点を通過するときの速さ $v$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          `放した位置は最下点より $h = L(1 - \\cos\\theta_0) = ${num(p.L)} \\times (1 - ${COS[p.theta0]})$ m だけ高い。`,
          '張力は常に速度と垂直で仕事をしないので、力学的エネルギーが保存される: $mgh = \\frac{1}{2}mv^2$',
          `$$v = \\sqrt{2gL(1 - \\cos\\theta_0)} \\approx ${sig(v)}\\ \\text{m/s}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の最下点での速さを見よう。再生して振れ角が 0 になる瞬間の「現在の値」の速度とも一致する。',
        },
      };
    },
  },
  {
    id: 'bottom-tension',
    title: '最下点での糸の張力',
    generate(rng) {
      const p: PendulumParams = {
        L: pickStep(rng, 0.3, 2, 0.1),
        theta0: pickOne(rng, [30, 60, 90]),
        m: pickStep(rng, 0.1, 2, 0.1),
      };
      const T = bottomTension(p);
      return {
        statement: `${SETUP(p)}糸がたるまないようにして、糸が鉛直と $${p.theta0}^\\circ$ の角をなす位置からおもりを静かに放した。重力加速度の大きさを $${g}$ m/s² とする。

おもりが最下点を通過するときの糸の張力の大きさ $T$ [N] を有効数字 2 桁で求めよ。`,
        answer: numeric(T, 'N'),
        solution: [
          '力学的エネルギー保存より、最下点での速さは $v^2 = 2gL(1 - \\cos\\theta_0)$。',
          '最下点でおもりは半径 $L$ の円運動をしている。中心方向（上向き）の運動方程式は',
          '$$m\\frac{v^2}{L} = T - mg$$',
          `$$T = mg + m\\frac{v^2}{L} = mg(3 - 2\\cos\\theta_0) = ${num(p.m)} \\times ${g} \\times (3 - 2 \\times ${COS[p.theta0]}) \\approx ${sig(T)}\\ \\text{N}$$`,
          '張力は重力 $mg$ より大きい。糸の長さ $L$ によらないことにも注目。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の最下点での張力を見よう。糸の長さ $L$ を変えても値が変わらないことを確かめよう。',
        },
      };
    },
  },
  {
    id: 'period-scaling',
    title: '周期を変えるには',
    generate(rng) {
      const kind = pickOne(rng, ['length4', 'length9', 'mass'] as const);
      const L = kind === 'length9' ? 0.2 : pickStep(rng, 0.2, 0.5, 0.1);
      const m = pickStep(rng, 0.1, 1, 0.1);
      const factor = kind === 'length9' ? 9 : kind === 'length4' ? 4 : 2;
      const sim: PendulumParams =
        kind === 'mass'
          ? { L, theta0: 5, m: Number((m * 2).toFixed(1)) }
          : { L: Number((L * factor).toFixed(1)), theta0: 5, m };
      const change = kind === 'mass' ? 'おもりの質量だけを 2 倍' : `糸の長さだけを ${factor} 倍`;
      const correct = kind === 'mass' ? '変わらない' : `$${Math.sqrt(factor)}$ 倍`;
      const wrong =
        kind === 'mass'
          ? ['$\\sqrt{2}$ 倍', '$2$ 倍', '$\\dfrac{1}{\\sqrt{2}}$ 倍']
          : [`$${factor}$ 倍`, `$\\dfrac{1}{${Math.sqrt(factor)}}$ 倍`, '変わらない'];
      return {
        statement: `${SETUP({ L, theta0: 5, m })}おもりを小さく振らせると、単振り子の周期は $T$ であった。

${change}にして同じように小さく振らせると、周期は $T$ の何倍になるか。`,
        answer: choice(rng, correct, ...wrong),
        solution: [
          '振れ角が小さいとき、単振り子の周期は $T = 2\\pi\\sqrt{L/g}$ で、おもりの質量によらない。',
          kind === 'mass'
            ? '質量を変えても周期は変わらない（重力も慣性も質量に比例するため打ち消し合う）。'
            : `$T \\propto \\sqrt{L}$ なので、糸の長さを ${factor} 倍にすると周期は $\\sqrt{${factor}} = ${Math.sqrt(factor)}$ 倍になる。`,
        ],
        sim: {
          params: sim,
          hint:
            kind === 'mass'
              ? `いまは変更後の条件（$m = ${num(sim.m)}$ kg）。質量のスライダーを ${num(m)} kg に戻して、「この条件での値」の周期が変わらないことを確かめよう。`
              : `いまは変更後の条件（$L = ${num(sim.L)}$ m）。糸の長さを ${num(L)} m に戻して、「この条件での値」の周期を比べよう。`,
        },
        given: { L, m, ratio: kind === 'mass' ? 1 : Math.sqrt(factor) },
      };
    },
  },
];
