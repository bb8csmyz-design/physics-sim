import { describe, expect, it } from 'vitest';
import { convergenceOrder, relativeError } from './analysis';
import {
  eulerStep,
  integrateMotion,
  integrateOde,
  midpointStep,
  rk4Step,
  symplecticEulerStep,
  velocityVerletStep,
  yoshida4Step,
  type AccelerationFunction,
  type OdeFunction,
  type OdeStepper,
  type PhaseState,
  type SymplecticStepper,
} from './integrators';

const HS = [0.1, 0.05, 0.025, 0.0125];

/** 調和振動子 x'' = -ω² x（ω = 1）。解析解 x = cos t, v = -sin t */
const oscillatorAccel: AccelerationFunction = (_t, x) => [-x[0]!];
const oscillatorOde: OdeFunction = (_t, y) => [y[1]!, -y[0]!];
const oscillatorEnergy = (x: number, v: number) => 0.5 * v * v + 0.5 * x * x;

function odeOrder(step: OdeStepper, f: OdeFunction, y0: number[], t1: number, exact: number) {
  const errors = HS.map((dt) => Math.abs(integrateOde(f, y0, { t1, dt }, step)[0]! - exact));
  return convergenceOrder(HS, errors);
}

function motionOrder(step: SymplecticStepper) {
  const t1 = 10;
  const errors = HS.map((dt) => {
    const s = integrateMotion(oscillatorAccel, { x: [1], v: [0] }, { t1, dt }, step);
    return Math.abs(s.x[0]! - Math.cos(t1));
  });
  return convergenceOrder(HS, errors);
}

describe('1階 ODE ソルバー', () => {
  const decay: OdeFunction = (_t, y) => [-y[0]!];

  it('RK4: 指数減衰 dy/dt = -y を高精度で解く', () => {
    const y = integrateOde(decay, [1], { t1: 1, dt: 0.1 });
    expect(relativeError(y[0]!, Math.exp(-1))).toBeLessThan(1e-6);
  });

  it('RK4: 時間に陽に依存する右辺 dy/dt = cos t を解く', () => {
    const y = integrateOde((t) => [Math.cos(t)], [0], { t1: 3, dt: 0.05 });
    expect(Math.abs(y[0]! - Math.sin(3))).toBeLessThan(1e-8);
  });

  it('RK4: 調和振動子の 10 秒後の位置が解析解と 1e-8 以内で一致する', () => {
    const y = integrateOde(oscillatorOde, [1, 0], { t1: 10, dt: 0.01 });
    expect(Math.abs(y[0]! - Math.cos(10))).toBeLessThan(1e-8);
    expect(Math.abs(y[1]! + Math.sin(10))).toBeLessThan(1e-8);
  });

  it('収束次数: オイラー法 ≈ 1, 中点法 ≈ 2, RK4 ≈ 4', () => {
    const exact = Math.exp(-1);
    expect(odeOrder(eulerStep, decay, [1], 1, exact)).toBeCloseTo(1, 1);
    expect(odeOrder(midpointStep, decay, [1], 1, exact)).toBeCloseTo(2, 1);
    expect(odeOrder(rk4Step, decay, [1], 1, exact)).toBeCloseTo(4, 1);
  });

  it('終了時刻が刻み幅で割り切れなくても t1 ちょうどまで積分する', () => {
    const y = integrateOde((_t) => [1], [0], { t1: 1.03, dt: 0.1 });
    expect(y[0]).toBeCloseTo(1.03, 12);
  });

  it('入力配列を書き換えない', () => {
    const y0 = [1, 0];
    rk4Step(oscillatorOde, 0, y0, 0.1);
    expect(y0).toEqual([1, 0]);
  });
});

