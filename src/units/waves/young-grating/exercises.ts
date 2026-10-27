/**
 * ヤングの実験と回折格子の演習問題。答え合わせは装置（choices.mode）とスライダーで指定する
 * （ダブルスリットは YOUNG_PARAMS、回折格子は GRATING_PARAMS）。
 * 正解は model.ts の fringeSpacing / diffractionAngle / maxOrder で求める。
 */
import { num, numeric, pickOne, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import {
  diffractionAngle,
  fringeSpacing,
  gratingConfig,
  maxOrder,
  youngConfig,
  type GratingParams,
  type YoungParams,
} from './model';

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'young-spacing',
    title: 'ヤングの実験の明線の間隔',
    generate(rng) {
      const p: YoungParams = {
        lambda: pickStep(rng, 400, 700, 10),
        d: pickStep(rng, 0.2, 1, 0.05),
        L: pickStep(rng, 1, 3, 0.1),
        n: 1,
      };
      const dx = fringeSpacing(youngConfig(p)) * 1e3;
      return {
        statement: `間隔 $${num(p.d)}$ mm の 2 本のスリット（ダブルスリット）に、波長 $${p.lambda}$ nm の単色光を垂直に当て、スリットから $${num(p.L)}$ m 離れたスクリーン上に干渉縞をつくった。

スクリーン上の隣り合う明線の間隔 $\\Delta x$ [mm] を有効数字 2 桁で求めよ。`,
        answer: numeric(dx, 'mm'),
        solution: [
          'スクリーン上の点 $x$ での 2 つのスリットからの経路差は、$x \\ll L$ のとき $\\dfrac{dx}{L}$。明線の条件は $\\dfrac{dx}{L} = m\\lambda$。',
          `$$\\Delta x = \\frac{L\\lambda}{d} = \\frac{${num(p.L)} \\times ${p.lambda} \\times 10^{-9}}{${num(p.d)} \\times 10^{-3}} \\approx ${sig(dx / 1e3)}\\ \\text{m} = ${sig(dx)}\\ \\text{mm}$$`,
          '波長が長いほど、スリットの間隔が狭いほど、縞の間隔は広がる。',
        ],
        sim: {
          params: p,
          choices: { mode: 'double' },
          hint: '「現在の値」の明線の間隔 $\\Delta x$ を見よう。スクリーンの目盛りで明線どうしの間隔を読んでもよい。',
        },
      };
    },
  },
  {
    id: 'young-medium',
    title: '水中でのヤングの実験',
    generate(rng) {
      const n = pickOne(rng, [1.33, 1.5]);
      const p: YoungParams = {
        lambda: pickStep(rng, 400, 700, 10),
        d: pickStep(rng, 0.2, 1, 0.05),
        L: pickStep(rng, 1, 3, 0.1),
        n,
      };
      const dx = fringeSpacing(youngConfig(p)) * 1e3;
      const dxAir = fringeSpacing(youngConfig({ ...p, n: 1 })) * 1e3;
      return {
        statement: `間隔 $${num(p.d)}$ mm のダブルスリットに、真空中での波長が $${p.lambda}$ nm の単色光を垂直に当て、$${num(p.L)}$ m 離れたスクリーンに干渉縞をつくった。この装置全体を屈折率 $${num(n)}$ の液体の中に入れて同じ実験をした。

液体中でのスクリーン上の明線の間隔 [mm] を有効数字 2 桁で求めよ。`,
        answer: numeric(dx, 'mm'),
        solution: [
          `屈折率 $n$ の媒質中では光の波長が $\\lambda/n$ になる（振動数は変わらない）。`,
          `$$\\Delta x' = \\frac{L}{d}\\cdot\\frac{\\lambda}{n} = \\frac{${num(p.L)} \\times ${p.lambda} \\times 10^{-9}}{${num(n)} \\times ${num(p.d)} \\times 10^{-3}} \\approx ${sig(dx)}\\ \\text{mm}$$`,
          `空気中（$\\Delta x \\approx ${sig(dxAir)}$ mm）の $1/n$ 倍に狭まる。`,
        ],
        sim: {
          params: p,
          choices: { mode: 'double' },
          hint: '「現在の値」の明線の間隔を見よう。屈折率のスライダーを 1 に戻すと、間隔が $n$ 倍に広がることを確かめよう。',
        },
      };
    },
  },
  {
    id: 'grating-angle',
    title: '回折格子の 1 次の回折角',
    generate(rng) {
      const p: GratingParams = {
        lambda: pickStep(rng, 400, 700, 10),
        lines: pickStep(rng, 200, 1000, 50),
        L: 1,
        N: 10,
      };
      const s = Math.sin(diffractionAngle(gratingConfig(p), 1));
      const d = 1e-3 / p.lines;
      return {
        statement: `1 mm あたり $${p.lines}$ 本の溝が刻まれた回折格子に、波長 $${p.lambda}$ nm の単色光を垂直に当てた。

1 次の明線が現れる方向と格子の法線とのなす角を $\\theta_1$ とするとき、$\\sin\\theta_1$ を有効数字 2 桁で求めよ。`,
        answer: numeric(s),
        solution: [
          `格子定数（溝の間隔）は $d = \\dfrac{1}{${p.lines}}$ mm $= ${sig(d * 1e6)} \\times 10^{-6}$ m。`,
          '隣り合う溝からの光の経路差は $d\\sin\\theta$ で、明線の条件は $d\\sin\\theta = m\\lambda$。',
          `$$\\sin\\theta_1 = \\frac{\\lambda}{d} = \\frac{${p.lambda} \\times 10^{-9}}{${sig(d * 1e6)} \\times 10^{-6}} \\approx ${sig(s)}$$`,
        ],
        sim: {
          params: p,
          choices: { mode: 'grating' },
          hint: '「現在の値」の 1 次の回折角 $\\theta_1$ を見て、その正弦を計算してみよう。',
        },
      };
    },
  },
  {
    id: 'grating-max-order',
    title: '回折格子で見える明線の次数',
    generate(rng) {
      let p: GratingParams;
      let ratio: number;
      do {
        p = {
          lambda: pickStep(rng, 400, 700, 10),
          lines: pickStep(rng, 200, 800, 50),
          L: 1,
          N: 10,
        };
        ratio = 1e-3 / p.lines / (p.lambda * 1e-9);
        // d/λ がほぼ整数（ちょうど 90° 方向の明線）の条件は避ける
      } while (Math.abs(ratio - Math.round(ratio)) < 0.05);
      const m = maxOrder(gratingConfig(p));
      return {
        statement: `1 mm あたり $${p.lines}$ 本の溝が刻まれた回折格子に、波長 $${p.lambda}$ nm の単色光を垂直に当てた。

格子の向こう側で観測できる明線の次数 $m$ の最大値を答えよ。`,
        answer: numeric(m, undefined, { integer: true }),
        solution: [
          '明線の条件は $d\\sin\\theta = m\\lambda$。$\\sin\\theta < 1$ でなければならないので $m < \\dfrac{d}{\\lambda}$。',
          `$$\\frac{d}{\\lambda} = \\frac{1/${p.lines}\\ \\text{mm}}{${p.lambda}\\ \\text{nm}} \\approx ${sig(ratio)}$$`,
          `よって $m$ の最大値は ${m}。中央（0 次）の両側に ${m} 次までの明線が現れ、明線は全部で ${2 * m + 1} 本。`,
        ],
        sim: {
          params: p,
          choices: { mode: 'grating' },
          hint: '「現在の値」の「現れる最大の次数」を見よう。溝の本数（格子定数）や波長を変えると最大の次数が変わる。',
        },
      };
    },
  },
];
