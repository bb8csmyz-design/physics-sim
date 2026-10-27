/**
 * 鉛直面内の円運動モデルの物理的な正しさのテスト。
 * 張力の公式、1 周する条件 v₀ ≥ √(5gr)、糸がたるむ位置の公式、力学的エネルギー保存、
 * たるんだ後の放物運動を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { estimatePeriod, relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import {
  DT,
  PARAMS,
  bottomTension,
  energies,
  height,
  initialState,
  loopSpeed,
  maxHeight,
  motionKind,
  position,
  slackPoint,
  speed,
  step,
  swingSpeed,
  tension,
  topSpeed,
  topTension,
  velocity,
  type CircleParams,
  type CircleState,
} from './model';

function simulate(p: CircleParams, duration: number, dt = DT) {
  const ts = [0];
  const states: CircleState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= Math.round(duration / dt) && !s.done; i++) {
    s = step(p, s, dt);
    ts.push(i * dt);
    states.push(s);
  }
  return { ts, states };
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const MOVING = CORNERS.filter((p) => p.v0 > 0);
/** 1 周する / 往復する / たるむ の代表例（r = 1 m: √(2gr) ≈ 4.43, √(5gr) = 7.0 m/s） */
const LOOP = { ...DEFAULT, r: 1, v0: 8 };
const SWING = { ...DEFAULT, r: 1, v0: 3 };
const SLACK = { ...DEFAULT, r: 1, v0: 6 };

/** 1 周分の時間（または往復運動の周期の数倍）の目安 */
const DURATION = 6;

const cache = new Map<string, ReturnType<typeof simulate>>();
function simulateCached(p: CircleParams) {
  const key = JSON.stringify(p);
  if (!cache.has(key)) cache.set(key, simulate(p, DURATION));
  return cache.get(key)!;
}

describe('公式', () => {
  it('最下点の張力 T₀ = m(v₀²/r + g)。r = 1 m, v₀ = 7 m/s, m = 0.5 kg で 29.4 N', () => {
    expect(bottomTension({ ...DEFAULT, r: 1, v0: 7, m: 0.5 })).toBeCloseTo(29.4, 12);
    const s0 = initialState(SLACK);
    expect(tension(SLACK, s0)).toBeCloseTo(bottomTension(SLACK), 12);
  });

  it('1 周する条件 √(5gr)、往復する条件 √(2gr)', () => {
    const p = { ...DEFAULT, r: 1 };
    expect(loopSpeed(p)).toBeCloseTo(7, 12);
    expect(swingSpeed(p)).toBeCloseTo(Math.sqrt(19.6), 12);
    expect(motionKind(LOOP)).toBe('loop');
    expect(motionKind(SWING)).toBe('swing');
    expect(motionKind(SLACK)).toBe('slack');
    expect(motionKind({ ...DEFAULT, v0: 0 })).toBe('rest');
  });

  it('ちょうど √(5gr) で打ち出すと、最高点での張力が 0（重力だけが向心力）', () => {
    const p = { ...DEFAULT, v0: loopSpeed(DEFAULT) };
    expect(topTension(p)).toBeCloseTo(0, 10);
    expect(topSpeed(p)).toBeCloseTo(Math.sqrt(G_ACCEL * p.r), 12);
  });

  it('糸がたるむ点: cos θ* = −(v₀² − 2gr)/(3gr) で張力 0 かつエネルギー保存を満たす', () => {
    const q = slackPoint(SLACK)!;
    const v2fromEnergy = SLACK.v0 ** 2 - 2 * G_ACCEL * q.height;
    expect(q.speed ** 2).toBeCloseTo(v2fromEnergy, 10);
    // 張力 0: v²/r = −g cos θ（重力の中心方向成分だけで向心力がまかなえる）
    expect(q.speed ** 2 / SLACK.r).toBeCloseTo(-G_ACCEL * Math.cos(q.theta), 10);
    expect(q.theta).toBeGreaterThan(Math.PI / 2);
    expect(q.theta).toBeLessThan(Math.PI);
  });
});

describe('解説の例題', () => {
  it('r = 1.0 m, v₀ = 6.0 m/s で糸がたるむ高さは約 1.56 m', () => {
    expect(slackPoint({ ...DEFAULT, r: 1, v0: 6 })!.height).toBeCloseTo(1.56, 2);
  });
});

