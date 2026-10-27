/**
 * 人工衛星の運動（万有引力）の演習問題。入試の慣例どおり GM = gR² を使う。
 * 正解は model.ts の関数で求める。打ち出す速さのスライダーは 0.1 km/s 刻みなので、
 * 答え合わせでは正解に最も近い値にする。
 */
import { num, numeric, pickStep, roundTo, sig, type ExerciseTemplate } from '@/core/exercise';
import { EARTH_RADIUS, G_ACCEL } from '@/core/physics/constants';
import { circularSpeed, escapeSpeed, orbit, orbitKind, type KeplerParams } from './model';

const g = num(G_ACCEL);
const R = num(EARTH_RADIUS);
const CONST = `地球の半径を $R = ${R}$ m、地表での重力加速度の大きさを $g = ${g}$ m/s² とし、地球の自転や大気の影響は無視する。`;

/** スライダーの刻み（0.1 km/s）に丸めた打ち出しの速さ [km/s] */
const sliderSpeed = (v: number) => Math.min(12, Math.max(1, roundTo(v / 1000, 0.1)));

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'circular-speed',
    title: '円軌道の速さ',
    generate(rng) {
      const r0 = pickStep(rng, 1.1, 6, 0.1);
      const v = circularSpeed({ r0, v0: 1, m: 500 });
      const m = pickStep(rng, 100, 2000, 100);
      return {
        statement: `質量 $${num(m)}$ kg の人工衛星が、地球の中心から $${num(r0)}R$ の距離の円軌道を等速円運動している。${CONST}

人工衛星の速さ $v$ [km/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v / 1000, 'km/s'),
        solution: [
          '万有引力定数を $G$、地球の質量を $M$ とすると、地表の物体について $mg = \\dfrac{GMm}{R^2}$ より $GM = gR^2$。',
          '軌道半径を $r$ として、万有引力が向心力になる: $m\\dfrac{v^2}{r} = \\dfrac{GMm}{r^2}$',
          `$$v = \\sqrt{\\frac{GM}{r}} = \\sqrt{\\frac{gR^2}{${num(r0)}R}} = \\sqrt{\\frac{gR}{${num(r0)}}} \\approx ${sig(v)}\\ \\text{m/s} = ${sig(v / 1000)}\\ \\text{km/s}$$`,
          '人工衛星の質量は答えに関係しない。',
        ],
        sim: {
          params: { r0, v0: sliderSpeed(v), m },
          hint: `打ち出しの速さを正解に近い $${num(sliderSpeed(v))}$ km/s にしてある。「この条件での値」の円軌道の速さと見比べ、軌道がほぼ円になることを確かめよう。`,
        },
      };
    },
  },
  {
    id: 'circular-period',
    title: '円軌道の周期',
    generate(rng) {
      const r0 = pickStep(rng, 1.1, 6, 0.1);
      const v = circularSpeed({ r0, v0: 1, m: 500 });
      const r = r0 * EARTH_RADIUS;
      const T = (2 * Math.PI * r) / v;
      return {
        statement: `人工衛星が、地球の中心から $${num(r0)}R$ の距離の円軌道を等速円運動している。${CONST}

この人工衛星の周期 $T$ [s] を有効数字 2 桁で求めよ。`,
        answer: numeric(T, 's'),
        solution: [
          `$GM = gR^2$ を使うと、円軌道の速さは $v = \\sqrt{GM/r} \\approx ${sig(v)}$ m/s。`,
          `$$T = \\frac{2\\pi r}{v} = 2\\pi\\sqrt{\\frac{r^3}{gR^2}} \\approx ${sig(T)}\\ \\text{s}$$`,
          '$T^2 \\propto r^3$（ケプラーの第 3 法則）。軌道半径が大きいほど周期は長い。',
        ],
        sim: {
          params: { r0, v0: sliderSpeed(v), m: 500 },
          hint: '「この条件での値」の周期を見よう（打ち出しの速さはスライダーの刻みに丸めてあるので、わずかに楕円になる）。',
        },
      };
    },
  },
  {
    id: 'escape-speed',
    title: '脱出速度',
    generate(rng) {
      const r0 = pickStep(rng, 1.1, 4, 0.1);
      const v = escapeSpeed({ r0, v0: 1, m: 500 });
      return {
        statement: `地球の中心から $${num(r0)}R$ の距離の点から、物体を打ち出す。${CONST}

物体が地球の引力を振り切って無限の遠方まで飛び去るために必要な、打ち出す速さの最小値 [km/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v / 1000, 'km/s'),
        solution: [
          '無限遠を基準とした万有引力による位置エネルギーは $U = -\\dfrac{GMm}{r}$。',
          '無限遠に達したときの運動エネルギーが 0 以上であればよい。力学的エネルギー保存より $\\frac{1}{2}mv_0^{\\,2} - \\dfrac{GMm}{r_0} \\ge 0$。',
          `$$v_0 \\ge \\sqrt{\\frac{2GM}{r_0}} = \\sqrt{\\frac{2gR}{${num(r0)}}} \\approx ${sig(v / 1000)}\\ \\text{km/s}$$`,
          '円軌道の速さの $\\sqrt{2}$ 倍になっている。',
        ],
        sim: {
          params: { r0, v0: Math.min(12, sliderSpeed(v) + 0.1), m: 500 },
          hint: '脱出速度より少しだけ速く打ち出す条件にしてある。打ち出しの速さを 0.2 km/s 下げると楕円軌道に戻ることを確かめよう。「この条件での値」の脱出速度も見よう。',
        },
      };
    },
  },
  {
    id: 'apogee-speed',
    title: '遠地点での速さ（面積速度一定）',
    generate(rng) {
      // 近地点から打ち出して楕円軌道になる条件を選ぶ。シミュレーションは打ち出した距離の 5 倍まで
      // 離れると「脱出」として止めるので、遠地点はその内側（4 倍以内）にする
      let p: KeplerParams;
      do {
        const r0 = pickStep(rng, 1.1, 3, 0.1);
        const vc = circularSpeed({ r0, v0: 1, m: 500 }) / 1000;
        const ve = vc * Math.SQRT2;
        const v0 = pickStep(rng, roundTo(vc + 0.3, 0.1), roundTo(Math.min(ve - 0.3, 12), 0.1), 0.1);
        p = { r0, v0, m: 500 };
      } while (orbitKind(p) !== 'ellipse' || orbit(p).apogee > 4 * p.r0 * EARTH_RADIUS);
      const o = orbit(p);
      const rA = o.apogee / EARTH_RADIUS;
      const rAText = rA.toPrecision(3);
      const vA = (p.r0 * p.v0) / Number(rAText);
      return {
        statement: `地球の中心から $${num(p.r0)}R$ の点 P で、人工衛星を地球の中心と P を結ぶ直線に垂直な向きに速さ $${num(p.v0)}$ km/s で打ち出したところ、人工衛星は P を近地点とする楕円軌道を描き、遠地点 Q は地球の中心から $${rAText}R$ の距離にあった。

Q での人工衛星の速さ $v_{\\mathrm{Q}}$ [km/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(vA, 'km/s'),
        solution: [
          '近地点・遠地点では速度が動径と垂直なので、面積速度は $\\frac{1}{2}rv$。ケプラーの第 2 法則（面積速度一定）より',
          `$$\\frac{1}{2} \\cdot ${num(p.r0)}R \\cdot ${num(p.v0)} = \\frac{1}{2} \\cdot ${rAText}R \\cdot v_{\\mathrm{Q}} \\quad\\Longrightarrow\\quad v_{\\mathrm{Q}} \\approx ${sig(vA)}\\ \\text{km/s}$$`,
          '力学的エネルギー保存 $\\frac{1}{2}mv_{\\mathrm{P}}^{\\,2} - \\dfrac{GMm}{r_{\\mathrm{P}}} = \\frac{1}{2}mv_{\\mathrm{Q}}^{\\,2} - \\dfrac{GMm}{r_{\\mathrm{Q}}}$ と組み合わせると、遠地点の距離も求められる。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の遠地点での速さと遠地点の距離を見よう。面積速度のグラフが一定であることも確かめよう。',
        },
        given: { rA: Number(rAText) },
      };
    },
  },
];
