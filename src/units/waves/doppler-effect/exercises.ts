/**
 * ドップラー効果の演習問題。音源は観測者の左にあり、右向きを正とする（model.ts と同じ）。
 * 正解は observedFrequency / wavelength で求める。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import { observedFrequency, V, wavelength, type DopplerParams } from './model';

const Vtext = num(V);

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'moving-source',
    title: '近づく音源',
    generate(rng) {
      const f0 = pickStep(rng, 300, 900, 10);
      const vs = pickStep(rng, 10, 60, 1);
      const p: DopplerParams = { f0, vs, vo: 0, w: 0 };
      const f = observedFrequency(p, 1);
      return {
        statement: `振動数 $${f0}$ Hz の音を出す音源が、静止している観測者に向かって一直線上を速さ $${vs}$ m/s で近づいている。音速を $${Vtext}$ m/s とし、風はないものとする。

観測者が聞く音の振動数 $f$ [Hz] を有効数字 3 桁で求めよ。`,
        answer: numeric(f, 'Hz', { sig: 3, relTol: 0.005 }),
        solution: [
          '音源が動くと、音源の前方では波面の間隔が詰まり、波長が短くなる。1 秒間に出した $f_0$ 個の波が $V - v_S$ の長さに詰まるので $\\lambda = \\dfrac{V - v_S}{f_0}$。',
          '観測者は静止しているので、聞く振動数は $f = V/\\lambda$:',
          `$$f = \\frac{V}{V - v_S}f_0 = \\frac{${Vtext}}{${Vtext} - ${vs}} \\times ${f0} \\approx ${num(f, 1)}\\ \\text{Hz}$$`,
        ],
        sim: {
          params: p,
          hint: '再生して、観測者が測った振動数（「現在の値」）と公式から求めた値を比べよう。音源が観測者を追い越すと振動数が下がる。',
        },
      };
    },
  },
  {
    id: 'moving-observer',
    title: '動く観測者',
    generate(rng) {
      const f0 = pickStep(rng, 300, 900, 10);
      const speed = pickStep(rng, 10, 60, 1);
      const toward = rng.uniform() < 0.5;
      // 観測者は音源の右側にいるので、近づくのは左向き（負）
      const p: DopplerParams = { f0, vs: 0, vo: toward ? -speed : speed, w: 0 };
      const f = observedFrequency(p, 1);
      return {
        statement: `静止した音源が振動数 $${f0}$ Hz の音を出している。観測者が音源${toward ? 'に向かって' : 'から遠ざかる向きに'}一直線上を速さ $${speed}$ m/s で動いている。音速を $${Vtext}$ m/s とし、風はないものとする。

観測者が聞く音の振動数 $f$ [Hz] を有効数字 3 桁で求めよ。`,
        answer: numeric(f, 'Hz', { sig: 3, relTol: 0.005 }),
        solution: [
          '音源が静止しているので波長は $\\lambda = V/f_0$ のまま。観測者から見た音の速さが変わる。',
          toward
            ? `観測者が近づくと、観測者に対する音の速さは $V + v_O$。$$f = \\frac{V + v_O}{\\lambda} = \\frac{${Vtext} + ${speed}}{${Vtext}} \\times ${f0} \\approx ${num(f, 1)}\\ \\text{Hz}$$`
            : `観測者が遠ざかると、観測者に対する音の速さは $V - v_O$。$$f = \\frac{V - v_O}{\\lambda} = \\frac{${Vtext} - ${speed}}{${Vtext}} \\times ${f0} \\approx ${num(f, 1)}\\ \\text{Hz}$$`,
        ],
        sim: {
          params: p,
          hint: '再生して、観測者が測った振動数（「現在の値」）を見よう。観測者の速度は右向きが正（音源は観測者の左にある）。',
        },
      };
    },
  },
  {
    id: 'wavelength',
    title: '音源の前方の波長',
    generate(rng) {
      const f0 = pickStep(rng, 200, 1000, 10);
      const vs = pickStep(rng, 10, 80, 1);
      const p: DopplerParams = { f0, vs, vo: 0, w: 0 };
      const lambda = wavelength(p, 1);
      return {
        statement: `振動数 $${f0}$ Hz の音を出す音源が、一直線上を速さ $${vs}$ m/s で動いている。音速を $${Vtext}$ m/s とし、風はないものとする。

音源の進む向きの前方に伝わる音の波長 $\\lambda$ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(lambda, 'm'),
        solution: [
          '音源は 1 秒間に $f_0$ 個の波を出す。その間に、最初に出した波面は $V$ だけ進み、音源は $v_S$ だけ進むので、前方では $f_0$ 個の波が長さ $V - v_S$ の中に並ぶ。',
          `$$\\lambda = \\frac{V - v_S}{f_0} = \\frac{${Vtext} - ${vs}}{${f0}} \\approx ${sig(lambda)}\\ \\text{m}$$`,
          '後方の波長は $(V + v_S)/f_0$ で長くなる。音源が動いても音速は変わらない。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の音源の前方（右）の波長を見よう。画面の波面の間隔が前方で詰まっていることも確かめよう。',
        },
      };
    },
  },
  {
    id: 'wind',
    title: '風があるときのドップラー効果',
    generate(rng) {
      const f0 = pickStep(rng, 300, 900, 10);
      const vs = pickStep(rng, 10, 50, 1);
      const w = pickStep(rng, 5, 20, 1) * (rng.uniform() < 0.5 ? 1 : -1);
      const p: DopplerParams = { f0, vs, vo: 0, w };
      const f = observedFrequency(p, 1);
      const c = V + w;
      return {
        statement: `振動数 $${f0}$ Hz の音を出す音源が、静止している観測者に向かって一直線上を速さ $${vs}$ m/s で近づいている。${w > 0 ? '音源から観測者に向かう向き' : '観測者から音源に向かう向き'}に風速 $${Math.abs(w)}$ m/s の風が吹いている。無風のときの音速を $${Vtext}$ m/s とする。

観測者が聞く音の振動数 $f$ [Hz] を有効数字 3 桁で求めよ。`,
        answer: numeric(f, 'Hz', { sig: 3, relTol: 0.005 }),
        solution: [
          `音は空気に対して $V$ の速さで伝わり、空気は風で流されるので、地面に対する音速は ${w > 0 ? '$V + w$（追い風）' : '$V - w$（向かい風）'} $= ${num(c)}$ m/s になる。`,
          'ドップラー効果の式の $V$ をこの速さに置きかえる:',
          `$$f = \\frac{${num(c)}}{${num(c)} - ${vs}} \\times ${f0} \\approx ${num(f, 1)}\\ \\text{Hz}$$`,
          '音源も観測者も静止していれば、風があっても振動数は変わらない（波長と音速が同じ割合で変わる）。',
        ],
        sim: {
          params: p,
          hint: '再生して観測者が測った振動数を見よう。風速を 0 にしたときと比べてみよう（風速は右向き、つまり音源から観測者へ向かう向きが正）。',
        },
      };
    },
  },
];
