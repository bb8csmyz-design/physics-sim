/**
 * ボーアの水素原子模型の演習問題。問題文では入試の慣例どおり E_n = −13.6Z²/n² eV、
 * 光子のエネルギー [eV] = 1240 / 波長 [nm] を与える（正解は CODATA の定数から model.ts で求める）。
 */
import { num, numeric, pickInt, pickOne, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import { BOHR_RADIUS, orbitRadius, seriesName, transition, type BohrParams } from './model';

const ATOM: Record<number, string> = {
  1: '水素原子',
  2: 'ヘリウムイオン He⁺',
  3: 'リチウムイオン Li²⁺',
};
const LEVELS = (Z: number) =>
  Z === 1
    ? '水素原子のエネルギー準位は $E_n = -\\dfrac{13.6}{n^2}$ eV（$n = 1, 2, 3, \\dots$）である。'
    : `電子を 1 個だけもつ原子番号 $Z$ のイオンのエネルギー準位は $E_n = -\\dfrac{13.6Z^2}{n^2}$ eV（$n = 1, 2, 3, \\dots$）である。`;
const HC =
  '光子のエネルギー $E$ [eV] と波長 $\\lambda$ [nm] の間には $E = \\dfrac{1240}{\\lambda}$ の関係がある。';

/** 放出の遷移 n → n'（n > n'） */
function pickEmission(rng: Rng, Z: number): BohrParams {
  const nf = pickInt(rng, 1, 3);
  const n = pickInt(rng, nf + 1, Math.min(7, nf + 4));
  return { Z, n, nf };
}

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'photon-energy',
    title: '放出される光子のエネルギー',
    generate(rng) {
      const Z = pickOne(rng, [1, 1, 2]);
      const p = pickEmission(rng, Z);
      const E = transition(p).energyEV;
      return {
        statement: `${ATOM[Z]}の電子が、量子数 $n = ${p.n}$ の状態から $n = ${p.nf}$ の状態に移るときに光子を 1 個放出した。${LEVELS(Z)}

放出された光子のエネルギー [eV] を有効数字 2 桁で求めよ。`,
        answer: numeric(E, 'eV'),
        solution: [
          'ボーアの振動数条件: 放出される光子のエネルギーは、2 つの準位のエネルギーの差に等しい。',
          `$$h\\nu = E_{${p.n}} - E_{${p.nf}} = 13.6 \\times ${Z * Z}\\left(\\frac{1}{${p.nf}^2} - \\frac{1}{${p.n}^2}\\right) \\approx ${sig(E)}\\ \\text{eV}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の光子のエネルギー $h\\nu$ と、2 つの準位のエネルギーを見よう。',
        },
      };
    },
  },
  {
    id: 'wavelength',
    title: 'スペクトル線の波長',
    generate(rng) {
      const nf = pickOne(rng, [1, 2, 2, 3]);
      const n = pickInt(rng, nf + 1, Math.min(7, nf + 4));
      const p: BohrParams = { Z: 1, n, nf };
      const t = transition(p);
      return {
        statement: `水素原子の電子が $n = ${n}$ の状態から $n = ${nf}$ の状態に移るときに出る光（${seriesName(nf)}の 1 本）を考える。${LEVELS(1)}${HC}

この光の波長 [nm] を有効数字 2 桁で求めよ。`,
        answer: numeric(t.wavelengthNm, 'nm'),
        solution: [
          `光子のエネルギーは $E_{${n}} - E_{${nf}} = 13.6\\left(\\dfrac{1}{${nf}^2} - \\dfrac{1}{${n}^2}\\right) \\approx ${sig(t.energyEV)}$ eV。`,
          `$$\\lambda = \\frac{1240}{${sig(t.energyEV)}} \\approx ${sig(t.wavelengthNm)}\\ \\text{nm}$$`,
          nf === 2
            ? 'バルマー系列は可視光を含む（$n = 3 \\to 2$ の赤い光 656 nm など）。'
            : nf === 1
              ? 'ライマン系列はすべて紫外線。'
              : 'パッシェン系列はすべて赤外線。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の光の波長を見よう。画面の光子の色（可視光なら実際の色）も確かめよう。',
        },
      };
    },
  },
  {
    id: 'orbit-radius',
    title: '軌道半径',
    generate(rng) {
      const Z = pickOne(rng, [1, 1, 2, 3]);
      const n = pickInt(rng, 1, 5);
      const r = orbitRadius(Z, n) * 1e9;
      return {
        statement: `ボーアの模型で、${ATOM[Z]}の電子が量子数 $n = ${n}$ の軌道を回っている。水素原子の $n = 1$ の軌道半径（ボーア半径）を $${num(BOHR_RADIUS * 1e9, 4)}$ nm とする。

この軌道の半径 [nm] を有効数字 2 桁で求めよ。`,
        answer: numeric(r, 'nm'),
        solution: [
          '量子条件 $mvr = n\\dfrac{h}{2\\pi}$ と円運動の運動方程式 $m\\dfrac{v^2}{r} = k\\dfrac{Ze^2}{r^2}$ から $v$ を消去すると $r_n = \\dfrac{n^2h^2}{4\\pi^2kmZe^2}$。',
          `軌道半径は $\\dfrac{n^2}{Z}$ に比例するので $$r = ${num(BOHR_RADIUS * 1e9, 4)} \\times \\frac{${n}^2}{${Z}} \\approx ${sig(r)}\\ \\text{nm}$$`,
        ],
        sim: {
          params: { Z, n, nf: n === 1 ? 2 : 1 },
          hint: '「現在の値」の軌道半径（はじめの準位のときの値）を見よう。',
        },
        given: { Z, n },
      };
    },
  },
  {
    id: 'line-count',
    title: '放出されうるスペクトル線の数',
    generate(rng) {
      const n = pickInt(rng, 3, 6);
      const count = (n * (n - 1)) / 2;
      return {
        statement: `多数の水素原子が、量子数 $n = ${n}$ の励起状態にある。これらの原子が光子を放出しながら、いろいろな経路で基底状態（$n = 1$）まで移っていく。

このとき観測されうるスペクトル線は、最大で何本か。`,
        answer: numeric(count, '本', { integer: true }),
        solution: [
          `放出される光子のエネルギーは、$1$ から $${n}$ までの準位のうち 2 つの組み合わせの差で決まる。どの 2 つの組も遷移として起こりうる。`,
          `$${n}$ 個の準位から 2 つを選ぶ組み合わせの数は $$_{${n}}\\mathrm{C}_2 = \\frac{${n} \\times ${n - 1}}{2} = ${count}$$`,
        ],
        sim: {
          params: { Z: 1, n, nf: 1 },
          hint: `移った後の準位 $n'$ を 1 〜 ${n - 1} に変えて、それぞれの光の波長を確かめよう。はじめの準位を下げた場合も数えると ${count} 通りになる。`,
        },
        given: { n },
      };
    },
  },
];
