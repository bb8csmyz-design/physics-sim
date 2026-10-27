/**
 * 点電荷の電場・電位の演習問題のテスト。正解を、電位の数値微分（E = −∇V）・電場の線積分（V = ∫E·dl）・
 * 試験電荷の運動のシミュレーションと比べる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { DT, PARAMS, field, initialState, potential, step, type FieldParams } from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

describe('正解が独立な計算と一致する', () => {
  it('中点の電場の強さ = 電位の傾き（中心差分、刻み 1e-5 m。誤差は 1e-9 程度）', () => {
    for (const ex of sampleExercises(template('midpoint-field'))) {
      const p = ex.sim.params as FieldParams;
      const h = 1e-5;
      const ex_ = -(potential(p, h, 0) - potential(p, -h, 0)) / (2 * h);
      const ey = -(potential(p, 0, h) - potential(p, 0, -h)) / (2 * h);
      expect(relativeError(value(ex), Math.hypot(ex_, ey))).toBeLessThan(1e-6);
    }
  });

  it('中点の電位 = M から y 軸に沿って遠方まで電場を積分した値（シンプソン則）', () => {
    for (const ex of sampleExercises(template('midpoint-potential'))) {
      const p = ex.sim.params as FieldParams;
      // y = d·tan(u)（u: 0 → π/2）と変数変換して無限遠まで積分する
      const N = 4000;
      const f = (u: number) => {
        const y = p.d * Math.tan(u);
        return field(p, 0, y).y * (p.d / Math.cos(u) ** 2);
      };
      const h = (Math.PI / 2 - 1e-9) / N;
      let sum = f(0) + f(N * h);
      for (let i = 1; i < N; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
      const V = (sum * h) / 3;
      expect(relativeError(value(ex), V)).toBeLessThan(1e-6);
    }
  });

  it('中点を通過する速さ: 試験電荷を動かしたシミュレーションで x = 0 を横切るときの速さ', () => {
    for (const ex of sampleExercises(template('speed-at-midpoint'), 20)) {
      const p = ex.sim.params as FieldParams;
      let s = initialState(p);
      let prev = s;
      while (s.x < 0) {
        prev = s;
        s = step(p, s, DT / 20);
        expect(s.status).toBe('moving');
      }
      const r = -prev.x / (s.x - prev.x);
      const v = prev.vx + r * (s.vx - prev.vx);
      // 中点では加速度が 0 なので、線形補間の誤差は小さい。速度ベルレ法の誤差は 1e-5 程度
      expect(relativeError(value(ex), v)).toBeLessThan(1e-4);
    }
  });
});
