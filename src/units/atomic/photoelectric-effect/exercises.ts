/**
 * 光電効果の演習問題。光子のエネルギー [eV] = 1240 / 波長 [nm] を問題文で与える
 * （正解は model.ts の関数で、CODATA の定数から求める。差は 0.02% 以下）。
 */
import { choice, num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import {
  emits,
  maxKineticEnergy,
  photonEnergyEV,
  stoppingVoltage,
  thresholdWavelength,
  type PhotoParams,
} from './model';

const METALS = [
  { name: 'セシウム', W: 2.1 },
  { name: 'ナトリウム', W: 2.3 },
  { name: 'カルシウム', W: 2.9 },
  { name: '亜鉛', W: 4.3 },
  { name: '銅', W: 4.7 },
] as const;

const HC =
  '光子のエネルギー $E$ [eV] と光の波長 $\\lambda$ [nm] の間には $E = \\dfrac{1240}{\\lambda}$ の関係がある。';

/** 光電子が十分なエネルギー（0.5 eV 以上）で飛び出す条件を選ぶ（丸めの影響を小さくするため） */
function pickEmitting(rng: Rng): PhotoParams {
  let p: PhotoParams;
  do {
    const metal = METALS[Math.min(METALS.length - 1, Math.floor(rng.uniform() * METALS.length))]!;
    p = { lambda: pickStep(rng, 200, 500, 5), P: 100, W: metal.W, V: 1 };
  } while (maxKineticEnergy(p) < 0.5);
  return p;
}

const metalName = (W: number) => METALS.find((m) => m.W === W)?.name ?? '金属';

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'max-kinetic-energy',
    title: '光電子の運動エネルギーの最大値',
    generate(rng) {
      const p = pickEmitting(rng);
      const K = maxKineticEnergy(p);
      return {
        statement: `仕事関数 $${num(p.W)}$ eV の${metalName(p.W)}の表面に、波長 $${p.lambda}$ nm の光を当てたところ、光電子が飛び出した。${HC}

飛び出す光電子の運動エネルギーの最大値 [eV] を有効数字 2 桁で求めよ。`,
        answer: numeric(K, 'eV'),
        solution: [
          `光子 1 個のエネルギーは $h\\nu = \\dfrac{1240}{${p.lambda}} \\approx ${sig(photonEnergyEV(p))}$ eV。`,
          '光子 1 個のエネルギーを電子 1 個が受け取り、金属から出るのに最低でも仕事関数 $W$ だけ使う（アインシュタインの光電方程式）:',
          `$$K_{\\max} = h\\nu - W = ${sig(photonEnergyEV(p))} - ${num(p.W)} \\approx ${sig(K)}\\ \\text{eV}$$`,
          '光を強くしても（光子の数が増えるだけで）$K_{\\max}$ は変わらない。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の光電子の運動エネルギーの最大値を見よう。光の強さのスライダーを変えても変わらないことを確かめよう。',
        },
      };
    },
  },
  {
    id: 'stopping-voltage',
    title: '阻止電圧',
    generate(rng) {
      const p = pickEmitting(rng);
      const V0 = stoppingVoltage(p);
      return {
        statement: `光電管の陰極（仕事関数 $${num(p.W)}$ eV）に波長 $${p.lambda}$ nm の光を当て、陰極に対する陽極の電位を負にしていくと、ある電圧で光電流が 0 になった。${HC}

光電流が 0 になる電圧の大きさ（阻止電圧）$V_0$ [V] を有効数字 2 桁で求めよ。`,
        answer: numeric(V0, 'V'),
        solution: [
          `光電子の運動エネルギーの最大値は $K_{\\max} = \\dfrac{1240}{${p.lambda}} - ${num(p.W)} \\approx ${sig(maxKineticEnergy(p))}$ eV。`,
          '最も勢いのよい光電子でも陽極に届かなくなる電圧が阻止電圧で、$eV_0 = K_{\\max}$。',
          `$$V_0 = \\frac{K_{\\max}}{e} \\approx ${sig(V0)}\\ \\text{V}$$（eV で表した $K_{\\max}$ の数値がそのまま阻止電圧の数値になる）`,
        ],
        sim: {
          params: { ...p, V: -Math.min(5, Math.floor(V0 * 20) / 20) },
          hint: '陽極の電位を阻止電圧のすぐ手前にしてある。さらに 0.05 V ずつ下げて、陽極に届く電子がいなくなる（光電流 0）ことを確かめよう。',
        },
      };
    },
  },
  {
    id: 'threshold-wavelength',
    title: '限界波長',
    generate(rng) {
      const metal = METALS[Math.min(METALS.length - 1, Math.floor(rng.uniform() * METALS.length))]!;
      const p: PhotoParams = { lambda: 400, P: 100, W: metal.W, V: 1 };
      const l0 = thresholdWavelength(p);
      return {
        statement: `仕事関数 $${num(metal.W)}$ eV の${metal.name}の表面に光を当てる。${HC}

光電子が飛び出すための、光の波長の上限（限界波長）$\\lambda_0$ [nm] を有効数字 2 桁で求めよ。`,
        answer: numeric(l0, 'nm'),
        solution: [
          '光電子が飛び出すには、光子 1 個のエネルギーが仕事関数以上であればよい: $h\\nu = \\dfrac{1240}{\\lambda} \\ge W$。',
          `$$\\lambda \\le \\lambda_0 = \\frac{1240}{W} = \\frac{1240}{${num(metal.W)}} \\approx ${sig(l0)}\\ \\text{nm}$$`,
          '限界波長より長い波長の光は、どんなに強くしても光電子を出さない。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の限界波長を見よう。波長のスライダーを限界波長の前後で動かし、光電子が出るかどうかを確かめよう。',
        },
      };
    },
  },
  {
    id: 'emission-judge',
    title: '光電子が出るかの判定',
    generate(rng) {
      const metal = METALS[Math.min(METALS.length - 1, Math.floor(rng.uniform() * METALS.length))]!;
      let p: PhotoParams;
      do {
        p = {
          lambda: pickStep(rng, 200, 700, 10),
          P: pickStep(rng, 10, 200, 10),
          W: metal.W,
          V: 1,
        };
      } while (Math.abs(photonEnergyEV(p) - metal.W) < 0.15); // 境目ぎりぎりは避ける
      const yes = emits(p);
      const strong = p.P >= 100 ? '強い' : '弱い';
      return {
        statement: `仕事関数 $${num(metal.W)}$ eV の${metal.name}の表面に、波長 $${p.lambda}$ nm の${strong}光を当てた。${HC}

このときのようすとして正しいものを選べ。`,
        answer: choice(
          rng,
          yes ? '光電子が飛び出す' : '光電子は飛び出さない',
          yes ? '光電子は飛び出さない' : '光電子が飛び出す',
          '光を当て続けると、しばらくしてから光電子が飛び出す',
        ),
        solution: [
          `光子 1 個のエネルギーは $\\dfrac{1240}{${p.lambda}} \\approx ${sig(photonEnergyEV(p))}$ eV。`,
          yes
            ? `仕事関数 $${num(metal.W)}$ eV より大きいので、光電子が（光を当てた瞬間から）飛び出す。`
            : `仕事関数 $${num(metal.W)}$ eV より小さいので、光をどんなに強くしても、長く当てても光電子は飛び出さない。`,
          '光電効果が起こるかどうかは光の強さではなく振動数（波長）で決まる。光を粒子（光子）と考えないと説明できない性質である。',
        ],
        sim: {
          params: p,
          hint: '光電子が飛び出すかどうかを画面で見よう。光の強さを変えても結果が変わらないことを確かめよう。',
        },
        given: { emits: yes ? 1 : 0 },
      };
    },
  },
];