describe('力学的エネルギー保存', () => {
  it('円運動中もたるんだ後も、力学的エネルギーが保存される（パラメータ範囲の全隅）', () => {
    for (const p of MOVING) {
      const { states } = simulateCached(p);
      const e0 = energies(p, states[0]!).total;
      const maxErr = Math.max(...states.map((s) => relativeError(energies(p, s).total, e0)));
      // 吉田の 4 次法のエネルギー誤差は (ωΔt)⁴ 程度（ωΔt ≤ 0.033 で ≤ 1e-6）
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-6);
    }
  });

  it('速さと高さの関係 v² = v₀² − 2gh が成り立つ', () => {
    const { states } = simulateCached(LOOP);
    const maxErr = Math.max(
      ...states.map((s) =>
        Math.abs(speed(LOOP, s) ** 2 - (LOOP.v0 ** 2 - 2 * G_ACCEL * height(LOOP, s))),
      ),
    );
    expect(maxErr).toBeLessThan(1e-5 * LOOP.v0 ** 2);
  });

  it('長時間（50 周以上）回してもエネルギーがドリフトしない', () => {
    const { states } = simulate(LOOP, 60);
    const e0 = energies(LOOP, states[0]!).total;
    const n = states.length;
    const err = (from: number, to: number) =>
      Math.max(...states.slice(from, to).map((s) => relativeError(energies(LOOP, s).total, e0)));
    const first = err(0, n / 10);
    const last = err(n - n / 10, n);
    expect(last).toBeLessThan(1e-7);
    expect(last).toBeLessThan(first * 1.5 + 1e-12);
  });
});

describe('運動の種類と公式の一致', () => {
  it('v₀ ≥ √(5gr) なら糸はたるまずに 1 周し、最高点の速さ・張力が公式と一致する', () => {
    for (const p of [LOOP, ...MOVING.filter((c) => motionKind(c) === 'loop')]) {
      const { states } = simulateCached(p);
      expect(
        states.every((s) => s.mode === 'circle'),
        JSON.stringify(p),
      ).toBe(true);
      expect(states.at(-1)!.theta, JSON.stringify(p)).toBeGreaterThan(2 * Math.PI);
      // 最高点（張力が最小になる位置）で比べる
      const top = states.reduce((a, b) => (tension(p, b) < tension(p, a) ? b : a));
      expect(Math.abs(Math.cos(top.theta) + 1), JSON.stringify(p)).toBeLessThan(1e-3);
      expect(relativeError(speed(p, top), topSpeed(p)), JSON.stringify(p)).toBeLessThan(1e-5);
      expect(Math.abs(tension(p, top) - topTension(p)), JSON.stringify(p)).toBeLessThan(
        1e-3 * p.m * G_ACCEL,
      );
    }
  });

  it('1 周にかかる時間が、∮ r dθ / v(θ) の数値積分と一致する', () => {
    const { ts, states } = simulateCached(LOOP);
    const i = states.findIndex((s) => s.theta >= 2 * Math.PI);
    const a = states[i - 1]!;
    const b = states[i]!;
    const measured = ts[i - 1]! + (DT * (2 * Math.PI - a.theta)) / (b.theta - a.theta);
    // シンプソン則で ∫₀^{2π} r dθ / √(v₀² − 2gr(1 − cos θ))
    const n = 2000;
    const f = (th: number) =>
      LOOP.r / Math.sqrt(LOOP.v0 ** 2 - 2 * G_ACCEL * LOOP.r * (1 - Math.cos(th)));
    let sum = f(0) + f(2 * Math.PI);
    for (let k = 1; k < n; k++) sum += (k % 2 ? 4 : 2) * f((2 * Math.PI * k) / n);
    const exact = (sum * (2 * Math.PI)) / n / 3;
    // 線形補間の誤差は (ωΔt)²/8 程度の時間 / ω
    expect(relativeError(measured, exact)).toBeLessThan(1e-6);
  });

  it('v₀ ≤ √(2gr) なら往復運動になり、最高点の高さは v₀²/(2g)', () => {
    for (const p of [SWING, ...MOVING.filter((c) => motionKind(c) === 'swing')]) {
      const { states } = simulateCached(p);
      expect(
        states.every((s) => s.mode === 'circle'),
        JSON.stringify(p),
      ).toBe(true);
      const hMax = Math.max(...states.map((s) => height(p, s)));
      expect(relativeError(hMax, maxHeight(p)), JSON.stringify(p)).toBeLessThan(1e-5);
      // 張力は常に正（糸はたるまない）
      expect(Math.min(...states.map((s) => tension(p, s))), JSON.stringify(p)).toBeGreaterThan(0);
    }
  });

  it('振れ幅が小さいとき、往復の周期は単振り子の公式 2π√(r/g) に一致する', () => {
    const p = { ...DEFAULT, r: 1, v0: 0.1 }; // 振れ角 ≈ 1.8°
    const { ts, states } = simulate(p, 12);
    const T = estimatePeriod(
      ts,
      states.map((s) => position(p, s).x),
    );
    // 有限振幅の補正は θ₀²/16 ≈ 6e-5
    expect(relativeError(T, 2 * Math.PI * Math.sqrt(1 / G_ACCEL))).toBeLessThan(1e-4);
  });

  it('√(2gr) < v₀ < √(5gr) なら、公式の位置で糸がたるみ、その後は放物運動をする', () => {
    for (const p of [SLACK, ...MOVING.filter((c) => motionKind(c) === 'slack')]) {
      const { states } = simulateCached(p);
      const iFree = states.findIndex((s) => s.mode === 'free');
      expect(iFree, JSON.stringify(p)).toBeGreaterThan(0);
      const q = slackPoint(p)!;
      const rel = states[iFree]!.release!;
      // たるむ瞬間の高さと速さ（二分法で求めた切りかえ点）
      expect(Math.abs(rel.y + p.r - q.height), JSON.stringify(p)).toBeLessThan(1e-6 * p.r);
      expect(relativeError(Math.hypot(rel.vx, rel.vy), q.speed), JSON.stringify(p)).toBeLessThan(
        1e-5,
      );
      // たるんだ後は加速度 (0, −g) の放物運動
      const free = states.filter((s) => s.mode === 'free');
      for (let i = 2; i < free.length; i++) {
        const v0 = velocity(p, free[i - 1]!);
        const v1 = velocity(p, free[i]!);
        if (free[i]!.done) continue;
        expect(Math.abs((v1.vx - v0.vx) / DT)).toBeLessThan(1e-9);
        expect(Math.abs((v1.vy - v0.vy) / DT + G_ACCEL)).toBeLessThan(1e-6);
      }
      // 放物運動で上がる最高点が公式と一致する
      const hMax = Math.max(...free.map((s) => height(p, s)));
      expect(Math.abs(hMax - maxHeight(p)), JSON.stringify(p)).toBeLessThan(1e-5);
      // 再び糸が張ったところで終わる
      const last = states.at(-1)!;
      expect(last.done, JSON.stringify(p)).toBe(true);
      const { x, y } = position(p, last);
      expect(Math.abs(Math.hypot(x, y) - p.r), JSON.stringify(p)).toBeLessThan(1e-9);
    }
  });
});

