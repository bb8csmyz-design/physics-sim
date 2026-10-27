/**
 * 力学サンドボックスの物理モデルのテスト。
 * 公式（周期・加速度・衝突後の速度・跳ね返りの高さ）との一致、保存則（力学的エネルギー・運動量、
 * 摩擦や衝突があるときは E + Q）、静止したままの状態、パラメータ範囲の全域での安定性を確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import { ellipticK } from '@/core/physics/special';
import { collide } from './collide';
import { BALL_SPECS, BLOCK_SPECS, SPRING_SPECS, pointOnSlope } from './design';
import {
  DT,
  PARAMS,
  bodyShape,
  compile,
  energies,
  fixtureShape,
  initialState,
  momentum,
  step,
  stringLength,
  type BodyDef,
  type InclineDef,
  type SandboxDesign,
  type SandboxParams,
  type SandboxState,
  type SandboxWorld,
  type WallDef,
} from './model';
import { defaultFloor, preset, presets } from './presets';

const DEFAULT = defaultParams(PARAMS);
const SMOOTH: SandboxParams = { ...DEFAULT, mu: 0, muk: 0 };
const FLOOR = defaultFloor();

/** duration 秒進め、各ステップのあとに onStep(state, t) を呼ぶ */
function simulate(
  world: SandboxWorld,
  duration: number,
  onStep?: (s: SandboxState, t: number) => void,
  s0: SandboxState = initialState(world),
): SandboxState {
  let s = s0;
  const n = Math.round(duration / DT);
  for (let i = 1; i <= n; i++) {
    s = step(world, s, DT);
    onStep?.(s, i * DT);
  }
  return s;
}

function ball(id: string, x: number, y: number, m = 1, vx = 0, vy = 0, r = 0.12): BodyDef {
  return { kind: 'ball', id, x, y, r, m, vx, vy };
}

function block(id: string, x: number, y: number, m = 1, vx = 0, vy = 0, angle = 0): BodyDef {
  return { kind: 'block', id, x, y, w: 0.3, h: 0.3, angle, m, vx, vy };
}

function world(d: Partial<SandboxDesign>, p: SandboxParams = DEFAULT): SandboxWorld {
  return compile({ bodies: [], fixtures: [], joints: [], ...d }, p);
}

/** 最大のめり込みの深さ [m]（物体どうし・物体と固定物） */
function maxPenetration(d: SandboxDesign, s: SandboxState): number {
  const at = (b: BodyDef, i: number) => ({ shape: bodyShape(b), x: s.x[i]!, y: s.y[i]! });
  let worst = 0;
  d.bodies.forEach((b, i) => {
    const A = at(b, i);
    for (const f of d.fixtures) {
      const F = fixtureShape(f);
      worst = Math.max(worst, -collide(A.shape, A.x, A.y, F.shape, F.x, F.y).sep);
    }
    d.bodies.slice(i + 1).forEach((o, k) => {
      const B = at(o, i + 1 + k);
      worst = Math.max(worst, -collide(A.shape, A.x, A.y, B.shape, B.x, B.y).sep);
    });
  });
  return worst;
}

describe('落下運動と放物運動', () => {
  it('重力だけを受ける物体は解析解 x = x₀ + v₀t, y = y₀ + v₀t − ½gt² どおりに動く', () => {
    const w = world({ bodies: [ball('A', 0.5, 2, 1.5, 3, 4)] });
    let maxErr = 0;
    simulate(w, 1.2, (s, t) => {
      maxErr = Math.max(
        maxErr,
        Math.abs(s.x[0]! - (0.5 + 3 * t)),
        Math.abs(s.y[0]! - (2 + 4 * t - 0.5 * G_ACCEL * t * t)),
      );
    });
    // 速度ベルレ法は一定の加速度に対して厳密（誤差は丸め誤差だけ）
    expect(maxErr).toBeLessThan(1e-9);
  });

  it('運動量の水平成分と力学的エネルギーが保存される', () => {
    const w = world({ bodies: [ball('A', 0.5, 2, 1.5, 3, 4)] });
    const e0 = energies(w, initialState(w)).total;
    simulate(w, 1.2, (s) => {
      expect(momentum(w, s).px).toBeCloseTo(4.5, 10); // 速度を (x′ − x)/Δt から求める丸め誤差だけ
      // 丸め誤差だけ（位置・速度の丸め誤差 1e-16 程度が 2400 ステップで積み重なる）
      expect(relativeError(energies(w, s).total, e0)).toBeLessThan(1e-10);
    });
  });

  it('g = 0 なら等速直線運動、静止した物体は静止したまま', () => {
    const w = world(
      { bodies: [ball('A', 1, 1, 1, 0.5, -0.2), ball('B', 4, 2)] },
      { ...DEFAULT, g: 0 },
    );
    const s = simulate(w, 2);
    expect(s.x[0]).toBeCloseTo(2, 12);
    expect(s.y[0]).toBeCloseTo(0.6, 12);
    expect([s.x[1], s.y[1], s.vx[1], s.vy[1]]).toEqual([4, 2, 0, 0]);
  });
});

