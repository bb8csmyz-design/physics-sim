/**
 * 単元: ドップラー効果
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
  DURATION,
  PARAMS,
  V,
  initialState,
  instantaneousFrequency,
  measuredFrequency,
  observedFrequency,
  receivedSignal,
  sourceSignal,
  step,
  wavelength,
  type DopplerParams,
  type DopplerState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 実時間 1 秒あたりに進むシミュレーション時間（音は速いのでスロー再生） */
const TIME_SCALE = 1 / 50;

const unit: UnitModule = {
  mount(root, { disposer }) {
    const sceneOpt: SceneOptions = { showVelocity: true, showWavelength: false };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, () => {
      applyParams();
      runner.reset();
    });
    const p = (): DopplerParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 3,
        ariaLabel:
          '左の音源から同心円状に広がる波面と、右の観測者。音源が動くと前方の波面が詰まり、後方では広がる',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const fGraph = createTimeGraph(
      {
        yLabel: 'f [Hz]',
        series: [
          { label: '測定値', quantity: 'time' },
          { label: '公式', quantity: 'time', dashed: true },
        ],
        window: DURATION,
        ariaLabel: '観測者が聞く振動数の時間変化',
      },
      disposer,
    );
    const waveGraph = createTimeGraph(
      {
        yLabel: '振動（相対値）',
        series: [
          { label: '観測者に届く音', quantity: 'position' },
          { label: '音源の振動', dashed: true },
        ],
        yRange: [-1.2, 1.2],
        ariaLabel: '観測者の位置での空気の振動と、音源の振動の比較',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: '観測振動数', graph: fGraph },
      { label: '届く音の波形', graph: waveGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      {
        key: 'fm',
        label: '観測振動数（測定）',
        symbol: 'f',
        unit: 'Hz',
        digits: 1,
        quantity: 'time',
      },
      { key: 'ff', label: '公式から求めた値', symbol: 'f', unit: 'Hz', digits: 1 },
      { key: 'xs', label: '音源の位置', symbol: 'x_S', unit: 'm', digits: 2, quantity: 'position' },
      {
        key: 'xo',
        label: '観測者の位置',
        symbol: 'x_O',
        unit: 'm',
        digits: 2,
        quantity: 'position',
      },
    ]);
    const constants = createValuePanel([
      { key: 'V', label: '音速', symbol: 'V', unit: 'm/s', digits: 0 },
      { key: 'l1', label: '音源の前方（右）の波長', symbol: 'λ_1', unit: 'm', digits: 3 },
      { key: 'l2', label: '音源の後方（左）の波長', symbol: 'λ_2', unit: 'm', digits: 3 },
      { key: 'f1', label: '観測者が右側で聞く振動数', symbol: 'f_1', unit: 'Hz', digits: 1 },
      { key: 'f2', label: '観測者が左側で聞く振動数', symbol: 'f_2', unit: 'Hz', digits: 1 },
    ]);
    const time = createTimeReadout(3, { note: '1/50 倍のスロー再生' });

    function applyParams() {
      const f1 = observedFrequency(p(), 1);
      const f2 = observedFrequency(p(), -1);
      const lo = Math.min(f1, f2, p().f0);
      const hi = Math.max(f1, f2, p().f0);
      fGraph.setYRange(niceBounds(lo - 0.05 * (hi - lo + 50), hi + 0.05 * (hi - lo + 50), 4));
      waveGraph.setWindow(8 / p().f0);
      constants.update({
        V: V,
        l1: wavelength(p(), 1),
        l2: wavelength(p(), -1),
        f1,
        f2,
      });
    }

    function record(s: DopplerState, t: number) {
      fGraph.push(t, [measuredFrequency(s), instantaneousFrequency(p(), t)]);
      waveGraph.push(t, [receivedSignal(p(), t), sourceSignal(p(), t)]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<DopplerState>({
      dt: DT,
      timeScale: TIME_SCALE,
      endTime: DURATION,
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
        values.update({
          fm: measuredFrequency(s),
          ff: instantaneousFrequency(p(), t),
          xs: s.xs,
          xo: s.xo,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.xs) || !Number.isFinite(s.xo),
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
      playback: createPlaybackControls(runner, disposer, { stepDuration: 0.002 }),
      status: time.element,
      params: params.element,
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('速度ベクトル v', 'showVelocity'),
        toggle('波長 λ の表示', 'showWavelength'),
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
