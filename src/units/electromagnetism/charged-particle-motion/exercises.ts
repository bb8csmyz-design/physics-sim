/**
 * 一様な磁場・電場の中の荷電粒子の演習問題。粒子は原点から x 軸の正の向きに打ち出す（model.ts と同じ）。
 * 正解は model.ts の radius / period / omega で求める。
 */
import {
  choice,
  num,
  numeric,
  pickOne,
  pickStep,
  sig,
  type ExerciseTemplate,
} from '@/core/exercise';
import type { Rng } from '@/core/random';
import { omega, period, radius, type ParticleParams } from './model';

function pickMagnetic(rng: Rng): ParticleParams {
  return {
    m: pickStep(rng, 1, 10, 0.5),
    q: pickStep(rng, 0.5, 4, 0.5),
    B: pickStep(rng, 0.5, 2, 0.1),
    E: 0,
    v0: pickStep(rng, 0.5, 2, 0.1),
  };
}

const B_DIR = (B: number) => (B > 0 ? '紙面の裏から表へ向かう向き' : '紙面の表から裏へ向かう向き');

const SETUP = (p: ParticleParams) =>
  `${B_DIR(p.B)}に、磁束密度の大きさ $${num(Math.abs(p.B))}$ T の一様な磁場がある。質量 $${num(p.m)}$ g、電気量 $${p.q > 0 ? '' : '-'}${num(Math.abs(p.q))}$ mC の荷電粒子を、磁場に垂直に速さ $${num(p.v0)}$ m/s で打ち出した。重力は無視する。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'radius',
    title: '等速円運動の半径',
    generate(rng) {
      const p = pickMagnetic(rng);
      const r = radius(p);
      return {
        statement: `${SETUP(p)}

粒子は等速円運動をした。その半径 $r$ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(r, 'm'),
        solution: [
          'ローレンツ力 $qvB$ は速度に垂直で、向心力としてはたらく: $m\\dfrac{v^2}{r} = qvB$。',
          `$$r = \\frac{mv}{qB} = \\frac{${num(p.m)} \\times 10^{-3} \\times ${num(p.v0)}}{${num(p.q)} \\times 10^{-3} \\times ${num(p.B)}} \\approx ${sig(r)}\\ \\text{m}$$`,
          'ローレンツ力は仕事をしないので、速さは変わらない。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の回転半径を見よう。軌跡の円の直径（y 方向の幅）を目盛りで読んでもよい。',
        },
      };
    },
  },
  {
    id: 'period',
    title: '円運動の周期',
    generate(rng) {
      const p = pickMagnetic(rng);
      const T = period(p);
      return {
        statement: `${SETUP(p)}

粒子は等速円運動をした。その周期 $T$ [s] を有効数字 2 桁で求めよ。`,
        answer: numeric(T, 's'),
        solution: [
          '半径は $r = \\dfrac{mv}{qB}$。1 周の長さを速さで割って',
          `$$T = \\frac{2\\pi r}{v} = \\frac{2\\pi m}{qB} = \\frac{2\\pi \\times ${num(p.m)} \\times 10^{-3}}{${num(p.q)} \\times 10^{-3} \\times ${num(p.B)}} \\approx ${sig(T)}\\ \\text{s}$$`,
          '周期は速さによらない（速いほど大きな円を回る）。サイクロトロンの原理。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の周期を見よう。初速度を変えても周期が変わらないことを確かめよう。',
        },
      };
    },
  },
  {
    id: 'rotation-direction',
    title: '回る向き',
    generate(rng) {
      const p0 = pickMagnetic(rng);
      const p: ParticleParams = {
        ...p0,
        q: p0.q * pickOne(rng, [1, -1]),
        B: p0.B * pickOne(rng, [1, -1]),
      };
      const clockwise = omega(p) > 0;
      return {
        statement: `${B_DIR(p.B)}に一様な磁場がある。紙面内で右向きに、電気量が${p.q > 0 ? '正' : '負'}の荷電粒子を磁場に垂直に打ち出した。重力は無視する。

紙面の表側から見て、粒子の運動として正しいものを選べ。`,
        answer: choice(
          rng,
          clockwise ? '時計回りに円運動をする' : '反時計回りに円運動をする',
          clockwise ? '反時計回りに円運動をする' : '時計回りに円運動をする',
          '磁場の向きに曲がっていく',
          'まっすぐ進む',
        ),
        solution: [
          'ローレンツ力の向きはフレミングの左手の法則で決まる（正電荷なら、中指 = 速度 = 電流の向き、人差し指 = 磁場の向き、親指 = 力の向き）。負電荷では逆向き。',
          `打ち出した直後（右向き）に受ける力は${clockwise ? '下向き（紙面内）' : '上向き（紙面内）'}なので、${clockwise ? '時計回り' : '反時計回り'}に円運動をする。`,
          '力は常に速度と垂直で紙面内にあるので、粒子は紙面内で等速円運動をする。',
        ],
        sim: {
          params: p,
          hint: '再生して回る向きを見よう。電荷の符号や磁場の向きを反対にすると、回る向きが逆になる。',
        },
        given: { clockwise: clockwise ? 1 : 0 },
      };
    },
  },
  {
    id: 'velocity-selector',
    title: '直進する速さ（速度選別）',
    generate(rng) {
      const B = pickOne(rng, [0.5, 1, 2]);
      const E =
        B === 2
          ? pickStep(rng, 2, 20, 2) / 10
          : B === 1
            ? pickStep(rng, 0.5, 2, 0.1)
            : pickStep(rng, 0.3, 1, 0.1);
      const v = E / B;
      const p: ParticleParams = {
        m: pickStep(rng, 1, 10, 0.5),
        q: pickStep(rng, 0.5, 4, 0.5),
        B,
        E,
        v0: Number(v.toFixed(1)),
      };
      return {
        statement: `紙面内で上向きに強さ $${num(E)}$ V/m の一様な電場と、紙面の裏から表へ向かう向きに磁束密度 $${num(B)}$ T の一様な磁場が重なっている。正の電荷をもつ粒子を、紙面内で右向き（電場と磁場の両方に垂直）に打ち出したところ、粒子はまっすぐに進んだ。重力は無視する。

粒子の速さ $v$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          '電場から受ける力 $qE$ は上向き。磁場から受けるローレンツ力 $qvB$ は（フレミングの左手の法則より）下向き。',
          `まっすぐ進むのは 2 つの力がつりあうとき: $$qE = qvB \\quad\\Longrightarrow\\quad v = \\frac{E}{B} = \\frac{${num(E)}}{${num(B)}} = ${sig(v)}\\ \\text{m/s}$$`,
          '電荷や質量によらず、速さ $E/B$ の粒子だけがまっすぐ進む（速度選別器）。',
        ],
        sim: {
          params: p,
          hint: '粒子がまっすぐ進むことを確かめよう。初速度を少し変えると軌道が曲がる（「この条件での値」のドリフトの速さ $E/B$）。',
        },
      };
    },
  },
];