describe('単振り子（糸）', () => {
  function pendulum(theta0: number, L = 1.5): SandboxDesign {
    return {
      bodies: [ball('A', 3 + L * Math.sin(theta0), 3.2 - L * Math.cos(theta0))],
      fixtures: [],
      joints: [{ kind: 'string', id: 'c1', a: { body: 'A' }, b: { x: 3, y: 3.2 }, via: null, L }],
    };
  }

  it('周期が厳密な公式 T = 4√(L/g)·K(sin(θ₀/2)) と一致する（振幅 3°〜80°）', () => {
    for (const deg of [3, 30, 80]) {
      const th = (deg * Math.PI) / 180;
      const L = 1.5;
      const w = compile(pendulum(th, L), DEFAULT);
      const exact = 4 * Math.sqrt(L / G_ACCEL) * ellipticK(Math.sin(th / 2));
      const ts: number[] = [];
      const xs: number[] = [];
      simulate(w, 5.3 * exact, (s, t) => {
        ts.push(t);
        xs.push(s.x[0]! - 3);
      });
      // 速度ベルレ法 + RATTLE の位相誤差は (ωΔt)²/24 程度（≈ 3e-8）
      expect(relativeError(estimatePeriod(ts, xs), exact), `${deg}°`).toBeLessThan(1e-5);
    }
  });

  it('振幅が小さいとき T ≈ 2π√(L/g)（等時性）', () => {
    const w = compile(pendulum(0.03), DEFAULT);
    const T = 2 * Math.PI * Math.sqrt(1.5 / G_ACCEL);
    const ts: number[] = [];
    const xs: number[] = [];
    simulate(w, 5.3 * T, (s, t) => {
      ts.push(t);
      xs.push(s.x[0]! - 3);
    });
    // 振幅による補正は θ₀²/16 ≈ 6e-5
    expect(relativeError(estimatePeriod(ts, xs), T)).toBeLessThan(1e-4);
  });

  it('糸の長さが一定に保たれ、力学的エネルギーが 30 周期にわたって保存されドリフトしない', () => {
    const w = compile(pendulum(1.0), DEFAULT);
    const e0 = energies(w, initialState(w)).total;
    const T = 4 * Math.sqrt(1.5 / G_ACCEL) * ellipticK(Math.sin(0.5));
    const n = Math.round((30 * T) / DT);
    let firstMax = 0;
    let lastMax = 0;
    let lenErr = 0;
    let i = 0;
    simulate(w, 30 * T, (s) => {
      i++;
      const err = relativeError(energies(w, s).total, e0);
      if (i <= n / 10) firstMax = Math.max(firstMax, err);
      if (i > n - n / 10) lastMax = Math.max(lastMax, err);
      lenErr = Math.max(lenErr, Math.abs(stringLength(w.strings[0]!, s) - 1.5));
    });
    expect(lenErr).toBeLessThan(1e-9);
    // RATTLE 法（シンプレクティック）のエネルギー誤差は (ωΔt)² 程度で頭打ちになる
    expect(Math.max(firstMax, lastMax)).toBeLessThan(1e-5);
    expect(lastMax).toBeLessThan(firstMax * 1.5 + 1e-12);
  });

  it('糸がたるむと物体は放物運動をし、急に張ると失われたエネルギーが Q に記録される', () => {
    // 固定点の真下 0.5 m（糸の長さ 1 m）から真上に投げ上げる → 糸はたるんだまま上がって落ち、
    // 固定点の 1 m 下を通るときに糸が急に張る
    const d: SandboxDesign = {
      bodies: [ball('A', 3, 2.7, 1, 0.8, 1)],
      fixtures: [],
      joints: [
        { kind: 'string', id: 'c1', a: { body: 'A' }, b: { x: 3, y: 3.2 }, via: null, L: 1 },
      ],
    };
    const w = compile(d, DEFAULT);
    const e0 = energies(w, initialState(w)).budget;
    let slackFree = true;
    let maxBudgetErr = 0;
    simulate(w, 2, (s, t) => {
      if (t < 0.25) {
        // たるんでいる間は放物運動
        slackFree &&= Math.abs(s.x[0]! - (3 + 0.8 * t)) < 1e-9;
      }
      maxBudgetErr = Math.max(maxBudgetErr, Math.abs(energies(w, s).budget - e0));
      expect(stringLength(w.strings[0]!, s)).toBeLessThan(1 + 1e-9);
    });
    const s = simulate(w, 2);
    expect(slackFree).toBe(true);
    expect(energies(w, s).collision).toBeGreaterThan(0.1);
    // 張る瞬間の速さを等加速度の式で推定するので、誤差は (gΔt)² 程度の量だけ
    expect(maxBudgetErr / e0).toBeLessThan(1e-4);
  });
});

