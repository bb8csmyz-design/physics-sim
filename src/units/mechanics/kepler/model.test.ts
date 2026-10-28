/**
 * 人工衛星（万有引力による中心力運動）モデルの物理的な正しさのテスト。
 * ケプラー方程式による解析解との一致、ケプラーの 3 法則、力学的エネルギーと角運動量の保存、
 * 宇宙速度の公式を確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import { EARTH_RADIUS, G_ACCEL } from '@/core/physics/constants';
import {
  DT,
  GM,
  PARAMS,
  analyticPosition,
  arealVelocity,
  circularSpeed,
  distance,
  energies,
  escapeRadius,
  escapeSpeed,
  initialState,
  keplerThirdRatio,
  launchRadius,
  launchSpeed,
  orbit,
  orbitKind,
  speed,
  step,
  type KeplerParams,
  type KeplerState,
} from './model';

function simulate(p: KeplerParams, duration: number, dt = DT) {
  const ts = [0];
  const states: KeplerState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= Math.round(duration / dt) && !s.crashed && !s.escaped; i++) {
    s = step(p, s, dt);
    ts.push(i * dt);
    states.push(s);
  }
  return { ts, states };
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
/** 落下も脱出もしない楕円軌道の代表例（近地点打ち出し・遠地点打ち出しの両方を含む） */
const ELLIPSES: KeplerParams[] = [
  DEFAULT,
  { ...DEFAULT, r0: 1.5, v0: 7.5 },
  { ...DEFAULT, r0: 3, v0: 5 },
  { ...DEFAULT, r0: 4, v0: 3.5 },
  { ...DEFAULT, r0: 1.2, v0: 8.5 },
];

const cache = new Map<string, ReturnType<typeof simulate>>();
/** 1 周分（脱出・落下なら終わるまで）シミュレーションした結果を使い回す */
function oneOrbit(p: KeplerParams) {
  const key = JSON.stringify(p);
  if (!cache.has(key)) {
    const T = orbit(p).period;
    cache.set(key, simulate(p, Number.isFinite(T) ? T : 2e5));
  }
  return cache.get(key)!;
}

describe('宇宙速度と軌道の公式', () => {
  it('GM = gR²。地表付近の円軌道の速さ（第一宇宙速度）√(gR) ≈ 7.9 km/s、第二宇宙速度 √(2gR) ≈ 11.2 km/s', () => {
    expect(GM).toBeCloseTo(G_ACCEL * EARTH_RADIUS ** 2, 0);
    const surface = { ...DEFAULT, r0: 1 };
    expect(circularSpeed(surface) / 1000).toBeCloseTo(7.92, 2);
    expect(escapeSpeed(surface) / 1000).toBeCloseTo(11.2, 1);
    expect(escapeSpeed(DEFAULT) / circularSpeed(DEFAULT)).toBeCloseTo(Math.SQRT2, 12);
  });

  it('軌道の種類: 円軌道の速さで円、脱出速度以上で脱出、近地点が地球の内側なら落下', () => {
    expect(orbitKind({ ...DEFAULT, r0: 2, v0: circularSpeed({ ...DEFAULT, r0: 2 }) / 1000 })).toBe(
      'circle',
    );
    expect(orbitKind(DEFAULT)).toBe('ellipse');
    expect(orbitKind({ ...DEFAULT, v0: 8 })).toBe('escape');
    expect(orbitKind({ ...DEFAULT, v0: 3 })).toBe('crash');
  });

  it('近地点と遠地点で h = r v が等しく（面積速度一定）、a = (r_p + r_a)/2', () => {
    for (const p of ELLIPSES) {
      const o = orbit(p);
      expect(relativeError((o.perigee + o.apogee) / 2, o.a)).toBeLessThan(1e-12);
      // エネルギー保存 v²/2 − GM/r が近地点・遠地点で等しい
      const vp = o.h / o.perigee;
      const va = o.h / o.apogee;
      expect(relativeError(vp ** 2 / 2 - GM / o.perigee, va ** 2 / 2 - GM / o.apogee)).toBeLessThan(
        1e-12,
      );
    }
  });
});

