/**
 * 2 つの点電荷がつくる電場・電位の演習問題。問題文ではクーロンの法則の比例定数を入試の慣例どおり
 * 9.0×10⁹ N·m²/C² とする（正解は CODATA の値で求め、差 0.13% は採点の許容誤差に収まる）。
 */
import { num, numeric, pickOne, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import { TEST_CHARGE, TEST_MASS, midpointValues, potential, type FieldParams } from './model';

const K_TEXT = '9.0 \\times 10^{9}';

function pickCharges(rng: Rng): { QA: number; QB: number; d: number } {
  let QA: number;
  let QB: number;
  do {
    QA = pickStep(rng, -4, 4, 0.5);
    QB = pickStep(rng, -4, 4, 0.5);
  } while (QA === 0 || QB === 0);
  return { QA, QB, d: pickStep(rng, 0.1, 0.3, 0.02) };
}

const qText = (Q: number) => `${Q < 0 ? '-' : '+'}${num(Math.abs(Q))}`;

const SETUP = (c: { QA: number; QB: number; d: number }) =>
  `真空中で、点 A に $${qText(c.QA)}$ nC、点 B に $${qText(c.QB)}$ nC の点電荷を固定した。AB 間の距離は $${num(c.d)}$ m で、線分 AB の中点を M とする。クーロンの法則の比例定数を $${K_TEXT}$ N·m²/C² とし、電位は無限遠を基準とする。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'midpoint-field',
    title: '中点の電場の強さ',
    generate(rng) {
      const c = pickCharges(rng);
      let p: FieldParams = { ...c, x0: -0.04, y0: 0.05 };
      if (c.QA === c.QB) p = { ...p, QB: c.QB === 4 ? 3.5 : c.QB + 0.5 }; // 中点で 0 になる条件は避ける
      const E = midpointValues(p).E;
      const r = p.d / 2;
      return {
        statement: `${SETUP(p)}

点 M での電場の強さ $E$ [V/m] を有効数字 2 桁で求めよ。`,
        answer: numeric(E, 'V/m'),
        solution: [
          `A, B から M までの距離はどちらも $r = ${num(r)}$ m。A, B の電荷がそれぞれ M につくる電場の強さは $k\\dfrac{|Q|}{r^2}$ で、向きは正電荷なら電荷から遠ざかる向き、負電荷なら電荷に向かう向き。`,
          `A→B の向きを正とすると、A がつくる電場は $+k\\dfrac{Q_A}{r^2}$、B がつくる電場は $-k\\dfrac{Q_B}{r^2}$。重ね合わせて`,
          `$$E = k\\frac{|Q_A - Q_B|}{r^2} = ${K_TEXT} \\times \\frac{|${num(p.QA)} - (${num(p.QB)})| \\times 10^{-9}}{${num(r)}^2} \\approx ${sig(E)}\\ \\text{V/m}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の中点 M の電場の強さを見よう。電気力線が M 付近で密なほど電場が強い。',
        },
      };
    },
  },
  {
    id: 'midpoint-potential',
    title: '中点の電位',
    generate(rng) {
      const c = pickCharges(rng);
      let p: FieldParams = { ...c, x0: -0.04, y0: 0.05 };
      if (c.QA === -c.QB) p = { ...p, QB: c.QB + (c.QB < 4 ? 0.5 : -1) }; // 電位 0 の条件は避ける
      if (p.QB === 0) p = { ...p, QB: 1 };
      const V = midpointValues(p).V;
      const r = p.d / 2;
      return {
        statement: `${SETUP(p)}

点 M の電位 $V$ [V] を有効数字 2 桁で求めよ（負の場合は負の値で答えよ）。`,
        answer: numeric(V, 'V'),
        solution: [
          '点電荷 $Q$ から距離 $r$ の点の電位は $k\\dfrac{Q}{r}$（無限遠が基準）。電位はスカラーなので、符号をつけてそのまま足し合わせる。',
          `$$V = k\\frac{Q_A}{r} + k\\frac{Q_B}{r} = ${K_TEXT} \\times \\frac{(${num(p.QA)} + (${num(p.QB)})) \\times 10^{-9}}{${num(r)}} \\approx ${sig(V)}\\ \\text{V}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の中点 M の電位を見よう。等電位線の数値とも比べよう。',
        },
      };
    },
  },
  {
    id: 'speed-at-midpoint',
    title: '中点を通過するときの速さ',
    generate(rng) {
      const Q = pickOne(rng, [1, 1.5, 2, 2.5, 3, 4]);
      const d = pickStep(rng, 0.16, 0.3, 0.02);
      const x0 = -pickStep(rng, 0.03, Math.round((d / 2 - 0.03) * 100) / 100, 0.01);
      const p: FieldParams = { QA: Q, QB: Q, d, x0, y0: 0 };
      const dV = potential(p, x0, 0) - potential(p, 0, 0);
      const v = Math.sqrt((2 * TEST_CHARGE * dV) / TEST_MASS);
      const rA = d / 2 + x0;
      const rB = d / 2 - x0;
      return {
        statement: `なめらかな水平面上の 2 点 A, B に、どちらも $+${num(Q)}$ nC の点電荷を固定した。AB 間の距離は $${num(d)}$ m で、AB の中点を M とする。線分 AB 上で A から $${num(rA)}$ m の点 P に、質量 $${num(TEST_MASS * 1e3)}$ g、電気量 $+1.0$ nC の小球を静かに置くと、小球は M に向かって動き出した。クーロンの法則の比例定数を $${K_TEXT}$ N·m²/C² とする。

小球が M を通過するときの速さ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          `P の電位は $V_P = kQ\\left(\\dfrac{1}{${num(rA)}} + \\dfrac{1}{${num(rB)}}\\right) \\approx ${sig(potential(p, x0, 0))}$ V、M の電位は $V_M = kQ \\cdot \\dfrac{2}{${num(d / 2)}} \\approx ${sig(potential(p, 0, 0))}$ V。`,
          '静電気力は保存力なので、エネルギー保存 $qV_P = \\frac{1}{2}mv^2 + qV_M$ が成り立つ。',
          `$$v = \\sqrt{\\frac{2q(V_P - V_M)}{m}} = \\sqrt{\\frac{2 \\times 1.0 \\times 10^{-9} \\times ${sig(dV)}}{${num(TEST_MASS)}}} \\approx ${sig(v)}\\ \\text{m/s}$$`,
        ],
        sim: {
          params: p,
          hint: '再生して、小球が M（$x = 0$）を通るときの「現在の値」の速さを読もう。エネルギーの和が一定であることも確かめよう。',
        },
      };
    },
  },
];
