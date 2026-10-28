/**
 * 単元: 交流回路と RLC 共振
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
  averagePower,
  capacitiveReactance,
  elementVoltages,
  impedance,
  inductiveReactance,
  initialState,
  peakCurrent,
  peakVoltage,
  phaseLag,
  resonanceFrequency,
  rmsCurrent,
  step,
  type AcParams,
  type AcState,
  type StartMode,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showCurrent: true, showPhasor: true };
    let mode: StartMode = 'steady';

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): AcParams => params.values;
    const startToggle = createToggle('電源を入れた瞬間から始める（過渡現象）', false, (on) => {
      mode = on ? 'rest' : 'steady';
      applyParams();
      runner.reset();
    });

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 0.9,
        ariaLabel:
          '交流電源に抵抗・コイル・コンデンサーを直列につないだ回路図と、各電圧と電流を回転する矢印で表したベクトル図',
        draw: (ctx, size, pal) =>
          drawScene(ctx, size, pal, p(), runner.state, runner.time, sceneOpt),
      },
      disposer,
    );

    // --- グラフ（横軸は ms） ---
    const vGraph = createTimeGraph(
      {
        yLabel: '電圧 [V]',
        series: [
          { label: '電源 v', quantity: 'potential' },
          { label: 'v_R', quantity: 'heat' },
          { label: 'v_L', quantity: 'magnetic' },
          { label: 'v_C', quantity: 'electric', dashed: true },
        ],
        symmetric: true,
        ariaLabel: '電源電圧と、抵抗・コイル・コンデンサーの電圧の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const iGraph = createTimeGraph(
      {
        yLabel: 'i [A]',
        series: [{ label: '電流 i', quantity: 'current' }],
        symmetric: true,
        ariaLabel: '回路を流れる電流の時間変化',
        timeUnit: 'ms',
      },
      disposer,
    );
    const pGraph = createTimeGraph(
      {
        yLabel: '電力 [W]',
        series: [
          { label: '瞬間の電力 p = vi', quantity: 'energy' },
          { label: '平均の消費電力', quantity: 'heat', dashed: true },
        ],
        ariaLabel: '電源が供給する瞬間の電力と、平均の消費電力',
        timeUnit: 'ms',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: '電圧', graph: vGraph },
      { label: 'i-t', graph: iGraph },
      { label: '電力', graph: pGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'v', label: '電源電圧', symbol: 'v', unit: 'V', digits: 1, quantity: 'potential' },
      { key: 'i', label: '電流', symbol: 'i', unit: 'A', digits: 3, quantity: 'current' },
      { key: 'vR', label: '抵抗の電圧', symbol: 'v_R', unit: 'V', digits: 1, quantity: 'heat' },
      {
        key: 'vL',
        label: 'コイルの電圧',
        symbol: 'v_L',
        unit: 'V',
        digits: 1,
        quantity: 'magnetic',
      },
      {
        key: 'vC',
        label: 'コンデンサーの電圧',
        symbol: 'v_C',
        unit: 'V',
        digits: 1,
        quantity: 'electric',
      },
      { key: 'pw', label: '瞬間の電力', symbol: 'p', unit: 'W', digits: 1, quantity: 'energy' },
    ]);
    const constants = createValuePanel([
      { key: 'Ve', label: '電圧の実効値', symbol: 'V_e', unit: 'V' },
      { key: 'V0', label: '電圧の最大値', symbol: 'V_0', unit: 'V' },
      { key: 'XL', label: '誘導リアクタンス', symbol: 'X_L', unit: 'Ω' },
      { key: 'XC', label: '容量リアクタンス', symbol: 'X_C', unit: 'Ω' },
      { key: 'Z', label: 'インピーダンス', symbol: 'Z', unit: 'Ω' },
      { key: 'Ie', label: '電流の実効値', symbol: 'I_e', unit: 'A' },
      { key: 'I0', label: '電流の最大値', symbol: 'I_0', unit: 'A' },
      { key: 'phi', label: '電流の遅れ', symbol: 'φ', unit: '°', digits: 1 },
      { key: 'pf', label: '力率', symbol: 'cos φ', digits: 3 },
      { key: 'P', label: '平均の消費電力', symbol: 'P', unit: 'W' },
      { key: 'f0', label: '共振周波数', symbol: 'f_0', unit: 'Hz' },
    ]);
    const time = createTimeReadout(1, { unit: 'ms', note: `1/${1 / TIME_SCALE} 倍のスロー再生` });

    const sym = (m: number): [number, number] => {
      const [, hi] = niceBounds(-m, m, 4);
      return [-hi, hi];
    };

    function applyParams() {
      const I0 = peakCurrent(p());
      const V0 = peakVoltage(p());
      const vMax = Math.max(V0, inductiveReactance(p()) * I0, capacitiveReactance(p()) * I0);
      // 過渡現象を含むときは振幅が定常状態より大きくなりうるので、縦軸は自動にする
      vGraph.setYRange(mode === 'steady' ? sym(vMax) : null);
      iGraph.setYRange(mode === 'steady' ? sym(I0) : null);
      pGraph.setYRange(
        mode === 'steady' ? niceBounds(Math.min(0, -V0 * I0 * 0.5), V0 * I0, 4) : null,
      );
      const window = 3 / p().f;
      for (const g of [vGraph, iGraph, pGraph]) g.setWindow(window);
      const phi = phaseLag(p());
      constants.update({
        Ve: p().Ve,
        V0,
        XL: inductiveReactance(p()),
        XC: capacitiveReactance(p()),
        Z: impedance(p()),
        Ie: rmsCurrent(p()),
        I0,
        phi: (phi * 180) / Math.PI,
        pf: Math.cos(phi),
        P: averagePower(p()),
        f0: resonanceFrequency(p()),
      });
    }

    function record(s: AcState, t: number) {
      const v = elementVoltages(p(), s, t);
      vGraph.push(t, [v.source, v.R, v.L, v.C]);
      iGraph.push(t, [s.i]);
      pGraph.push(t, [v.source * s.i, averagePower(p())]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<AcState>({
      dt: DT,
      timeScale: TIME_SCALE,
      init: () => initialState(p(), mode),
      step: (s, t, dt) => step(p(), s, t, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        const v = elementVoltages(p(), s, t);
        values.update({ v: v.source, i: s.i, vR: v.R, vL: v.L, vC: v.C, pw: v.source * s.i });
      },
      isInvalid: (s) => !Number.isFinite(s.q + s.i + s.heat + s.work),
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
      params: h('div', { class: 'param-panel' }, params.element, startToggle.element),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('電流の流れ', 'showCurrent'),
        toggle('ベクトル図', 'showPhasor'),
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
