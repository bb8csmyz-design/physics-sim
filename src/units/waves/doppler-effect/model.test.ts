/**
 * ドップラー効果モデルの物理的な正しさのテスト。
 * 波面の到達時刻から測った観測振動数・波面の間隔（波長）が、ドップラー効果の公式と一致することを
 * パラメータ範囲の全隅で確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  DT,
  DURATION,
  PARAMS,
  V,
  XO0,
  XS0,
  emissionTime,
  firstArrivalTime,
  frontCenter,
  frontRadius,
  initialState,
  instantaneousFrequency,
  measuredFrequency,
  observedFrequency,
  observerPosition,
  receivedSignal,
  sourcePosition,
  step,
  wavelength,
  type DopplerParams,
  type DopplerState,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);

/** duration 秒シミュレーションし、毎ステップの状態を返す */
function simulate(p: DopplerParams, duration: number, dt = DT): DopplerState[] {
  const n = Math.round(duration / dt);
  const out = [initialState(p)];
  let s = out[0]!;
  for (let i = 0; i < n; i++) {
    s = step(p, s, dt);
    out.push(s);
  }
  return out;
}

/** すべての到達時刻を集める（arrivals は直近 2 個しか持たないので、毎ステップ差分を拾う） */
function arrivalTimes(states: readonly DopplerState[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < states.length; i++) {
    const added = states[i]!.received - states[i - 1]!.received;
    out.push(...states[i]!.arrivals.slice(states[i]!.arrivals.length - added));
  }
  return out;
}

/** 音源と観測者がすれ違う時刻（すれ違わなければ Infinity） */
function passingTime(p: DopplerParams): number {
  const rel = p.vs - p.vo;
  return rel > 0 ? (XO0 - XS0) / rel : Infinity;
}

describe('公式', () => {
  it('入試の典型例: f₀ = 500 Hz の音源が 34 m/s で近づく → 556 Hz、遠ざかる → 455 Hz', () => {
    const p = { ...DEFAULT, f0: 500, vs: 34, vo: 0, w: 0 };
    expect(observedFrequency(p, 1)).toBeCloseTo((500 * 340) / 306, 10);
    expect(observedFrequency(p, -1)).toBeCloseTo((500 * 340) / 374, 10);
  });

  it('観測者が 34 m/s で音源に近づく → f = (V + v)/V · f₀ = 550 Hz', () => {
    const p = { ...DEFAULT, f0: 500, vs: 0, vo: -34, w: 0 };
    expect(observedFrequency(p, 1)).toBeCloseTo(550, 10);
  });

  it('風が吹いても音源・観測者が静止していれば振動数は変わらない（波長だけが変わる）', () => {
    for (const w of [-20, 7, 20]) {
      const p = { ...DEFAULT, vs: 0, vo: 0, w };
      expect(observedFrequency(p, 1)).toBeCloseTo(p.f0, 10);
      expect(observedFrequency(p, -1)).toBeCloseTo(p.f0, 10);
      expect(wavelength(p, 1)).toBeCloseTo((V + w) / p.f0, 12);
    }
  });

  it('音源と観測者が同じ速度で動き、風がなければ振動数は変わらない', () => {
    const p = { ...DEFAULT, vs: 25, vo: 25, w: 0 };
    expect(observedFrequency(p, 1)).toBeCloseTo(p.f0, 10);
    expect(observedFrequency(p, -1)).toBeCloseTo(p.f0, 10);
  });

  it('f = V′/λ′: 観測振動数 = （観測者に対する音の速さ）/（その向きの波長）', () => {
    for (const p of CORNERS) {
      for (const side of [1, -1] as const) {
        const relSpeed = V + side * p.w - side * p.vo;
        expect(
          relativeError(observedFrequency(p, side), relSpeed / wavelength(p, side)),
        ).toBeLessThan(1e-12);
      }
    }
  });
});

