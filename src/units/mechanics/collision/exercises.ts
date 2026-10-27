/**
 * 2 物体の衝突の演習問題。正解は model.ts の関数（運動量保存と反発係数の式）で求める。
 */
import { num, numeric, pickStep, sig, snapZero, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import { afterCollision, energyLoss, impulseOnA, type CollisionParams } from './model';

/** A が B に追いついて衝突する条件（vA > vB）を選ぶ */
function pickCollision(rng: Rng, e: number): CollisionParams {
  const mA = pickStep(rng, 0.5, 4, 0.5);
  const mB = pickStep(rng, 0.5, 4, 0.5);
  const vA = pickStep(rng, 1, 5, 0.5);
  const vB = rng.uniform() < 0.5 ? 0 : pickStep(rng, -3, Math.min(vA - 1, 2), 0.5);
  return { mA, mB, vA, vB, e };
}

const motion = (v: number) =>
  v === 0
    ? '静止していた'
    : v > 0
      ? `右向きに速さ $${num(v)}$ m/s で進んでいた`
      : `左向きに速さ $${num(-v)}$ m/s で進んでいた`;

const SETUP = (p: CollisionParams) =>
  `なめらかな水平面上の一直線上で、右向きに速さ $${num(p.vA)}$ m/s で進む質量 $${num(p.mA)}$ kg の物体 A が、${motion(p.vB)}質量 $${num(p.mB)}$ kg の物体 B に正面衝突した。`;

const LAWS = (p: CollisionParams) => [
  "右向きを正とし、衝突後の A, B の速度を $v_A'$, $v_B'$ とする。",
  `運動量保存: $$${num(p.mA)} \\times ${num(p.vA)} + ${num(p.mB)} \\times (${num(p.vB)}) = ${num(p.mA)}\\,v_A' + ${num(p.mB)}\\,v_B'$$`,
  `反発係数の式: $$v_B' - v_A' = -${num(p.e)} \\times (${num(p.vB)} - ${num(p.vA)})$$`,
];

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'velocity-after',
    title: '衝突後の速度',
    generate(rng) {
      const p = pickCollision(rng, pickStep(rng, 0.2, 1, 0.1));
      const after = afterCollision(p);
      const askA = rng.uniform() < 0.5;
      const v = snapZero(askA ? after.vA : after.vB, p.vA);
      return {
        statement: `${SETUP(p)}A と B の間の反発係数（はねかえり係数）は $${num(p.e)}$ である。

右向きを正として、衝突直後の物体 ${askA ? 'A' : 'B'} の速度 $v_${askA ? 'A' : 'B'}'$ [m/s] を有効数字 2 桁で求めよ（左向きなら負の値で答えよ）。`,
        answer: numeric(v, 'm/s'),
        solution: [
          ...LAWS(p),
          `2 式を連立して $v_A' \\approx ${sig(after.vA)}$ m/s, $v_B' \\approx ${sig(after.vB)}$ m/s。`,
          '速度の向き（符号）まで含めて答える。運動量保存は「外力の力積が 0」、反発係数の式は「近づく速さと遠ざかる速さの比」と覚える。',
        ],
        sim: {
          params: p,
          hint: "「この条件での値」の衝突後の速度 $v_A'$, $v_B'$ を見よう。再生して衝突させると、「現在の値」の速度も同じになる（右向きが正）。",
        },
      };
    },
  },
  {
    id: 'energy-loss',
    title: '失われた運動エネルギー',
    generate(rng) {
      const e = rng.uniform() < 0.4 ? 0 : pickStep(rng, 0.2, 0.8, 0.1);
      const p = pickCollision(rng, e);
      const loss = energyLoss(p);
      const mu = (p.mA * p.mB) / (p.mA + p.mB);
      return {
        statement: `${SETUP(p)}${e === 0 ? '衝突後、A と B は一体となって運動した。' : `A と B の間の反発係数は $${num(e)}$ である。`}

この衝突で失われた力学的エネルギー $\\Delta E$ [J] を有効数字 2 桁で求めよ。`,
        answer: numeric(loss, 'J'),
        solution: [
          ...LAWS(p),
          `これより $v_A' \\approx ${sig(afterCollision(p).vA)}$ m/s, $v_B' \\approx ${sig(afterCollision(p).vB)}$ m/s。衝突前後の運動エネルギーの差が失われたエネルギー（熱や音になる）。`,
          '一般に、相対速度 $u = v_A - v_B$ と換算質量 $\\mu = \\dfrac{m_A m_B}{m_A + m_B}$ を使うと',
          `$$\\Delta E = \\frac{1}{2}\\mu(1 - e^2)u^2 = \\frac{1}{2} \\times ${sig(mu)} \\times (1 - ${num(e)}^2) \\times ${num(p.vA - p.vB)}^2 \\approx ${sig(loss)}\\ \\text{J}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の「失われる運動エネルギー $\\Delta K$」を見よう。再生すると、エネルギーのグラフで運動エネルギーの和が衝突の瞬間に減ることも確かめられる。',
        },
      };
    },
  },
  {
    id: 'impulse',
    title: '受けた力積',
    generate(rng) {
      const p = pickCollision(rng, pickStep(rng, 0, 1, 0.1));
      const I = -impulseOnA(p); // B が A から受ける力積（右向きが正）
      return {
        statement: `${SETUP(p)}A と B の間の反発係数は $${num(p.e)}$ である。

衝突の間に物体 B が物体 A から受けた力積の大きさ $I$ [N·s] を有効数字 2 桁で求めよ。`,
        answer: numeric(Math.abs(I), 'N·s'),
        solution: [
          ...LAWS(p),
          `これより $v_B' \\approx ${sig(afterCollision(p).vB)}$ m/s。B が受けた力積は B の運動量の変化に等しい:`,
          `$$I = m_B(v_B' - v_B) = ${num(p.mB)} \\times (${sig(afterCollision(p).vB)} - (${num(p.vB)})) \\approx ${sig(I)}\\ \\text{N·s}$$`,
          '作用・反作用の法則により、A が B から受けた力積は大きさが同じで逆向き（運動量の和が保存されるのはこのため）。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の「A が受ける力積」は、B が受ける力積と大きさが同じで逆向き。運動量のグラフで、衝突の前後の B の運動量の変化と比べよう。',
        },
      };
    },
  },
];
