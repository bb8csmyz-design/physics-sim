/**
 * レンズによる像の演習問題。距離は問題文では cm で示し、シミュレーションのスライダーは m で渡す。
 * 正解は model.ts の imageDistance / magnification / imageKind で求める。
 */
import { choice, numeric, pickOne, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import { imageDistance, imageKind, magnification, type LensKind, type LensParams } from './model';

/** 焦点距離と物体の位置 [cm]（整数）。a = f は像ができないので避ける */
function pickDistances(rng: Rng, region: 'beyond' | 'inside' | 'any'): { F: number; a: number } {
  const F = pickStep(rng, 5, 20, 1);
  let a: number;
  do {
    a =
      region === 'beyond'
        ? pickStep(rng, F + 2, Math.min(50, 4 * F), 1)
        : region === 'inside'
          ? pickStep(rng, 2, F - 2, 1)
          : pickStep(rng, 2, 50, 1);
  } while (a === F || a === 2 * F); // 焦点上（像ができない）と等倍（拡大でも縮小でもない）は避ける
  return { F, a };
}

const params = (F: number, a: number): LensParams => ({
  F: F / 100,
  a0: a / 100,
  h: 0.05,
  v: 0,
});

const LENS_NAME: Record<LensKind, string> = { convex: '凸レンズ', concave: '凹レンズ' };

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'convex-real-image',
    title: '凸レンズの実像の位置',
    generate(rng) {
      const { F, a } = pickDistances(rng, 'beyond');
      const p = params(F, a);
      const b = imageDistance('convex', p.a0, p) * 100;
      return {
        statement: `焦点距離 $${F}$ cm の凸レンズの前方（左側）$${a}$ cm の位置に、光軸に垂直に物体を置いた。

レンズの後方にできる像の、レンズからの距離 $b$ [cm] を有効数字 2 桁で求めよ。`,
        answer: numeric(b, 'cm'),
        solution: [
          'レンズの式 $\\dfrac{1}{a} + \\dfrac{1}{b} = \\dfrac{1}{f}$（凸レンズは $f > 0$）に代入する。',
          `$$\\frac{1}{b} = \\frac{1}{${F}} - \\frac{1}{${a}} \\quad\\Longrightarrow\\quad b = \\frac{af}{a - f} = \\frac{${a} \\times ${F}}{${a} - ${F}} \\approx ${sig(b)}\\ \\text{cm}$$`,
          '$b > 0$ なので、レンズの後方に倒立の実像ができる。',
        ],
        sim: {
          params: p,
          choices: { kind: 'convex' },
          hint: '「現在の値」の像の位置 $b$（単位は m）を見よう。作図の 3 本の光線が 1 点に集まるところが像。',
        },
      };
    },
  },
  {
    id: 'magnification',
    title: '像の倍率',
    generate(rng) {
      const virtual = rng.uniform() < 0.4;
      const { F, a } = pickDistances(rng, virtual ? 'inside' : 'beyond');
      const p = params(F, a);
      const m = magnification('convex', p.a0, p);
      const b = imageDistance('convex', p.a0, p) * 100;
      return {
        statement: `焦点距離 $${F}$ cm の凸レンズの前方 $${a}$ cm の位置に、光軸に垂直に物体を置いた。

できる像の倍率（像の大きさ ÷ 物体の大きさ）を有効数字 2 桁で求めよ。`,
        answer: numeric(m, '倍'),
        solution: [
          `レンズの式 $\\dfrac{1}{${a}} + \\dfrac{1}{b} = \\dfrac{1}{${F}}$ より $b = \\dfrac{af}{a - f} \\approx ${sig(b)}$ cm。`,
          virtual
            ? '$b < 0$ なので、物体と同じ側に正立の虚像ができる（虫めがね）。'
            : '$b > 0$ なので、レンズの後方に倒立の実像ができる。',
          `$$m = \\frac{|b|}{a} = \\frac{${sig(Math.abs(b))}}{${a}} \\approx ${sig(m)}$$`,
        ],
        sim: {
          params: p,
          choices: { kind: 'convex' },
          hint: '「現在の値」の倍率 $m$ と像の種類を見よう。物体と像の矢印の大きさを比べてもよい。',
        },
      };
    },
  },
  {
    id: 'concave-image',
    title: '凹レンズの虚像',
    generate(rng) {
      const { F, a } = pickDistances(rng, 'any');
      const p = params(F, a);
      const b = imageDistance('concave', p.a0, p) * 100; // 負（虚像）
      return {
        statement: `焦点距離 $${F}$ cm の凹レンズの前方（左側）$${a}$ cm の位置に、光軸に垂直に物体を置いた。

できる像は、レンズからどちら側に何 cm の位置にできるか。レンズの前方（物体と同じ側）にできるときは負の値で、レンズからの距離 $b$ [cm] を有効数字 2 桁で答えよ。`,
        answer: numeric(b, 'cm'),
        solution: [
          '凹レンズでは焦点距離を負として $f = -' + F + '$ cm をレンズの式に入れる。',
          `$$\\frac{1}{${a}} + \\frac{1}{b} = -\\frac{1}{${F}} \\quad\\Longrightarrow\\quad b = -\\frac{af}{a + f}\\Big|_{f = ${F}} = -\\frac{${a} \\times ${F}}{${a} + ${F}} \\approx ${sig(b)}\\ \\text{cm}$$`,
          '凹レンズの像は、物体の位置によらずいつもレンズの前方（焦点の内側）にできる、正立で縮小された虚像。',
        ],
        sim: {
          params: p,
          choices: { kind: 'concave' },
          hint: '「現在の値」の像の位置 $b$（m、負なら虚像）を見よう。レンズを出た光線を逆向きにのばした点線が交わるところが虚像。',
        },
      };
    },
  },
  {
    id: 'image-type',
    title: '像の種類の判定',
    generate(rng) {
      const kind = pickOne(rng, ['convex', 'convex', 'concave'] as const);
      const { F, a } = pickDistances(rng, 'any');
      const p = params(F, a);
      const real = imageKind(kind, p.a0, p) === 'real';
      const m = magnification(kind, p.a0, p);
      const size = m > 1 ? '拡大' : '縮小';
      const correct = real ? `倒立の実像（${size}）` : `正立の虚像（${size}）`;
      const all = [
        '倒立の実像（拡大）',
        '倒立の実像（縮小）',
        '正立の虚像（拡大）',
        '正立の虚像（縮小）',
      ];
      return {
        statement: `焦点距離 $${F}$ cm の${LENS_NAME[kind]}の前方 $${a}$ cm の位置に、光軸に垂直に物体を置いた。

できる像として正しいものを選べ。`,
        answer: choice(rng, correct, ...all.filter((x) => x !== correct)),
        solution: [
          kind === 'convex'
            ? `凸レンズでは、物体が焦点より外側（$a > f$）なら倒立の実像、内側（$a < f$）なら正立の虚像ができる。$a = ${a}$ cm、$f = ${F}$ cm なので${a > F ? '外側' : '内側'}。`
            : '凹レンズでは、物体の位置によらず正立で縮小された虚像ができる。',
          `レンズの式から $b \\approx ${sig(imageDistance(kind, p.a0, p) * 100)}$ cm、倍率は $|b|/a \\approx ${sig(m)}$ で${size}。`,
          kind === 'convex' && a > F
            ? '凸レンズの実像は、$a > 2f$ なら縮小、$f < a < 2f$ なら拡大になる。'
            : kind === 'convex'
              ? '焦点の内側に置くと、虫めがねのように拡大された虚像が見える。'
              : '凹レンズは光を広げるので、実像を結ぶことはない。',
        ],
        sim: {
          params: p,
          choices: { kind },
          hint: '「現在の値」の像の種類と倍率を見よう。物体の位置を動かして、像の種類が切りかわる位置（焦点）を確かめよう。',
        },
        given: { real: real ? 1 : 0, m },
      };
    },
  },
];