describe('ばね', () => {
  it('水平ばね振り子（なめらかな床）: 周期 T = 2π√(m/k) とエネルギー保存', () => {
    for (const [m, k] of [
      [1, 20],
      [0.1, 200],
      [5, 5],
    ] as const) {
      const d = preset('spring').design;
      d.bodies[0]!.m = m;
      (d.joints[0] as { k: number }).k = k;
      const w = compile(d, SMOOTH);
      const T = 2 * Math.PI * Math.sqrt(m / k);
      const e0 = energies(w, initialState(w)).total;
      const ts: number[] = [];
      const xs: number[] = [];
      let eErr = 0;
      simulate(w, 5.3 * T, (s, t) => {
        ts.push(t);
        xs.push(s.x[0]! - 2.0); // つりあいの位置（固定点 0.4 m + 自然長 1.6 m）
        eErr = Math.max(eErr, relativeError(energies(w, s).total, e0));
        expect(s.y[0]).toBeCloseTo(0.15, 9); // 床から浮かず、めり込まない
      });
      expect(relativeError(estimatePeriod(ts, xs), T), `m=${m}, k=${k}`).toBeLessThan(1e-4);
      // 速度ベルレ法のエネルギー誤差は (ωΔt)²/4 程度
      expect(eErr).toBeLessThan((Math.sqrt(k / m) * DT) ** 2);
    }
  });

  it('鉛直ばね振り子: つりあいの位置（自然長 + mg/k）を中心に周期 2π√(m/k) で振動する', () => {
    const w = compile(preset('vertical-spring').design, DEFAULT);
    const { m } = w.bodies[0]!;
    const { k, L0 } = w.springs[0]!;
    const yEq = 3.2 - L0 - (m * G_ACCEL) / k;
    const T = 2 * Math.PI * Math.sqrt(m / k);
    const e0 = energies(w, initialState(w)).total;
    const ts: number[] = [];
    const ys: number[] = [];
    let eErr = 0;
    simulate(w, 5.3 * T, (s, t) => {
      ts.push(t);
      ys.push(s.y[0]! - yEq);
      eErr = Math.max(eErr, Math.abs(energies(w, s).total - e0));
    });
    expect(relativeError(estimatePeriod(ts, ys), T)).toBeLessThan(1e-4);
    expect(Math.max(...ys)).toBeCloseTo(0.3, 4);
    expect(Math.min(...ys)).toBeCloseTo(-0.3, 4);
    // 振動のエネルギー ½kA² に対して (ωΔt)²/4 程度
    expect(eErr).toBeLessThan(0.5 * k * 0.3 ** 2 * (Math.sqrt(k / m) * DT) ** 2);
  });

  it('無重力でばねでつながれた 2 物体: 運動量の和が保存され、重心は等速直線運動をする', () => {
    const d: SandboxDesign = {
      bodies: [ball('A', 2, 2, 1, 1.5, 0.4), ball('B', 3, 2, 3, -0.5, 0)],
      fixtures: [],
      joints: [{ kind: 'spring', id: 's1', a: { body: 'A' }, b: { body: 'B' }, k: 50, L0: 0.8 }],
    };
    const w = compile(d, { ...DEFAULT, g: 0 });
    const p0 = momentum(w, initialState(w));
    const e0 = energies(w, initialState(w)).total;
    const vg = { x: p0.px / 4, y: p0.py / 4 };
    simulate(w, 3, (s, t) => {
      const p = momentum(w, s);
      // 内力（ばねの力）は作用・反作用なので、運動量は丸め誤差の範囲で保存される
      expect(p.px).toBeCloseTo(p0.px, 10);
      expect(p.py).toBeCloseTo(p0.py, 10);
      expect((s.x[0]! + 3 * s.x[1]!) / 4).toBeCloseTo((2 + 9) / 4 + vg.x * t, 9);
      expect((s.y[0]! + 3 * s.y[1]!) / 4).toBeCloseTo(2 + vg.y * t, 9);
      expect(relativeError(energies(w, s).total, e0)).toBeLessThan(1e-4);
    });
  });
});

