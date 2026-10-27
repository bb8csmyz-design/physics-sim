/**
 * ばねの単振動の演習問題。正解は model.ts の関数で求め、答え合わせはスライダーを問題の条件にして行う。
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
import type { Rng } from '@/core/random';
import { amplitude, angularFrequency, period, type SpringParams } from './model';

/** 問題の条件（ばね定数と質量） */
function pickSystem(rng: Rng): { m: number; k: number } {
  return { m: pickStep(rng, 0.2, 4, 0.1), k: pickStep(rng, 5, 80, 1) };
}

const SETUP = (m: number, k: number) =>
  `なめらかな水平面上で、ばね定数 $k = ${num(k)}$ N/m の軽いばねの一端を壁に固定し、他端に質量 $m = ${num(m)}$ kg の小物体をつないだ。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'period',
    title: '周期を求める',
    generate(rng) {
      const { m, k } = pickSystem(rng);
      const x0 = pickStep(rng, 0.1, 0.4, 0.05);
      const p: SpringParams = { m, k, x0, v0: 0 };
      return {
        statement: `${SETUP(m, k)}物体をつりあいの位置から $${num(x0)}$ m だけ右に引いて静かに放したところ、物体は単振動をした。

この単振動の周期 $T$ [s] を有効数字 2 桁で求めよ。`,
        answer: numeric(period(p), 's'),
        solution: [
          '物体の変位を $x$ とすると、運動方程式は $ma = -kx$。加速度が変位に比例し逆向きなので単振動で、角振動数は $\\omega = \\sqrt{k/m}$。',
          `$$T = 2\\pi\\sqrt{\\frac{m}{k}} = 2\\pi\\sqrt{\\frac{${num(m)}}{${num(k)}}} \\approx ${sig(period(p))}\\ \\text{s}$$`,
          '周期は振幅（引いた距離）によらない（等時性）。引いた距離は答えに使わない。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の周期 $T$ と、x-t グラフで山から山までの時間を見比べよう。初期変位を変えても周期は変わらない。',
        },
      };
    },
  },
  {
    id: 'max-speed',
    title: '最大の速さ',
    generate(rng) {
      const { m, k } = pickSystem(rng);
      const x0 = pickStep(rng, 0.1, 0.5, 0.05);
      const p: SpringParams = { m, k, x0, v0: 0 };
      const w = angularFrequency(p);
      const vmax = amplitude(p) * w;
      return {
        statement: `${SETUP(m, k)}物体をつりあいの位置から $${num(x0)}$ m だけ引いて静かに放した。

