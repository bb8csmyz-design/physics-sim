/**
 * 2 つの波源による水面波の干渉の物理モデル。DOM に依存しない純粋な計算のみ。
 *
 * 座標: 水面上に x 軸（右向き正）と y 軸（上向き正）をとり、2 つの波源の中点を原点とする。
 *   波源 S₁ = (−d/2, 0)、S₂ = (+d/2, 0)。
 * 各波源は振幅 A、振動数 f の同じ波を出す（S₂ は S₁ と同位相、または逆位相）。
 * 距離による振幅の減衰は無視する（教科書・入試の扱いと同じ）。単位は A = 1 とした相対値。
 *
 *   S₁ からの波: y₁ = A sin(ωt − k r₁),  S₂ からの波: y₂ = A sin(ωt − k r₂ + φ)
 *   （r₁, r₂ は波源からの距離、k = 2π/λ、φ = 0（同位相）または π（逆位相））
 *
 * 合成波 y = y₁ + y₂ の振幅は 2A |cos(π(r₁ − r₂)/λ − φ/2)| で、
 *   同位相なら |r₁ − r₂| = mλ で強め合い、(m + ½)λ で弱め合う（逆位相では逆）。
 * 時間発展は解析解そのもの（状態は時刻だけ）。
 */
import type { ParamSpec, ParamValues } from '@/core/params';

export type InterferenceParamKey = 'd' | 'lambda' | 'xP' | 'yP';
export type InterferenceParams = ParamValues<InterferenceParamKey>;
export type SourcePhase = 'same' | 'opposite';
/**
 * 答え合わせ・URL で指定できる択一の切り替え（ctx.preset.choices のキーと選べる値）。
 * index.ts の presetChoice() と、演習問題のテスト（checkExercises）の両方がこれを使う。
 */
export const PRESET_CHOICES = { phase: ['same', 'opposite'] } as const satisfies Record<
  string,
  readonly SourcePhase[]
>;

export const PARAMS: readonly ParamSpec<InterferenceParamKey>[] = [
  {
    key: 'd',
    label: '波源の間隔',
    symbol: 'd',
    unit: 'm',
    min: 0.02,
    max: 0.1,
    step: 0.005,
    default: 0.06,
    digits: 3,
  },
  {
    key: 'lambda',
    label: '波長',
    symbol: 'λ',
    unit: 'm',
    min: 0.01,
    max: 0.04,
    step: 0.001,
    default: 0.02,
  },
  {
    key: 'xP',
    label: '点 P の位置（横）',
    symbol: 'x_P',
    unit: 'm',
    min: -0.15,
    max: 0.15,
    step: 0.005,
    default: 0.03,
    digits: 3,
    hint: '2 つの波源の中点からの距離（右向きが正）',
  },
  {
    key: 'yP',
    label: '点 P の位置（縦）',
    symbol: 'y_P',
    unit: 'm',
    min: 0,
    max: 0.14,
    step: 0.005,
    default: 0.08,
    digits: 3,
    hint: '波源を結ぶ直線からの距離',
  },
];

/** 波源の振動数 f [Hz]（水波投影装置の典型値） */
export const FREQUENCY = 5;
/** 1 つの波源から出る波の振幅（これを 1 とした相対値で表す） */
export const AMPLITUDE = 1;
/** 物理ステップの刻み幅 [s]。ωΔt = 2π·5·0.001 ≈ 0.03（1 周期 200 ステップ） */
export const DT = 1e-3;

export interface InterferenceState {
  t: number;
}

export function initialState(): InterferenceState {
  return { t: 0 };
}

export function step(s: InterferenceState, dt: number): InterferenceState {
  return { t: s.t + dt };
}

export function phaseDifference(phase: SourcePhase): number {
  return phase === 'same' ? 0 : Math.PI;
}

/** 波源の位置 S₁, S₂ */
export function sources(
  p: InterferenceParams,
): readonly [{ x: number; y: number }, { x: number; y: number }] {
  return [
    { x: -p.d / 2, y: 0 },
    { x: p.d / 2, y: 0 },
  ];
}