describe('斜面と摩擦', () => {
  function inclineWorld(
    deg: number,
    mu: number,
    muk: number,
    m = 1,
  ): {
    w: SandboxWorld;
    d: SandboxDesign;
  } {
    const inc: InclineDef = {
      kind: 'incline',
      id: 'i1',
      x: 3.2,
      y: 0,
      w: 4,
      angle: deg,
      flip: false,
    };
    const c = pointOnSlope(inc, 3.5, 0.3);
    const d: SandboxDesign = {
      bodies: [block('A', c.x, c.y, m, 0, 0, deg)],
      fixtures: [FLOOR, inc],
      joints: [],
    };
    return { w: compile(d, { ...DEFAULT, mu, muk }), d };
  }

  it('滑り降りる加速度が a = g(sinθ − μ′cosθ)、tanθ ≤ μ なら静止したまま', () => {
    for (const [deg, mu, muk] of [
      [30, 0, 0],
      [30, 0.3, 0.2],
      [45, 0.5, 0.5],
      [20, 0.36, 0.1], // tan 20° = 0.364 > μ: ぎりぎり滑る
      [20, 0.37, 0.1], // tan 20° < μ: 静止
      [60, 1, 1],
    ] as const) {
      const { w } = inclineWorld(deg, mu, muk);
      const th = (deg * Math.PI) / 180;
      const s = simulate(w, 0.6);
      const dist = Math.hypot(s.x[0]! - w.x0[0]!, s.y[0]! - w.y0[0]!);
      const label = `θ=${deg}°, μ=${mu}, μ'=${muk}`;
      if (Math.tan(th) <= mu) {
        expect(dist, label).toBeLessThan(1e-12);
      } else {
        const a = G_ACCEL * (Math.sin(th) - muk * Math.cos(th));
        expect(relativeError(dist, 0.5 * a * 0.6 ** 2), label).toBeLessThan(1e-8);
      }
    }
  });

  it('摩擦熱 Q = μ′N × 滑った距離 で、E + Q が保存される', () => {
    const { w } = inclineWorld(30, 0.3, 0.2, 2);
    const e0 = energies(w, initialState(w)).total;
    const N = 2 * G_ACCEL * Math.cos(Math.PI / 6);
    simulate(w, 0.6, (s) => {
      const e = energies(w, s);
      const dist = Math.hypot(s.x[0]! - w.x0[0]!, s.y[0]! - w.y0[0]!);
      expect(relativeError(e.friction, 0.2 * N * dist + 1e-300)).toBeLessThan(1e-6);
      expect(Math.abs(e.budget - e0)).toBeLessThan(1e-9 * e0);
    });
  });

  it('なめらかな床の上を滑る物体は等速、粗い床では μ′g で減速して止まり、運動エネルギーがすべて熱になる', () => {
    const d = (v: number): SandboxDesign => ({
      bodies: [block('A', 1, 0.15, 2, v)],
      fixtures: [FLOOR],
      joints: [],
    });
    const smooth = simulate(compile(d(2), SMOOTH), 1);
    expect(smooth.x[0]).toBeCloseTo(3, 10);
    const w = compile(d(3), { ...DEFAULT, mu: 0.5, muk: 0.4 });
    const s = simulate(w, 1.5);
    // 止まるまでの距離 v²/(2μ′g)
    expect(relativeError(s.x[0]! - 1, 9 / (2 * 0.4 * G_ACCEL))).toBeLessThan(1e-3);
    expect(s.vx[0]).toBe(0);
    // 止まる直前の 1 ステップの減速（速さ μ′gΔt 以下）は静止摩擦として扱うので、
    // その運動エネルギー ½m(μ′gΔt)² ≈ 4e-6 J だけ熱に数えない
    expect(energies(w, s).friction).toBeCloseTo(0.5 * 2 * 9, 4);
  });
});

