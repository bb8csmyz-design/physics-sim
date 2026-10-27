/**
 * ボーアの水素原子模型の物理的な正しさのテスト。
 * 量子条件・円運動の運動方程式から導いた r_n, v_n, E_n が、ボーア半径・13.6 eV・リュードベリ定数、
 * 実測されている水素のスペクトル線の波長と一致することを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { defaultParams, paramCorners } from '@/core/params';
import { relativeError } from '@/core/physics/analysis';
import {
  COULOMB_CONSTANT,
  ELECTRON_MASS,
  ELECTRON_VOLT,
  ELEMENTARY_CHARGE,
  PLANCK,
  SPEED_OF_LIGHT,
} from '@/core/physics/constants';
import { VISIBLE_MAX_NM, VISIBLE_MIN_NM } from '@/core/spectrum';
import {
  BASE_PERIOD,
  BOHR_RADIUS,
  DT,
  JUMP_TIME,
  N_MAX,
  PARAMS,
  PHOTON_TRAVEL,
  RYDBERG,
  deBroglieWavelength,
  displayAngularSpeed,
  electronAt,
  energyLevel,
  energyLevelEV,
  initialState,
  ionizationEnergyEV,
  kineticEnergy,
  lineWavelengthNm,
  orbitRadius,
  orbitSpeed,
  orbitalPeriod,
  photonAt,
  potentialEnergy,
  seriesLimitNm,
  seriesName,
  step,
  transition,
} from './model';

const DEFAULT = defaultParams(PARAMS);
const CORNERS = paramCorners(PARAMS);
const LEVELS = Array.from({ length: N_MAX }, (_, i) => i + 1);
const ZS = [1, 2, 3];

describe('ボーアの量子条件と円運動', () => {
  it('量子条件 mvr = nh/2π を満たす', () => {
    for (const Z of ZS)
      for (const n of LEVELS) {
        const L = ELECTRON_MASS * orbitSpeed(Z, n) * orbitRadius(Z, n);
        expect(relativeError(L, (n * PLANCK) / (2 * Math.PI))).toBeLessThan(1e-12);
      }
  });

  it('静電気力が向心力になっている（mv²/r = kZe²/r²）', () => {
    for (const Z of ZS)
      for (const n of LEVELS) {
        const r = orbitRadius(Z, n);
        const v = orbitSpeed(Z, n);
        const centripetal = (ELECTRON_MASS * v * v) / r;
        const coulomb = (COULOMB_CONSTANT * Z * ELEMENTARY_CHARGE ** 2) / (r * r);
        expect(relativeError(centripetal, coulomb)).toBeLessThan(1e-9);
      }
  });

  it('軌道の 1 周が電子波の波長のちょうど n 倍（2πr = nλ）', () => {
    for (const Z of ZS)
      for (const n of LEVELS) {
        const ratio = (2 * Math.PI * orbitRadius(Z, n)) / deBroglieWavelength(Z, n);
        expect(ratio).toBeCloseTo(n, 9);
      }
  });

  it('ボーア半径 r₁ ≈ 5.29×10⁻¹¹ m、v₁ ≈ 2.19×10⁶ m/s、r_n ∝ n²/Z、v_n ∝ Z/n', () => {
    expect(relativeError(BOHR_RADIUS, 5.29177e-11)).toBeLessThan(1e-5);
    expect(relativeError(orbitSpeed(1, 1), 2.18769e6)).toBeLessThan(1e-5);
    for (const Z of ZS)
      for (const n of LEVELS) {
        expect(relativeError(orbitRadius(Z, n), (BOHR_RADIUS * n * n) / Z)).toBeLessThan(1e-12);
        expect(relativeError(orbitSpeed(Z, n), (orbitSpeed(1, 1) * Z) / n)).toBeLessThan(1e-12);
      }
  });

  it('光速に比べて十分遅い（v₁/c ≈ 1/137、Z ≤ 3 で v/c < 0.03）', () => {
    expect(SPEED_OF_LIGHT / orbitSpeed(1, 1)).toBeCloseTo(137.036, 2);
    for (const Z of ZS) expect(orbitSpeed(Z, 1) / SPEED_OF_LIGHT).toBeLessThan(0.03);
  });
});

describe('エネルギー準位', () => {
  it('水素原子で E₁ ≈ −13.6 eV、E_n = E₁/n²、He⁺ では Z² = 4 倍', () => {
    expect(energyLevelEV(1, 1)).toBeCloseTo(-13.606, 3);
    expect(ionizationEnergyEV(1)).toBeCloseTo(13.606, 3);
    expect(ionizationEnergyEV(2)).toBeCloseTo(4 * 13.606, 2);
    for (const Z of ZS)
      for (const n of LEVELS) {
        expect(
          relativeError(energyLevelEV(Z, n), (Z * Z * energyLevelEV(1, 1)) / (n * n)),
        ).toBeLessThan(1e-12);
      }
  });

  it('E = K + U で、K = −E、U = 2E（位置エネルギーの大きさは運動エネルギーの 2 倍）', () => {
    for (const Z of ZS)
      for (const n of LEVELS) {
        const E = energyLevel(Z, n);
        expect(relativeError(kineticEnergy(Z, n) + potentialEnergy(Z, n), E)).toBeLessThan(1e-9);
        expect(relativeError(kineticEnergy(Z, n), -E)).toBeLessThan(1e-9);
        expect(relativeError(potentialEnergy(Z, n), 2 * E)).toBeLessThan(1e-9);
      }
  });

  it('準位は n が大きいほど高く、間隔は狭くなり、0（電離）に近づく', () => {
    for (const Z of ZS) {
      for (let n = 1; n < N_MAX; n++) {
        expect(energyLevel(Z, n + 1)).toBeGreaterThan(energyLevel(Z, n));
        if (n + 2 <= N_MAX) {
          const gap1 = energyLevel(Z, n + 1) - energyLevel(Z, n);
          const gap2 = energyLevel(Z, n + 2) - energyLevel(Z, n + 1);
          expect(gap2).toBeLessThan(gap1);
        }
      }
      expect(energyLevel(Z, 1e6)).toBeLessThan(0);
      expect(Math.abs(energyLevelEV(Z, 1e6))).toBeLessThan(1e-9);
    }
  });

  it('1 周の時間 T₁ ≈ 1.52×10⁻¹⁶ s、T_n ∝ n³/Z²', () => {
    expect(relativeError(orbitalPeriod(1, 1), 1.51983e-16)).toBeLessThan(1e-4);
    for (const Z of ZS)
      for (const n of LEVELS)
        expect(
          relativeError(orbitalPeriod(Z, n), (orbitalPeriod(1, 1) * n ** 3) / Z ** 2),
        ).toBeLessThan(1e-12);
  });
});

describe('スペクトル（振動数条件）', () => {
  it('ボーア模型から導いたリュードベリ定数が R = 1.097×10⁷ /m に一致する', () => {
    expect(relativeError(RYDBERG, 1.0973731568e7)).toBeLessThan(1e-8);
  });

  it('光子のエネルギーは準位の差に等しく（エネルギー保存）、1/λ = RZ²(1/n_下² − 1/n_上²) を満たす（全隅）', () => {
    for (const p of CORNERS) {
      const tr = transition(p);
      if (p.n === p.nf) {
        expect(tr.kind).toBe('なし');
        expect(tr.energyEV).toBe(0);
        continue;
      }
      expect(tr.kind).toBe(p.nf < p.n ? '放出' : '吸収');
      const dE = Math.abs(energyLevelEV(p.Z, p.n) - energyLevelEV(p.Z, p.nf));
      expect(relativeError(tr.energyEV, dE)).toBeLessThan(1e-12);
      expect(relativeError(PLANCK * tr.frequency, dE * ELECTRON_VOLT)).toBeLessThan(1e-12);
      expect(relativeError(tr.wavelengthNm * 1e-9 * tr.frequency, SPEED_OF_LIGHT)).toBeLessThan(
        1e-12,
      );
      const invLambda = RYDBERG * p.Z ** 2 * (1 / tr.lower ** 2 - 1 / tr.upper ** 2);
      expect(relativeError(1 / (tr.wavelengthNm * 1e-9), invLambda)).toBeLessThan(1e-9);
    }
  });

  it('水素のバルマー系列の波長が実測値（真空中）と 0.1% 以内で一致する', () => {
    // 実測値 [nm]。差の主な原因は原子核の運動（換算質量）で、相対的に m/M ≈ 5×10⁻⁴ 程度
    const measured: [number, number][] = [
      [3, 656.28],
      [4, 486.13],
      [5, 434.05],
      [6, 410.17],
    ];
    for (const [n, lam] of measured) {
      expect(relativeError(lineWavelengthNm(1, n, 2), lam), `n=${n}`).toBeLessThan(1e-3);
    }
    // ライマン α 線（121.57 nm）
    expect(relativeError(lineWavelengthNm(1, 2, 1), 121.57)).toBeLessThan(1e-3);
  });

  it('系列の極限: ライマン 91.2 nm、バルマー 365 nm（上の準位を大きくすると近づく）', () => {
    expect(seriesLimitNm(1, 1)).toBeCloseTo(91.13, 1);
    expect(seriesLimitNm(1, 2)).toBeCloseTo(364.5, 1);
    expect(relativeError(lineWavelengthNm(1, 1e5, 2), seriesLimitNm(1, 2))).toBeLessThan(1e-9);
    for (let n = 3; n < N_MAX; n++)
      expect(lineWavelengthNm(1, n + 1, 2)).toBeLessThan(lineWavelengthNm(1, n, 2));
  });

  it('ライマン系列は紫外線、バルマー系列の n = 3〜6 は可視光、パッシェン系列は赤外線', () => {
    for (let n = 2; n <= N_MAX; n++) expect(lineWavelengthNm(1, n, 1)).toBeLessThan(VISIBLE_MIN_NM);
    for (let n = 3; n <= 6; n++) {
      const lam = lineWavelengthNm(1, n, 2);
      expect(lam > VISIBLE_MIN_NM && lam < VISIBLE_MAX_NM, `n=${n}`).toBe(true);
    }
    for (let n = 4; n <= N_MAX; n++)
      expect(lineWavelengthNm(1, n, 3)).toBeGreaterThan(VISIBLE_MAX_NM);
    expect(seriesName(1)).toBe('ライマン系列');
    expect(seriesName(2)).toBe('バルマー系列');
    expect(seriesName(3)).toBe('パッシェン系列');
  });

  it('リッツの結合則: ν(3→1) = ν(3→2) + ν(2→1)', () => {
    for (const Z of ZS) {
      const nu = (u: number, l: number) => SPEED_OF_LIGHT / (lineWavelengthNm(Z, u, l) * 1e-9);
      expect(relativeError(nu(3, 1), nu(3, 2) + nu(2, 1))).toBeLessThan(1e-12);
      expect(relativeError(nu(7, 1), nu(7, 4) + nu(4, 2) + nu(2, 1))).toBeLessThan(1e-12);
    }
  });

  it('吸収と放出で、同じ 2 つの準位なら光子の波長は同じ', () => {
    const emit = transition({ ...DEFAULT, n: 4, nf: 2 });
    const absorb = transition({ ...DEFAULT, n: 2, nf: 4 });
    expect(absorb.wavelengthNm).toBe(emit.wavelengthNm);
  });
});

describe('アニメーション（模式的な時間）', () => {
  function run(p: typeof DEFAULT, duration: number) {
    let s = initialState();
    const n = Math.round(duration / DT);
    for (let i = 0; i < n; i++) s = step(p, s, DT);
    return s;
  }

  it('移る前は初めの準位、移った後は後の準位の軌道にいて、角は連続', () => {
    for (const p of CORNERS) {
      const before = electronAt(p, JUMP_TIME - 1e-9);
      const after = electronAt(p, JUMP_TIME + 1e-9);
      expect(before.n).toBe(p.n);
      expect(after.n).toBe(p.nf);
      expect(before.r).toBe(orbitRadius(p.Z, p.n));
      expect(after.r).toBe(orbitRadius(p.Z, p.nf));
      expect(Math.abs(after.theta - before.theta)).toBeLessThan(1e-6);
    }
  });

  it('回る速さの比は実際と同じ（ω ∝ 1/n³）で、内側の軌道の周期が BASE_PERIOD', () => {
    for (const p of CORNERS) {
      const inner = Math.min(p.n, p.nf);
      expect(displayAngularSpeed(p, inner)).toBeCloseTo((2 * Math.PI) / BASE_PERIOD, 12);
      const ratio = displayAngularSpeed(p, p.n) / displayAngularSpeed(p, p.nf);
      expect(relativeError(ratio, orbitalPeriod(p.Z, p.nf) / orbitalPeriod(p.Z, p.n))).toBeLessThan(
        1e-12,
      );
    }
  });

  it('光子は放出なら準位が移った瞬間に電子の位置から出て行き、吸収ならその瞬間に電子に届く', () => {
    const emit = { ...DEFAULT, n: 3, nf: 2 };
    expect(photonAt(emit, JUMP_TIME - 0.01)).toBeNull();
    expect(photonAt(emit, JUMP_TIME)!.progress).toBe(0);
    expect(photonAt(emit, JUMP_TIME + PHOTON_TRAVEL / 2)!.progress).toBeCloseTo(0.5, 12);
    expect(photonAt(emit, JUMP_TIME + PHOTON_TRAVEL + 0.01)).toBeNull();
    expect(photonAt(emit, JUMP_TIME)!.theta).toBeCloseTo(electronAt(emit, JUMP_TIME).theta, 12);

    const absorb = { ...DEFAULT, n: 2, nf: 3 };
    expect(photonAt(absorb, JUMP_TIME - PHOTON_TRAVEL)!.progress).toBeCloseTo(1, 12);
    expect(photonAt(absorb, JUMP_TIME - 1e-9)!.progress).toBeLessThan(1e-6);
    expect(photonAt(absorb, JUMP_TIME + 0.01)).toBeNull();

    const none = { ...DEFAULT, n: 2, nf: 2 };
    for (const t of [0, JUMP_TIME, JUMP_TIME + 0.5]) expect(photonAt(none, t)).toBeNull();
  });

  it('step で時間が正しく進む', () => {
    const s = run(DEFAULT, 3);
    expect(s.t).toBeCloseTo(3, 9);
  });
});

describe('数値計算の設定', () => {
  it('パラメータ範囲全体で、1 ステップに回る角は 0.05 rad 以下', () => {
    for (const p of CORNERS)
      for (const n of [p.n, p.nf]) expect(displayAngularSpeed(p, n) * DT).toBeLessThanOrEqual(0.05);
  });
});
