/**
 * 剛体のつりあい（壁に立てかけたはしご）の演習問題。はしごの長さは L = 4 m で固定。
 * 正解は model.ts の関数（力のつりあいと力のモーメントのつりあい）で求める。
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
  LADDER_LENGTH,
  inEquilibrium,
  maxClimbDistance,
  staticForces,
  type LadderParams,
} from './model';

const g = num(G_ACCEL);
const L = num(LADDER_LENGTH);
const TRIG: Record<number, { sin: string; cos: string; tan: string }> = {
  30: { sin: '\\frac{1}{2}', cos: '\\frac{\\sqrt{3}}{2}', tan: '\\frac{1}{\\sqrt{3}}' },
  45: { sin: '\\frac{\\sqrt{2}}{2}', cos: '\\frac{\\sqrt{2}}{2}', tan: '1' },
  60: { sin: '\\frac{\\sqrt{3}}{2}', cos: '\\frac{1}{2}', tan: '\\sqrt{3}' },
};

const SETUP = (p: LadderParams, mu: boolean) =>
  `長さ $${L}$ m、質量 $${num(p.m)}$ kg の一様なはしごを、なめらかな鉛直の壁と粗い水平な床の間に、床と $${p.theta}^\\circ$ の角をなすように立てかけた。${p.M > 0 ? `質量 $${num(p.M)}$ kg の人が、はしごの下端からはしごに沿って $${num(p.d)}$ m の位置に乗っている（人は質点とみなす）。` : ''}${mu ? `はしごと床の間の静止摩擦係数は $${num(p.mu)}$ である。` : ''}重力加速度の大きさを $${g}$ m/s² とする。`;

const MOMENT = (p: LadderParams) =>
  `下端のまわりの力のモーメントのつりあい: $$N_2 \\cdot ${L}\\sin\\theta = ${num(p.m)}g \\cdot ${num(LADDER_LENGTH / 2)}\\cos\\theta${p.M > 0 ? ` + ${num(p.M)}g \\cdot ${num(p.d)}\\cos\\theta` : ''}$$`;

function pickLoad(rng: Rng): Pick<LadderParams, 'm' | 'M' | 'd'> {
  return {
    m: pickStep(rng, 5, 30, 1),
    M: rng.uniform() < 0.25 ? 0 : pickStep(rng, 30, 80, 1),
    d: pickStep(rng, 0.5, 3.5, 0.5),
  };
}

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'wall-force',
    title: '壁からの垂直抗力',
    generate(rng) {
      let p: LadderParams;
      do {
        p = { ...pickLoad(rng), theta: pickOne(rng, [30, 45, 60]), mu: 1 };
      } while (!inEquilibrium(p));
      const N2 = staticForces(p).N2;
      return {
        statement: `${SETUP({ ...p }, false)}はしごは静止していた。

はしごが壁から受ける垂直抗力の大きさ $N_2$ [N] を有効数字 2 桁で求めよ。`,
        answer: numeric(N2, 'N'),
        solution: [
          'はしごにはたらく力は、重力（はしごの中点）、人からの力（人の重さ）、床からの垂直抗力 $N_1$ と静止摩擦力 $f$（下端）、壁からの垂直抗力 $N_2$（上端。壁はなめらかなので摩擦はない）。',
          '未知の力が 2 つはたらく下端のまわりでモーメントを考えると、$N_1$ と $f$ が式から消える。',
          MOMENT(p),
          `$\\sin ${p.theta}^\\circ = ${TRIG[p.theta]!.sin}$, $\\cos ${p.theta}^\\circ = ${TRIG[p.theta]!.cos}$ を代入して $N_2 \\approx ${sig(N2)}$ N。`,
        ],
        sim: {
          params: p,
          hint: '「現在の値」の壁からの垂直抗力 $N_2$ を見よう（静止摩擦係数を十分大きくして、はしごが静止する条件にしてある）。',
        },
      };
    },
  },
  {
    id: 'min-friction',
    title: '滑らないための静止摩擦係数',
    generate(rng) {
      let p: LadderParams;
      let muMin: number;
      do {
        p = { ...pickLoad(rng), theta: pickOne(rng, [45, 60]), mu: 1 };
        const s = staticForces(p);
        muMin = s.f / s.N1;
      } while (muMin > 0.95);
      const mu = Math.min(1, roundTo(Math.ceil(muMin * 100 - 1e-9) / 100, 0.01));
      return {
        statement: `${SETUP(p, false)}

はしごが滑らずに静止しているためには、はしごと床の間の静止摩擦係数 $\\mu$ がいくら以上であればよいか。有効数字 2 桁で求めよ。`,
        answer: numeric(muMin),
        solution: [
          `鉛直方向のつりあい: $N_1 = (${num(p.m)} + ${num(p.M)})g \\approx ${sig(staticForces(p).N1)}$ N`,
          MOMENT(p),
          `これより $N_2 \\approx ${sig(staticForces(p).N2)}$ N。水平方向のつりあいより、必要な静止摩擦力は $f = N_2$。`,
          `滑らない条件 $f \\le \\mu N_1$ より $$\\mu \\ge \\frac{N_2}{N_1} \\approx ${sig(muMin)}$$`,
        ],
        sim: {
          params: { ...p, mu },
          hint: `静止摩擦係数を最小値よりわずかに大きい $${num(mu)}$ にしてある。0.02 ほど小さくすると、はしごが滑り出すことを確かめよう。`,
        },
        given: { muMin },
      };
    },
  },
  {
    id: 'max-climb',
    title: '人が上れる高さ',
    generate(rng) {
      let p: LadderParams;
      let dMax: number;
      do {
        p = {
          m: pickStep(rng, 5, 30, 1),
          M: pickStep(rng, 40, 80, 1),
          d: 0,
          theta: pickOne(rng, [45, 60]),
          mu: pickStep(rng, 0.2, 0.6, 0.05),
        };
        dMax = maxClimbDistance(p);
      } while (!(dMax > 0.3 && dMax < LADDER_LENGTH - 0.3));
      const d = Math.floor(dMax * 10 + 1e-9) / 10;
      return {
        statement: `${SETUP({ ...p, M: 0 }, true)}質量 $${num(p.M)}$ kg の人が、はしごの下端からはしごに沿ってゆっくり上っていく（人は質点とみなす）。

はしごが滑り出さずに人が上れるのは、下端からはしごに沿って何 m の位置までか。有効数字 2 桁で求めよ。`,
        answer: numeric(dMax, 'm'),
        solution: [
          '人が下端から $x$ の位置にいるとき、鉛直方向のつりあいより $N_1 = (m + M)g$、水平方向のつりあいより $f = N_2$。',
          `下端のまわりのモーメントのつりあい: $N_2 \\cdot ${L}\\sin\\theta = mg \\cdot ${num(LADDER_LENGTH / 2)}\\cos\\theta + Mg \\cdot x\\cos\\theta$。人が上るほど $N_2$（= 必要な摩擦力）が大きくなる。`,
          `滑らない条件 $N_2 \\le \\mu N_1$ に代入して $$x \\le \\frac{\\mu(m + M)\\,${L}\\tan\\theta - ${num(LADDER_LENGTH / 2)}m}{M} \\approx ${sig(dMax)}\\ \\text{m}$$`,
        ],
        sim: {
          params: { ...p, d },
          hint: `人の位置を限界のすぐ手前の $${num(d)}$ m にしてある。人の位置を 0.1 m ずつ上げて、滑り出す位置を確かめよう（「この条件での値」に上れる限界も出ている）。`,
        },
        given: { dMax },
      };
    },
  },
  {
    id: 'slip-judge',
    title: '滑るかどうかの判定',
    generate(rng) {
      let p: LadderParams;
      let ratio: number;
      do {
        p = {
          ...pickLoad(rng),
          theta: pickOne(rng, [30, 45, 60]),
          mu: pickStep(rng, 0.2, 0.8, 0.05),
        };
        const s = staticForces(p);
        ratio = s.f / s.fMax;
      } while (Math.abs(ratio - 1) < 0.08); // 境目ぎりぎりの条件は避ける
      const stays = ratio <= 1;
      const s = staticForces(p);
      return {
        statement: `${SETUP(p, true)}

はしごはどうなるか。正しいものを選べ。`,
        answer: choice(
          rng,
          stays ? 'はしごは静止したままである' : 'はしごの下端が壁から離れる向きに滑り出す',
          stays ? 'はしごの下端が壁から離れる向きに滑り出す' : 'はしごは静止したままである',
          'はしごの下端が壁に近づく向きに滑り出す',
        ),
        solution: [
          '静止していると仮定して、つりあいに必要な静止摩擦力を求め、最大静止摩擦力と比べる。',
          MOMENT(p),
          `$N_2 \\approx ${sig(s.N2)}$ N。必要な静止摩擦力は $f = N_2 \\approx ${sig(s.f)}$ N、最大静止摩擦力は $\\mu N_1 = ${num(p.mu)} \\times ${sig(s.N1)} \\approx ${sig(s.fMax)}$ N。`,
          stays
            ? '$f \\le \\mu N_1$ なので、静止摩擦力でつりあうことができ、はしごは静止したまま。'
            : '$f > \\mu N_1$ なので静止摩擦力では足りず、下端が壁から離れる向きに滑り出す。',
        ],
        sim: {
          params: p,
          hint: '再生して、はしごが滑るかどうかを見よう。「この条件での値」の必要な静止摩擦力と最大静止摩擦力も比べよう。',
        },
        given: { stays: stays ? 1 : 0 },
      };
    },
  },
];