describe('滑車', () => {
  it('アトウッドの器械: 加速度 a = (m_A − m_B)g/(m_A + m_B)、糸の長さ一定、エネルギー保存', () => {
    for (const [mA, mB] of [
      [2, 1],
      [1, 3],
      [0.5, 0.5],
    ] as const) {
      const d = preset('atwood').design;
      d.bodies[0]!.m = mA;
      d.bodies[1]!.m = mB;
      const w = compile(d, DEFAULT);
      const e0 = energies(w, initialState(w)).total;
      const T = 0.4;
      const s = simulate(w, T, (st) => {
        expect(Math.abs(stringLength(w.strings[0]!, st) - w.strings[0]!.L)).toBeLessThan(1e-9);
        expect(Math.abs(energies(w, st).total - e0)).toBeLessThan(1e-9);
      });
      const a = ((mA - mB) / (mA + mB)) * G_ACCEL;
      expect(s.y[0]! - w.y0[0]!).toBeCloseTo(-0.5 * a * T * T, 8);
      expect(s.y[1]! - w.y0[1]!).toBeCloseTo(0.5 * a * T * T, 8);
      // 糸は鉛直なので、水平には動かない
      expect(s.x[0]).toBeCloseTo(w.x0[0]!, 9);
    }
  });

  it('机の上の物体と滑車: 滑るなら a = (m_B − μ′m_A)g/(m_A + m_B)、μm_A ≥ m_B なら静止したまま', () => {
    for (const [mu, muk] of [
      [0, 0],
      [0.3, 0.2],
      [0.55, 0.4], // μ m_A = 1.1 ≥ m_B = 1 → 静止
      [0.6, 0.6],
    ] as const) {
      const d = preset('table').design; // m_A = 2 kg（机の上）, m_B = 1 kg（つり下げ）
      const w = compile(d, { ...DEFAULT, mu, muk });
      const T = 0.5;
      const e0 = energies(w, initialState(w)).total;
      const s = simulate(w, T);
      const dx = s.x[0]! - w.x0[0]!;
      const dy = s.y[1]! - w.y0[1]!;
      if (mu * 2 >= 1) {
        expect(Math.abs(dx) + Math.abs(dy), `μ=${mu}`).toBeLessThan(1e-12);
      } else {
        const a = ((1 - muk * 2) / 3) * G_ACCEL;
        expect(relativeError(dx, 0.5 * a * T * T), `μ=${mu}`).toBeLessThan(1e-6);
        expect(dy).toBeCloseTo(-dx, 9);
        // 摩擦熱 = μ′ m_A g × 滑った距離 で、E + Q は保存
        expect(energies(w, s).friction).toBeCloseTo(muk * 2 * G_ACCEL * dx, 6);
        expect(Math.abs(energies(w, s).budget - e0)).toBeLessThan(1e-8);
      }
    }
  });
});

