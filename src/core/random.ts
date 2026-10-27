/**
 * 再現性のある乱数（シード付き）。確率的な現象（光電子の放出・放射性崩壊など）のモデルで使う。
 *
 * model.ts は純粋関数にするため Math.random() を使わず、乱数の内部状態を物理の状態に含めて受け渡す:
 *
 *   const r = nextUniform(s.rng);   // r.value ∈ [0, 1)、r.state が次の内部状態
 */

/** 乱数の内部状態（32 ビット整数） */
export type RngState = number;

/** 任意の整数シードから内部状態を作る */
export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/** 一様乱数 [0, 1)（mulberry32） */
export function nextUniform(state: RngState): { value: number; state: RngState } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

/**
 * 状態を内部に持つ乱数列。1 回の step の中で何個も乱数を使うときに便利。
 * 使い終わったら `state` を次の状態として保存する。
 */
export class Rng {
  state: RngState;
  constructor(state: RngState) {
    this.state = state;
  }
  /** 一様乱数 [0, 1) */
  uniform(): number {
    const r = nextUniform(this.state);
    this.state = r.state;
    return r.value;
  }
  /** 一様乱数 (0, 1]（対数をとっても発散しない） */
  uniformPositive(): number {
    return 1 - this.uniform();
  }
  /** 平均 mean の指数分布 */
  exponential(mean: number): number {
    return -mean * Math.log(this.uniformPositive());
  }
  /**
   * 平均 mean のポアソン分布（Knuth の方法。mean が数十程度までを想定）。
   * 一定の割合で起こる独立な事象が、ある時間内に起こる回数の分布。
   */
  poisson(mean: number): number {
    if (!(mean > 0)) return 0;
    const limit = Math.exp(-mean);
    let k = 0;
    let prod = this.uniform();
    while (prod > limit) {
      k++;
      prod *= this.uniform();
    }
    return k;
  }
}
