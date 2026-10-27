/**
 * 斜面上の運動と摩擦のモデルの物理的な正しさのテスト。
 * 等加速度運動の公式（最高到達距離・時刻・戻る速さ）、静止摩擦の条件（摩擦角）、
 * 発熱を含めたエネルギーの収支を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import {
  DT,
  FOOT_DISTANCE,
  PARAMS,
  acceleration,
  accelerationDown,
  accelerationUp,
  energies,
  frictionAngle,
  frictionForce,
  initialState,
  kineticCoefficient,
  maxStaticFriction,
  normalForce,
  returnSpeed,
  slidesFromRest,
  step,
  stopDistance,
  stopTime,
  topPosition,
  type InclineParams,
  type InclineState,
} from './model';

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * dt 刻みで、斜面の端に達するか maxTime になるまでシミュレーションする。
 * 静止摩擦で止まった後はもう動かないので、そこで打ち切る（0.1 s だけ余分に進めて静止を確かめる）。
 */
function simulate(p: InclineParams, maxTime = 20, dt = DT) {
  const ts = [0];
  const states: InclineState[] = [initialState(p)];
  let s = states[0]!;
  let restSince = Infinity;
  for (let i = 1; i <= Math.round(maxTime / dt) && !s.exited; i++) {
    if (s.v === 0 && !slidesFromRest(p)) restSince = Math.min(restSince, i);
    if (i - restSince > 0.1 / dt) break;
    s = step(p, s, dt);
    ts.push(i * dt);
    states.push(s);
  }
  return { ts, states };
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
/** 最高点で止まった後、滑り降りる条件（tan 30° = 0.577 > μ = 0.4） */
const SLIDES = { ...DEFAULT, theta: 30, mu: 0.4, muk: 0.2, v0: 5 };
/** 最高点で止まったまま静止する条件（tan 30° < μ = 0.7） */
const STAYS = { ...DEFAULT, theta: 30, mu: 0.7, muk: 0.3, v0: 5 };

describe('公式', () => {
  it('θ = 30°, μ′ = 0 のとき、上昇中も下降中も加速度は −g sin θ = −4.9 m/s²', () => {
    const p = { ...DEFAULT, theta: 30, muk: 0 };
    expect(accelerationUp(p)).toBeCloseTo(-4.9, 12);
    expect(accelerationDown(p)).toBeCloseTo(-4.9, 12);
  });

  it('最高到達距離 L = v₀²/(2g(sin θ + μ′cos θ))、時刻 t₁ = v₀/(g(sin θ + μ′cos θ))', () => {
    const p = { ...DEFAULT, theta: 30, muk: 0.3, mu: 0.5, v0: 6 };
    const a = G_ACCEL * (Math.sin(rad(30)) + 0.3 * Math.cos(rad(30)));
    expect(stopDistance(p)).toBeCloseTo(36 / (2 * a), 12);
    expect(stopTime(p)).toBeCloseTo(6 / a, 12);
  });

  it('水平面（θ = 0）では止まるまでの距離 v₀²/(2μ′g)', () => {
    const p = { ...DEFAULT, theta: 0, muk: 0.5, mu: 0.5, v0: 7 };
    expect(stopDistance(p)).toBeCloseTo(49 / (2 * 0.5 * G_ACCEL), 12);
  });

  it('摩擦角: tan θ₀ = μ。θ が摩擦角を超えたときだけ静止状態から滑り出す', () => {
    const p = { ...DEFAULT, mu: 0.5 };
    const theta0 = frictionAngle(p);
    expect(Math.tan(rad(theta0))).toBeCloseTo(0.5, 12);
    expect(slidesFromRest({ ...p, theta: Math.floor(theta0) })).toBe(false);
    expect(slidesFromRest({ ...p, theta: Math.ceil(theta0) })).toBe(true);
  });

  it('動摩擦係数は静止摩擦係数を超えない（μ′ > μ を選んでも μ′ = μ として扱う）', () => {
    expect(kineticCoefficient({ ...DEFAULT, mu: 0.2, muk: 0.6 })).toBe(0.2);
    expect(kineticCoefficient({ ...DEFAULT, mu: 0.6, muk: 0.2 })).toBe(0.2);
  });
});

describe('解説の例題', () => {
  it('θ = 30°, μ = 0.5, μ′ = 0.3, v₀ = 5.0 m/s で滑り降り、L ≈ 1.68 m', () => {
    const p = { ...DEFAULT, theta: 30, mu: 0.5, muk: 0.3, v0: 5 };
    expect(slidesFromRest(p)).toBe(true);
    expect(slidesFromRest({ ...p, mu: 0.6 })).toBe(false);
    expect(stopDistance(p)).toBeCloseTo(1.68, 2);
  });
});

describe('シミュレーションと公式の一致', () => {
  it('上昇中の位置・速度が等加速度運動の式 s = v₀t + ½at², v = v₀ + at と一致する', () => {
    for (const p of CORNERS.filter((c) => c.v0 > 0)) {
      const a = accelerationUp(p);
      const tEnd = Math.min(stopTime(p), 1);
      const { ts, states } = simulate(p, tEnd * 0.99);
      let maxErr = 0;
      ts.forEach((t, i) => {
        const st = states[i]!;
        if (st.exited) return;
        maxErr = Math.max(
          maxErr,
          Math.abs(st.s - (p.v0 * t + 0.5 * a * t * t)),
          Math.abs(st.v - (p.v0 + a * t)),
        );
      });
      // 解析解で進めているので丸め誤差のみ
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-10);
    }
  });

  it('最高到達距離と、そこに達する時刻が公式と一致する（全隅）', () => {
    for (const p of CORNERS.filter((c) => c.v0 > 0 && stopDistance(c) < topPosition(c))) {
      const { ts, states } = simulate(p);
      const maxS = Math.max(...states.map((s) => s.s));
      const iMax = states.findIndex((s) => s.s === maxS);
      expect(relativeError(maxS, stopDistance(p)), JSON.stringify(p)).toBeLessThan(1e-6);
      // 最高点はステップの途中にあるので、記録時刻とのずれは Δt 以内
      expect(Math.abs(ts[iMax]! - stopTime(p)), JSON.stringify(p)).toBeLessThanOrEqual(DT);
    }
  });

  it('滑り降りる場合、出発点を通過する速さが v₀√((sin θ − μ′cos θ)/(sin θ + μ′cos θ)) と一致する', () => {
    for (const p of [SLIDES, ...CORNERS.filter((c) => c.v0 > 0 && slidesFromRest(c))]) {
      if (stopDistance(p) >= topPosition(p)) continue;
      const { states } = simulate(p);
      // 下降中に s = 0 を横切るステップを探し、そこでの速さを補間で求める
      const i = states.findIndex((s, j) => j > 0 && s.v < 0 && s.s <= 0 && states[j - 1]!.s > 0);
      expect(i, JSON.stringify(p)).toBeGreaterThan(0);
      const a = states[i - 1]!;
      const b = states[i]!;
      const v = a.v + ((b.v - a.v) * a.s) / (a.s - b.s);
      // 線形補間の誤差は |a|Δt 程度
      expect(Math.abs(-v - returnSpeed(p)), JSON.stringify(p)).toBeLessThan(G_ACCEL * DT);
    }
  });

  it('静止摩擦で止まる場合（tan θ ≤ μ）、最高点で止まったまま動かない', () => {
    const { states } = simulate(STAYS, 5);
    const last = states[states.length - 1]!;
    expect(last.v).toBe(0);
    expect(last.s).toBeCloseTo(stopDistance(STAYS), 10);
    // 止まっている間、静止摩擦力 mg sin θ は最大静止摩擦力 μN を超えない
    expect(frictionForce(STAYS, last)).toBeCloseTo(STAYS.m * G_ACCEL * Math.sin(rad(30)), 12);
    expect(frictionForce(STAYS, last)).toBeLessThanOrEqual(maxStaticFriction(STAYS));
    expect(acceleration(STAYS, last)).toBe(0);
  });

  it('静かに置いた物体は、tan θ > μ なら加速度 g(sin θ − μ′cos θ) で滑り出し、そうでなければ静止したまま', () => {
    for (const p of CORNERS.filter((c) => c.v0 === 0)) {
      const { ts, states } = simulate(p, 0.5);
      const last = states[states.length - 1]!;
      const t = ts[ts.length - 1]!;
      if (slidesFromRest(p)) {
        const a = accelerationDown(p);
        expect(a, JSON.stringify(p)).toBeLessThan(0);
        if (!last.exited) expect(last.s).toBeCloseTo(0.5 * a * t * t, 10);
      } else {
        expect(
          states.every((s) => s.s === 0 && s.v === 0),
          JSON.stringify(p),
        ).toBe(true);
      }
    }
  });

  it('運動方程式: 速度の変化率が合力 / 質量（重力の斜面成分 + 摩擦力）に一致する', () => {
    const { states } = simulate(SLIDES);
    const th = rad(SLIDES.theta);
    let maxErr = 0;
    for (let i = 1; i < states.length; i++) {
      const a = states[i - 1]!;
      const b = states[i]!;
      // 速度の向きが変わるステップと端に達したステップは区間の途中で力が変わるので除く
      if (Math.sign(a.v) !== Math.sign(b.v) || a.v === 0 || b.exited) continue;
      const F = -SLIDES.m * G_ACCEL * Math.sin(th) + frictionForce(SLIDES, a);
      maxErr = Math.max(maxErr, Math.abs((b.v - a.v) / DT - F / SLIDES.m));
    }
    expect(maxErr).toBeLessThan(1e-9);
  });

  it('刻み幅によらず同じ結果になる（区間ごとに解析解で進めているため）', () => {
    for (const p of [SLIDES, STAYS, DEFAULT]) {
      const a = simulate(p, 2, 1e-3).states.at(-1)!;
      const b = simulate(p, 2, 0.05).states.at(-1)!;
      expect(Math.abs(a.s - b.s)).toBeLessThan(1e-10);
      expect(Math.abs(a.v - b.v)).toBeLessThan(1e-10);
    }
  });
});

