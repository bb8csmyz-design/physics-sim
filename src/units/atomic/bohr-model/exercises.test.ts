/**
 * ボーア模型の演習問題のテスト。正解を、量子条件 mvr = nh/2π と円運動の運動方程式
 * mv²/r = kZe²/r² を数値的に解いて求めた軌道・エネルギーと比べる。
 */
import { describe, expect, it } from 'vitest';
import { relativeError } from '@/core/physics/analysis';
import {
  COULOMB_CONSTANT,
  ELECTRON_MASS,
  ELECTRON_VOLT,
  ELEMENTARY_CHARGE,
  PLANCK,
  SPEED_OF_LIGHT,
} from '@/core/physics/constants';
import { checkExercises, numericAnswer, sampleExercises } from '@/units/exerciseChecks';
import { EXERCISES } from './exercises';
import { PARAMS, type BohrParams } from './model';

checkExercises(EXERCISES, PARAMS);

const template = (id: string) => EXERCISES.find((t) => t.id === id)!;
const value = numericAnswer;

/**
 * 量子条件と運動方程式を満たす半径を二分法で求める（v = nh/(2πmr) を運動方程式に代入した
 * f(r) = mv²/r − kZe²/r² の符号の変わり目）
 */
function solveOrbit(Z: number, n: number): { r: number; v: number; E: number } {
  const vOf = (r: number) => (n * PLANCK) / (2 * Math.PI * ELECTRON_MASS * r);
  const f = (r: number) =>
    (ELECTRON_MASS * vOf(r) ** 2) / r - (COULOMB_CONSTANT * Z * ELEMENTARY_CHARGE ** 2) / r ** 2;
  let lo = 1e-13;
  let hi = 1e-8;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const r = Math.sqrt(lo * hi);
  const v = vOf(r);
  const E = 0.5 * ELECTRON_MASS * v * v - (COULOMB_CONSTANT * Z * ELEMENTARY_CHARGE ** 2) / r;
  return { r, v, E: E / ELECTRON_VOLT };
}

describe('正解がボーアの条件を数値的に解いた結果と一致する', () => {
  it('光子のエネルギー = 2 つの軌道の力学的エネルギーの差', () => {
    for (const ex of sampleExercises(template('photon-energy'))) {
      const p = ex.sim.params as BohrParams;
      const dE = solveOrbit(p.Z, p.n).E - solveOrbit(p.Z, p.nf).E;
      expect(relativeError(value(ex), dE)).toBeLessThan(1e-9);
    }
  });

  it('スペクトル線の波長 = hc / (エネルギーの差)', () => {
    for (const ex of sampleExercises(template('wavelength'))) {
      const p = ex.sim.params as BohrParams;
      const dE = (solveOrbit(p.Z, p.n).E - solveOrbit(p.Z, p.nf).E) * ELECTRON_VOLT;
      expect(relativeError(value(ex), ((PLANCK * SPEED_OF_LIGHT) / dE) * 1e9)).toBeLessThan(1e-9);
    }
  });

  it('軌道半径', () => {
    for (const ex of sampleExercises(template('orbit-radius'))) {
      const { r } = solveOrbit(ex.given!.Z!, ex.given!.n!);
      expect(relativeError(value(ex), r * 1e9)).toBeLessThan(1e-9);
    }
  });

  it('スペクトル線の数: n 以下の準位の組から生じる異なる波長の数（水素では重複しない）', () => {
    for (const ex of sampleExercises(template('line-count'))) {
      const n = ex.given!.n!;
      const lines = new Set<string>();
      for (let a = 1; a <= n; a++) {
        for (let b = a + 1; b <= n; b++) {
          lines.add((solveOrbit(1, b).E - solveOrbit(1, a).E).toPrecision(8));
        }
      }
      expect(lines.size).toBe(value(ex));
    }
  });
});