describe('数値計算と解析解の一致', () => {
  it('楕円軌道 1 周にわたって、位置がケプラー方程式の解析解と一致する', () => {
    for (const p of ELLIPSES) {
      const { ts, states } = oneOrbit(p);
      const o = orbit(p);
      let maxErr = 0;
      ts.forEach((t, i) => {
        const a = analyticPosition(p, t);
        const s = states[i]!;
        maxErr = Math.max(maxErr, Math.hypot(s.x - a.x, s.y - a.y));
      });
      // 吉田の 4 次法の誤差は 1 周で (近地点での角速度 × Δt)⁴ 程度 × 周回数（相対 1e-9 以下）
      expect(maxErr / o.a, JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('円軌道の速さで打ち出すと、距離が一定のまま回る', () => {
    const p = { ...DEFAULT, r0: 3, v0: circularSpeed({ ...DEFAULT, r0: 3 }) / 1000 };
    const { states } = oneOrbit(p);
    const r0 = launchRadius(p);
    const maxErr = Math.max(...states.map((s) => Math.abs(distance(s) - r0) / r0));
    expect(maxErr).toBeLessThan(1e-10);
  });
});

describe('ケプラーの法則', () => {
  it('第 1 法則: 軌道は地球の中心を焦点とする楕円 r = p/(1 + e cos(φ − φ_p))', () => {
    for (const p of ELLIPSES) {
      const o = orbit(p);
      const { states } = oneOrbit(p);
      const maxErr = Math.max(
        ...states.map((s) => {
          const phi = Math.atan2(s.y, s.x);
          const r = o.semiLatus / (1 + o.e * Math.cos(phi - o.perigeeAngle));
          return Math.abs(distance(s) - r) / o.a;
        }),
      );
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('第 2 法則: 面積速度 ½|r × v| が一定で、等しい時間に掃く面積が等しい', () => {
    for (const p of ELLIPSES) {
      const o = orbit(p);
      const { states } = oneOrbit(p);
      // 面積速度は角運動量に比例し、中心力のもとではシンプレクティック法でも丸め誤差の範囲で保存される
      const maxErr = Math.max(
        ...states.map((s) => relativeError(arealVelocity(s), o.arealVelocity)),
      );
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-10);
      // 1 周を 8 等分した時間ごとに、掃いた面積（三角形の和）を比べる
      const n = states.length - 1;
      const areas: number[] = [];
      for (let k = 0; k < 8; k++) {
        let area = 0;
        for (let i = Math.floor((k * n) / 8); i < Math.floor(((k + 1) * n) / 8); i++) {
          const a = states[i]!;
          const b = states[i + 1]!;
          area += 0.5 * (a.x * b.y - a.y * b.x);
        }
        areas.push(area);
      }
      const mean = areas.reduce((x, y) => x + y, 0) / areas.length;
      // 弦で近似した三角形の面積なので、弧との差 (角度/step)² 程度と、区切りのずれ 1 ステップ分の誤差
      for (const a of areas)
        expect(relativeError(a, mean), JSON.stringify(p)).toBeLessThan(8 / n + 1e-5);
    }
  });

  it('第 3 法則: 測った周期が 2π√(a³/GM) と一致し、T²/a³ はどの軌道でも 4π²/GM', () => {
    for (const p of ELLIPSES) {
      const o = orbit(p);
      // 1.05 周回して、打ち出した方向（φ = 0、y が負→正）を再び横切る時刻を測る
      const { ts, states } = simulate(p, 1.05 * o.period);
      let measured = NaN;
      for (let i = Math.floor(states.length / 2); i < states.length; i++) {
        const a = states[i - 1]!;
        const b = states[i]!;
        if (a.y < 0 && b.y >= 0 && b.x > 0) {
          measured = ts[i - 1]! + (DT * -a.y) / (b.y - a.y);
          break;
        }
      }
      // 線形補間の誤差は (角速度 × Δt)² 程度の時間
      expect(relativeError(measured, o.period), JSON.stringify(p)).toBeLessThan(1e-7);
      expect(relativeError(o.period ** 2 / o.a ** 3, keplerThirdRatio())).toBeLessThan(1e-12);
    }
  });
});

describe('保存則', () => {
  it('力学的エネルギー ½mv² − GMm/r と面積速度が保存される（パラメータ範囲の全隅）', () => {
    for (const p of CORNERS) {
      const { states } = oneOrbit(p);
      const e0 = energies(p, states[0]!);
      const scale = Math.abs(e0.potential); // 位置エネルギーの大きさを基準にした誤差
      const h0 = arealVelocity(states[0]!);
      let maxE = 0;
      let maxH = 0;
      for (const s of states) {
        maxE = Math.max(maxE, Math.abs(energies(p, s).total - e0.total) / scale);
        maxH = Math.max(maxH, relativeError(arealVelocity(s), h0));
      }
      // 吉田の 4 次法: エネルギー誤差は (角速度 × Δt)⁴ 程度で有界、角運動量は丸め誤差のみ
      expect(maxE, JSON.stringify(p)).toBeLessThan(1e-9);
      expect(maxH, JSON.stringify(p)).toBeLessThan(1e-10);
    }
  });

  it('活力の式 v² = GM(2/r − 1/a) が軌道上のどこでも成り立つ', () => {
    for (const p of ELLIPSES) {
      const o = orbit(p);
      const { states } = oneOrbit(p);
      const maxErr = Math.max(
        ...states.map((s) => relativeError(speed(s) ** 2, GM * (2 / distance(s) - 1 / o.a))),
      );
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-8);
    }
  });

  it('近地点で最も速く、遠地点で最も遅い（v_p r_p = v_a r_a）', () => {
    const p = ELLIPSES[3]!; // 遠地点から打ち出す
    const o = orbit(p);
    const { states } = oneOrbit(p);
    const vMax = Math.max(...states.map(speed));
    const vMin = Math.min(...states.map(speed));
    expect(relativeError(vMax, o.h / o.perigee)).toBeLessThan(1e-6);
    expect(relativeError(vMin, o.h / o.apogee)).toBeLessThan(1e-9);
  });
});

describe('脱出と落下', () => {
  it('脱出速度以上で打ち出すと、遠ざかり続けて戻ってこない', () => {
    for (const p of CORNERS.filter((c) => orbitKind(c) === 'escape')) {
      const { states } = oneOrbit(p);
      expect(states.at(-1)!.escaped, JSON.stringify(p)).toBe(true);
      expect(distance(states.at(-1)!)).toBeGreaterThan(escapeRadius(p));
      expect(energies(p, states[0]!).total).toBeGreaterThanOrEqual(0);
      // 近地点から打ち出すので、距離は単調に増える
      for (let i = 1; i < states.length; i++) {
        expect(distance(states[i]!)).toBeGreaterThan(distance(states[i - 1]!));
      }
    }
  });

  it('遠地点が打ち出した距離の 5 倍より遠い楕円軌道でも、脱出扱いで止めずに戻ってくる', () => {
    // r₀ = 1.1R で脱出速度（約 10.7 km/s）よりわずかに遅い: 遠地点は約 20R
    const p: KeplerParams = { r0: 1.1, v0: 10.5, m: 500 };
    const o = orbit(p);
    expect(orbitKind(p)).toBe('ellipse');
    expect(o.apogee).toBeGreaterThan(escapeRadius(p));
    const { states } = simulate(p, o.period);
    expect(states.some((s) => s.escaped || s.crashed)).toBe(false);
    const rMax = states.reduce((m, s) => Math.max(m, distance(s)), 0);
    expect(relativeError(rMax, o.apogee)).toBeLessThan(1e-6);
    // 1 周後には打ち出した点に戻る（周期が DT の整数倍でない分のずれ v₀Δt 程度まで）
    const last = states.at(-1)!;
    expect(Math.hypot(last.x - launchRadius(p), last.y)).toBeLessThan(launchSpeed(p) * DT);
  });

  it('近地点が地球の内側なら、地表（r = R）に達したところで止まる', () => {
    for (const p of CORNERS.filter((c) => orbitKind(c) === 'crash')) {
      const { states } = oneOrbit(p);
      const last = states.at(-1)!;
      expect(last.crashed, JSON.stringify(p)).toBe(true);
      expect(Math.abs(distance(last) - EARTH_RADIUS) / EARTH_RADIUS).toBeLessThan(1e-9);
    }
  });

  it('全隅でシミュレーションが終わるか 1 周し、状態が有限', () => {
    for (const p of CORNERS) {
      const { states } = oneOrbit(p);
      const ok = states.every((s) => [s.x, s.y, s.vx, s.vy].every(Number.isFinite));
      expect(ok, JSON.stringify(p)).toBe(true);
    }
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で、1 ステップに動径が回る角度が 0.01 rad 以下', () => {
    for (const p of CORNERS) {
      const o = orbit(p);
      // 角速度 h/r² は近地点（落下する軌道では地表）で最大
      const rMin = Math.max(o.perigee, EARTH_RADIUS);
      expect((o.h / rMin ** 2) * DT, JSON.stringify(p)).toBeLessThanOrEqual(0.01);
    }
  });
});
