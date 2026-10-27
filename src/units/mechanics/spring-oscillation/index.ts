/**
 * 単元: ばねの単振動（見本単元。新しい単元はこの構成をまねて作る）
 */
import { niceBounds } from '@/core/ticks';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  acceleration,
  amplitude,
  angularFrequency,
  energies,
  initialState,
  period,
  springForce,
  step,
  type SpringParams,
  type SpringState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer }) {
    const sceneOpt: SceneOptions = { showVelocity: true, showForce: true, showCircle: false };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, () => {
      applyParams();
      runner.reset();
    });
    const p = (): SpringParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 3,
        ariaLabel: 'なめらかな床の上で、壁につながれたばねと物体が水平に振動する様子',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const xGraph = createTimeGraph(
      {
        yLabel: 'x [m]',
        series: [{ label: '変位 x', quantity: 'position' }],
        ariaLabel: '変位の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'v [m/s]',
        series: [{ label: '速度 v', quantity: 'velocity' }],
        ariaLabel: '速度の時間変化',
      },
      disposer,
    );
    const aGraph = createTimeGraph(
      {
        yLabel: 'a [m/s²]',
        series: [{ label: '加速度 a', quantity: 'acceleration' }],
        ariaLabel: '加速度の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U', quantity: 'potential' },
          { label: 'E', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '運動エネルギー・弾性エネルギー・力学的エネルギーの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'x-t', graph: xGraph },
      { label: 'v-t', graph: vGraph },
      { label: 'a-t', graph: aGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'x', label: '変位', symbol: 'x', unit: 'm', digits: 3, quantity: 'position' },
      { key: 'v', label: '速度', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'a', label: '加速度', symbol: 'a', unit: 'm/s²', digits: 2, quantity: 'acceleration' },
      { key: 'F', label: '弾性力', symbol: 'F', unit: 'N', digits: 2, quantity: 'force' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', digits: 3, quantity: 'kinetic' },
      {
        key: 'U',
        label: '弾性エネルギー',
        symbol: 'U',
        unit: 'J',
        digits: 3,
        quantity: 'potential',
      },
      {
        key: 'E',
        label: '力学的エネルギー',
        symbol: 'E',
        unit: 'J',
        digits: 3,
        quantity: 'energy',
      },
    ]);
    const constants = createValuePanel([
      { key: 'omega', label: '角振動数', symbol: 'ω', unit: 'rad/s', digits: 3 },
      { key: 'T', label: '周期', symbol: 'T', unit: 's', digits: 3 },
      { key: 'A', label: '振幅', symbol: 'A', unit: 'm', digits: 3 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const A = Math.max(amplitude(p()), 1e-3);
      const w = angularFrequency(p());
      const sym = (m: number): [number, number] => {
        const [, hi] = niceBounds(-m, m, 4);
        return [-hi, hi];
      };
      xGraph.setYRange(sym(A));
      vGraph.setYRange(sym(A * w));
      aGraph.setYRange(sym(A * w * w));
      eGraph.setYRange(niceBounds(0, 0.5 * p().k * A * A, 4));
      const window = Math.min(60, Math.max(10, 3 * period(p())));
      for (const g of [xGraph, vGraph, aGraph, eGraph]) g.setWindow(window);
      constants.update({ omega: w, T: period(p()), A: amplitude(p()) });
    }

    function record(s: SpringState, t: number) {
      const e = energies(p(), s);
      xGraph.push(t, [s.x]);
      vGraph.push(t, [s.v]);
      aGraph.push(t, [acceleration(p(), s.x)]);
      eGraph.push(t, [e.kinetic, e.potential, e.total]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<SpringState>({
      dt: DT,
      init: () => initialState(p()),
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
        const e = energies(p(), s);
        values.update({
          x: s.x,
          v: s.v,
          a: acceleration(p(), s.x),
          F: springForce(p(), s.x),
          K: e.kinetic,
          U: e.potential,
          E: e.total,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.x) || !Number.isFinite(s.v),
    });
    disposer.add(() => runner.destroy());
    applyParams();

    // --- 表示オプション ---
    const toggle = (label: string, key: keyof SceneOptions) =>
      createToggle(label, sceneOpt[key], (on) => {
        sceneOpt[key] = on;
        runner.requestRender();
      }).element;

    mountSimulationLayout(root, {
      stage: stage.element,
      playback: createPlaybackControls(runner, disposer),
      status: time.element,
      params: params.element,
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('速度ベクトル v', 'showVelocity'),
        toggle('弾性力 F', 'showForce'),
        toggle('等速円運動との対応（参照円）', 'showCircle'),
      ),
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
