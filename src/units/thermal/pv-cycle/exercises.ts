/**
 * 熱サイクル（p-V 図）の演習問題。正解は model.ts の関数で求める。
 * 答え合わせはサイクルの種類（choices.cycle）・気体の種類（choices.gas）とスライダーで指定する。
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
import { CYCLES, buildCycle, processEnergy, summarize, type CycleId, type GasKind } from './model';

const R_TEXT = '8.31';
const GAS_TEXT: Record<GasKind, { name: string; cv: string; cp: string }> = {
  monatomic: { name: '単原子分子', cv: '\\frac{3}{2}R', cp: '\\frac{5}{2}R' },
  diatomic: { name: '二原子分子', cv: '\\frac{5}{2}R', cp: '\\frac{7}{2}R' },
};

const choices = (cycle: CycleId, gas: GasKind) => ({ cycle, gas });

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'net-work',
    title: '1 サイクルの正味の仕事',
    generate(rng) {
      const n = pickStep(rng, 0.5, 2, 0.5);
      const TA = pickStep(rng, 200, 400, 50);
      const k = pickStep(rng, 1.5, 3, 0.5);
      const r = pickStep(rng, 1.5, 3, 0.5);
      const gas = pickOne(rng, ['monatomic', 'diatomic'] as const);
      const params = { n, TA, k, r };
      const W = summarize(buildCycle('rectangle', gas, params)).total.W;
      return {
        statement: `$${num(n)}$ mol の理想気体（${GAS_TEXT[gas].name}）を、状態 A（圧力 $p_0$、絶対温度 $${TA}$ K）から、定積変化 A→B で圧力を $${num(k)}$ 倍に、定圧変化 B→C で体積を $${num(r)}$ 倍にし、さらに定積変化 C→D、定圧変化 D→A を経て状態 A に戻した。気体定数を $${R_TEXT}$ J/(mol·K) とする。

この 1 サイクルの間に気体が外部にした正味の仕事 $W$ [J] を有効数字 2 桁で求めよ。`,
        answer: numeric(W, 'J'),
        solution: [
          'p-V 図でこのサイクルは長方形を時計回りにたどり、正味の仕事は長方形の面積に等しい（定積変化では仕事 0）。',
          `状態 A の体積を $V_0$ とすると、長方形の縦は $(${num(k)} - 1)p_0$、横は $(${num(r)} - 1)V_0$。`,
          `$$W = (${num(k)} - 1)(${num(r)} - 1)\\,p_0V_0 = (${num(k)} - 1)(${num(r)} - 1)\\,nRT_A = ${num((k - 1) * (r - 1))} \\times ${num(n)} \\times ${R_TEXT} \\times ${TA} \\approx ${sig(W)}\\ \\text{J}$$`,
          '正味の仕事は気体の種類（単原子か二原子か）によらない。',
        ],
        sim: {
          params,
          choices: choices('rectangle', gas),
          hint: '「現在の値」の表で、1 サイクルの合計の $W$ を見よう。p-V 図で囲まれた面積が正味の仕事になる。',
        },
      };
    },
  },
  {
    id: 'isobaric-heat',
    title: '定圧変化で吸収する熱量',
    generate(rng) {
      const n = pickStep(rng, 0.5, 2, 0.5);
      const TA = pickStep(rng, 200, 400, 50);
      const k = pickStep(rng, 1.5, 3, 0.5);
      const r = pickStep(rng, 1.5, 3, 0.5);
      const gas = pickOne(rng, ['monatomic', 'diatomic'] as const);
      const params = { n, TA, k, r };
      const proc = buildCycle('rectangle', gas, params).processes[1]!;
      const Q = processEnergy(gas, n, proc).Q;
      const TB = proc.start.T;
      const TC = proc.end.T;
      return {
        statement: `$${num(n)}$ mol の理想気体（${GAS_TEXT[gas].name}）が状態 A（絶対温度 $${TA}$ K）にある。体積を一定に保って圧力を $${num(k)}$ 倍にし（状態 B）、次に圧力を一定に保って体積を $${num(r)}$ 倍にした（状態 C）。気体定数を $${R_TEXT}$ J/(mol·K) とする。

B→C の変化で気体が吸収した熱量 $Q$ [J] を有効数字 2 桁で求めよ。`,
        answer: numeric(Q, 'J'),
        solution: [
          `ボイル・シャルルの法則より $T_B = ${num(k)}T_A = ${num(TB)}$ K、$T_C = ${num(r)}T_B = ${num(TC)}$ K。`,
          `定圧モル比熱は ${GAS_TEXT[gas].name}では $C_p = C_V + R = ${GAS_TEXT[gas].cp}$。`,
          `$$Q = nC_p(T_C - T_B) = ${num(n)} \\times ${GAS_TEXT[gas].cp.replace('R', `\\times ${R_TEXT}`)} \\times (${num(TC)} - ${num(TB)}) \\approx ${sig(Q)}\\ \\text{J}$$`,
          '吸収した熱の一部 $W = p\\Delta V = nR\\Delta T$ が外部への仕事に、残り $\\Delta U = nC_V\\Delta T$ が内部エネルギーの増加になる。',
        ],
        sim: {
          params,
          choices: choices('rectangle', gas),
          hint: '「現在の値」の表で、B→C の行の $Q$ を見よう。$Q = \\Delta U + W$ も確かめよう。',
        },
      };
    },
  },
  {
    id: 'carnot-efficiency',
    title: 'カルノーサイクルの熱効率',
    generate(rng) {
      const TA = pickStep(rng, 300, 500, 10);
      const tau = pickStep(rng, 0.5, 0.85, 0.05);
      const TC = Math.round(TA * tau * 10) / 10;
      const gas = pickOne(rng, ['monatomic', 'diatomic'] as const);
      const params = { n: 1, TA, r: pickStep(rng, 1.5, 3, 0.5), tau };
      const e = summarize(buildCycle('carnot', gas, params)).efficiency;
      return {
        statement: `理想気体（${GAS_TEXT[gas].name}）に、絶対温度 $${TA}$ K の高温熱源と $${num(TC)}$ K の低温熱源の間で、等温膨張 → 断熱膨張 → 等温圧縮 → 断熱圧縮 のサイクル（カルノーサイクル）を行わせた。

このサイクルの熱効率 $e$ を有効数字 2 桁で求めよ（百分率ではなく小数で答えよ）。`,
        answer: numeric(e),
        solution: [
          '等温変化では $\\Delta U = 0$ なので $Q = W = nRT\\ln(V_2/V_1)$。高温側で吸収する熱は $Q_1 = nRT_1\\ln(V_B/V_A)$、低温側で放出する熱は $Q_2 = nRT_2\\ln(V_C/V_D)$。',
          '2 つの断熱変化 $TV^{\\gamma - 1} = $ 一定 から $V_B/V_A = V_C/V_D$ となり、$Q_2/Q_1 = T_2/T_1$。',
          `$$e = 1 - \\frac{Q_2}{Q_1} = 1 - \\frac{T_2}{T_1} = 1 - \\frac{${num(TC)}}{${TA}} \\approx ${sig(e)}$$`,
          'カルノーサイクルの効率は熱源の温度だけで決まり、気体の種類や体積比によらない。同じ温度の間ではたらく熱機関の効率の上限である。',
        ],
        sim: {
          params,
          choices: choices('carnot', gas),
          hint: '「この条件での値」の熱効率を見よう。体積比や気体の種類を変えても効率が変わらないことを確かめよう。',
        },
      };
    },
  },
  {
    id: 'process-signs',
    title: '各過程の Q・W・ΔU の符号',
    generate(rng) {
      const cycle = pickOne(rng, ['rectangle', 'isothermal', 'carnot'] as const);
      const gas = pickOne(rng, ['monatomic', 'diatomic'] as const);
      const params = Object.fromEntries(CYCLES[cycle].params.map((s) => [s.key, s.default]));
      const c = buildCycle(cycle, gas, params);
      const index = Math.min(
        c.processes.length - 1,
        Math.floor(rng.uniform() * c.processes.length),
      );
      const proc = c.processes[index]!;
      const e = processEnergy(gas, c.n, proc);
      const scale = c.n * 8.314 * proc.start.T;
      const sign = (x: number) => (Math.abs(x) < 1e-9 * scale ? '= 0' : x > 0 ? '> 0' : '< 0');
      const fmt = (q: string, w: string, u: string) => `$Q ${q}$, $W ${w}$, $\\Delta U ${u}$`;
      const correct = fmt(sign(e.Q), sign(e.W), sign(e.dU));
      const all = ['> 0', '< 0', '= 0'];
      const wrong = new Set<string>();
      while (wrong.size < 3) {
        const cand = fmt(pickOne(rng, all), pickOne(rng, all), pickOne(rng, all));
        if (cand !== correct) wrong.add(cand);
      }
      const label = {
        isochoric: '定積変化',
        isobaric: '定圧変化',
        isothermal: '等温変化',
        adiabatic: '断熱変化',
      }[proc.kind];
      const dV = proc.end.V - proc.start.V;
      const dT = proc.end.T - proc.start.T;
      const desc =
        proc.kind === 'isochoric'
          ? `体積を一定に保ったまま温度を${dT > 0 ? '上げる' : '下げる'}`
          : proc.kind === 'isobaric'
            ? `圧力を一定に保ったまま体積を${dV > 0 ? '増やす' : '減らす'}`
            : proc.kind === 'isothermal'
              ? `温度を一定に保ったまま体積を${dV > 0 ? '増やす' : '減らす'}`
              : `熱の出入りがないようにして体積を${dV > 0 ? '増やす' : '減らす'}`;
      return {
        statement: `一定量の理想気体に、${label}（${desc}）を行わせた。この過程で気体が吸収した熱量を $Q$、気体が外部にした仕事を $W$、気体の内部エネルギーの変化を $\\Delta U$ とする。

$Q$, $W$, $\\Delta U$ の符号の組み合わせとして正しいものを選べ。`,
        answer: choice(rng, correct, ...wrong),
        solution: [
          '熱力学第一法則 $Q = \\Delta U + W$。$\\Delta U = nC_V\\Delta T$ は温度変化だけで決まり、$W$ は体積が増えれば正、減れば負、一定なら 0。',
          proc.kind === 'isochoric'
            ? `体積一定なので $W = 0$。温度が${dT > 0 ? '上がる' : '下がる'}ので $\\Delta U ${sign(e.dU)}$、$Q = \\Delta U ${sign(e.Q)}$。`
            : proc.kind === 'isobaric'
              ? `体積が${dV > 0 ? '増える' : '減る'}ので $W ${sign(e.W)}$。$pV = nRT$ より温度も${dT > 0 ? '上がり' : '下がり'} $\\Delta U ${sign(e.dU)}$。$Q = \\Delta U + W ${sign(e.Q)}$。`
              : proc.kind === 'isothermal'
                ? `温度一定なので $\\Delta U = 0$。体積が${dV > 0 ? '増える' : '減る'}ので $W ${sign(e.W)}$、$Q = W ${sign(e.Q)}$。`
                : `断熱なので $Q = 0$。体積が${dV > 0 ? '増える' : '減る'}ので $W ${sign(e.W)}$、$\\Delta U = -W ${sign(e.dU)}$（温度が${dT > 0 ? '上がる' : '下がる'}）。`,
        ],
        sim: {
          params,
          choices: choices(cycle, gas),
          hint: `このサイクルの ${proc.from}→${proc.to} が${label}。「現在の値」の表で、その行の $Q$, $W$, $\\Delta U$ の符号を確かめよう。`,
        },
        given: { index },
      };
    },
  },
];
