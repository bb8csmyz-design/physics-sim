/**
 * 単元: 電磁誘導（磁場中のレール上を動く導体棒）
 */
import { h } from '@/core/dom';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { niceBounds } from '@/core/ticks';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  chargePassed,
  current,
  emf,
  flux,
  initialState,
  kineticEnergy,
  magneticForce,
  step,
  terminalVelocity,
  timeConstant,
  type InductionParams,
  type InductionState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showVelocity: true, showForce: true, showCurrent: true };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): InductionParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 3,
        ariaLabel:
          '鉛直上向きの磁場の中で、抵抗につながれた 2 本のレールの上を導体棒が動き、誘導電流が流れる様子（真上から見た図）',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const vGraph = createTimeGraph(
      {
        yLabel: 'v [m/s]',
        series: [{ label: '速度 v', quantity: 'velocity' }],
        ariaLabel: '導体棒の速度の時間変化',
      },
      disposer,
    );
    const emfGraph = createTimeGraph(
      {
        yLabel: 'V [V]',
        series: [{ label: '誘導起電力 V', quantity: 'electric' }],
        ariaLabel: '誘導起電力の時間変化',
      },
      disposer,
    );
    const iGraph = createTimeGraph(
      {
        yLabel: 'I [A]',
        series: [{ label: '誘導電流 I', quantity: 'current' }],
        ariaLabel: '誘導電流の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: '運動エネルギー K', quantity: 'kinetic' },
          { label: 'ジュール熱 Q', quantity: 'heat' },
          { label: '外力の仕事 W', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '運動エネルギーの増加・ジュール熱・外力がした仕事の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'v-t', graph: vGraph },
      { label: '起電力 V', graph: emfGraph },
      { label: '電流 I', graph: iGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'v', label: '速さ', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'V', label: '誘導起電力', symbol: 'V', unit: 'V', digits: 3, quantity: 'electric' },
      { key: 'I', label: '誘導電流', symbol: 'I', unit: 'A', digits: 3, quantity: 'current' },
      { key: 'f', label: '電流が受ける力', symbol: 'IBl', unit: 'N', digits: 3, quantity: 'force' },
      { key: 'phi', label: '磁束', symbol: 'Φ', unit: 'Wb', digits: 3, quantity: 'magnetic' },
      { key: 'q', label: '流れた電気量', symbol: 'q', unit: 'C', digits: 3, quantity: 'current' },
      { key: 'P', label: '消費電力', symbol: 'I²R', unit: 'W', digits: 3, quantity: 'heat' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', digits: 3, quantity: 'kinetic' },
      {
        key: 'Q',
        label: 'ジュール熱（累計）',
        symbol: 'Q',
        unit: 'J',
        digits: 3,
        quantity: 'heat',
      },
      {
        key: 'W',
        label: '外力の仕事（累計）',
        symbol: 'W',
        unit: 'J',
        digits: 3,
        quantity: 'energy',
      },
    ]);
    const constants = createValuePanel([
      { key: 'vf', label: '終端速度', symbol: 'v_f', unit: 'm/s' },
      { key: 'tau', label: '時定数', symbol: 'τ', unit: 's' },
      { key: 'Vf', label: '終端速度での起電力', symbol: 'v_fBl', unit: 'V' },
      { key: 'If', label: '終端速度での電流', symbol: 'I_f', unit: 'A' },
    ]);
    const time = createTimeReadout();

    function applyParams() {
      const vf = terminalVelocity(p());
      const tau = timeConstant(p());
      const vMax = Math.max(vf, p().v0, 0.1);
      vGraph.setYRange(niceBounds(0, vMax, 4));
      emfGraph.setYRange(niceBounds(0, emf(p(), vMax), 4));
      iGraph.setYRange(niceBounds(0, current(p(), vMax), 4));
      const window = Math.min(60, Math.max(10, 6 * tau));
      for (const g of [vGraph, emfGraph, iGraph, eGraph]) g.setWindow(window);
      constants.update({ vf, tau, Vf: emf(p(), vf), If: current(p(), vf) });
    }

    function record(s: InductionState, t: number) {
      vGraph.push(t, [s.v]);
      emfGraph.push(t, [emf(p(), s.v)]);
      iGraph.push(t, [current(p(), s.v)]);
      eGraph.push(t, [
        kineticEnergy(p(), s) - kineticEnergy(p(), initialState(p())),
        s.heat,
        s.work,
      ]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<InductionState>({
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
        const I = current(p(), s.v);
        values.update({
          v: s.v,
          V: emf(p(), s.v),
          I,
          f: Math.abs(magneticForce(p(), s.v)),
          phi: flux(p(), s.x),
          q: chargePassed(p(), s),
          P: I * I * p().R,
          K: kineticEnergy(p(), s),
          Q: s.heat,
          W: s.work,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.x + s.v + s.heat + s.work),
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
        toggle('速度 v', 'showVelocity'),
        toggle('外力 F と電流が受ける力 IBl', 'showForce'),
        toggle('誘導電流の流れ', 'showCurrent'),
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
