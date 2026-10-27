/**
 * 単元: 落下運動と放物運動（空気抵抗あり/なし）
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
  energies,
  flightSummary,
  idealSummary,
  initialState,
  speed,
  step,
  terminalSpeed,
  type ProjectileParams,
  type ProjectileState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer }) {
    const sceneOpt: SceneOptions = {
      showVelocity: true,
      showComponents: false,
      showForce: false,
      showIdeal: true,
    };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, () => {
      applyParams();
      runner.reset();
    });
    const p = (): ProjectileParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 3,
        ariaLabel: '斜めに投げ上げた物体が放物線を描いて地面に落ちる様子と、その軌跡',
        draw: (ctx, size, pal) =>
          drawScene(ctx, size, pal, p(), runner.state, runner.time, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const posGraph = createTimeGraph(
      {
        yLabel: '位置 [m]',
        series: [
          { label: 'x', quantity: 'position' },
          { label: 'y', quantity: 'position', dashed: true },
        ],
        ariaLabel: '水平位置 x と高さ y の時間変化',
      },
      disposer,
    );
    const velGraph = createTimeGraph(
      {
        yLabel: '速度 [m/s]',
        series: [
          { label: 'vx', quantity: 'velocity' },
          { label: 'vy', quantity: 'velocity', dashed: true },
        ],
        ariaLabel: '速度の水平成分と鉛直成分の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U', quantity: 'potential' },
          { label: 'Q', quantity: 'heat' },
          { label: 'E', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '運動エネルギー・位置エネルギー・発熱・力学的エネルギーの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'x-t, y-t', graph: posGraph },
      { label: 'v-t', graph: velGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'x', label: '水平位置', symbol: 'x', unit: 'm', digits: 2, quantity: 'position' },
      { key: 'y', label: '高さ', symbol: 'y', unit: 'm', digits: 2, quantity: 'position' },
      {
        key: 'vx',
        label: '速度の水平成分',
        symbol: 'v_x',
        unit: 'm/s',
        digits: 2,
        quantity: 'velocity',
      },
      {
        key: 'vy',
        label: '速度の鉛直成分',
        symbol: 'v_y',
        unit: 'm/s',
        digits: 2,
        quantity: 'velocity',
      },
      { key: 'v', label: '速さ', symbol: 'v', unit: 'm/s', digits: 2, quantity: 'velocity' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', quantity: 'kinetic' },
      { key: 'U', label: '位置エネルギー', symbol: 'U', unit: 'J', quantity: 'potential' },
      { key: 'Q', label: '空気抵抗による発熱', symbol: 'Q', unit: 'J', quantity: 'heat' },
    ]);
    const summarySpecs = [
      { key: 'H', label: '最高点の高さ', symbol: 'H', unit: 'm', digits: 2 },
      { key: 't1', label: '最高点に達する時刻', symbol: 't_1', unit: 's', digits: 2 },
      { key: 't2', label: '滞空時間', symbol: 't_2', unit: 's', digits: 2 },
      { key: 'R', label: '水平到達距離', symbol: 'R', unit: 'm', digits: 2 },
      { key: 'vEnd', label: '着地の速さ', unit: 'm/s', digits: 2 },
    ] as const;
    const summary = createValuePanel([
      ...summarySpecs,
      { key: 'vT', label: '終端速度', symbol: 'v_T', unit: 'm/s', digits: 2 },
    ]);
    const ideal = createValuePanel(summarySpecs);
    const idealBox = h(
      'div',
      null,
      h('h3', { class: 'panel-subtitle' }, '空気抵抗がない場合（公式）'),
      ideal.element,
    );
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const real = flightSummary(p());
      const id = idealSummary(p());
      const vMax = Math.max(p().v0, id.landingSpeed, 1);
      posGraph.setYRange(niceBounds(0, Math.max(real.range, real.maxHeight, 1), 4));
      const [, hi] = niceBounds(-vMax, vMax, 4);
      velGraph.setYRange([-hi, hi]);
      const e0 = energies(p(), initialState(p())).total;
      eGraph.setYRange(niceBounds(0, Math.max(e0, 1e-3), 4));
      const window = Math.min(30, Math.max(2, 1.1 * real.flightTime));
      for (const g of [posGraph, velGraph, eGraph]) g.setWindow(window);
      const toValues = (s: typeof real) => ({
        H: s.maxHeight,
        t1: s.apexTime,
        t2: s.flightTime,
        R: s.range,
        vEnd: s.landingSpeed,
      });
      summary.update({ ...toValues(real), vT: p().k > 0 ? terminalSpeed(p()) : 'なし' });
      ideal.update(toValues(id));
      idealBox.hidden = p().k === 0;
    }

    function record(s: ProjectileState, t: number) {
      const e = energies(p(), s);
      posGraph.push(t, [s.x, s.y]);
      velGraph.push(t, [s.vx, s.vy]);
      eGraph.push(t, [e.kinetic, e.potential, e.heat, e.total]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<ProjectileState>({
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
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          v: speed(s),
          K: e.kinetic,
          U: e.potential,
          Q: e.heat,
        });
      },
      isFinished: (s) => s.landed,
      isInvalid: (s) => !Number.isFinite(s.x) || !Number.isFinite(s.y),
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
        toggle('速度の成分 vx, vy', 'showComponents'),
        toggle('力（重力 mg・抵抗力 kv）', 'showForce'),
        toggle('空気抵抗なしの軌道（破線）', 'showIdeal'),
      ),
      values: h(
        'div',
        { class: 'value-group' },
        values.element,
        h('h3', { class: 'panel-subtitle' }, 'この条件での値'),
        summary.element,
        idealBox,
      ),
      graphs: graphs.element,
      theory: buildTheory(),
    });
  },
};

export default unit;