/** 点 (x, y) から S₁, S₂ までの距離 [r₁, r₂] */
export function distances(p: InterferenceParams, x: number, y: number): [number, number] {
  return [Math.hypot(x + p.d / 2, y), Math.hypot(x - p.d / 2, y)];
}

/** 波の速さ v = fλ [m/s] */
export function waveSpeed(p: InterferenceParams): number {
  return FREQUENCY * p.lambda;
}

/** S₁ からの波・S₂ からの波・合成波の変位（A = 1 の相対値） */
export function displacements(
  p: InterferenceParams,
  phase: SourcePhase,
  x: number,
  y: number,
  t: number,
): { y1: number; y2: number; total: number } {
  const [r1, r2] = distances(p, x, y);
  const w = 2 * Math.PI * FREQUENCY;
  const k = (2 * Math.PI) / p.lambda;
  const y1 = AMPLITUDE * Math.sin(w * t - k * r1);
  const y2 = AMPLITUDE * Math.sin(w * t - k * r2 + phaseDifference(phase));
  return { y1, y2, total: y1 + y2 };
}

/** 経路差 |r₁ − r₂| [m] */
export function pathDifference(p: InterferenceParams, x: number, y: number): number {
  const [r1, r2] = distances(p, x, y);
  return Math.abs(r1 - r2);
}

/** 合成波の振幅（解析解）2A |cos(π(r₁ − r₂)/λ − φ/2)| */
export function resultantAmplitude(
  p: InterferenceParams,
  phase: SourcePhase,
  x: number,
  y: number,
): number {
  const [r1, r2] = distances(p, x, y);
  return (
    2 *
    AMPLITUDE *
    Math.abs(Math.cos((Math.PI * (r1 - r2)) / p.lambda - phaseDifference(phase) / 2))
  );
}

export type InterferenceKind = 'constructive' | 'destructive' | 'partial';

/**
 * 経路差から、強め合う（腹）・弱め合う（節）・その中間 を判定する。
 * tol は「ちょうど」とみなす幅（波長に対する割合）。
 */
export function interferenceKind(
  p: InterferenceParams,
  phase: SourcePhase,
  x: number,
  y: number,
  tol = 0.02,
): InterferenceKind {
  const n = pathDifference(p, x, y) / p.lambda + (phase === 'same' ? 0 : 0.5);
  const frac = n - Math.floor(n);
  if (frac < tol || frac > 1 - tol) return 'constructive';
  if (Math.abs(frac - 0.5) < tol) return 'destructive';
  return 'partial';
}

/**
 * 強め合う線・弱め合う線の経路差 r₁ − r₂ の値（|r₁ − r₂| < d を満たすもの、小さい順）。
 * 同位相なら強め合う線は mλ、弱め合う線は (m + ½)λ。逆位相では入れかわる。
 */
export function lineOffsets(
  p: InterferenceParams,
  phase: SourcePhase,
  kind: 'constructive' | 'destructive',
): number[] {
  const half = (kind === 'constructive') === (phase === 'same') ? 0 : 0.5;
  const out: number[] = [];
  const mMax = Math.ceil(p.d / p.lambda) + 1;
  for (let m = -mMax; m <= mMax; m++) {
    const delta = (m + half) * p.lambda;
    if (Math.abs(delta) < p.d - 1e-12) out.push(delta);
  }
  return out;
}

/** 線分 S₁S₂ と交わる強め合う線（または弱め合う線）の本数 */
export function lineCount(
  p: InterferenceParams,
  phase: SourcePhase,
  kind: 'constructive' | 'destructive',
): number {
  return lineOffsets(p, phase, kind).length;
}

/**
 * 経路差 r₁ − r₂ = δ の点の集まり（双曲線、y ≥ 0 の側）上で、縦の位置 y に対応する x。
 * 焦点 (±d/2, 0)、x²/a² − y²/b² = 1（a = |δ|/2, b² = (d/2)² − a²）。δ = 0 なら y 軸。
 */
export function hyperbolaX(p: InterferenceParams, delta: number, y: number): number {
  const a = Math.abs(delta) / 2;
  if (a === 0) return 0;
  const b2 = (p.d / 2) ** 2 - a * a;
  return Math.sign(delta) * a * Math.sqrt(1 + (y * y) / b2);
}
