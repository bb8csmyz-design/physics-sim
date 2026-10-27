/**
 * 鉛直面内の円運動の演習問題。正解は model.ts の関数（エネルギー保存と中心方向の運動方程式）で求める。
 */
import {
  choice,
  num,
  numeric,
  pickOne,
  pickStep,
  roundTo,
  sig,
  type ExerciseTemplate,
} from '@/core/exercise';
import { G_ACCEL } from '@/core/physics/constants';
import type { Rng } from '@/core/random';
import {
  loopSpeed,
  motionKind,
  slackPoint,
  swingSpeed,
  topTension,
  type CircleParams,
} from './model';

const g = num(G_ACCEL);

const SETUP = (p: { r: number; m: number }) =>
  `長さ $${num(p.r)}$ m の軽い糸の一端を点 O に固定し、他端に質量 $${num(p.m)}$ kg の小球をつけた。小球が O の真下（最下点）にあるとき、水平方向に初速を与えたところ、小球は鉛直面内で O を中心とする円運動を始めた。重力加速度の大きさを $${g}$ m/s² とする。`;

/** v₀ を [lo, hi] の内側から選ぶ（境界ちょうどの値は避け、刻み 0.1 に乗せる） */
function pickBetween(rng: Rng, lo: number, hi: number): number {
  const a = Math.ceil((lo + 0.15) * 10) / 10;
  const b = Math.floor((Math.min(hi, 10) - 0.15) * 10) / 10;
  return pickStep(rng, a, Math.max(a, b), 0.1);
}

