/**
 * 粗い斜面上の運動の演習問題。正解は model.ts の関数で求める。
 * 角度は入試に合わせて 30°・45°・60° とし、三角比の値を問題文に添える。
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
  kineticCoefficient,
  returnSpeed,
  slidesFromRest,
  stopDistance,
  type InclineParams,
} from './model';

const TRIG: Record<number, { sin: string; cos: string; tan: string }> = {
  30: { sin: '\\frac{1}{2}', cos: '\\frac{\\sqrt{3}}{2}', tan: '\\frac{1}{\\sqrt{3}}' },
  45: { sin: '\\frac{\\sqrt{2}}{2}', cos: '\\frac{\\sqrt{2}}{2}', tan: '1' },
  60: { sin: '\\frac{\\sqrt{3}}{2}', cos: '\\frac{1}{2}', tan: '\\sqrt{3}' },
};

function pickAngle(rng: Rng, angles: readonly number[] = [30, 45, 60]): number {
  return pickOne(rng, angles);
}

const SETUP = (p: InclineParams, withStatic: boolean) =>
  `水平面となす角 $${p.theta}^\\circ$ の粗い斜面上で、質量 $${num(p.m)}$ kg の小物体を斜面に沿って上向きに初速 $${num(p.v0)}$ m/s で打ち出した。物体と斜面の間の動摩擦係数は $${num(p.muk)}$${withStatic ? `、静止摩擦係数は $${num(p.mu)}$` : ''} であり、重力加速度の大きさを $${num(G_ACCEL)}$ m/s² とする。`;

const UP_ACCEL = (p: InclineParams) =>
  `上昇中は重力の斜面成分 $mg\\sin\\theta$ と動摩擦力 $\\mu' mg\\cos\\theta$ がともに斜面下向きにはたらくので、加速度の大きさは $$a_1 = g(\\sin\\theta + \\mu'\\cos\\theta) = ${num(G_ACCEL)} \\times \\left(${TRIG[p.theta]!.sin} + ${num(p.muk)} \\times ${TRIG[p.theta]!.cos}\\right) \\approx ${sig(G_ACCEL * (Math.sin((p.theta * Math.PI) / 180) + p.muk * Math.cos((p.theta * Math.PI) / 180)))}\\ \\text{m/s}^2$$`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'stop-distance',
    title: '斜面を上る距離',
    generate(rng) {
      const muk = pickStep(rng, 0.1, 0.5, 0.05);
      const p: InclineParams = {
        theta: pickAngle(rng),
        muk,
        mu: Math.min(1, muk + 0.2),
        v0: pickStep(rng, 3, 8, 0.5),
        m: pickStep(rng, 0.5, 3, 0.5),
      };
      const L = stopDistance(p);
      const a1 = (p.v0 * p.v0) / (2 * L);
      return {
        statement: `${SETUP(p, false)}

物体が斜面上で一瞬静止するまでに、斜面に沿って上った距離 $L$ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(L, 'm'),
        solution: [
          UP_ACCEL(p),
          '等加速度運動の式 $0^2 - v_0^{\\,2} = -2a_1L$ より',
          `$$L = \\frac{v_0^{\\,2}}{2a_1} = \\frac{${num(p.v0)}^2}{2 \\times ${sig(a1)}} \\approx ${sig(L)}\\ \\text{m}$$`,
          '質量 $m$ は加速度に効かないので、答えは質量によらない。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の最高到達距離 $L$ を見よう。再生して止まったときの位置 $s$（打ち出した位置が原点）とも一致する。',
        },
      };
    },
  },
  {
    id: 'return-speed',
    title: '戻ってきたときの速さ',
    generate(rng) {
      const theta = pickAngle(rng, [45, 60]);
      const muk = pickStep(rng, 0.1, 0.4, 0.05);
      const p: InclineParams = {
        theta,
        muk,
        mu: Math.min(0.9, muk + 0.1), // tan θ ≥ 1 > μ なので最高点から滑り降りる
        v0: pickStep(rng, 3, 8, 0.5),
        m: pickStep(rng, 0.5, 3, 0.5),
      };
      const th = (theta * Math.PI) / 180;
      const v = returnSpeed(p);
      const a2 = G_ACCEL * (Math.sin(th) - muk * Math.cos(th));
      return {
        statement: `${SETUP(p, true)}物体は斜面上で一瞬静止したのち、斜面を滑り降りてきた。

物体が打ち出した位置まで戻ってきたときの速さ $v$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          UP_ACCEL(p),
          `上った距離は $L = v_0^{\\,2}/(2a_1) \\approx ${sig(stopDistance(p))}$ m。`,
          `$\\tan ${theta}^\\circ = ${TRIG[theta]!.tan} > \\mu = ${num(p.mu)}$ なので最高点で止まったままにならず、滑り降りる。下降中は動摩擦力が斜面上向きになるので、加速度の大きさは $$a_2 = g(\\sin\\theta - \\mu'\\cos\\theta) \\approx ${sig(a2)}\\ \\text{m/s}^2$$`,
          `$$v = \\sqrt{2a_2L} = v_0\\sqrt{\\frac{\\sin\\theta - \\mu'\\cos\\theta}{\\sin\\theta + \\mu'\\cos\\theta}} \\approx ${sig(v)}\\ \\text{m/s}$$`,
          '動摩擦力が上りでも下りでも仕事をして力学的エネルギーを減らすので、戻ってきた速さは初速より小さい。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の「出発点に戻る速さ」を見よう。v-t グラフの傾き（加速度）が上りと下りで違うことにも注目。',
        },
      };
    },
  },
  {
    id: 'heat',
    title: '摩擦による発熱',
    generate(rng) {
      const muk = pickStep(rng, 0.1, 0.5, 0.05);
      const p: InclineParams = {
        theta: pickAngle(rng),
        muk,
        mu: Math.min(1, muk + 0.3),
        v0: pickStep(rng, 3, 8, 0.5),
        m: pickStep(rng, 0.5, 3, 0.5),
      };
      const th = (p.theta * Math.PI) / 180;
      const L = stopDistance(p);
      const Q = kineticCoefficient(p) * p.m * G_ACCEL * Math.cos(th) * L;
      return {
        statement: `${SETUP(p, false)}

打ち出してから物体が斜面上で一瞬静止するまでに、動摩擦力によって発生した熱 $Q$ [J] を有効数字 2 桁で求めよ。`,
        answer: numeric(Q, 'J'),
        solution: [
          UP_ACCEL(p),
          `上った距離は $L = v_0^{\\,2}/(2a_1) \\approx ${sig(L)}$ m。`,
          '発熱は「動摩擦力の大きさ × 滑った距離」:',
          `$$Q = \\mu' mg\\cos\\theta \\times L = ${num(p.muk)} \\times ${num(p.m)} \\times ${num(G_ACCEL)} \\times ${TRIG[p.theta]!.cos} \\times ${sig(L)} \\approx ${sig(Q)}\\ \\text{J}$$`,
          `確かめ: 初めの運動エネルギー $\\frac{1}{2}mv_0^{\\,2}$ が、位置エネルギーの増加 $mgL\\sin\\theta$ と熱 $Q$ に分かれる。`,
        ],
        sim: {
          params: p,
          hint: '再生して物体が止まったとき、エネルギーのグラフや「現在の値」の摩擦による発熱を見よう。$K$ の減少分 = $U$ の増加分 + 発熱 になっている。',
        },
      };
    },
  },
  {
    id: 'slide-or-stay',
    title: '最高点で静止するか',
    generate(rng) {
      const theta = pickAngle(rng);
      const tan = Math.tan((theta * Math.PI) / 180);
      // tan θ の前後に静止摩擦係数をとる（ちょうど等しい値は避ける）
      const mu = pickStep(rng, 0.3, 1, 0.05);
      const muVal = Math.abs(mu - tan) < 0.03 ? roundTo(mu - 0.05, 0.01) : mu;
      const muk = pickStep(rng, 0.1, Math.min(muVal, 0.5), 0.05);
      const p: InclineParams = { theta, mu: muVal, muk, v0: pickStep(rng, 2, 6, 0.5), m: 1 };
      const slides = slidesFromRest(p);
      const yes = '最高点から斜面を滑り降りる';
      const no = '最高点で静止したままになる';
      return {
        statement: `${SETUP(p, true)}

物体は斜面上で一瞬静止した。その後の物体の運動として正しいものを選べ。`,
        answer: choice(rng, slides ? yes : no, slides ? no : yes, '斜面を再び上り始める'),
        solution: [
          '静止した物体には、重力の斜面成分 $mg\\sin\\theta$（斜面下向き）と静止摩擦力がはたらく。静止摩擦力の最大値は $\\mu mg\\cos\\theta$。',
          '$mg\\sin\\theta > \\mu mg\\cos\\theta$、つまり $\\tan\\theta > \\mu$ なら静止摩擦力では支えきれず滑り出す。',
          `$\\tan ${theta}^\\circ = ${TRIG[theta]!.tan} \\approx ${sig(tan)}$、$\\mu = ${num(p.mu)}$ なので、${slides ? '$\\tan\\theta > \\mu$ となり、滑り降りる' : '$\\tan\\theta \\le \\mu$ となり、静止したままになる'}。`,
          "判定に使うのは静止摩擦係数 $\\mu$（動摩擦係数 $\\mu'$ ではない）。",
        ],
        sim: {
          params: p,
          hint: '再生して、最高点で止まったあとに物体が滑り降りるかどうかを見よう。「この条件での値」の摩擦角 $\\theta_0$（$\\tan\\theta_0 = \\mu$）と傾斜角を比べてもよい。',
        },
        given: { slides: slides ? 1 : 0 },
      };
    },
  },
];
