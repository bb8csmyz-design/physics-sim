/**
 * 力学サンドボックスの演習問題（滑車・跳ね返り）。問題の配置をサンプルから作り、
 * 答え合わせではその配置（serialize した JSON）をサンドボックスに読み込む。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import { defaultParams } from '@/core/params';
import { G_ACCEL } from '@/core/physics/constants';
import { PARAMS, type SandboxDesign, type SandboxParams } from './model';
import { defaultFloor, preset } from './presets';
import { serialize } from './storage';

const g = num(G_ACCEL);
const DEFAULTS = defaultParams(PARAMS);

/** 答え合わせ用の設定（スライダーの値と配置） */
function sim(params: SandboxParams, design: SandboxDesign, hint: string) {
  return { params, state: serialize(params, design), hint };
}

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'atwood',
    title: 'アトウッドの器械',
    generate(rng) {
      let mA: number;
      let mB: number;
      do {
        mA = pickStep(rng, 0.5, 4, 0.5);
        mB = pickStep(rng, 0.5, 4, 0.5);
      } while (mA === mB);
      const askTension = rng.uniform() < 0.5;
      const a = (Math.abs(mA - mB) / (mA + mB)) * G_ACCEL;
      const T = ((2 * mA * mB) / (mA + mB)) * G_ACCEL;
      const d = preset('atwood').design;
      d.bodies[0]!.m = mA;
      d.bodies[1]!.m = mB;
      const heavy = mA > mB ? 'A' : 'B';
      return {
        statement: `天井に固定した軽くなめらかな滑車に軽い糸をかけ、糸の両端に質量 $${num(mA)}$ kg の物体 A と質量 $${num(mB)}$ kg の物体 B をつるした。A と B を静かに放すと、物体 ${heavy} が下がり始めた。重力加速度の大きさを $${g}$ m/s² とする。

${askTension ? '物体が動いている間の糸の張力の大きさ $T$ [N]' : '物体の加速度の大きさ $a$ [m/s²]'} を有効数字 2 桁で求めよ。`,
        answer: askTension ? numeric(T, 'N') : numeric(a, 'm/s²'),
        solution: [
          `加速度の大きさを $a$、糸の張力を $T$ とし、${heavy} が下がる向きを正として A, B それぞれの運動方程式を立てる。`,
          mA > mB
            ? `$$\\text{A}: ${num(mA)}a = ${num(mA)}g - T, \\qquad \\text{B}: ${num(mB)}a = T - ${num(mB)}g$$`
            : `$$\\text{A}: ${num(mA)}a = T - ${num(mA)}g, \\qquad \\text{B}: ${num(mB)}a = ${num(mB)}g - T$$`,
          `2 式を足すと $a = \\dfrac{|m_A - m_B|}{m_A + m_B}g \\approx ${sig(a)}$ m/s²。代入すると $T = \\dfrac{2m_Am_B}{m_A + m_B}g \\approx ${sig(T)}$ N。`,
          '張力は軽い物体の重さより大きく、重い物体の重さより小さい。',
        ],
        sim: sim(
          DEFAULTS,
          d,
          '再生して、物体の速度が時間に比例して増える（等加速度運動）ことを確かめよう。表示の「各物体の速さ」をオンにすると速さが見える。速度 ÷ 時間 で加速度を求めてみよう。',
        ),
        given: { askTension: askTension ? 1 : 0 },
      };
    },
  },
  {
    id: 'table-pulley',
    title: '机の上の物体と滑車',
    generate(rng) {
      let mA: number;
      let mB: number;
      let mu: number;
      let muk: number;
      do {
        mA = pickStep(rng, 1, 4, 0.5);
        mB = pickStep(rng, 0.5, 3, 0.5);
        muk = pickStep(rng, 0.1, 0.5, 0.05);
        mu = Math.min(1, muk + 0.1);
      } while (mu * mA >= mB - 0.1); // 滑り出す条件（静止摩擦で止まらない）
      const a = ((mB - muk * mA) / (mA + mB)) * G_ACCEL;
      const d = preset('table').design;
      d.bodies[0]!.m = mA;
      d.bodies[1]!.m = mB;
      const params = { ...DEFAULTS, mu: Number(mu.toFixed(2)), muk };
      return {
        statement: `水平な机の上に質量 $${num(mA)}$ kg の物体 A を置き、A につけた軽い糸を机の端に固定した軽くなめらかな滑車にかけ、糸の他端に質量 $${num(mB)}$ kg の物体 B をつるした。A と机の間の静止摩擦係数は $${num(params.mu)}$、動摩擦係数は $${num(muk)}$ である。静かに放すと、A は机の上を滑り始めた。重力加速度の大きさを $${g}$ m/s² とする。

A の加速度の大きさ $a$ [m/s²] を有効数字 2 桁で求めよ。`,
        answer: numeric(a, 'm/s²'),
        solution: [
          "A が滑ると、A には動摩擦力 $\\mu' m_A g$ が運動と逆向きにはたらく。糸の張力を $T$ として",
          `$$\\text{A}: ${num(mA)}a = T - ${num(muk)} \\times ${num(mA)}g, \\qquad \\text{B}: ${num(mB)}a = ${num(mB)}g - T$$`,
          `2 式を足して $$a = \\frac{m_B - \\mu' m_A}{m_A + m_B}g = \\frac{${num(mB)} - ${num(muk)} \\times ${num(mA)}}{${num(mA + mB)}} \\times ${g} \\approx ${sig(a)}\\ \\text{m/s}^2$$`,
          `滑り出すかどうかは静止摩擦係数で判定する: $m_B g > \\mu m_A g$（$${num(mB)} > ${num(params.mu)} \\times ${num(mA)}$）なので滑り出す。`,
        ],
        sim: sim(
          params,
          d,
          '再生して A の速度の増え方を見よう（表示の「各物体の速さ」をオン）。エネルギーのグラフでは、B の位置エネルギーの減少が、運動エネルギーと摩擦熱に分かれる。',
        ),
      };
    },
  },
  {
    id: 'bounce',
    title: '床で跳ね返るボール',
    generate(rng) {
      const h = pickStep(rng, 1, 3, 0.1);
      const e = pickStep(rng, 0.3, 0.9, 0.05);
      const m = pickStep(rng, 0.2, 2, 0.1);
      const r = 0.12;
      const design: SandboxDesign = {
        bodies: [{ kind: 'ball', id: 'A', x: 3.2, y: h + r, r, m, vx: 0, vy: 0 }],
        fixtures: [defaultFloor()],
        joints: [],
      };
      const params = { ...DEFAULTS, e };
      const h1 = e * e * h;
      return {
        statement: `質量 $${num(m)}$ kg の小球を、水平な床から高さ $${num(h)}$ m の位置で静かに放した。小球と床の間の反発係数は $${num(e)}$ で、空気抵抗は無視できる。重力加速度の大きさを $${g}$ m/s² とする。

小球が床で 1 回跳ね返ったあとに達する最高点の、床からの高さ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(h1, 'm'),
        solution: [
          `床に衝突する直前の速さは $v = \\sqrt{2gh}$。反発係数の定義より、跳ね返った直後の速さは $ev$。`,
          `$$h_1 = \\frac{(ev)^2}{2g} = e^2 h = ${num(e)}^2 \\times ${num(h)} \\approx ${sig(h1)}\\ \\text{m}$$`,
          '跳ね返るたびに高さは $e^2$ 倍になる。質量や重力加速度にはよらない。',
        ],
        sim: sim(
          params,
          design,
          '「軌跡」をオンにして再生し、跳ね返ったあとの最高点の高さを目盛りで読もう（小球の中心は床から半径 0.12 m 上にある）。',
        ),
      };
    },
  },
];
