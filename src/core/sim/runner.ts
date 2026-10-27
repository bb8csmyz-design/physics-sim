/**
 * シミュレーションの時間管理（固定刻みの物理ステップ + requestAnimationFrame による描画）。
 *
 * - 物理は常に固定刻み dt で進める（フレームレートに依存しない＝再現性がある）
 * - 1 フレームの経過時間 × timeScale × speed だけシミュレーション時刻を進める
 * - 停止中は再描画要求（requestRender）があったときだけ描画する
 *
 * 状態 S の中身や物理は単元側（model.ts）が持ち、ここは「いつ何回 step するか」だけを担う。
 */

export interface RunnerOptions<S> {
  /** 物理ステップの刻み幅 [s]（シミュレーション内の時間） */
  dt: number;
  /** 初期状態を作る。リセット時にも呼ばれる */
  init: () => S;
  /** 状態を dt だけ進めた新しい状態を返す。t は進める前の時刻 */
  step: (state: S, t: number, dt: number) => S;
  /** 現在の状態を描画する */
  render: (state: S, t: number) => void;
  /** 物理ステップごとに呼ばれる（グラフへの記録など） */
  onStep?: (state: S, t: number) => void;
  /** リセット直後に呼ばれる（グラフの消去など） */
  onReset?: (state: S) => void;
  /** 実時間 1 秒あたりに進むシミュレーション時間（既定 1 = 実時間） */
  timeScale?: number;
  /** この時刻に達したら自動で一時停止する（任意） */
  endTime?: number;
  /** 状態が終了条件（着地・落下など）を満たしたら true を返す。true なら一時停止する（任意） */
  isFinished?: (state: S) => boolean;
  /** 状態が物理的に破綻したら true を返す（NaN 検出など）。true なら一時停止する */
  isInvalid?: (state: S) => boolean;
}

export type RunnerEvent = 'play' | 'pause' | 'reset' | 'speed';

/** 1 フレームで処理する物理ステップの上限（タブ復帰時などの暴走防止） */
const MAX_STEPS_PER_FRAME = 2000;
/** 1 フレームで進める実時間の上限 [s] */
const MAX_FRAME_DELTA = 0.1;

export class SimulationRunner<S> {
  private readonly opts: RunnerOptions<S>;
  private _state: S;
  private _time = 0;
  private _playing = false;
  private _speed = 1;
  private accumulator = 0;
  private rafId: number | null = null;
  private renderRequested = false;
  private lastFrame = 0;
  private readonly listeners = new Set<(ev: RunnerEvent) => void>();

  constructor(opts: RunnerOptions<S>) {
    this.opts = opts;
    this._state = opts.init();
    this.opts.onReset?.(this._state);
    this.requestRender();
  }

  get state(): S {
    return this._state;
  }
  get time(): number {
    return this._time;
  }
  get playing(): boolean {
    return this._playing;
  }
  get speed(): number {
    return this._speed;
  }
  get dt(): number {
    return this.opts.dt;
  }

  play(): void {
    if (this._playing) return;
    if (this.finished()) this.reset();
    this._playing = true;
    this.lastFrame = performance.now();
    this.emit('play');
    this.schedule();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this.emit('pause');
  }

  toggle(): void {
    if (this._playing) this.pause();
    else this.play();
  }

  /** 初期状態に戻す（再生中かどうかは維持しない＝停止する） */
  reset(): void {
    this.pause();
    this._state = this.opts.init();
    this._time = 0;
    this.accumulator = 0;
    this.opts.onReset?.(this._state);
    this.emit('reset');
    this.requestRender();
  }

  /** 停止中に、シミュレーション時間で duration だけ進める（コマ送り） */
  advance(duration: number): void {
    this.pause();
    const n = Math.max(1, Math.round(duration / this.opts.dt));
    for (let i = 0; i < n; i++) if (!this.stepOnce()) break;
    this.requestRender();
  }

  setSpeed(speed: number): void {
    this._speed = speed;
    this.emit('speed');
  }

  /** 次のアニメーションフレームで 1 回描画する（停止中のパラメータ変更・リサイズ時など） */
  requestRender(): void {
    this.renderRequested = true;
    this.schedule();
  }

  on(fn: (ev: RunnerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy(): void {
    this._playing = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.listeners.clear();
  }

  private emit(ev: RunnerEvent): void {
    for (const fn of this.listeners) fn(ev);
  }

  private schedule(): void {
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.frame);
  }

  /** 1 ステップ進める。破綻・終了で停止したら false */
  private stepOnce(): boolean {
    const { dt } = this.opts;
    this._state = this.opts.step(this._state, this._time, dt);
    this._time += dt;
    this.opts.onStep?.(this._state, this._time);
    if (this.opts.isInvalid?.(this._state)) {
      console.warn('シミュレーションが数値的に破綻したため停止しました', this._state);
      this.pause();
      return false;
    }
    if (this.finished()) {
      this.pause();
      return false;
    }
    return true;
  }

  /** 終了時刻・終了条件に達しているか（達していれば再生ボタンで最初から再生する） */
  private finished(): boolean {
    const { endTime, isFinished } = this.opts;
    return (
      (endTime !== undefined && this._time >= endTime - this.opts.dt / 2) ||
      (isFinished?.(this._state) ?? false)
    );
  }

  private readonly frame = (now: number): void => {
    this.rafId = null;
    if (this._playing) {
      const real = Math.min((now - this.lastFrame) / 1000, MAX_FRAME_DELTA);
      this.lastFrame = now;
      this.accumulator += real * (this.opts.timeScale ?? 1) * this._speed;
      let n = 0;
      while (this.accumulator >= this.opts.dt && n < MAX_STEPS_PER_FRAME) {
        this.accumulator -= this.opts.dt;
        n++;
        if (!this.stepOnce()) break;
      }
      if (n >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
      this.renderRequested = true;
    }
    if (this.renderRequested) {
      this.renderRequested = false;
      this.opts.render(this._state, this._time);
    }
    if (this._playing) this.schedule();
  };
}
