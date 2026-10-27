/**
 * 単元: 鉛直面内の円運動
 */
import { niceBounds } from '@/core/ticks';
import { SimulationRunner } from '@/core/sim/runner';
import { G_ACCEL } from '@/core/physics/constants';
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
  bottomTension,
  energies,
  height,
  initialState,
  loopSpeed,
  maxHeight,
  motionKind,
  slackPoint,
  speed,
  step,
  swingSpeed,
  tension,
  topSpeed,
  topTension,
  type CircleParams,
  type CircleState,
  type MotionKind,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const KIND_LABEL: Record<MotionKind, string> = {
  loop: '1 周する',
  swing: '往復運動（振り子）',
  slack: '途中で糸がたるむ',
  rest: '静止',
};

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showVelocity: true, showForce: true, showSlackPoint: true };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): CircleParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 10,
        mobileAspect: 1,
        ariaLabel: '糸につけた小球が鉛直面内で円運動する様子と、小球にはたらく張力と重力',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const tGraph = createTimeGraph(
      {
        yLabel: 'T [N]',
        series: [{ label: '張力 T', quantity: 'force' }],
        ariaLabel: '糸の張力の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'v [m/s]',
        series: [{ label: '速さ v', quantity: 'velocity' }],
        ariaLabel: '速さの時間変化',
      },
      disposer,
    );
    const hGraph = createTimeGraph(
      {
        yLabel: 'h [m]',
        series: [{ label: '高さ h', quantity: 'position' }],
        ariaLabel: '最下点からの高さの時間変化',
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
        ariaLabel: '運動エネルギー・位置エネルギー・力学的エネルギーの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: '張力', graph: tGraph },
      { label: 'v-t', graph: vGraph },
      { label: 'h-t', graph: hGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      {
        key: 'h',
        label: '高さ（最下点から）',
        symbol: 'h',
        unit: 'm',
        digits: 3,
        quantity: 'position',
      },
      { key: 'v', label: '速さ', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'T', label: '張力', symbol: 'T', unit: 'N', digits: 2, quantity: 'force' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', digits: 3, quantity: 'kinetic' },
      {
        key: 'U',
        label: '位置エネルギー',
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
      { key: 'kind', label: '運動の種類' },
      { key: 'vLoop', label: '1 周に必要な速さ √(5gr)', unit: 'm/s', digits: 2 },
      { key: 'vSwing', label: '往復運動になる上限 √(2gr)', unit: 'm/s', digits: 2 },
      { key: 'T0', label: '最下点での張力', symbol: 'T_0', unit: 'N', digits: 2 },
      { key: 'vTop', label: '最高点での速さ', unit: 'm/s', digits: 2 },
      { key: 'TTop', label: '最高点での張力', unit: 'N', digits: 2 },
      { key: 'hSlack', label: '糸がたるむ高さ', unit: 'm', digits: 3 },
      { key: 'vSlack', label: '糸がたるむときの速さ', unit: 'm/s', digits: 3 },
      { key: 'hMax', label: '到達する最高点の高さ', symbol: 'H', unit: 'm', digits: 3 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      tGraph.setYRange(niceBounds(0, bottomTension(q), 4));
      vGraph.setYRange(niceBounds(0, Math.max(q.v0, 0.1), 4));
      hGraph.setYRange(niceBounds(0, 2 * q.r, 4));
      eGraph.setYRange(niceBounds(0, Math.max(0.5 * q.m * q.v0 * q.v0, 1e-3), 4));
      const window = Math.min(20, Math.max(5, 8 * Math.sqrt(q.r / G_ACCEL) * Math.PI));
      for (const g of [tGraph, vGraph, hGraph, eGraph]) g.setWindow(window);
      const kind = motionKind(q);
      const slack = slackPoint(q);
      constants.update({
        kind: KIND_LABEL[kind],
        vLoop: loopSpeed(q),
        vSwing: swingSpeed(q),
        T0: bottomTension(q),
        vTop: kind === 'loop' ? topSpeed(q) : '届かない',
        TTop: kind === 'loop' ? topTension(q) : '—',
        hSlack: slack ? slack.height : 'たるまない',
        vSlack: slack ? slack.speed : '—',
        hMax: maxHeight(q),
      });
    }

    function record(s: CircleState, t: number) {
      const e = energies(p(), s);
      tGraph.push(t, [tension(p(), s)]);
      vGraph.push(t, [speed(p(), s)]);
      hGraph.push(t, [height(p(), s)]);
      eGraph.push(t, [e.kinetic, e.potential, e.total]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<CircleState>({
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
          h: height(p(), s),
          v: speed(p(), s),
          T: tension(p(), s),
          K: e.kinetic,
          U: e.potential,
          E: e.total,
        });
      },
      isFinished: (s) => s.done,
      isInvalid: (s) => !Number.isFinite(s.theta) || !Number.isFinite(s.omega),
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
        toggle('力（張力 T・重力 mg）', 'showForce'),
        toggle('糸がたるむ点', 'showSlackPoint'),
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
