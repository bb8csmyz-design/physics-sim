/**
 * 磁場中のレール上を動く導体棒（電磁誘導）の演習問題。正解は model.ts の関数で求める。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import type { Rng } from '@/core/random';
import {
  current,
  magneticForce,
  terminalVelocity,
  timeConstant,
  type InductionParams,
} from './model';

/** レールの条件。画面で運動の変化が見えるように、時定数 mR/(Bl)² が 3 s 以下になるものを選ぶ */
function pickRails(rng: Rng): Pick<InductionParams, 'B' | 'l' | 'R' | 'm'> {
  let r: Pick<InductionParams, 'B' | 'l' | 'R' | 'm'>;
  do {
    r = {
      B: pickStep(rng, 0.2, 1, 0.05),
      l: pickStep(rng, 0.2, 1, 0.05),
      R: pickStep(rng, 0.5, 5, 0.1),
      m: pickStep(rng, 0.05, 0.5, 0.01),
    };
  } while (timeConstant({ ...r, F: 0, v0: 0 }) > 3);
  return r;
}

const SETUP = (p: InductionParams) =>
  `鉛直上向きで磁束密度 $${num(p.B)}$ T の一様な磁場の中に、間隔 $${num(p.l)}$ m の 2 本の平行な導体レールを水平に置き、一端を $${num(p.R)}$ Ω の抵抗でつないだ。レールの上に質量 $${num(p.m)}$ kg の導体棒をレールと垂直に置いた。棒とレールの間の摩擦、棒とレールの電気抵抗、回路の自己インダクタンスは無視できる。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'induced-current',
    title: '誘導起電力と誘導電流',
    generate(rng) {
      const p: InductionParams = { ...pickRails(rng), F: 0, v0: pickStep(rng, 0.5, 3, 0.1) };
      const I = current(p, p.v0);
      return {
        statement: `${SETUP(p)}棒に、レールに沿った向きに初速 $${num(p.v0)}$ m/s を与えた。

動き始めた瞬間に抵抗を流れる電流の大きさ $I$ [A] を有効数字 2 桁で求めよ。`,
        answer: numeric(I, 'A'),
        solution: [
          '棒が速さ $v$ で動くと、棒と抵抗でできた回路を貫く磁束が 1 秒あたり $vBl$ ずつ変わる。ファラデーの電磁誘導の法則より、誘導起電力は $V = vBl$。',
          `$$V = ${num(p.v0)} \\times ${num(p.B)} \\times ${num(p.l)} \\approx ${sig(p.v0 * p.B * p.l)}\\ \\text{V}, \\qquad I = \\frac{V}{R} \\approx ${sig(I)}\\ \\text{A}$$`,
        ],
        sim: {
          params: p,
          hint: '$t = 0$ での「現在の値」の誘導起電力と誘導電流を見よう。再生すると、棒は減速して電流も小さくなっていく。',
        },
      };
    },
  },
  {
    id: 'braking-force',
    title: '棒が受ける電磁力',
    generate(rng) {
      const p: InductionParams = { ...pickRails(rng), F: 0, v0: pickStep(rng, 0.5, 3, 0.1) };
      const f = Math.abs(magneticForce(p, p.v0));
      return {
        statement: `${SETUP(p)}棒に、レールに沿った向きに初速 $${num(p.v0)}$ m/s を与えた。

動き始めた瞬間に、棒を流れる電流が磁場から受ける力の大きさ [N] を有効数字 2 桁で求めよ。`,
        answer: numeric(f, 'N'),
        solution: [
          `誘導電流は $I = \\dfrac{vBl}{R} \\approx ${sig(current(p, p.v0))}$ A。電流が磁場から受ける力は $IBl$ で、レンツの法則より棒の運動を妨げる向き。`,
          `$$f = IBl = \\frac{B^2l^2v}{R} = \\frac{${num(p.B)}^2 \\times ${num(p.l)}^2 \\times ${num(p.v0)}}{${num(p.R)}} \\approx ${sig(f)}\\ \\text{N}$$`,
        ],
        sim: {
          params: p,
          hint: '$t = 0$ での「現在の値」の「電流が受ける力」を見よう（右向きが正なので、負の値は運動と逆向き）。',
        },
      };
    },
  },
  {
    id: 'terminal-velocity',
    title: '一定の力で引いたときの終端速度',
    generate(rng) {
      // 画面で見られるように、終端速度が 5 m/s 以下になる条件を選ぶ
      let p: InductionParams;
      do {
        p = { ...pickRails(rng), F: pickStep(rng, 0.02, 0.5, 0.01), v0: 0 };
      } while (terminalVelocity(p) > 5);
      const vf = terminalVelocity(p);
      return {
        statement: `${SETUP(p)}静止していた棒を、レールに沿った向きに大きさ $${num(p.F)}$ N の一定の力で引き続けた。

十分に時間がたったときの棒の速さ $v_f$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(vf, 'm/s'),
        solution: [
          '速さ $v$ のとき、棒には引く力 $F$ と、運動を妨げる向きの電磁力 $\\dfrac{B^2l^2v}{R}$ がはたらく。速さが増すと電磁力が大きくなり、やがて 2 力がつりあって一定の速さになる。',
          `$$F = \\frac{B^2l^2v_f}{R} \\quad\\Longrightarrow\\quad v_f = \\frac{FR}{B^2l^2} = \\frac{${num(p.F)} \\times ${num(p.R)}}{${num(p.B)}^2 \\times ${num(p.l)}^2} \\approx ${sig(vf)}\\ \\text{m/s}$$`,
          'このとき、引く力の仕事率 $Fv_f$ はすべて抵抗の消費電力 $I^2R$ になる。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の終端速度を見よう。v-t グラフで速さが近づいていく値とも一致する。',
        },
      };
    },
  },
  {
    id: 'total-heat',
    title: '止まるまでに発生するジュール熱',
    generate(rng) {
      const p: InductionParams = { ...pickRails(rng), F: 0, v0: pickStep(rng, 0.5, 3, 0.1) };
      const Q = 0.5 * p.m * p.v0 * p.v0;
      return {
        statement: `${SETUP(p)}棒に、レールに沿った向きに初速 $${num(p.v0)}$ m/s を与えたところ、棒はしだいに減速した。

棒が止まるまでに抵抗で発生するジュール熱の総量 [J] を有効数字 2 桁で求めよ。`,
        answer: numeric(Q, 'J'),
        solution: [
          '電磁力は運動を妨げる向きにはたらき、棒の運動エネルギーは誘導電流のジュール熱に変わる（エネルギー保存）。摩擦はないので、運動エネルギーがすべて熱になる。',
          `$$Q = \\frac{1}{2}mv_0^{\\,2} = \\frac{1}{2} \\times ${num(p.m)} \\times ${num(p.v0)}^2 \\approx ${sig(Q)}\\ \\text{J}$$`,
          '磁束密度やレールの間隔は、止まるまでの時間を変えるが、熱の総量は変えない。',
        ],
        sim: {
          params: p,
          hint: '再生して十分に時間がたったときの「現在の値」のジュール熱と、はじめの運動エネルギーを比べよう。',
        },
      };
    },
  },
];
