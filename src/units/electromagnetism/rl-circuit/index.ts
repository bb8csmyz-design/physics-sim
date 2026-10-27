/**
 * 単元: RL 回路の過渡現象
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
  TIME_SCALE,
  coilEnergy,
  coilVoltage,
  henries,
  initialState,
  step,
  timeConstant,
  type RlParams,
  type RlState,
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
    const p = (): RlParams => params.values;

    // スイッチは途中で切り替えても t = 0 に戻さない
    const switchChoice = createChoice<SwitchPosition>(
      'スイッチ S',
      [
        { value: 'a', label: 'a（電池あり）' },
        { value: 'b', label: 'b（電池なし）' },
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
        ariaLabel: '電池・スイッチ・抵抗・コイルの回路図。回路を流れる電流が表示される',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sw, sceneOpt),
      },
      disposer,
    );

    // --- グラフ（横軸は ms） ---
    const iGraph = createTimeGraph(
      {
        yLabel: 'I [mA]',
        series: [{ label: '電流 I', quantity: 'current' }],
        ariaLabel: '回路を流れる電流の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: '電圧 [V]',
        series: [
          { label: 'コイル V_L', quantity: 'magnetic' },
          { label: '抵抗 V_R', quantity: 'heat' },
        ],
        ariaLabel: 'コイルの電圧（自己誘導起電力）と抵抗の電圧の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [mJ]',
        series: [
          { label: 'コイル U', quantity: 'magnetic' },
          { label: 'ジュール熱 Q', quantity: 'heat' },
          { label: '電池の仕事 W', quantity: 'energy', dashed: true },
        ],
        ariaLabel: 'コイルのエネルギー・ジュール熱・電池がした仕事の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'I-t', graph: iGraph },
      { label: '電圧', graph: vGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'I', label: '電流', symbol: 'I', unit: 'mA', digits: 1, quantity: 'current' },
      {
        key: 'VL',
        label: 'コイルの電圧',
        symbol: 'V_L',
        unit: 'V',
        digits: 3,
        quantity: 'magnetic',
      },
      { key: 'VR', label: '抵抗の電圧', symbol: 'V_R', unit: 'V', digits: 3, quantity: 'heat' },
      {
        key: 'U',
        label: 'コイルのエネルギー',
        symbol: 'U',
        unit: 'mJ',
        digits: 3,
        quantity: 'magnetic',
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
      { key: 'tau', label: '時定数', symbol: 'τ', unit: 'ms' },
      { key: 'If', label: '十分後の電流', symbol: 'E/R', unit: 'mA' },
      { key: 'Uf', label: '十分後のエネルギー', symbol: 'LI²/2', unit: 'mJ' },
    ]);
    const time = createTimeReadout({
      digits: 1,
      unit: 'ms',
      note: `スロー再生 1/${1 / TIME_SCALE}`,
    });

    function applyParams() {
      const tau = timeConstant(p());
      const If = p().E / p().R;
      iGraph.setYRange(niceBounds(0, If * MILLI, 4));
      const [, vHi] = niceBounds(-p().E, p().E, 4);
      vGraph.setYRange([-vHi, vHi]);
      eGraph.setYRange(niceBounds(0, henries(p()) * If * If * MILLI, 4));
      const window = Math.min(1, Math.max(0.05, 8 * tau));
      for (const g of [iGraph, vGraph, eGraph]) g.setWindow(window);
      constants.update({ tau: tau * MILLI, If: If * MILLI, Uf: coilEnergy(p(), If) * MILLI });
    }

    function record(s: RlState, t: number) {
      vGraph.push(t, [coilVoltage(p(), s.I, sw), p().R * s.I]);
      iGraph.push(t, [s.I * MILLI]);
      eGraph.push(t, [coilEnergy(p(), s.I) * MILLI, s.heat * MILLI, s.work * MILLI]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<RlState>({
      dt: DT,
      timeScale: TIME_SCALE,
      init: initialState,
      step: (s, _t, dt) => step(p(), s, dt, sw),
      onStep: record,
      onReset: (s) => {
        sw = 'a';
        switchChoice.value = 'a';
        graphs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        values.update({
          I: s.I * MILLI,
          VL: coilVoltage(p(), s.I, sw),
          VR: p().R * s.I,
          U: coilEnergy(p(), s.I) * MILLI,
          Q: s.heat * MILLI,
          W: s.work * MILLI,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.I + s.heat + s.work),
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
      // コマ送り 1 回 = 0.5 ms
      playback: createPlaybackControls(runner, disposer, { stepDuration: 5e-4 }),
      status: time.element,
      params: h('div', { class: 'param-panel' }, switchChoice.element, params.element),
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
