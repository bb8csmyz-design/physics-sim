/**
 * 単元: RC 回路の過渡現象
 */
import { h } from '@/core/dom';
import { SimulationRunner } from '@/core/sim/runner';
import { niceBounds } from '@/core/ticks';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createChoice, createParamPanel, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  capacitorEnergy,
  capacitorVoltage,
  current,
  farads,
  initialState,
  ohms,
  step,
  timeConstant,
  type RcParams,
  type RcState,
  type SwitchPosition,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 表示用の単位換算 */
const MILLI = 1e3;

const unit: UnitModule = {
  mount(root, { disposer }) {
    const sceneOpt: SceneOptions = { showCurrent: true, showEnergyBars: true };
    let sw: SwitchPosition = 'a';

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, () => {
      applyParams();
      runner.reset();
    });
    const p = (): RcParams => params.values;

    // スイッチは途中で切り替えても t = 0 に戻さない（充電の途中から放電させられる）
    const switchChoice = createChoice<SwitchPosition>(
      'スイッチ S',
      [
        { value: 'a', label: 'a（充電）' },
        { value: 'b', label: 'b（放電）' },
      ],
      'a',
      (v) => {
        sw = v;
        runner.requestRender();
      },
    );

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 1.1,
        ariaLabel:
          '電池・スイッチ・抵抗・コンデンサーの回路図。コンデンサーの極板の電荷と、回路を流れる電流が表示される',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sw, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const qGraph = createTimeGraph(
      {
        yLabel: 'q [mC]',
        series: [{ label: '電気量 q', quantity: 'electric' }],
        ariaLabel: 'コンデンサーの電気量の時間変化',
      },
      disposer,
    );
    const iGraph = createTimeGraph(
      {
        yLabel: 'I [mA]',
        series: [{ label: '電流 I', quantity: 'current' }],
        ariaLabel: '回路を流れる電流の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: '電圧 [V]',
        series: [
          { label: 'コンデンサー V_C', quantity: 'electric' },
          { label: '抵抗 V_R', quantity: 'heat' },
        ],
        ariaLabel: 'コンデンサーの電圧と抵抗の電圧の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [mJ]',
        series: [
          { label: '静電エネルギー U', quantity: 'electric' },
          { label: 'ジュール熱 Q', quantity: 'heat' },
          { label: '電池の仕事 W', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '静電エネルギー・ジュール熱・電池がした仕事の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'q-t', graph: qGraph },
      { label: 'I-t', graph: iGraph },
      { label: '電圧', graph: vGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'q', label: '電気量', symbol: 'q', unit: 'mC', digits: 3, quantity: 'electric' },
      {
        key: 'VC',
        label: 'コンデンサーの電圧',
        symbol: 'V_C',
        unit: 'V',
        digits: 3,
        quantity: 'electric',
      },
      { key: 'VR', label: '抵抗の電圧', symbol: 'V_R', unit: 'V', digits: 3, quantity: 'heat' },
      { key: 'I', label: '電流', symbol: 'I', unit: 'mA', digits: 3, quantity: 'current' },
      {
        key: 'U',
        label: '静電エネルギー',
        symbol: 'U',
        unit: 'mJ',
        digits: 3,
        quantity: 'electric',
      },
      {
        key: 'Q',
        label: 'ジュール熱（累計）',
        symbol: 'Q',
        unit: 'mJ',
        digits: 3,
        quantity: 'heat',
      },
      {
        key: 'W',
        label: '電池の仕事（累計）',
        symbol: 'W',
        unit: 'mJ',
        digits: 3,
        quantity: 'energy',
      },
    ]);
    const constants = createValuePanel([
      { key: 'tau', label: '時定数', symbol: 'τ', unit: 's' },
      { key: 'I0', label: '最初の電流', symbol: 'E/R', unit: 'mA' },
      { key: 'Qf', label: '充電後の電気量', symbol: 'CE', unit: 'mC' },
      { key: 'Uf', label: '充電後のエネルギー', symbol: 'CE²/2', unit: 'mJ' },
    ]);
    const time = createTimeReadout();

    function applyParams() {
      const tau = timeConstant(p());
      const Q = farads(p()) * p().E;
      const I0 = p().E / ohms(p());
      qGraph.setYRange(niceBounds(0, Q * MILLI, 4));
      const [, iHi] = niceBounds(-I0 * MILLI, I0 * MILLI, 4);
      iGraph.setYRange([-iHi, iHi]);
      const [, vHi] = niceBounds(-p().E, p().E, 4);
      vGraph.setYRange([-vHi, vHi]);
      eGraph.setYRange(niceBounds(0, farads(p()) * p().E ** 2 * MILLI, 4));
      const window = Math.min(60, Math.max(10, 8 * tau));
      for (const g of [qGraph, iGraph, vGraph, eGraph]) g.setWindow(window);
      constants.update({ tau, I0: I0 * MILLI, Qf: Q * MILLI, Uf: 0.5 * Q * p().E * MILLI });
    }

    function record(s: RcState, t: number) {
      const I = current(p(), s.q, sw);
      qGraph.push(t, [s.q * MILLI]);
      iGraph.push(t, [I * MILLI]);
      vGraph.push(t, [capacitorVoltage(p(), s.q), I * ohms(p())]);
      eGraph.push(t, [capacitorEnergy(p(), s.q) * MILLI, s.heat * MILLI, s.work * MILLI]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<RcState>({
      dt: DT,
      init: initialState,
      step: (s, _t, dt) => step(p(), s, dt, sw),
      onStep: record,
      onReset: (s) => {
        // リセットするとスイッチも a 側（充電）に戻す
        sw = 'a';
        switchChoice.value = 'a';
        graphs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        const I = current(p(), s.q, sw);
        values.update({
          q: s.q * MILLI,
          VC: capacitorVoltage(p(), s.q),
          VR: I * ohms(p()),
          I: I * MILLI,
          U: capacitorEnergy(p(), s.q) * MILLI,
          Q: s.heat * MILLI,
          W: s.work * MILLI,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.q + s.heat + s.work),
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
      params: h('div', null, switchChoice.element, params.element),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('電流の流れ', 'showCurrent'),
        toggle('エネルギーの棒グラフ', 'showEnergyBars'),
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
