/**
 * 単元: 電気振動（LC 回路）
 */
import { h } from '@/core/dom';
import { SimulationRunner } from '@/core/sim/runner';
import { niceBounds } from '@/core/ticks';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  TIME_SCALE,
  angularFrequency,
  capacitorVoltage,
  energies,
  frequency,
  initialCharge,
  initialState,
  maxCurrent,
  period,
  step,
  type LcParams,
  type LcState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 表示用の単位換算 */
const MILLI = 1e3;
const MICRO = 1e6;

const unit: UnitModule = {
  mount(root, { disposer }) {
    const sceneOpt: SceneOptions = { showCurrent: true, showFields: true, showEnergyBars: true };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, () => {
      applyParams();
      runner.reset();
    });
    const p = (): LcParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 1.1,
        ariaLabel:
          '充電したコンデンサーとコイルをつないだ回路図。極板の電荷と電流が振動し、電場と磁場のエネルギーが入れかわる様子',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ（横軸は ms） ---
    const qGraph = createTimeGraph(
      {
        yLabel: 'q [μC]',
        series: [{ label: '電気量 q', quantity: 'electric' }],
        ariaLabel: 'コンデンサーの電気量の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const iGraph = createTimeGraph(
      {
        yLabel: 'i [mA]',
        series: [{ label: '電流 i', quantity: 'current' }],
        ariaLabel: '回路を流れる電流の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [mJ]',
        series: [
          { label: '静電 U_E', quantity: 'electric' },
          { label: '磁場 U_B', quantity: 'magnetic' },
          { label: '和', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '静電エネルギー・磁場のエネルギー・その和の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'q-t', graph: qGraph },
      { label: 'i-t', graph: iGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'q', label: '電気量', symbol: 'q', unit: 'μC', digits: 1, quantity: 'electric' },
      {
        key: 'V',
        label: 'コンデンサーの電圧',
        symbol: 'V',
        unit: 'V',
        digits: 3,
        quantity: 'electric',
      },
      { key: 'i', label: '電流', symbol: 'i', unit: 'mA', digits: 1, quantity: 'current' },
      {
        key: 'UE',
        label: '静電エネルギー',
        symbol: 'U_E',
        unit: 'mJ',
        digits: 3,
        quantity: 'electric',
      },
      {
        key: 'UB',
        label: '磁場のエネルギー',
        symbol: 'U_B',
        unit: 'mJ',
        digits: 3,
        quantity: 'magnetic',
      },
      { key: 'U', label: 'エネルギーの和', symbol: 'U', unit: 'mJ', digits: 3, quantity: 'energy' },
    ]);
    const constants = createValuePanel([
      { key: 'T', label: '周期', symbol: 'T', unit: 'ms' },
      { key: 'f', label: '固有周波数', symbol: 'f', unit: 'Hz' },
      { key: 'w', label: '角周波数', symbol: 'ω', unit: 'rad/s' },
      { key: 'Q0', label: '電気量の最大値', symbol: 'Q_0', unit: 'μC' },
      { key: 'I0', label: '電流の最大値', symbol: 'I_0', unit: 'mA' },
    ]);
    const time = createTimeReadout(2, { unit: 'ms', note: `1/${1 / TIME_SCALE} 倍のスロー再生` });

    const sym = (m: number): [number, number] => {
      const [, hi] = niceBounds(-m, m, 4);
      return [-hi, hi];
    };

    function applyParams() {
      const Q0 = initialCharge(p());
      const I0 = maxCurrent(p());
      qGraph.setYRange(sym(Math.max(Q0 * MICRO, 1e-3)));
      iGraph.setYRange(sym(Math.max(I0 * MILLI, 1e-3)));
      eGraph.setYRange(
        niceBounds(0, Math.max(energies(p(), initialState(p())).total * MILLI, 1e-3), 4),
      );
      const window = 3 * period(p());
      for (const g of [qGraph, iGraph, eGraph]) g.setWindow(window);
      constants.update({
        T: period(p()) * MILLI,
        f: frequency(p()),
        w: angularFrequency(p()),
        Q0: Q0 * MICRO,
        I0: I0 * MILLI,
      });
    }

    function record(s: LcState, t: number) {
      const e = energies(p(), s);
      qGraph.push(t, [s.q * MICRO]);
      iGraph.push(t, [s.i * MILLI]);
      eGraph.push(t, [e.electric * MILLI, e.magnetic * MILLI, e.total * MILLI]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<LcState>({
      dt: DT,
      timeScale: TIME_SCALE,
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
          q: s.q * MICRO,
          V: capacitorVoltage(p(), s.q),
          i: s.i * MILLI,
          UE: e.electric * MILLI,
          UB: e.magnetic * MILLI,
          U: e.total * MILLI,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.q + s.i),
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
      // コマ送り 1 回 = 0.1 ms
      playback: createPlaybackControls(runner, disposer, { stepDuration: 1e-4 }),
      status: time.element,
      params: params.element,
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('電流の流れ', 'showCurrent'),
        toggle('電場 E と磁場 B の強さの目安', 'showFields'),
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