describe('シンプレクティック法', () => {
  it('収束次数: シンプレクティック・オイラー ≈ 1, 速度ベルレ ≈ 2, 吉田 4 次 ≈ 4', () => {
    expect(motionOrder(symplecticEulerStep)).toBeCloseTo(1, 0);
    expect(motionOrder(velocityVerletStep)).toBeCloseTo(2, 1);
    expect(motionOrder(yoshida4Step)).toBeCloseTo(4, 1);
  });

  it('速度ベルレ: 約 1600 周期回してもエネルギー誤差が有界でドリフトしない', () => {
    const dt = 0.1;
    const steps = 100_000;
    let s: PhaseState = { x: [1], v: [0] };
    const e0 = oscillatorEnergy(1, 0);
    let maxErrFirst = 0;
    let maxErrLast = 0;
    for (let i = 0; i < steps; i++) {
      s = velocityVerletStep(oscillatorAccel, i * dt, s, dt);
      const err = Math.abs(oscillatorEnergy(s.x[0]!, s.v[0]!) - e0) / e0;
      if (i < steps / 10) maxErrFirst = Math.max(maxErrFirst, err);
      if (i >= steps - steps / 10) maxErrLast = Math.max(maxErrLast, err);
    }
    // 速度ベルレのエネルギー誤差は O(dt²) で振動するだけ（ω²dt²/8 程度）
    expect(maxErrFirst).toBeLessThan(dt * dt);
    // 最初と最後で誤差の振幅が変わらない = 系統的なドリフトがない
    expect(maxErrLast).toBeLessThan(maxErrFirst * 1.01);
  });

  it('対照実験: 粗い刻みで長時間回すと RK4 はエネルギーを失い続け、ベルレ法は失わない', () => {
    const dt = 0.3;
    const steps = 50_000; // 約 2400 周期
    let y = [1, 0];
    let s: PhaseState = { x: [1], v: [0] };
    const rk4Energies: number[] = [];
    let verletMaxErr = 0;
    for (let i = 0; i < steps; i++) {
      y = rk4Step(oscillatorOde, i * dt, y, dt);
      s = velocityVerletStep(oscillatorAccel, i * dt, s, dt);
      verletMaxErr = Math.max(
        verletMaxErr,
        Math.abs(oscillatorEnergy(s.x[0]!, s.v[0]!) - 0.5) / 0.5,
      );
      if ((i + 1) % 10_000 === 0) rk4Energies.push(oscillatorEnergy(y[0]!, y[1]!));
    }
    // RK4: 単調減少（数値的な散逸）し、最終的に 10% 以上失う
    for (let i = 1; i < rk4Energies.length; i++) {
      expect(rk4Energies[i]!).toBeLessThan(rk4Energies[i - 1]!);
    }
    expect(1 - rk4Energies[rk4Energies.length - 1]! / 0.5).toBeGreaterThan(0.1);
    // ベルレ: 誤差は ω²dt²/8 程度で頭打ち
    expect(verletMaxErr).toBeLessThan((dt * dt) / 4);
  });

  it('ケプラー運動（中心力）: 角運動量を丸め誤差の範囲で保存し、エネルギーも有界', () => {
    // GM = 1, 離心率 0.5 の楕円軌道（近日点から出発）
    const gravity: AccelerationFunction = (_t, x) => {
      const r3 = Math.hypot(x[0]!, x[1]!) ** 3;
      return [-x[0]! / r3, -x[1]! / r3];
    };
    const e = 0.5;
    const s0: PhaseState = { x: [1 - e, 0], v: [0, Math.sqrt((1 + e) / (1 - e))] };
    const energy = (s: PhaseState) =>
      0.5 * (s.v[0]! ** 2 + s.v[1]! ** 2) - 1 / Math.hypot(s.x[0]!, s.x[1]!);
    const angMom = (s: PhaseState) => s.x[0]! * s.v[1]! - s.x[1]! * s.v[0]!;

    // 周期 T = 2π a^{3/2}, a = 1 → T = 2π。10 周期分
    const period = 2 * Math.PI;
    for (const step of [velocityVerletStep, yoshida4Step]) {
      let s = s0;
      let maxEnergyErr = 0;
      const dt = period / 2000;
      for (let i = 0; i < 20_000; i++) {
        s = step(gravity, i * dt, s, dt);
        maxEnergyErr = Math.max(maxEnergyErr, relativeError(energy(s), energy(s0)));
      }
      expect(relativeError(angMom(s), angMom(s0))).toBeLessThan(1e-11);
      expect(maxEnergyErr).toBeLessThan(1e-3);
      // 10 周期後に出発点（近日点）へ戻る
      expect(Math.hypot(s.x[0]! - s0.x[0]!, s.x[1]! - s0.x[1]!)).toBeLessThan(5e-3);
    }
  });

  it('時間依存の加速度（強制振動）も解析解と一致する', () => {
    // x'' = -x + cos(2t), x(0)=0, v(0)=0 → x = (cos t - cos 2t) / 3
    const forced: AccelerationFunction = (t, x) => [-x[0]! + Math.cos(2 * t)];
    const s = integrateMotion(forced, { x: [0], v: [0] }, { t1: 5, dt: 0.01 }, yoshida4Step);
    expect(Math.abs(s.x[0]! - (Math.cos(5) - Math.cos(10)) / 3)).toBeLessThan(1e-7);
  });
});