const KIND_LABEL = {
  loop: '糸がたるまずに 1 回転する',
  swing: '糸がたるまずに最下点の両側を往復する',
  slack: '途中で糸がたるみ、小球は放物運動をする',
} as const;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'loop-speed',
    title: '1 回転するための初速',
    generate(rng) {
      const r = pickStep(rng, 0.3, 2, 0.1);
      const m = pickStep(rng, 0.1, 1, 0.1);
      const vmin = loopSpeed({ r, m, v0: 0 });
      // 答え合わせ: 最小の速さより少しだけ大きい初速（刻み 0.1）にする
      const v0 = Math.min(10, roundTo(Math.ceil(vmin * 10 + 1e-9) / 10, 0.1));
      return {
        statement: `${SETUP({ r, m })}

小球が糸をたるませることなく 1 回転するために、最下点で与える初速の大きさ $v_0$ が満たすべき最小値 [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(vmin, 'm/s'),
        solution: [
          '最高点での速さを $v$、張力を $T$ とする。力学的エネルギー保存より $\\frac{1}{2}mv_0^{\\,2} = \\frac{1}{2}mv^2 + mg \\cdot 2r$。',
          '最高点での中心方向（下向き）の運動方程式は $m\\dfrac{v^2}{r} = T + mg$。糸がたるまない条件は $T \\ge 0$、つまり $v^2 \\ge gr$。',
          `$$v_0^{\\,2} = v^2 + 4gr \\ge 5gr \\quad\\Longrightarrow\\quad v_0 \\ge \\sqrt{5gr} = \\sqrt{5 \\times ${g} \\times ${num(r)}} \\approx ${sig(vmin)}\\ \\text{m/s}$$`,
          '「最高点で速さが 0 でもよい」と考えて $\\sqrt{4gr}$ とするのは誤り。糸は押せないので、最高点でも重力だけで円運動を続けられる速さが必要。',
        ],
        sim: {
          params: { r, v0, m },
          hint: `初速を最小値よりわずかに大きい $${num(v0)}$ m/s にしてある。再生して 1 回転することを確かめたあと、初速を少し下げると途中で糸がたるむことを確かめよう。`,
        },
        given: { v0Loop: v0 },
      };
    },
  },
  {
    id: 'top-tension',
    title: '最高点での張力',
    generate(rng) {
      const r = pickStep(rng, 0.3, 1.5, 0.1);
      const m = pickStep(rng, 0.1, 1, 0.1);
      const v0 = pickBetween(rng, loopSpeed({ r, m, v0: 0 }) + 0.3, 10);
      const p: CircleParams = { r, m, v0 };
      const T = topTension(p);
      return {
        statement: `${SETUP(p).replace('水平方向に初速を与えた', `水平方向に初速 $${num(v0)}$ m/s を与えた`)}

小球が円の最高点を通過するときの糸の張力の大きさ $T$ [N] を有効数字 2 桁で求めよ。`,
        answer: numeric(T, 'N'),
        solution: [
          '力学的エネルギー保存より、最高点での速さ $v$ は $v^2 = v_0^{\\,2} - 4gr$。',
          '最高点での中心方向（下向き）の運動方程式 $m\\dfrac{v^2}{r} = T + mg$ より',
          `$$T = m\\frac{v_0^{\\,2} - 4gr}{r} - mg = m\\left(\\frac{v_0^{\\,2}}{r} - 5g\\right) = ${num(m)} \\times \\left(\\frac{${num(v0)}^2}{${num(r)}} - 5 \\times ${g}\\right) \\approx ${sig(T)}\\ \\text{N}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の最高点での張力を見よう。再生して小球が真上を通るとき、「現在の値」の張力もこの値になる。',
        },
      };
    },
  },
  {
    id: 'slack-height',
    title: '糸がたるむ高さ',
    generate(rng) {
      const r = pickStep(rng, 0.5, 2, 0.1);
      const m = pickStep(rng, 0.1, 1, 0.1);
      const p0 = { r, m, v0: 0 };
      const v0 = pickBetween(rng, swingSpeed(p0), loopSpeed(p0));
      const p: CircleParams = { r, m, v0 };
      const q = slackPoint(p)!;
      const cos = 1 - q.height / r;
      return {
        statement: `${SETUP(p).replace('水平方向に初速を与えた', `水平方向に初速 $${num(v0)}$ m/s を与えた`)}小球は円周上を上っていき、ある点で糸がたるんだ。

糸がたるんだ点の、最下点からの高さ $h$ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(q.height, 'm'),
        solution: [
          '糸と鉛直下向きのなす角が $\\theta$ の点で、速さを $v$、張力を $T$ とする。高さは $h = r(1 - \\cos\\theta)$。',
          'エネルギー保存: $v^2 = v_0^{\\,2} - 2gr(1 - \\cos\\theta)$。中心方向の運動方程式: $m\\dfrac{v^2}{r} = T + mg\\cos(\\pi - \\theta) = T - mg\\cos\\theta$。',
          '糸がたるむのは $T = 0$ になるとき。$v^2 = -gr\\cos\\theta$ をエネルギー保存の式に代入して',
          `$$\\cos\\theta = -\\frac{v_0^{\\,2} - 2gr}{3gr} \\approx ${sig(cos)}, \\qquad h = r(1 - \\cos\\theta) \\approx ${sig(q.height)}\\ \\text{m}$$`,
          `$\\sqrt{2gr} < v_0 < \\sqrt{5gr}$ のとき、円の中心より高い位置（$r < h < 2r$）で糸がたるむ。`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の「糸がたるむ高さ」を見よう。再生すると、張力が 0 になった点から放物運動に変わる様子がわかる。',
        },
      };
    },
  },
  {
    id: 'motion-kind',
    title: '運動のようすの判定',
    generate(rng) {
      const r = pickStep(rng, 0.3, 1.5, 0.1);
      const m = pickStep(rng, 0.1, 1, 0.1);
      const p0 = { r, m, v0: 0 };
      const kind = pickOne(rng, ['loop', 'swing', 'slack'] as const);
      const v0 =
        kind === 'loop'
          ? pickBetween(rng, loopSpeed(p0), 10)
          : kind === 'swing'
            ? pickBetween(rng, 0.3, swingSpeed(p0))
            : pickBetween(rng, swingSpeed(p0), loopSpeed(p0));
      const p: CircleParams = { r, m, v0 };
      const actual = motionKind(p) as keyof typeof KIND_LABEL;
      return {
        statement: `${SETUP(p)
          .replace('水平方向に初速を与えた', `水平方向に初速 $${num(v0)}$ m/s を与えた`)
          .replace('小球は鉛直面内で O を中心とする円運動を始めた', '小球は鉛直面内で運動を始めた')}

その後の小球の運動として正しいものを選べ。`,
        answer: choice(
          rng,
          KIND_LABEL[actual],
          ...(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[])
            .filter((k) => k !== actual)
            .map((k) => KIND_LABEL[k]),
        ),
        solution: [
          '最下点での初速 $v_0$ と、2 つの境目の速さを比べる。',
          `1 回転する条件（最高点で張力 $\\ge 0$）: $v_0 \\ge \\sqrt{5gr} \\approx ${sig(loopSpeed(p))}$ m/s`,
          `中心の高さまでしか上がらず往復する条件（その高さで速さ 0、張力も 0）: $v_0 \\le \\sqrt{2gr} \\approx ${sig(swingSpeed(p))}$ m/s`,
          `その間では、中心より高い位置で張力が 0 になり糸がたるむ。$v_0 = ${num(v0)}$ m/s なので「${KIND_LABEL[actual]}」。`,
        ],
        sim: {
          params: p,
          hint: '再生して運動のようすを見よう。「この条件での値」の「運動の種類」と、2 つの境目の速さも確かめよう。',
        },
        given: { kind: ['loop', 'swing', 'slack'].indexOf(actual) },
      };
    },
  },
];