describe('衝突', () => {
  /** 衝突後の速度（運動量保存と反発係数の式） */
  function after(mA: number, mB: number, vA: number, vB: number, e: number) {
    const P = mA * vA + mB * vB;
    return {
      vA: (P - e * mB * (vA - vB)) / (mA + mB),
      vB: (P + e * mA * (vA - vB)) / (mA + mB),
    };
  }

  it('なめらかな床の上の 2 物体: 衝突後の速度が公式どおりで、失われた運動エネルギーが Q に等しい', () => {
    for (const e of [0, 0.5, 0.8, 1]) {
      for (const [mA, mB, vA, vB] of [
        [1, 2, 2, -1],
        [3, 0.5, 1, 0],
        [1, 1, 4, 0],
      ] as const) {
        const d: SandboxDesign = {
          bodies: [block('A', 1.5, 0.15, mA, vA), block('B', 2.2, 0.15, mB, vB)],
          fixtures: [FLOOR],
          joints: [],
        };
        const w = compile(d, { ...SMOOTH, e });
        const p0 = momentum(w, initialState(w)).px;
        const k0 = energies(w, initialState(w)).kinetic;
        // 衝突は 0.4 s 以内に起こり、0.9 s 後もどちらも床の上にある
        const s = simulate(w, 0.9, (st) => {
          expect(momentum(w, st).px).toBeCloseTo(p0, 10);
        });
        const exp = after(mA, mB, vA, vB, e);
        const label = `e=${e}, mA=${mA}, mB=${mB}`;
        expect(s.vx[0], label).toBeCloseTo(exp.vA, 9);
        expect(s.vx[1], label).toBeCloseTo(exp.vB, 9);
        const lost = 0.5 * ((mA * mB) / (mA + mB)) * (1 - e * e) * (vA - vB) ** 2;
        expect(energies(w, s).collision, label).toBeCloseTo(lost, 9);
        expect(energies(w, s).kinetic + energies(w, s).collision, label).toBeCloseTo(k0, 9);
      }
    }
  });

  it('無重力での斜めの衝突（2 球）: 運動量のベクトルが保存され、e = 1 なら運動エネルギーも保存', () => {
    for (const e of [1, 0.6]) {
      const d: SandboxDesign = {
        bodies: [ball('A', 1, 1.5, 1, 3, 0.2), ball('B', 3, 1.7, 2, -1, 0)],
        fixtures: [],
        joints: [],
      };
      const w = compile(d, { ...DEFAULT, g: 0, e });
      const p0 = momentum(w, initialState(w));
      const e0 = energies(w, initialState(w)).total;
      const s = simulate(w, 1);
      expect(Math.abs(s.vy[1]!)).toBeGreaterThan(0.1); // 斜めに衝突した
      expect(momentum(w, s).px).toBeCloseTo(p0.px, 10);
      expect(momentum(w, s).py).toBeCloseTo(p0.py, 10);
      const en = energies(w, s);
      if (e === 1) expect(en.collision).toBeLessThan(1e-9); // 丸め誤差だけ
      expect(relativeError(en.budget, e0)).toBeLessThan(1e-9);
    }
  });

  it('床で跳ね返るボール: 跳ね返りの高さが e² 倍になり、E + Q が保存される', () => {
    for (const e of [1, 0.8, 0.5]) {
      const w = compile(
        { bodies: [ball('A', 2, 1.12, 1)], fixtures: [FLOOR], joints: [] },
        {
          ...DEFAULT,
          e,
        },
      );
      const e0 = energies(w, initialState(w)).budget;
      const peaks: number[] = [];
      let prev = initialState(w);
      let maxBudgetErr = 0;
      simulate(w, 2.5, (s) => {
        if (prev.vy[0]! > 0 && s.vy[0]! <= 0) peaks.push(s.y[0]! - 0.12);
        prev = s;
        maxBudgetErr = Math.max(maxBudgetErr, Math.abs(energies(w, s).budget - e0));
      });
      expect(peaks.length).toBeGreaterThanOrEqual(2);
      // 最高点は刻み Δt ごとにしか測れないので、高さの誤差は ½g·(v·Δt)… ≈ 1e-6 m 程度
      peaks.slice(0, 3).forEach((hgt, k) => {
        expect(relativeError(hgt, e ** (2 * (k + 1))), `e=${e}, ${k + 1} 回目`).toBeLessThan(1e-4);
      });
      // 衝突ごとの記録は厳密だが、最後に 10 mm/s 未満で静かに接して止まるときの
      // 運動エネルギー ½m(0.01)² = 5e-5 J（E₀ ≈ 11 J）は記録しない
      expect(maxBudgetErr / e0, `e=${e}`).toBeLessThan(1e-5);
    }
  });
});

