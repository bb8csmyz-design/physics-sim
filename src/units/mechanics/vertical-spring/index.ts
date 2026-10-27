/**
 * 単元: 鉛直ばね振り子
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
import { G_ACCEL } from '@/core/physics/constants';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  acceleration,
  amplitude,
  angularFrequency,
  energies,
  equilibriumStretch,
  initialState,
  netForce,
  period,
  springForce,
  step,
  stretch,
  type VSpringParams,
  type VSpringState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showVelocity: true, showForce: true };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): VSpringParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 3 / 4,
        ariaLabel: '天井からつるしたばねにつけたおもりが、つりあいの位置を中心に上下に振動する様子',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const xGraph = createTimeGraph(
      {
        yLabel: 'x [m]',
        series: [{ label: '変位 x', quantity: 'position' }],
        ariaLabel: 'つりあいの位置からの変位の時間変化',
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
    const fGraph = createTimeGraph(
      {
        yLabel: '力 [N]',
        series: [
          { label: '弾性力', quantity: 'force' },
          { label: '重力', quantity: 'force', dotted: true },
          { label: '合力', quantity: 'force', dashed: true },
        ],
        ariaLabel: '弾性力・重力・合力（上向き正）の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U弾', quantity: 'potential' },
          { label: 'U重', quantity: 'potential', dotted: true },
          { label: 'E', quantity: 'energy', dashed: true },
        ],
        ariaLabel:
          '運動エネルギー・弾性エネルギー・重力の位置エネルギー・力学的エネルギーの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'x-t', graph: xGraph },
      { label: 'v-t', graph: vGraph },
      { label: '力', graph: fGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'x', label: '変位', symbol: 'x', unit: 'm', digits: 3, quantity: 'position' },
      { key: 'dl', label: 'ばねの伸び', symbol: 'Δl', unit: 'm', digits: 3 },
      { key: 'v', label: '速度', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'a', label: '加速度', symbol: 'a', unit: 'm/s²', digits: 2, quantity: 'acceleration' },
      { key: 'F', label: '弾性力', unit: 'N', digits: 2, quantity: 'force' },
      { key: 'Fnet', label: '合力', symbol: 'F', unit: 'N', digits: 2, quantity: 'force' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', digits: 4, quantity: 'kinetic' },
      { key: 'Ue', label: '弾性エネルギー', unit: 'J', digits: 4, quantity: 'potential' },
      { key: 'Ug', label: '重力の位置エネルギー', unit: 'J', digits: 4, quantity: 'potential' },
      {
        key: 'E',
        label: '力学的エネルギー',
        symbol: 'E',
        unit: 'J',
        digits: 4,
        quantity: 'energy',
      },
    ]);
    const constants = createValuePanel([
      { key: 'd', label: 'つりあいの伸び', symbol: 'd', unit: 'm', digits: 3 },
      { key: 'omega', label: '角振動数', symbol: 'ω', unit: 'rad/s', digits: 3 },
      { key: 'T', label: '周期', symbol: 'T', unit: 's', digits: 3 },
      { key: 'A', label: '振幅', symbol: 'A', unit: 'm', digits: 3 },
      { key: 'vmax', label: '最大の速さ', symbol: 'Aω', unit: 'm/s', digits: 3 },
      { key: 'top', label: '最高点でのばねの伸び', unit: 'm', digits: 3 },
      { key: 'bottom', label: '最下点でのばねの伸び', unit: 'm', digits: 3 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      const A = Math.max(amplitude(q), 1e-3);
      const w = angularFrequency(q);
      const d = equilibriumStretch(q);
      const sym = (m: number): [number, number] => {
        const [, hi] = niceBounds(-m, m, 4);
        return [-hi, hi];
      };
      xGraph.setYRange(sym(A));
      vGraph.setYRange(sym(A * w));
      fGraph.setYRange(sym(q.k * (d + A)));
      const eMax = Math.max(0.5 * q.k * (d + A) ** 2, q.m * G_ACCEL * A);
      eGraph.setYRange(sym(eMax));
      const window = Math.min(30, Math.max(5, 4 * period(q)));
      for (const g of [xGraph, vGraph, fGraph, eGraph]) g.setWindow(window);
      constants.update({
        d,
        omega: w,
        T: period(q),
        A: amplitude(q),
        vmax: amplitude(q) * w,
        top: d - amplitude(q),
        bottom: d + amplitude(q),
      });
    }

    function record(s: VSpringState, t: number) {
      const e = energies(p(), s);
      xGraph.push(t, [s.x]);
      vGraph.push(t, [s.v]);
      fGraph.push(t, [springForce(p(), s.x), -p().m * G_ACCEL, netForce(p(), s.x)]);
      eGraph.push(t, [e.kinetic, e.elastic, e.gravity, e.total]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<VSpringState>({
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
          dl: stretch(p(), s.x),
          v: s.v,
          a: acceleration(p(), s.x),
          F: springForce(p(), s.x),
          Fnet: netForce(p(), s.x),
          K: e.kinetic,
          Ue: e.elastic,
          Ug: e.gravity,
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
        toggle('力（弾性力 kΔl・重力 mg）', 'showForce'),
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
