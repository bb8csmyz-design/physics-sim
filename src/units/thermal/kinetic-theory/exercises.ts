/**
 * 気体分子運動論の演習問題。正解は model.ts の関数で求める（定数は CODATA の値。問題文では
 * 入試の慣例どおり 3 桁に丸めた値を示し、丸めによるずれは採点の許容誤差 2% に収まる）。
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
import { idealGasPressure, meanKineticEnergy, rmsSpeed, volume, type KineticParams } from './model';

const R_TEXT = '8.31';
const K_TEXT = '1.38 \\times 10^{-23}';
const GASES = [
  { name: 'ヘリウム He', M: 4 },
  { name: 'ネオン Ne', M: 20 },
  { name: 'アルゴン Ar', M: 40 },
  { name: '水素 H₂', M: 2 },
] as const;
/** 単原子分子の気体（「単原子分子の理想気体」と書く問題では水素 H₂（二原子分子）を除く） */
const MONATOMIC = GASES.filter((gas) => gas.M !== 2);

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'rms-speed',
    title: '分子の二乗平均速度',
    generate(rng) {
      const gas = pickOne(rng, MONATOMIC);
      const p: KineticParams = { N: 100, T: pickStep(rng, 200, 1000, 10), M: gas.M, L: 0.1 };
      const v = rmsSpeed(p);
      return {
        statement: `絶対温度 $${p.T}$ K の${gas.name}（モル質量 $${gas.M}$ g/mol）の気体がある。気体定数を $${R_TEXT}$ J/(mol·K) とし、分子は単原子分子の理想気体として扱う。

気体分子の二乗平均速度 $\\sqrt{\\overline{v^2}}$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(v, 'm/s'),
        solution: [
          '分子 1 個の質量を $m$、アボガドロ定数を $N_A$ とすると、分子の平均運動エネルギーは $\\frac{1}{2}m\\overline{v^2} = \\frac{3}{2}kT = \\frac{3}{2}\\frac{R}{N_A}T$。',
          'モル質量 $M = mN_A$ [kg/mol] を使うと（g/mol を kg/mol に直すのを忘れない）',
          `$$\\sqrt{\\overline{v^2}} = \\sqrt{\\frac{3RT}{M}} = \\sqrt{\\frac{3 \\times ${R_TEXT} \\times ${p.T}}{${gas.M} \\times 10^{-3}}} \\approx ${sig(v)}\\ \\text{m/s}$$`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の二乗平均速度 $\\sqrt{\\langle v^2 \\rangle}$ を見よう。速さの分布のグラフで、分子の速さがこの値のまわりにばらついていることも確かめよう。',
        },
      };
    },
  },
  {
    id: 'mean-kinetic-energy',
    title: '分子の平均運動エネルギー',
    generate(rng) {
      const gas = pickOne(rng, MONATOMIC);
      const p: KineticParams = { N: 100, T: pickStep(rng, 100, 1000, 10), M: gas.M, L: 0.1 };
      const E = meanKineticEnergy(p);
      return {
        statement: `絶対温度 $${p.T}$ K の${gas.name}の気体（単原子分子の理想気体）がある。ボルツマン定数を $${K_TEXT}$ J/K とする。

分子 1 個あたりの平均運動エネルギー [J] を有効数字 2 桁で求めよ。`,
        answer: numeric(E, 'J'),
        solution: [
          '気体分子運動論より、分子の平均運動エネルギーは絶対温度に比例し、気体の種類（分子の質量）によらない:',
          `$$\\frac{1}{2}m\\overline{v^2} = \\frac{3}{2}kT = \\frac{3}{2} \\times ${K_TEXT} \\times ${p.T} \\approx ${sig(E)}\\ \\text{J}$$`,
          '分子の質量が大きい気体ほど、同じ温度では二乗平均速度が小さい。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の平均運動エネルギーを見よう。モル質量を変えても値が変わらないことを確かめよう。',
        },
      };
    },
  },
  {
    id: 'pressure',
    title: '分子の衝突による圧力',
    generate(rng) {
      const gas = pickOne(rng, GASES);
      const p: KineticParams = {
        N: pickStep(rng, 50, 300, 10),
        T: pickStep(rng, 200, 1000, 10),
        M: gas.M,
        L: pickStep(rng, 0.05, 0.2, 0.01),
      };
      const P = idealGasPressure(p);
      return {
        statement: `一辺 $${num(p.L)}$ m の立方体の容器に、${gas.name}の分子が $${p.N}$ 個だけ入っている。気体の絶対温度は $${p.T}$ K である。ボルツマン定数を $${K_TEXT}$ J/K とし、分子どうしの衝突は無視でき、分子は壁と弾性衝突をするものとする。

分子が壁に衝突することによって壁が受ける圧力 $p$ [Pa] を有効数字 2 桁で求めよ。`,
        answer: numeric(P, 'Pa'),
        solution: [
          '1 個の分子が $x$ 軸に垂直な壁に 1 回衝突すると、壁が受ける力積は $2mv_x$。往復に $2L/v_x$ かかるので、平均の力は $mv_x^{\\,2}/L$。',
          'N 個の分子では、$\\overline{v_x^{\\,2}} = \\frac{1}{3}\\overline{v^2}$（方向がでたらめ）を使って $F = \\dfrac{Nm\\overline{v^2}}{3L}$、圧力は $p = \\dfrac{F}{L^2} = \\dfrac{Nm\\overline{v^2}}{3V}$。',
          `$\\frac{1}{2}m\\overline{v^2} = \\frac{3}{2}kT$ を代入すると $pV = NkT$:`,
          `$$p = \\frac{NkT}{V} = \\frac{${p.N} \\times ${K_TEXT} \\times ${p.T}}{${num(p.L)}^3} \\approx ${sig(P)}\\ \\text{Pa}$$`,
          `（分子がたった ${p.N} 個なので、圧力はとても小さい。）`,
        ],
        sim: {
          params: p,
          hint: '再生して、壁が受けた力積から測った圧力（時間平均）が「この条件での値」の圧力 $NkT/V$ に近づいていくことを確かめよう。',
        },
        given: { V: volume(p) },
      };
    },
  },
  {
    id: 'rms-scaling',
    title: '温度と二乗平均速度の関係',
    generate(rng) {
      const factor = pickOne(rng, [4, 9] as const);
      const T1 = factor === 4 ? pickStep(rng, 100, 250, 10) : pickStep(rng, 100, 110, 10);
      const gas = pickOne(rng, GASES);
      const root = Math.sqrt(factor);
      const p: KineticParams = { N: 100, T: T1 * factor, M: gas.M, L: 0.1 };
      return {
        statement: `${gas.name}の気体の絶対温度を、$${T1}$ K から $${T1 * factor}$ K に上げた。

気体分子の二乗平均速度 $\\sqrt{\\overline{v^2}}$ は何倍になるか。`,
        answer: choice(
          rng,
          `$${root}$ 倍`,
          `$${factor}$ 倍`,
          `$${factor * factor}$ 倍`,
          '変わらない',
        ),
        solution: [
          '$\\frac{1}{2}m\\overline{v^2} = \\frac{3}{2}kT$ より $\\sqrt{\\overline{v^2}} \\propto \\sqrt{T}$。',
          `絶対温度が ${factor} 倍になるので、二乗平均速度は $\\sqrt{${factor}} = ${root}$ 倍。平均運動エネルギーは ${factor} 倍になる。`,
        ],
        sim: {
          params: p,
          hint: `いまは変更後の温度（$${T1 * factor}$ K）。温度を $${T1}$ K に戻して、「この条件での値」の二乗平均速度を比べよう。`,
        },
        given: { T1, ratio: root },
      };
    },
  },
];
