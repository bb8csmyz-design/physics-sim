/**
 * 光の屈折と全反射の演習問題。角度は 30°・45°・60° を使い、正弦の値を答えさせる（入試の形式）。
 * 正解は model.ts の関数で求める。
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
import {
  criticalAngle,
  isTotalReflection,
  refractionAngle,
  wavelengthIn,
  type RefractionParams,
} from './model';

const SIN: Record<number, string> = {
  30: '\\frac{1}{2}',
  45: '\\frac{\\sqrt{2}}{2}',
  60: '\\frac{\\sqrt{3}}{2}',
};
const MEDIA = [
  { name: '水', n: 1.33 },
  { name: 'ガラス', n: 1.5 },
  { name: '透明な樹脂', n: 1.6 },
  { name: 'サファイア', n: 1.77 },
] as const;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'refraction-sine',
    title: '屈折角の正弦',
    generate(rng) {
      const theta1 = pickOne(rng, [30, 45, 60]);
      const n2 = pickStep(rng, 1.3, 2, 0.05);
      const p: RefractionParams = { n1: 1, n2, theta1, lambda0: 600 };
      const s2 = Math.sin(refractionAngle(p));
      return {
        statement: `空気（屈折率 1.0）中から、屈折率 $${num(n2)}$ の媒質の平らな表面に、入射角 $${theta1}^\\circ$ で光を入射させた。

屈折角を $\\theta_2$ とするとき、$\\sin\\theta_2$ の値を有効数字 2 桁で求めよ。`,
        answer: numeric(s2),
        solution: [
          '屈折の法則 $n_1\\sin\\theta_1 = n_2\\sin\\theta_2$ より',
          `$$\\sin\\theta_2 = \\frac{n_1}{n_2}\\sin\\theta_1 = \\frac{1.0}{${num(n2)}} \\times ${SIN[theta1]} \\approx ${sig(s2)}$$`,
          `屈折率の大きい媒質に入ると、光は法線に近づく向きに曲がる（$\\theta_2 \\approx ${num((Math.asin(s2) * 180) / Math.PI, 1)}^\\circ < ${theta1}^\\circ$）。`,
        ],
        sim: {
          params: p,
          hint: '「現在の値」の屈折角 $\\theta_2$ を見て、その正弦を計算してみよう。入射角を変えて $\\sin\\theta_1/\\sin\\theta_2$ が一定（相対屈折率）であることも確かめよう。',
        },
      };
    },
  },
  {
    id: 'critical-angle',
    title: '臨界角',
    generate(rng) {
      const m = pickOne(rng, MEDIA);
      const n1 = m.n;
      const p: RefractionParams = { n1, n2: 1, theta1: 30, lambda0: 600 };
      const s = Math.sin(criticalAngle(p));
      return {
        statement: `屈折率 $${num(n1)}$ の${m.name}の中から、空気（屈折率 1.0）との平らな境界面に光を当てる。入射角をしだいに大きくすると、ある角度 $\\theta_c$ をこえたところで光は空気中へ出なくなった。

$\\sin\\theta_c$ の値を有効数字 2 桁で求めよ。`,
        answer: numeric(s),
        solution: [
          '屈折角が $90^\\circ$ になる入射角が臨界角 $\\theta_c$。屈折の法則より',
          `$$${num(n1)}\\sin\\theta_c = 1.0 \\times \\sin 90^\\circ \\quad\\Longrightarrow\\quad \\sin\\theta_c = \\frac{1}{${num(n1)}} \\approx ${sig(s)}$$`,
          `$\\theta_c \\approx ${num((criticalAngle(p) * 180) / Math.PI, 1)}^\\circ$。これより大きな入射角では、光はすべて反射される（全反射）。`,
        ],
        sim: {
          params: p,
          hint: '「現在の値」の臨界角 $\\theta_c$ を見よう。入射角のスライダーを臨界角の前後で動かし、屈折光が消えて全反射になることを確かめよう。',
        },
      };
    },
  },
  {
    id: 'wavelength',
    title: '媒質中の光の波長',
    generate(rng) {
      const n2 = pickStep(rng, 1.3, 2, 0.05);
      const lambda0 = pickStep(rng, 400, 700, 10);
      const p: RefractionParams = { n1: 1, n2, theta1: 0, lambda0 };
      const l2 = wavelengthIn(p, 2) * 1e9;
      return {
        statement: `真空中での波長が $${lambda0}$ nm の単色光が、真空から屈折率 $${num(n2)}$ の媒質に入った。

媒質中での光の波長 [nm] を有効数字 2 桁で求めよ。`,
        answer: numeric(l2, 'nm'),
        solution: [
          '光の振動数は媒質が変わっても変わらない。媒質中の光の速さは $c/n$ になるので、波長も $1/n$ 倍になる。',
          `$$\\lambda = \\frac{\\lambda_0}{n} = \\frac{${lambda0}}{${num(n2)}} \\approx ${sig(l2)}\\ \\text{nm}$$`,
        ],
        sim: {
          params: p,
          hint: '「現在の値」の媒質 2 での波長を見よう。画面の波面の間隔も、媒質 2 で $1/n$ 倍に詰まっている。',
        },
      };
    },
  },
  {
    id: 'total-reflection-judge',
    title: '全反射が起こるか',
    generate(rng) {
      const m = pickOne(rng, MEDIA);
      const theta1 = pickOne(rng, [30, 45, 60]);
      const p: RefractionParams = { n1: m.n, n2: 1, theta1, lambda0: 600 };
      const total = isTotalReflection(p);
      const yes = '全反射が起こり、光は空気中へ出ない';
      const no = '光の一部は屈折して空気中へ出る';
      return {
        statement: `屈折率 $${num(m.n)}$ の${m.name}の中から、空気（屈折率 1.0）との平らな境界面に、入射角 $${theta1}^\\circ$ で光を当てた。

このときのようすとして正しいものを選べ。`,
        answer: choice(
          rng,
          total ? yes : no,
          total ? no : yes,
          '光はすべて屈折して空気中へ出る（反射は起こらない）',
        ),
        solution: [
          `臨界角は $\\sin\\theta_c = 1/${num(m.n)} \\approx ${sig(1 / m.n)}$。`,
          `入射角の正弦は $\\sin ${theta1}^\\circ = ${SIN[theta1]} \\approx ${sig(Math.sin((theta1 * Math.PI) / 180))}$。`,
          total
            ? '$\\sin\\theta_1 > \\sin\\theta_c$ なので入射角が臨界角より大きく、全反射が起こる。'
            : '$\\sin\\theta_1 < \\sin\\theta_c$ なので入射角が臨界角より小さく、光の一部は屈折して空気中へ出る（一部は反射する）。',
        ],
        sim: {
          params: p,
          hint: '画面で屈折光があるかを見よう。「現在の値」の臨界角と入射角を比べ、反射率（発展）が 100% かどうかも確かめよう。',
        },
        given: { total: total ? 1 : 0 },
      };
    },
  },
];
