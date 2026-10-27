/**
 * 単元: 放射性崩壊と半減期
 */
import { niceBounds } from '@/core/ticks';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  decayConstant,
  decayedBy,
  expectedActivity,
  expectedRemaining,
  initialState,
  meanLife,
  measuredActivity,
  remaining,
  step,
  type DecayParams,
  type DecayState,
} from './model';
import { drawScene } from './scene';
import { buildTheory } from './theory';

/** グラフに表示する時間幅（半減期の何倍か） */
const WINDOW_HALF_LIVES = 6;

const unit: UnitModule = {
  mount(root, { disposer }) {
    let seed = 1;

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, () => {
      applyParams();
      runner.reset();
    });
    const p = (): DecayParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 1,
        ariaLabel:
          '格子状に並んだ放射性原子核が確率的に崩壊していき、崩壊していない原子核の数が減っていく様子',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state),
      },
      disposer,
    );

    // --- グラフ ---
    const nGraph = createTimeGraph(
      {
        yLabel: 'N [個]',
        series: [
          { label: 'N（シミュレーション）', quantity: 'nucleus' },
          { label: 'N₀(1/2)^(t/T)', quantity: 'nucleus', dashed: true },
          { label: '崩壊した数', quantity: 'daughter' },
        ],
        ariaLabel: '残っている原子核の数と崩壊した数の時間変化',
      },
      disposer,
    );
    const lnGraph = createTimeGraph(
      {
        yLabel: 'ln(N/N₀)',
        series: [
          { label: 'シミュレーション', quantity: 'nucleus' },
          { label: '−λt', quantity: 'nucleus', dashed: true },
        ],
        ariaLabel: '残っている原子核の数の対数の時間変化（片対数グラフ）',
      },
      disposer,
    );
    const aGraph = createTimeGraph(
      {
        yLabel: 'A [Bq]',
        series: [
          { label: '測定値', quantity: 'daughter' },
          { label: 'λN', quantity: 'daughter', dashed: true },
        ],
        ariaLabel: '放射能（1 秒あたりの崩壊数）の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'N-t', graph: nGraph },
      { label: 'ln N-t', graph: lnGraph },
      { label: 'A-t', graph: aGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      {
        key: 'N',
        label: '残っている原子核の数',
        symbol: 'N',
        unit: '個',
        digits: 0,
        quantity: 'nucleus',
      },
      { key: 'Nth', label: '残りの数の理論値', unit: '個', digits: 1 },
      { key: 'ratio', label: '残っている割合', symbol: 'N/N_0', unit: '%', digits: 1 },
      { key: 'D', label: '崩壊した数', unit: '個', digits: 0, quantity: 'daughter' },
      { key: 'halves', label: '経過時間 ÷ 半減期', symbol: 't/T', digits: 2 },
      {
        key: 'A',
        label: '放射能（測定値）',
        symbol: 'A',
        unit: 'Bq',
        digits: 1,
        quantity: 'daughter',
      },
      { key: 'Ath', label: '放射能の理論値', symbol: 'λN', unit: 'Bq', digits: 1 },
    ]);
    const constants = createValuePanel([
      { key: 'lambda', label: '崩壊定数', symbol: 'λ', unit: '1/s' },
      { key: 'tau', label: '平均寿命', symbol: 'τ', unit: 's' },
      { key: 'A0', label: '初めの放射能', symbol: 'A_0', unit: 'Bq', digits: 1 },
      { key: 'N1', label: 'T 後の残り（理論値）', unit: '個', digits: 1 },
      { key: 'N2', label: '2T 後の残り（理論値）', unit: '個', digits: 1 },
      { key: 'N3', label: '3T 後の残り（理論値）', unit: '個', digits: 1 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      const window = WINDOW_HALF_LIVES * q.T;
      nGraph.setYRange([0, q.N0]);
      lnGraph.setYRange(niceBounds(-decayConstant(q) * window, 0, 4));
      aGraph.setYRange(niceBounds(0, expectedActivity(q, 0) * 1.5, 4));
      for (const g of [nGraph, lnGraph, aGraph]) g.setWindow(window);
      constants.update({
        lambda: decayConstant(q),
        tau: meanLife(q),
        A0: expectedActivity(q, 0),
        N1: expectedRemaining(q, q.T),
        N2: expectedRemaining(q, 2 * q.T),
        N3: expectedRemaining(q, 3 * q.T),
      });
    }

    function record(s: DecayState, t: number) {
      const q = p();
      const N = remaining(s);
      nGraph.push(t, [N, expectedRemaining(q, t), q.N0 - N]);
      lnGraph.push(t, [N > 0 ? Math.log(N / q.N0) : NaN, -decayConstant(q) * t]);
      aGraph.push(t, [measuredActivity(q, s), expectedActivity(q, t)]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<DecayState>({
      dt: DT,
      init: () => initialState(p(), seed++),
      step: (s, _t, dt) => step(p(), s, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        const q = p();
        const N = remaining(s);
        values.update({
          N,
          Nth: expectedRemaining(q, t),
          ratio: (100 * N) / q.N0,
          D: decayedBy(s, s.t),
          halves: t / q.T,
          A: measuredActivity(q, s),
          Ath: decayConstant(q) * N,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.t),
    });
    disposer.add(() => runner.destroy());
    applyParams();

    mountSimulationLayout(root, {
      stage: stage.element,
      playback: createPlaybackControls(runner, disposer, { speeds: [0.5, 1, 2, 5, 10] }),
      status: time.element,
      params: params.element,
      values: h(
        'div',
        { class: 'value-group' },
        values.element,
        h('h3', { class: 'panel-subtitle' }, 'この条件での値'),
        constants.element,
      ),
      graphs: graphs.element,
      theory: buildTheory(),
    });
  },
};

export default unit;
