/**
 * 回路エディタの演習問題（直流回路・キルヒホッフの法則・コンデンサーを含む回路）。
 * 問題の回路を格子の上に組み、答え合わせではその回路（encodeCircuit の文字列）をエディタに読み込む。
 * 正解はオームの法則・キルヒホッフの法則から求める（テストで回路のソルバーと照らし合わせる）。
 */
import { num, numeric, pickStep, sig, type ExerciseTemplate } from '@/core/exercise';
import { circuitFrom, encodeCircuit, type Circuit } from './model';

/** 答え合わせの設定（回路エディタにはスライダーがないので params は空） */
function sim(circuit: Circuit, hint: string, timeScale = 1 / 100) {
  return { params: {}, state: encodeCircuit(circuit, timeScale), hint };
}

/**
 * 直並列回路。電池 E → R₁ → 電流計 A₁ → (R₂ ∥ R₃)
 *   (0,1)─R₁─(1,1)─A₁─(2,1)───(3,1)
 *     E               R₂        R₃
 *   (0,2)           (2,2)     (3,2)
 *   (0,3)──(1,3)──(2,3)──(3,3)
 */
export function seriesParallelCircuit(E: number, R1: number, R2: number, R3: number): Circuit {
  return circuitFrom([
    ['dc', [0, 2], [0, 1], { E }],
    ['resistor', [0, 1], [1, 1], { R: R1 }],
    ['ammeter', [1, 1], [2, 1]],
    ['wire', [2, 1], [3, 1]],
    ['resistor', [2, 1], [2, 2], { R: R2 }],
    ['resistor', [3, 1], [3, 2], { R: R3 }],
    ['wire', [0, 2], [0, 3]],
    ['wire', [2, 2], [2, 3]],
    ['wire', [3, 2], [3, 3]],
    ['wire', [0, 3], [1, 3]],
    ['wire', [1, 3], [2, 3]],
    ['wire', [2, 3], [3, 3]],
  ]);
}

/**
 * 2 つの電池と 3 つの抵抗（キルヒホッフの法則）。R₃ を流れる電流を電流計 A₁ で測る
 *   (0,1)─R₁─(1,1)──(2,1)─R₂─(3,1)──(4,1)
 *    E₁               R₃               E₂
 *   (0,2)            (2,2)            (4,2)
 *                     A₁
 *   (0,3)──(1,3)──(2,3)──(3,3)──(4,3)
 */
export function kirchhoffCircuit(
  E1: number,
  E2: number,
  R1: number,
  R2: number,
  R3: number,
): Circuit {
  return circuitFrom([
    ['dc', [0, 2], [0, 1], { E: E1 }],
    ['wire', [0, 2], [0, 3]],
    ['resistor', [0, 1], [1, 1], { R: R1 }],
    ['wire', [1, 1], [2, 1]],
    ['resistor', [3, 1], [2, 1], { R: R2 }],
    ['wire', [3, 1], [4, 1]],
    ['dc', [4, 2], [4, 1], { E: E2 }],
    ['wire', [4, 2], [4, 3]],
    ['resistor', [2, 1], [2, 2], { R: R3 }],
    ['ammeter', [2, 2], [2, 3]],
    ['wire', [0, 3], [1, 3]],
    ['wire', [1, 3], [2, 3]],
    ['wire', [2, 3], [3, 3]],
    ['wire', [3, 3], [4, 3]],
  ]);
}

/**
 * コンデンサーを含む直流回路。スイッチ S₁ を閉じて十分に時間がたつと、C には R₂ と同じ電圧がかかる
 *   (0,1)─S₁─(1,1)─R₁─(2,1)───(3,1)
 *     E                C        R₂
 *   (0,2)            (2,2)    (3,2)
 *   (0,3)──(1,3)──(2,3)──(3,3)
 */
