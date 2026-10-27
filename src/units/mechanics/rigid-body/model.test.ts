/**
 * はしご（剛体）のつりあいと滑り出しのモデルの物理的な正しさのテスト。
 * 力のつりあい・モーメントのつりあい、滑り出す限界の角の公式、なめらかな床と壁の場合の既知の解、
 * 滑っている間のエネルギー収支（摩擦熱を含む）を、パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { G_ACCEL } from '@/core/physics/constants';
import {
  DT,
  LADDER_LENGTH as L,
  PARAMS,
  criticalAngle,
  energies,
  forces,
  inEquilibrium,
  initialState,
  maxClimbDistance,
  slidingDynamics,
  staticForces,
  step,
  torquesAboutBottom,
  totalMass,
  type LadderParams,
  type LadderState,
} from './model';

function simulate(p: LadderParams, maxTime = 10, dt = DT) {
  const states: LadderState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= Math.round(maxTime / dt) && s.sliding && !s.ended; i++) {
    s = step(p, s, dt);
    states.push(s);
  }
  return states;
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const SLIDING = CORNERS.filter((p) => !inEquilibrium(p));
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

describe('つりあいの式', () => {
  it('力のつりあい: 鉛直 N₁ = (m + M)g、水平 f = N₂（全隅）', () => {
    for (const p of CORNERS) {
      const s = staticForces(p);
      expect(s.N1).toBeCloseTo(totalMass(p) * G_ACCEL, 10);
      expect(s.f).toBe(s.N2);
    }
  });

  it('力のモーメントのつりあい: 下端のまわりのモーメントの和が 0（全隅）', () => {
    for (const p of CORNERS) {
      const t = torquesAboutBottom(p);
      const scale = totalMass(p) * G_ACCEL * L;
      expect(Math.abs(t.ladder + t.person + t.wall) / scale, JSON.stringify(p)).toBeLessThan(1e-14);
    }
  });

  it('どの点のまわりでもモーメントの和は 0（上端のまわりで確かめる）', () => {
    for (const p of CORNERS) {
      const th = rad(p.theta);
      const s = staticForces(p);
      // 上端から見た位置: 下端 (L cos θ, −L sin θ)、はしごに沿って下端から s の点 ((L − s) cos θ, −(L − s) sin θ)
      const rBottom = { x: L * Math.cos(th), y: -L * Math.sin(th) };
      const torque =
        rBottom.x * s.N1 -
        rBottom.y * -s.f + // 下端: 垂直抗力 (0, N₁) と摩擦力 (−f, 0)
        (L / 2) * Math.cos(th) * -p.m * G_ACCEL + // はしごの重力
        (L - p.d) * Math.cos(th) * -p.M * G_ACCEL; // 人の重力
      expect(Math.abs(torque) / (totalMass(p) * G_ACCEL * L), JSON.stringify(p)).toBeLessThan(
        1e-13,
      );
    }
  });

  it('人が乗っていない一様なはしごでは tan θc = 1/(2μ)', () => {
    for (const mu of [0.2, 0.5, 1]) {
      const p = { ...DEFAULT, M: 0, mu };
      expect(Math.tan(rad(criticalAngle(p)))).toBeCloseTo(1 / (2 * mu), 12);
    }
  });

  it('限界の角 θc ちょうどで必要な摩擦力が最大静止摩擦力に等しく、θ ≥ θc でつりあう', () => {
    for (const p of CORNERS.filter((c) => c.mu > 0)) {
      const thc = criticalAngle(p);
      const s = staticForces(p, thc);
      expect(relativeError(s.f, s.fMax), JSON.stringify(p)).toBeLessThan(1e-12);
      expect(inEquilibrium(p), JSON.stringify(p)).toBe(p.theta >= thc - 1e-12);
    }
  });

  it('人が上れる限界の位置 d_max で、必要な摩擦力が最大静止摩擦力に等しい', () => {
    for (const p of CORNERS.filter((c) => c.M > 0)) {
      const dMax = maxClimbDistance(p);
      if (!(dMax > 0 && dMax < L)) continue;
      const s = staticForces({ ...p, d: dMax });
      expect(relativeError(s.f, s.fMax), JSON.stringify(p)).toBeLessThan(1e-12);
      expect(inEquilibrium({ ...p, d: dMax * 0.99 })).toBe(true);
      expect(inEquilibrium({ ...p, d: Math.min(L, dMax * 1.01) })).toBe(false);
    }
  });

  it('人が高く上るほど、また角度が小さいほど滑りやすい（必要な摩擦力が大きい）', () => {
    const f = (d: number, theta: number) => staticForces({ ...DEFAULT, d, theta }).f;
    expect(f(3, 60)).toBeGreaterThan(f(1, 60));
    expect(f(2, 40)).toBeGreaterThan(f(2, 70));
  });
});

describe('解説の例題', () => {
  it('M = 0, μ = 0.40 で限界の角は約 51°', () => {
    expect(criticalAngle({ ...DEFAULT, M: 0, mu: 0.4 })).toBeCloseTo(51.3, 1);
  });

  it('既定の条件（θ = 60°, μ = 0.40, m = 10 kg, M = 50 kg）で人が上れるのは約 2.9 m まで', () => {
    expect(maxClimbDistance({ ...DEFAULT, theta: 60, mu: 0.4, m: 10, M: 50 })).toBeCloseTo(2.93, 2);
    expect(inEquilibrium(DEFAULT)).toBe(true);
  });
});

describe('なめらかな床と壁（μ = 0）の既知の解', () => {
  const p = { ...DEFAULT, mu: 0, M: 0, theta: 70 };

  it('角加速度は θ̈ = −(3g/2L) cos θ（角速度によらない）', () => {
    for (const [theta, omega] of [
      [1.2, 0],
      [0.9, -1.3],
      [0.5, -2.5],
    ] as const) {
      const { alpha } = slidingDynamics(p, theta, omega);
      expect(alpha).toBeCloseTo(-(3 * G_ACCEL * Math.cos(theta)) / (2 * L), 12);
    }
  });

  it('上端は sin θ = (2/3) sin θ₀ で壁から離れる', () => {
    const states = simulate(p);
    const last = states.at(-1)!;
    expect(last.ended).toBe('wall');
    expect(Math.sin(last.theta)).toBeCloseTo((2 / 3) * Math.sin(rad(70)), 6);
    // 角速度はエネルギー保存から ω² = (3g/L)(sin θ₀ − sin θ)
    const w2 = ((3 * G_ACCEL) / L) * (Math.sin(rad(70)) - Math.sin(last.theta));
    expect(relativeError(last.omega ** 2, w2)).toBeLessThan(1e-8);
  });
});

describe('滑っている間の運動', () => {
  it('つりあう条件なら、まったく動かない', () => {
    for (const p of CORNERS.filter(inEquilibrium)) {
      const s0 = initialState(p);
      expect(s0.sliding).toBe(false);
      expect(step(p, s0, DT)).toEqual(s0);
    }
  });

  it('つりあわない条件なら滑り出し、θ は単調に減り、壁から離れるか床に倒れて終わる（全隅）', () => {
    for (const p of SLIDING) {
      const states = simulate(p);
      const last = states.at(-1)!;
      expect(last.ended, JSON.stringify(p)).not.toBeNull();
      let monotone = true;
      for (let i = 1; i < states.length; i++)
        if (states[i]!.theta >= states[i - 1]!.theta) monotone = false;
      expect(monotone, JSON.stringify(p)).toBe(true);
    }
  });

  it('滑っている間、床の垂直抗力は正、壁の垂直抗力は 0 以上（接触を保つ）', () => {
    for (const p of SLIDING) {
      const states = simulate(p);
      const minN1 = Math.min(...states.map((s) => forces(p, s).N1));
      const minN2 = Math.min(...states.slice(0, -1).map((s) => forces(p, s).N2));
      expect(minN1, JSON.stringify(p)).toBeGreaterThan(0);
      expect(minN2, JSON.stringify(p)).toBeGreaterThanOrEqual(0);
    }
  });

  it('エネルギーの収支: 力学的エネルギーの減少分が摩擦熱に等しい（K + U + Q = 一定、全隅）', () => {
    for (const p of SLIDING) {
      const states = simulate(p);
      const e0 = energies(p, states[0]!).total;
      const maxErr = Math.max(
        ...states.map((s) => {
          const e = energies(p, s);
          return Math.abs(e.total + e.heat - e0) / e0;
        }),
      );
      // 運動方程式（垂直抗力を含む連立）と発熱を同じ RK4 で積分しているので、
      // 式が正しければ収支の誤差は (ωΔt)⁴ 程度の相対量に収まる
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-9);
    }
  });

  it('摩擦がないとき（μ = 0）、力学的エネルギーが保存される', () => {
    const p = { ...DEFAULT, mu: 0 };
    const states = simulate(p);
    const e0 = energies(p, states[0]!).total;
    expect(states.every((s) => s.heat === 0)).toBe(true);
    expect(Math.max(...states.map((s) => relativeError(energies(p, s).total, e0)))).toBeLessThan(
      1e-9,
    );
  });

  it('刻み幅を半分にしても結果が変わらない', () => {
    const p = { ...DEFAULT, mu: 0.1, theta: 50 };
    const a = simulate(p, 10, DT).at(-1)!;
    const b = simulate(p, 10, DT / 2).at(-1)!;
    expect(a.ended).toBe(b.ended);
    expect(Math.abs(deg(a.theta) - deg(b.theta))).toBeLessThan(1e-6);
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で、滑っている間の |ω|Δt ≤ 0.01', () => {
    for (const p of SLIDING) {
      const maxW = Math.max(...simulate(p).map((s) => Math.abs(s.omega)));
      expect(maxW * DT, JSON.stringify(p)).toBeLessThanOrEqual(0.01);
    }
  });
});