describe('エネルギーの収支', () => {
  it('力学的エネルギーの減少分が摩擦による発熱に等しい（K + U + Q = 一定、全隅）', () => {
    for (const p of CORNERS) {
      const { states } = simulate(p);
      const e0 = energies(p, states[0]!).total;
      let maxErr = 0;
      let heatDecreased = false;
      for (let i = 0; i < states.length; i++) {
        const e = energies(p, states[i]!);
        maxErr = Math.max(maxErr, Math.abs(e.total + e.heat - e0));
        if (i > 0 && states[i]!.heat < states[i - 1]!.heat) heatDecreased = true;
      }
      // 区間ごとの解析解なので丸め誤差のみ
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-9 * (1 + e0));
      // 摩擦は常に負の仕事をする（発熱は減らない）
      expect(heatDecreased, JSON.stringify(p)).toBe(false);
    }
  });

  it('発熱は「動摩擦力 × 滑った道のり」μ′N·(2L + 下端までの距離) に等しい', () => {
    const { states } = simulate(SLIDES);
    const last = states.at(-1)!;
    expect(last.exited).toBe(true);
    expect(last.s).toBe(-FOOT_DISTANCE);
    const path = 2 * stopDistance(SLIDES) + FOOT_DISTANCE;
    const fk = kineticCoefficient(SLIDES) * normalForce(SLIDES);
    expect(relativeError(last.heat, fk * path)).toBeLessThan(1e-12);
  });

  it('摩擦がなければ（μ′ = 0）力学的エネルギーが保存され、出発点に同じ速さ v₀ で戻る', () => {
    const p = { ...DEFAULT, theta: 30, mu: 0, muk: 0, v0: 4 };
    const { states } = simulate(p);
    expect(states.every((s) => s.heat === 0)).toBe(true);
    expect(returnSpeed(p)).toBeCloseTo(4, 12);
  });
});

