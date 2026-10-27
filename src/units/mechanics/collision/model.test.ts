/**
 * 2 物体の衝突モデルの物理的な正しさのテスト。
 * 運動量保存、反発係数の定義、運動エネルギーの損失の公式、重心の等速運動を、
 * パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  DT,
  PARAMS,
  START_DISTANCE,
  afterCollision,
  centerOfMass,
  centerOfMassVelocity,
  collisionTime,
  contactDistance,
  energies,
  energyLoss,
  impulseOnA,
  initialState,
  isOutOfFloor,
  momenta,
  step,
  velocitiesAfter,
  type CollisionParams,
  type CollisionState,
} from './model';

function simulate(p: CollisionParams, maxTime = 10, dt = DT) {
  const states: CollisionState[] = [initialState(p)];
  let s = states[0]!;
  for (let i = 1; i <= Math.round(maxTime / dt) && !isOutOfFloor(s); i++) {
    s = step(p, s, dt);
    states.push(s);
  }
  return states;
}

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const APPROACHING = CORNERS.filter((p) => p.vA > p.vB);
const tol = (p: CollisionParams) => 1e-12 * (1 + Math.abs(p.mA * p.vA) + Math.abs(p.mB * p.vB));

describe('衝突後の速度の公式', () => {
  it('運動量の和が保存される（全隅）', () => {
    for (const p of APPROACHING) {
      const after = afterCollision(p);
      const before = p.mA * p.vA + p.mB * p.vB;
      expect(Math.abs(p.mA * after.vA + p.mB * after.vB - before), JSON.stringify(p)).toBeLessThan(
        tol(p),
      );
    }
  });

  it('反発係数の定義 vB′ − vA′ = −e(vB − vA) を満たす（全隅）', () => {
    for (const p of APPROACHING) {
      const after = afterCollision(p);
      expect(Math.abs(after.vB - after.vA + p.e * (p.vB - p.vA)), JSON.stringify(p)).toBeLessThan(
        1e-12,
      );
    }
  });

  it('同じ質量の弾性衝突（e = 1）では速度が入れかわる', () => {
    const v = velocitiesAfter(2, 2, 3, -1, 1);
    expect(v.vA).toBeCloseTo(-1, 12);
    expect(v.vB).toBeCloseTo(3, 12);
  });

  it('完全非弾性衝突（e = 0）では一体となって重心の速度で動く', () => {
    for (const p of APPROACHING.filter((c) => c.e === 0)) {
      const after = afterCollision(p);
      expect(after.vA).toBeCloseTo(centerOfMassVelocity(p), 12);
      expect(after.vB).toBeCloseTo(centerOfMassVelocity(p), 12);
    }
  });

  it('静止している物体に弾性衝突すると vA′ = (mA − mB)vA/(mA + mB), vB′ = 2mA vA/(mA + mB)', () => {
    const v = velocitiesAfter(3, 1, 4, 0, 1);
    expect(v.vA).toBeCloseTo(2, 12);
    expect(v.vB).toBeCloseTo(6, 12);
  });

  it('非常に重い物体（壁）に当たると vA′ ≈ −e vA ではね返る', () => {
    const v = velocitiesAfter(1, 1e9, 5, 0, 0.6);
    expect(v.vA).toBeCloseTo(-3, 7);
    expect(Math.abs(v.vB)).toBeLessThan(1e-8);
  });
});

describe('解説の例題', () => {
  it('mA = 1.0, mB = 2.0 kg, vA = 3.0, vB = −1.0 m/s, e = 0.80 で vA′ = −1.8, vB′ = 1.4 m/s', () => {
    const v = afterCollision({ mA: 1, mB: 2, vA: 3, vB: -1, e: 0.8 });
    expect(v.vA).toBeCloseTo(-1.8, 12);
    expect(v.vB).toBeCloseTo(1.4, 12);
  });
});

describe('エネルギー', () => {
  it('失われる運動エネルギーが ½μ(1 − e²)(vA − vB)² に等しく、負にならない（全隅）', () => {
    for (const p of APPROACHING) {
      const after = afterCollision(p);
      const before = 0.5 * p.mA * p.vA ** 2 + 0.5 * p.mB * p.vB ** 2;
      const afterK = 0.5 * p.mA * after.vA ** 2 + 0.5 * p.mB * after.vB ** 2;
      expect(Math.abs(before - afterK - energyLoss(p)), JSON.stringify(p)).toBeLessThan(
        1e-12 * (1 + before),
      );
      expect(energyLoss(p)).toBeGreaterThanOrEqual(0);
    }
  });

  it('弾性衝突（e = 1）では運動エネルギーが保存され、e が小さいほど多く失われる', () => {
    expect(energyLoss({ ...DEFAULT, e: 1 })).toBeCloseTo(0, 12);
    const losses = [0, 0.25, 0.5, 0.75, 1].map((e) => energyLoss({ ...DEFAULT, e }));
    for (let i = 1; i < losses.length; i++) expect(losses[i]!).toBeLessThan(losses[i - 1]!);
  });

  it('完全非弾性衝突では、重心の運動エネルギー以外がすべて失われる', () => {
    const p = { ...DEFAULT, e: 0 };
    const before = 0.5 * p.mA * p.vA ** 2 + 0.5 * p.mB * p.vB ** 2;
    const vG = centerOfMassVelocity(p);
    expect(energyLoss(p)).toBeCloseTo(before - 0.5 * (p.mA + p.mB) * vG ** 2, 12);
  });
});

describe('シミュレーション', () => {
  it('運動量の和は衝突の前後を通じて一定（全隅）', () => {
    for (const p of CORNERS) {
      const states = simulate(p);
      const p0 = momenta(p, states[0]!).total;
      const maxErr = Math.max(...states.map((s) => Math.abs(momenta(p, s).total - p0)));
      expect(maxErr, JSON.stringify(p)).toBeLessThan(tol(p));
    }
  });

  it('衝突は接触した瞬間に 1 回だけ起こり、その時刻が (2d − (a + b)/2)/(vA − vB) と一致する（全隅）', () => {
    for (const p of CORNERS) {
      const states = simulate(p);
      const last = states.at(-1)!;
      if (p.vA > p.vB) {
        expect(last.collidedAt, JSON.stringify(p)).not.toBeNull();
        expect(Math.abs(last.collidedAt! - collisionTime(p)), JSON.stringify(p)).toBeLessThan(
          1e-12,
        );
        expect(last.vA).toBeCloseTo(afterCollision(p).vA, 12);
        expect(last.vB).toBeCloseTo(afterCollision(p).vB, 12);
      } else {
        // 近づかないなら衝突しない
        expect(last.collidedAt, JSON.stringify(p)).toBeNull();
        expect(last.vA).toBe(p.vA);
        expect(last.vB).toBe(p.vB);
      }
    }
  });

  it('位置は解析解（衝突の前後で区切った等速直線運動）と一致する', () => {
    const p = DEFAULT;
    const tc = collisionTime(p);
    const after = afterCollision(p);
    const xAt = (t: number) => {
      const t1 = Math.min(t, tc);
      const t2 = Math.max(0, t - tc);
      return {
        xA: -START_DISTANCE + p.vA * t1 + after.vA * t2,
        xB: START_DISTANCE + p.vB * t1 + after.vB * t2,
      };
    };
    const states = simulate(p);
    const maxErr = Math.max(
      ...states.map((s) => {
        const a = xAt(s.t);
        return Math.max(Math.abs(s.xA - a.xA), Math.abs(s.xB - a.xB));
      }),
    );
    expect(maxErr).toBeLessThan(1e-12);
  });

  it('重心は衝突の前後を通じて等速直線運動をする（全隅）', () => {
    for (const p of CORNERS) {
      const states = simulate(p);
      const x0 = centerOfMass(p, states[0]!);
      const vG = centerOfMassVelocity(p);
      const maxErr = Math.max(...states.map((s) => Math.abs(centerOfMass(p, s) - (x0 + vG * s.t))));
      expect(maxErr, JSON.stringify(p)).toBeLessThan(1e-11);
    }
  });

  it('物体どうしは重ならない（全隅）', () => {
    for (const p of CORNERS) {
      const states = simulate(p);
      const minGap = Math.min(...states.map((s) => s.xB - s.xA - contactDistance(p)));
      expect(minGap, JSON.stringify(p)).toBeGreaterThan(-1e-12);
    }
  });

  it('運動エネルギーは衝突で ΔK だけ減り、それ以外では一定（全隅）', () => {
    for (const p of CORNERS) {
      const states = simulate(p);
      const last = energies(p, states.at(-1)!);
      expect(Math.abs(last.lost - energyLoss(p)), JSON.stringify(p)).toBeLessThan(1e-11);
    }
  });

  it('作用・反作用: A と B が受ける力積は大きさが等しく逆向き', () => {
    for (const p of APPROACHING) {
      const after = afterCollision(p);
      const IB = p.mB * (after.vB - p.vB);
      expect(Math.abs(impulseOnA(p) + IB), JSON.stringify(p)).toBeLessThan(tol(p));
    }
  });

  it('刻み幅によらず同じ結果になる（接触の瞬間を厳密に求めているため）', () => {
    const a = simulate(DEFAULT, 1, 1e-3).at(-1)!;
    const b = simulate(DEFAULT, 1, 0.1).at(-1)!;
    expect(relativeError(a.xA, b.xA)).toBeLessThan(1e-12);
    expect(relativeError(a.xB, b.xB)).toBeLessThan(1e-12);
  });
});
