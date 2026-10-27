/**
 * 落下運動と放物運動の演習問題。空気抵抗のない問題は idealSummary（入試の公式）、
 * 空気抵抗のある問題は terminalSpeed で正解を求める。
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
import { G_ACCEL } from '@/core/physics/constants';
import { idealSummary, terminalSpeed, type ProjectileParams } from './model';

const TRIG: Record<number, { sin: string; cos: string }> = {
  30: { sin: '\\frac{1}{2}', cos: '\\frac{\\sqrt{3}}{2}' },
  45: { sin: '\\frac{\\sqrt{2}}{2}', cos: '\\frac{\\sqrt{2}}{2}' },
  60: { sin: '\\frac{\\sqrt{3}}{2}', cos: '\\frac{1}{2}' },
};
const g = num(G_ACCEL);
const GRAVITY = `重力加速度の大きさを $${g}$ m/s² とし、空気抵抗は無視する。`;

export const EXERCISES: readonly ExerciseTemplate[] = [
  {
    id: 'max-height',
    title: '斜方投射の最高点の高さ',
    generate(rng) {
      const theta = pickOne(rng, [30, 45, 60]);
      const p: ProjectileParams = { v0: pickStep(rng, 8, 25, 0.5), theta, h0: 0, k: 0, m: 1 };
      const H = idealSummary(p).maxHeight;
      return {
        statement: `水平な地面から、小球を水平と $${theta}^\\circ$ の角をなす向きに初速 $${num(p.v0)}$ m/s で投げ上げた。${GRAVITY}

小球が達する最高点の地面からの高さ $H$ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(H, 'm'),
        solution: [
          `鉛直方向は初速 $v_0\\sin\\theta$ の鉛直投げ上げ。最高点では速度の鉛直成分が 0 になるので、$0^2 - (v_0\\sin\\theta)^2 = -2gH$ より`,
          `$$H = \\frac{(v_0\\sin\\theta)^2}{2g} = \\frac{(${num(p.v0)} \\times ${TRIG[theta]!.sin})^2}{2 \\times ${g}} \\approx ${sig(H)}\\ \\text{m}$$`,
          '水平方向の速度は最高点でも 0 にならない（$v_0\\cos\\theta$ のまま）ことに注意。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の最高点の高さ $H$ を見よう。再生して軌跡の頂点の高さと比べてもよい。',
        },
      };
    },
  },
  {
    id: 'range',
    title: '斜方投射の水平到達距離',
    generate(rng) {
      const theta = pickOne(rng, [30, 45, 60]);
      const p: ProjectileParams = { v0: pickStep(rng, 8, 25, 0.5), theta, h0: 0, k: 0, m: 1 };
      const s = idealSummary(p);
      return {
        statement: `水平な地面から、小球を水平と $${theta}^\\circ$ の角をなす向きに初速 $${num(p.v0)}$ m/s で投げ上げた。${GRAVITY}

小球が地面に落下した点と投げた点との距離（水平到達距離）$R$ [m] を有効数字 2 桁で求めよ。`,
        answer: numeric(s.range, 'm'),
        solution: [
          `鉛直方向: $y = v_0\\sin\\theta\\,t - \\frac{1}{2}gt^2 = 0$ より、落下するまでの時間は $t_2 = \\dfrac{2v_0\\sin\\theta}{g} \\approx ${sig(s.flightTime)}$ s。`,
          '水平方向は等速 $v_0\\cos\\theta$ なので',
          `$$R = v_0\\cos\\theta \\cdot t_2 = \\frac{v_0^{\\,2}\\sin 2\\theta}{g} = \\frac{${num(p.v0)}^2 \\times \\sin ${2 * theta}^\\circ}{${g}} \\approx ${sig(s.range)}\\ \\text{m}$$`,
          '$\\sin 2\\theta$ が最大になる $\\theta = 45^\\circ$ で最も遠くまで届く。$30^\\circ$ と $60^\\circ$ では同じ距離になる。',
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の水平到達距離 $R$ を見よう。投射角を $30^\\circ$, $45^\\circ$, $60^\\circ$ に変えて距離を比べてみよう。',
        },
      };
    },
  },
  {
    id: 'horizontal-throw',
    title: '水平投射',
    generate(rng) {
      const p: ProjectileParams = {
        v0: pickStep(rng, 3, 15, 0.5),
        theta: 0,
        h0: pickStep(rng, 5, 30, 0.5),
        k: 0,
        m: 1,
      };
      const s = idealSummary(p);
      const askSpeed = rng.uniform() < 0.5;
      return {
        statement: `高さ $${num(p.h0)}$ m のがけの上から、小球を水平に初速 $${num(p.v0)}$ m/s で投げ出した。${GRAVITY}

${askSpeed ? '小球が地面に達する直前の速さ $v$ [m/s]' : '投げ出した点の真下から、小球が地面に落下した点までの距離 $x$ [m]'} を有効数字 2 桁で求めよ。`,
        answer: askSpeed ? numeric(s.landingSpeed, 'm/s') : numeric(s.range, 'm'),
        solution: [
          `鉛直方向は自由落下: $${num(p.h0)} = \\frac{1}{2} \\times ${g} \\times t^2$ より $t = \\sqrt{2h/g} \\approx ${sig(s.flightTime)}$ s。`,
          askSpeed
            ? `着地直前の速度の鉛直成分は $gt = \\sqrt{2gh}$、水平成分は $v_0$ のままなので $$v = \\sqrt{v_0^{\\,2} + 2gh} = \\sqrt{${num(p.v0)}^2 + 2 \\times ${g} \\times ${num(p.h0)}} \\approx ${sig(s.landingSpeed)}\\ \\text{m/s}$$`
            : `水平方向は等速なので $$x = v_0 t = ${num(p.v0)} \\times ${sig(s.flightTime)} \\approx ${sig(s.range)}\\ \\text{m}$$`,
          askSpeed
            ? '力学的エネルギー保存 $\\frac{1}{2}mv^2 = \\frac{1}{2}mv_0^{\\,2} + mgh$ からも同じ結果が得られる。'
            : '落下時間は水平方向の初速によらない（同じ高さから自由落下させた物体と同時に着地する）。',
        ],
        sim: {
          params: p,
          hint: askSpeed
            ? '「この条件での値」の着地の速さを見よう。'
            : '「この条件での値」の水平到達距離と滞空時間を見よう。初速を変えても滞空時間は変わらない。',
        },
        given: { askSpeed: askSpeed ? 1 : 0 },
      };
    },
  },
  {
    id: 'terminal-speed',
    title: '空気抵抗と終端速度',
    generate(rng) {
      // 答え合わせの条件（高さ 30 m から落とす）で終端速度にほぼ達するよう、時定数 τ = m/k を 1.2 s 以下にする
      // （3τ で終端速度の 95% に達し、それまでに落ちる距離は約 2gτ² ≤ 29 m）
      const k = pickStep(rng, 0.2, 1, 0.02);
      const m = pickStep(rng, 0.1, Math.max(0.1, Math.floor(k * 12 + 1e-9) / 10), 0.1);
      const p: ProjectileParams = { v0: 0, theta: 90, h0: 30, k, m };
      const vT = terminalSpeed(p);
      const half = m / 2;
      return {
        statement: `質量 $${num(m)}$ kg の小球を高い位置から静かに落とした。小球には速さ $v$ に比例する大きさ $kv$ の空気抵抗がはたらき、比例定数は $k = ${num(k)}$ kg/s である。重力加速度の大きさを $${g}$ m/s² とする。

十分に時間がたったときの小球の速さ（終端速度）$v_{\\mathrm{T}}$ [m/s] を有効数字 2 桁で求めよ。`,
        answer: numeric(vT, 'm/s'),
        solution: [
          '下向きを正とすると、運動方程式は $ma = mg - kv$。速さが増すと抵抗力が大きくなり、加速度は小さくなっていく。',
          '十分時間がたつと $a = 0$（重力と抵抗力がつりあう）になり、一定の速さで落ちる:',
          `$$mg = kv_{\\mathrm{T}} \\quad\\Longrightarrow\\quad v_{\\mathrm{T}} = \\frac{mg}{k} = \\frac{${num(m)} \\times ${g}}{${num(k)}} \\approx ${sig(vT)}\\ \\text{m/s}$$`,
          `終端速度は質量に比例する。例えば質量を $${num(half)}$ kg にすると終端速度は半分になる。`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の終端速度を見よう。v-t グラフで、速さが終端速度に近づいていく様子（加速度が 0 に近づく）を確かめよう。',
        },
      };
    },
  },
  {
    id: 'compare-fall',
    title: '同時に投げた 2 球（定性）',
    generate(rng) {
      const h0 = pickStep(rng, 5, 30, 0.5);
      const v0 = pickStep(rng, 3, 15, 0.5);
      const p: ProjectileParams = { v0, theta: 0, h0, k: 0, m: 1 };
      return {
        statement: `高さ $${num(h0)}$ m の位置から、小球 P を水平に初速 $${num(v0)}$ m/s で投げ出すと同時に、同じ高さから小球 Q を静かに放した。${GRAVITY}

P と Q が地面に達する時刻について正しいものを選べ。`,
        answer: choice(
          rng,
          'P と Q は同時に地面に達する',
          'P のほうが先に地面に達する',
          'Q のほうが先に地面に達する',
          'P の質量が大きければ P のほうが先に達する',
        ),
        solution: [
          '水平方向と鉛直方向の運動は独立に考えられる。P の鉛直方向の初速度は 0 で、加速度は Q と同じ $g$ なので、鉛直方向の運動は P も Q も同じ自由落下になる。',
          `よって同時に着地し、その時刻は $t = \\sqrt{2h/g} = \\sqrt{2 \\times ${num(h0)}/${g}} \\approx ${sig(idealSummary(p).flightTime)}$ s。空気抵抗がなければ質量にもよらない。`,
        ],
        sim: {
          params: p,
          hint: '「この条件での値」の滞空時間を見たあと、初速 $v_0$ を 0 にして（Q と同じ条件）滞空時間が変わらないことを確かめよう。',
        },
      };
    },
  },
];