describe('定性的な性質・極限', () => {
  it('摩擦があると、下りの加速度の大きさは上りより小さい（戻る速さ < v₀）', () => {
    expect(Math.abs(accelerationDown(SLIDES))).toBeLessThan(Math.abs(accelerationUp(SLIDES)));
    expect(returnSpeed(SLIDES)).toBeLessThan(SLIDES.v0);
  });

  it('加速度は質量によらない（重力も摩擦力も質量に比例するため）', () => {
    for (const m of [0.5, 2, 5]) {
      expect(accelerationUp({ ...SLIDES, m })).toBeCloseTo(accelerationUp(SLIDES), 12);
      expect(accelerationDown({ ...SLIDES, m })).toBeCloseTo(accelerationDown(SLIDES), 12);
    }
  });

  it('水平でなめらかな面（θ = 0, μ′ = 0）では等速直線運動を続け、斜面の端に達して終わる', () => {
    const p = { ...DEFAULT, theta: 0, mu: 0, muk: 0, v0: 3 };
    const { ts, states } = simulate(p);
    const last = states.at(-1)!;
    expect(last.exited).toBe(true);
    expect(last.v).toBe(3);
    expect(Math.abs(ts.at(-1)! - topPosition(p) / 3)).toBeLessThanOrEqual(DT);
  });

  it('全隅で状態が有限で、斜面の範囲を出ない', () => {
    for (const p of CORNERS) {
      const { states } = simulate(p);
      const ok = states.every(
        (s) =>
          Number.isFinite(s.s) &&
          Number.isFinite(s.v) &&
          s.s >= -FOOT_DISTANCE &&
          s.s <= topPosition(p),
      );
      expect(ok, JSON.stringify(p)).toBe(true);
    }
  });
});