describe('シミュレーション（波面の到達）と公式の一致', () => {
  it('全隅で、到達間隔から測った観測振動数がすれ違う前・後とも公式と一致する', () => {
    for (const p of CORNERS) {
      // 到達時刻は 1 ステップ内で厳密に求めているので、粗い刻みでも一致する（実行時間の短縮）
      const arr = arrivalTimes(simulate(p, DURATION, 1e-4));
      const tp = passingTime(p);
      let checked = 0;
      for (let i = 1; i < arr.length; i++) {
        const [a, b] = [arr[i - 1]!, arr[i]!];
        // すれ違いをまたぐ 1 区間は除く（前後で別々の公式が成り立つ）
        const side = b < tp ? 1 : a > tp + 0.05 ? -1 : 0;
        if (side === 0) continue;
        const f = 1 / (b - a);
        expect(relativeError(f, observedFrequency(p, side)), JSON.stringify(p)).toBeLessThan(1e-8);
        checked++;
      }
      expect(checked, JSON.stringify(p)).toBeGreaterThan(30);
    }
  });

  it('measuredFrequency（画面の測定値）も公式と一致する', () => {
    const p = { ...DEFAULT };
    const states = simulate(p, 0.1);
    expect(
      relativeError(measuredFrequency(states[states.length - 1]!), observedFrequency(p, 1)),
    ).toBeLessThan(1e-8);
    expect(measuredFrequency(initialState(p))).toBeNaN();
  });

  it('刻み幅を変えても到達時刻は変わらない（厳密に求めている）', () => {
    const p = { ...DEFAULT, vs: 60, vo: -40, w: 10 };
    const a = arrivalTimes(simulate(p, DURATION, DT));
    const b = arrivalTimes(simulate(p, DURATION, 3e-4));
    expect(a.length).toBe(b.length);
    a.forEach((t, i) => expect(Math.abs(t - b[i]!)).toBeLessThan(1e-12));
  });

  it('最初の音が届く時刻 = 距離 / （観測者に対する音の速さ）', () => {
    for (const p of CORNERS) {
      const arr = arrivalTimes(simulate(p, 0.04, 1e-4));
      expect(Math.abs(arr[0]! - firstArrivalTime(p)), JSON.stringify(p)).toBeLessThan(1e-12);
      expect(firstArrivalTime(p)).toBeCloseTo((XO0 - XS0) / (V + p.w - p.vo), 12);
    }
  });

  it('波面は放出順に 1 回ずつ届き、受け取った数は放出した数を超えない', () => {
    for (const p of CORNERS) {
      const states = simulate(p, DURATION, 1e-4);
      const arr = arrivalTimes(states);
      for (let i = 1; i < arr.length; i++) expect(arr[i]!).toBeGreaterThan(arr[i - 1]!);
      const last = states[states.length - 1]!;
      expect(last.received).toBe(arr.length);
      expect(last.received).toBeLessThanOrEqual(last.emitted);
    }
  });
});

describe('波長（波面の間隔）', () => {
  it('音源の前方・後方の波面の間隔が λ = (V ± w ∓ v_S)/f₀ と一致する（全隅）', () => {
    for (const p of CORNERS) {
      const s = simulate(p, 0.06, 1e-4).at(-1)!;
      // 同じ時刻での隣り合う波面の右端・左端の間隔
      for (const side of [1, -1] as const) {
        const edges = s.fronts.map((f) => frontCenter(p, f, s.t) + side * frontRadius(f, s.t));
        for (let i = 1; i < edges.length; i++) {
          const gap = side * (edges[i - 1]! - edges[i]!);
          expect(relativeError(gap, wavelength(p, side)), JSON.stringify(p)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('波面の数は放出時刻の順に f₀ 枚/秒で増える', () => {
    const p = DEFAULT;
    const s = simulate(p, 0.1, 1e-4).at(-1)!;
    expect(s.emitted).toBe(Math.floor(0.1 * p.f0 + 1e-9) + 1);
  });
});

describe('観測者が受け取る音（解析解）', () => {
  it('波面が届いた時刻に、届いた音の放出時刻 t_e がちょうど k/f₀ になる', () => {
    for (const p of CORNERS.filter((_, i) => i % 3 === 0)) {
      const states = simulate(p, DURATION, 1e-4);
      const arr = arrivalTimes(states);
      arr.forEach((t, k) => {
        expect(Math.abs(emissionTime(p, t) - k / p.f0), JSON.stringify(p)).toBeLessThan(1e-9);
      });
    }
  });

  it('瞬間の観測振動数（解析解）が、すれ違う前後で公式の 2 つの値をとる', () => {
    const p = DEFAULT;
    const tp = passingTime(p);
    expect(instantaneousFrequency(p, 0.001)).toBeNaN(); // まだ音が届いていない
    expect(instantaneousFrequency(p, tp - 0.01)).toBeCloseTo(observedFrequency(p, 1), 9);
    expect(instantaneousFrequency(p, tp + 0.02)).toBeCloseTo(observedFrequency(p, -1), 9);
    expect(receivedSignal(p, 0.001)).toBe(0);
  });

  it('既定の条件では、シミュレーション時間内にすれ違う（近づく音と遠ざかる音の両方が聞ける）', () => {
    const tp = passingTime(DEFAULT);
    expect(tp).toBeLessThan(DURATION * 0.7);
    expect(sourcePosition(DEFAULT, tp)).toBeCloseTo(observerPosition(DEFAULT, tp), 12);
  });
});

describe('数値計算の設定', () => {
  it('音源が音速より十分遅い（衝撃波にならない）範囲に限っている', () => {
    for (const p of CORNERS) {
      expect(Math.abs(p.vs) + Math.abs(p.w)).toBeLessThan(V / 3);
      expect(Math.abs(p.vo) + Math.abs(p.w)).toBeLessThan(V / 3);
    }
  });

  it('刻み幅は最大振動数の 1 周期を 25 点以上で描ける細かさ', () => {
    const fMax = Math.max(
      ...CORNERS.flatMap((p) => [observedFrequency(p, 1), observedFrequency(p, -1)]),
    );
    expect(1 / fMax / DT).toBeGreaterThanOrEqual(25);
  });
});
