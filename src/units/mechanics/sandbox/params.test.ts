/**
 * パラメータ範囲の全域（g, μ, μ′, e の最小・既定・最大の全組み合わせ）で、
 * すべてのサンプルの物理が破綻しないことを確かめる（CLAUDE.md のルール 4）。
 */
import { describe, expect, it } from 'vitest';
import { paramCorners } from '@/core/params';
import { collide } from './collide';
import {
  DT,
  PARAMS,
  bodyShape,
  compile,
  energies,
  fixtureShape,
  initialState,
  step,
  stringLength,
  type SandboxDesign,
  type SandboxState,
} from './model';
import { presets } from './presets';

/** 物体どうし・物体と固定物の最大のめり込みの深さ [m] */
function maxPenetration(d: SandboxDesign, s: SandboxState): number {
  let worst = 0;
  d.bodies.forEach((b, i) => {
    const A = bodyShape(b);
    for (const f of d.fixtures) {
      const F = fixtureShape(f);
      worst = Math.max(worst, -collide(A, s.x[i]!, s.y[i]!, F.shape, F.x, F.y).sep);
    }
    for (let j = i + 1; j < d.bodies.length; j++) {
      const B = bodyShape(d.bodies[j]!);
      worst = Math.max(worst, -collide(A, s.x[i]!, s.y[i]!, B, s.x[j]!, s.y[j]!).sep);
    }
  });
  return worst;
}

const CORNERS = paramCorners(PARAMS);
/** 1 つの組み合わせで進める時間 [s]（81 通り × サンプル数を数秒で検査するため） */
const DURATION = 0.5;

describe('パラメータ範囲の全域', () => {
  for (const pr of presets().filter((p) => p.design.bodies.length > 0)) {
    it(`${pr.label}: g, μ, μ′, e の全隅で破綻せず、E + Q が増えず、めり込まず、糸が伸びない`, () => {
      for (const p of CORNERS) {
        const label = `${pr.id} ${JSON.stringify(p)}`;
        const w = compile(pr.design, p);
        let s = initialState(w);
        const e0 = energies(w, s).budget;
        const scale = Math.max(1, Math.abs(e0));
        for (let i = 1; i <= Math.round(DURATION / DT); i++) {
          s = step(w, s, DT);
          if (i % 10 !== 0) continue;
          // 速度ベルレ法のエネルギーの振動 (ωΔt)²/4（サンプルのばねでは ω ≤ 10 rad/s で 6e-6）まで
          expect(energies(w, s).budget - e0, label).toBeLessThan(2e-5 * scale);
          for (const str of w.strings) {
            expect(stringLength(str, s) - str.L, label).toBeLessThan(1e-5);
          }
        }
        expect(s.x.every(Number.isFinite) && s.vy.every(Number.isFinite), label).toBe(true);
        expect(maxPenetration(pr.design, s), label).toBeLessThan(1e-5);
      }
    });
  }
});