物体の速さの最大値 $v_{\\max}$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(vmax, 'm/s'),
        solution: [
          `静かに放したので振幅は $A = ${num(x0)}$ m。速さはつりあいの位置で最大になる。`,
          '力学的エネルギー保存 $\\frac{1}{2}kA^2 = \\frac{1}{2}mv_{\\max}^2$ より',
          `$$v_{\\max} = A\\sqrt{\\frac{k}{m}} = A\\omega = ${num(x0)} \\times \\sqrt{\\frac{${num(k)}}{${num(m)}}} \\approx ${sig(vmax)}\\ \\text{m/s}$$`,
        ],
        sim: {
          params: p,
          hint: 'v-t グラフの山の高さ、または物体が $x = 0$ を通るときの「現在の値」の速度 $v$ を見よう。',
        },
      };
    },
  },
  {
    id: 'speed-at-position',
    title: '途中の位置での速さ',
    generate(rng) {
      const { m, k } = pickSystem(rng);
      const A = pickStep(rng, 0.2, 0.5, 0.05);
      const frac = pickOne(rng, [0.25, 0.5, 0.6, 0.8]);
      const x = A * frac;
      const p: SpringParams = { m, k, x0: A, v0: 0 };
      const w = angularFrequency(p);
      const v = w * Math.sqrt(A * A - x * x);
      return {
        statement: `${SETUP(m, k)}物体をつりあいの位置から $${num(A)}$ m だけ引いて静かに放した。

物体がつりあいの位置から $${num(x)}$ m の位置を通過するときの速さ $v$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          `振幅 $A = ${num(A)}$ m の単振動。力学的エネルギー保存より`,
          '$$\\frac{1}{2}mv^2 + \\frac{1}{2}kx^2 = \\frac{1}{2}kA^2 \\quad\\Longrightarrow\\quad v = \\sqrt{\\frac{k}{m}}\\sqrt{A^2 - x^2}$$',
          `$$v = \\sqrt{\\frac{${num(k)}}{${num(m)}}} \\times \\sqrt{${num(A)}^2 - ${num(x)}^2} \\approx ${sig(v)}\\ \\text{m/s}$$`,
        ],
        sim: {
          params: p,
          hint: `一時停止とコマ送り（→）で、変位 $x$ が $${num(x)}$ m 付近になったときの速度 $v$ を「現在の値」で読もう。`,
        },
        given: { x },
      };
    },
  },
  {
    id: 'period-scaling',
    title: '周期の変化（比例関係）',
    generate(rng) {
      const factor = pickOne(rng, [2, 4, 9]);
      const changeMass = rng.uniform() < 0.5;
      // 変更後の値もスライダーの範囲に収まるように、変更前の値を選ぶ
      const m = changeMass
        ? pickStep(rng, 0.1, Math.floor(50 / factor) / 10, 0.1)
        : pickStep(rng, 0.2, 4, 0.1);
      const k = changeMass
        ? pickStep(rng, 5, 80, 1)
        : pickStep(rng, 1, Math.floor(100 / factor), 1);
      const root = factor === 2 ? '\\sqrt{2}' : String(Math.sqrt(factor));
      const times = (x: string) => (x === '1' ? '変わらない（$1$ 倍）' : `$${x}$ 倍`);
      const up = times(root);
      const down = times(`\\dfrac{1}{${root}}`);
      const answer = changeMass
        ? choice(rng, up, times(String(factor)), down, times('1'))
        : choice(rng, down, times(`\\dfrac{1}{${factor}}`), up, times('1'));
      const sim: SpringParams = changeMass
        ? { m: Number((m * factor).toFixed(1)), k, x0: 0.2, v0: 0 }
        : { m, k: k * factor, x0: 0.2, v0: 0 };
      return {
        statement: `${SETUP(m, k)}物体を引いて静かに放すと、物体は単振動をした。

${changeMass ? `物体の質量だけを ${factor} 倍` : `ばね定数だけを ${factor} 倍`}にして同じ実験をすると、単振動の周期は元の何倍になるか。`,
        answer,
        solution: [
          '単振動の周期は $T = 2\\pi\\sqrt{m/k}$ で、振幅にはよらない。',
          changeMass
            ? `$T \\propto \\sqrt{m}$ なので、質量を ${factor} 倍にすると周期は $\\sqrt{${factor}}${factor === 2 ? '' : ` = ${root}`}$ 倍になる。`
            : `$T \\propto 1/\\sqrt{k}$ なので、ばね定数を ${factor} 倍にすると周期は $\\dfrac{1}{\\sqrt{${factor}}}${factor === 2 ? '' : ` = \\dfrac{1}{${root}}`}$ 倍になる。`,
          `元の周期は $T = 2\\pi\\sqrt{${num(m)}/${num(k)}} \\approx ${sig(period({ m, k, x0: 0.2, v0: 0 }))}$ s、変更後は $${sig(period(sim))}$ s。`,
        ],
        sim: {
          params: sim,
          hint: changeMass
            ? `いまは変更後の条件（$m = ${num(sim.m)}$ kg）。質量 $m$ のスライダーを ${num(m)} kg に戻して、「この条件での値」の周期を比べよう。`
            : `いまは変更後の条件（$k = ${num(sim.k)}$ N/m）。ばね定数 $k$ のスライダーを ${num(k)} N/m に戻して、「この条件での値」の周期を比べよう。`,
        },
        given: {
          mBefore: m,
          kBefore: k,
          ratio: changeMass ? Math.sqrt(factor) : 1 / Math.sqrt(factor),
        },
      };
    },
  },
];