describe('定性的な性質・極限', () => {
  it('糸は伸びない: 中心からの距離は常に r 以下（全隅）', () => {
    for (const p of CORNERS) {
      const { states } = simulateCached(p);
      const maxR = Math.max(
        ...states.map((s) => {
          const { x, y } = position(p, s);
          return Math.hypot(x, y);
        }),
      );
      expect(maxR, JSON.stringify(p)).toBeLessThanOrEqual(p.r * (1 + 1e-12));
    }
  });

  it('張力は最下点で最大、高い位置ほど小さい（1 周する場合）', () => {
    const { states } = simulateCached(LOOP);
    const firstLap = states.filter((s) => s.theta <= Math.PI);
    for (let i = 1; i < firstLap.length; i++) {
      expect(tension(LOOP, firstLap[i]!)).toBeLessThan(tension(LOOP, firstLap[i - 1]!));
    }
  });

  it('v₀ = 0 なら最下点で静止したまま（張力 mg）', () => {
    const p = { ...DEFAULT, v0: 0 };
    const { states } = simulate(p, 1);
    expect(states.every((s) => s.theta === 0 && s.omega === 0)).toBe(true);
    expect(tension(p, states.at(-1)!)).toBeCloseTo(p.m * G_ACCEL, 12);
  });

  it('運動の種類と到達する高さは質量によらない', () => {
    for (const v0 of [3, 6, 8]) {
      const a = { ...DEFAULT, v0, m: 0.1 };
      const b = { ...DEFAULT, v0, m: 2 };
      expect(motionKind(a)).toBe(motionKind(b));
      expect(maxHeight(a)).toBeCloseTo(maxHeight(b), 12);
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で ωΔt ≤ 0.04', () => {
    for (const p of CORNERS) expect((p.v0 / p.r) * DT).toBeLessThanOrEqual(0.04);
  });
});