describe('静止・つりあい', () => {
  it('床の上の物体・積み重ねた物体は静止したまま（めり込み・ずれ・振動しない）', () => {
    const d: SandboxDesign = {
      bodies: [block('A', 2, 0.15, 5), block('B', 2.05, 0.45, 1), ball('C', 4, 0.12, 0.3)],
      fixtures: [FLOOR],
      joints: [],
    };
    const w = compile(d, DEFAULT);
    const s = simulate(w, 3);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(s.x[i]! - w.x0[i]!) + Math.abs(s.y[i]! - w.y0[i]!)).toBeLessThan(1e-12);
      expect(Math.hypot(s.vx[i]!, s.vy[i]!)).toBeLessThan(1e-12);
    }
    expect(energies(w, s).heat).toBe(0);
  });

  it('壁に押しつけた物体も静止したまま', () => {
    const wall: WallDef = { kind: 'wall', id: 'w2', x: 1, y: 0.5, w: 0.2, h: 1 };
    const d: SandboxDesign = {
      bodies: [block('A', 1.25, 0.15, 1)],
      fixtures: [FLOOR, wall],
      // 自然長より縮んだばねで物体を壁に押しつける
      joints: [
        { kind: 'spring', id: 's1', a: { body: 'A' }, b: { x: 2.5, y: 0.15 }, k: 100, L0: 2 },
      ],
    };
    const w = compile(d, SMOOTH);
    const s = simulate(w, 2);
    expect(Math.abs(s.x[0]! - 1.25)).toBeLessThan(1e-12);
    expect(energies(w, s).heat).toBe(0);
  });
});

describe('すべてのサンプル', () => {
  for (const pr of presets()) {
    it(`${pr.label}: E + Q が保存され、めり込まず、糸が伸びない`, () => {
      const w = compile(pr.design, pr.params);
      const e0 = energies(w, initialState(w)).budget;
      const scale = Math.max(1, Math.abs(e0));
      let worstBudget = 0;
      let worstPen = 0;
      let worstStretch = 0;
      simulate(w, 4, (s) => {
        worstBudget = Math.max(worstBudget, Math.abs(energies(w, s).budget - e0));
        worstPen = Math.max(worstPen, maxPenetration(pr.design, s));
        for (const str of w.strings) {
          worstStretch = Math.max(worstStretch, stringLength(str, s) - str.L);
        }
      });
      // 静かに着地する（10 mm/s 未満の）接触は記録しないので、その分だけ E + Q がずれうる
      expect(worstBudget / scale).toBeLessThan(1e-5);
      // めり込み・糸の伸びは、ふつうは丸め誤差程度。衝突と糸が同時にはたらくステップ（滑車に
      // ぶつかるなど）では、ガウス＝ザイデル法の反復が有限なので 1e-5 m 未満の残りが出うる
      expect(worstPen).toBeLessThan(1e-5);
      expect(worstStretch).toBeLessThan(1e-5);
    });
  }
});

describe('数値計算の設定', () => {
  it('刻み幅: ばね定数・質量の範囲全体で ωΔt ≤ 0.04（2 物体をつなぐときは換算質量で考える）', () => {
    const kMax = SPRING_SPECS.find((s) => s.key === 'k')!.max;
    const mMin = Math.min(
      BALL_SPECS.find((s) => s.key === 'm')!.min,
      BLOCK_SPECS.find((s) => s.key === 'm')!.min,
    );
    const omegaMax = Math.sqrt(kMax / (mMin / 2));
    expect(omegaMax * DT).toBeLessThanOrEqual(0.04);
  });
});