export function capacitorCircuit(E: number, R1: number, R2: number, C: number): Circuit {
  return circuitFrom([
    ['dc', [0, 2], [0, 1], { E }],
    ['switch', [0, 1], [1, 1]],
    ['resistor', [1, 1], [2, 1], { R: R1 }],
    ['wire', [2, 1], [3, 1]],
    ['capacitor', [2, 1], [2, 2], { C, V0: 0 }],
    ['resistor', [3, 1], [3, 2], { R: R2 }],
    ['wire', [0, 2], [0, 3]],
    ['wire', [2, 2], [2, 3]],
    ['wire', [3, 2], [3, 3]],
    ['wire', [0, 3], [1, 3]],
    ['wire', [1, 3], [2, 3]],
    ['wire', [2, 3], [3, 3]],
  ]);
}

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'series-parallel',
    title: '直並列回路の電流',
    generate(rng) {
      const E = pickStep(rng, 3, 12, 0.5);
      const R1 = pickStep(rng, 50, 500, 10);
      const R2 = pickStep(rng, 50, 500, 10);
      const R3 = pickStep(rng, 50, 500, 10);
      const Rp = (R2 * R3) / (R2 + R3);
      const I = (E / (R1 + Rp)) * 1e3;
      return {
        statement: `起電力 $${num(E)}$ V の電池（内部抵抗は無視できる）に、抵抗値 $${R1}$ Ω の抵抗 $R_1$ を直列につなぎ、さらに抵抗値 $${R2}$ Ω の抵抗 $R_2$ と $${R3}$ Ω の抵抗 $R_3$ を並列につないだものを直列に接続した。

電池を流れる電流 [mA] を有効数字 2 桁で求めよ。`,
        answer: numeric(I, 'mA'),
        solution: [
          `$R_2$ と $R_3$ の並列部分の合成抵抗は $$\\frac{1}{R_{23}} = \\frac{1}{${R2}} + \\frac{1}{${R3}} \\quad\\Longrightarrow\\quad R_{23} = \\frac{R_2R_3}{R_2 + R_3} \\approx ${num(Rp, 1)}\\ \\Omega$$`,
          `全体の合成抵抗は $R_1 + R_{23} \\approx ${num(R1 + Rp, 1)}$ Ω。`,
          `$$I = \\frac{E}{R_1 + R_{23}} = \\frac{${num(E)}}{${num(R1 + Rp, 1)}} \\approx ${sig(I / 1e3)}\\ \\text{A} = ${sig(I)}\\ \\text{mA}$$`,
        ],
        sim: sim(
          seriesParallelCircuit(E, R1, R2, R3),
          '問題の回路を組んである。電流計 A₁ の読み（「現在の値」の表）を見よう。$R_2$, $R_3$ を流れる電流の和が A₁ の電流になっている。',
        ),
      };
    },
  },
  {
    id: 'kirchhoff',
    title: 'キルヒホッフの法則',
    generate(rng) {
      const E1 = pickStep(rng, 2, 12, 0.5);
      const E2 = pickStep(rng, 2, 12, 0.5);
      const R1 = pickStep(rng, 50, 500, 10);
      const R2 = pickStep(rng, 50, 500, 10);
      const R3 = pickStep(rng, 50, 500, 10);
      const V = (E1 / R1 + E2 / R2) / (1 / R1 + 1 / R2 + 1 / R3);
      const I3 = (V / R3) * 1e3;
      return {
        statement: `起電力 $E_1 = ${num(E1)}$ V の電池 $E_1$ と抵抗 $R_1 = ${R1}$ Ω を直列にした枝、起電力 $E_2 = ${num(E2)}$ V の電池 $E_2$ と抵抗 $R_2 = ${R2}$ Ω を直列にした枝、抵抗 $R_3 = ${R3}$ Ω だけの枝の 3 本を、2 つの点 P, Q の間に並列につないだ。どちらの電池も正極が P 側にある。電池の内部抵抗は無視できる。

$R_3$ を流れる電流の大きさ [mA] を有効数字 2 桁で求めよ。`,
        answer: numeric(I3, 'mA'),
        solution: [
          'Q の電位を 0、P の電位を $V$ として、P に流れ込む電流の和が 0（キルヒホッフの第 1 法則）。各枝の電流はオームの法則（第 2 法則）で表せる:',
          `$$\\frac{${num(E1)} - V}{${R1}} + \\frac{${num(E2)} - V}{${R2}} = \\frac{V}{${R3}}$$`,
          `これを解いて $V \\approx ${sig(V)}$ V。$R_3$ を流れる電流は $$I_3 = \\frac{V}{R_3} \\approx ${sig(I3 / 1e3)}\\ \\text{A} = ${sig(I3)}\\ \\text{mA}$$`,
          '各枝の電流を未知数にして、閉回路ごとに「起電力の和 = 電圧降下の和」を立てて解いてもよい。',
        ],
        sim: sim(
          kirchhoffCircuit(E1, E2, R1, R2, R3),
          '問題の回路を組んである（P は上の導線、Q は下の導線）。$R_3$ と直列の電流計 A₁ の読みを見よう。各抵抗の電流も表で確かめよう。',
        ),
      };
    },
  },
  {
    id: 'capacitor-charge',
    title: 'コンデンサーを含む直流回路',
    generate(rng) {
      const E = pickStep(rng, 3, 12, 0.5);
      const R1 = pickStep(rng, 50, 500, 10);
      const R2 = pickStep(rng, 50, 500, 10);
      const C = pickStep(rng, 50, 500, 10);
      const VC = (E * R2) / (R1 + R2);
      const Q = C * VC; // μC
      return {
        statement: `起電力 $${num(E)}$ V の電池（内部抵抗は無視できる）、スイッチ S、抵抗値 $${R1}$ Ω の抵抗 $R_1$ を直列につなぎ、その先に、電気容量 $${C}$ μF のコンデンサーと抵抗値 $${R2}$ Ω の抵抗 $R_2$ を並列につないだものを接続した。はじめコンデンサーに電荷はない。

S を閉じて十分に時間がたったとき、コンデンサーに蓄えられている電気量 [μC] を有効数字 2 桁で求めよ。`,
        answer: numeric(Q, 'μC'),
        solution: [
          '十分に時間がたつとコンデンサーの充電が終わり、コンデンサーには電流が流れない。電流は $R_1$ と $R_2$ だけを流れる。',
          `$$I = \\frac{E}{R_1 + R_2} = \\frac{${num(E)}}{${R1 + R2}} \\approx ${sig(E / (R1 + R2))}\\ \\text{A}$$`,
          `コンデンサーの電圧は並列の $R_2$ の電圧に等しく $V = R_2I \\approx ${sig(VC)}$ V。`,
          `$$Q = CV = ${C} \\times 10^{-6} \\times ${sig(VC)} \\approx ${sig(Q)} \\times 10^{-6}\\ \\text{C}$$`,
        ],
        sim: sim(
          capacitorCircuit(E, R1, R2, C),
          'スイッチ S₁ を「閉じる」にして再生し、十分に時間がたったときのコンデンサーの電圧（表）を読んで、電気量 $Q = CV$ を確かめよう。',
          1 / 10,
        ),
      };
    },
  },
];
