/**
 * 単元: 弦と気柱の固有振動
 */
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createChoice, createParamPanel, createToggle, presetChoice } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  antinodePositions,
  densityChange,
  displacement,
  frequency,
  fundamentalFrequency,
  harmonic,
  initialState,
  modeShape,
  nodePositions,
  probePosition,
  step,
  wavelength,
  type ResonatorKind,
  type ResonatorParams,
  type ResonatorState,
  PRESET_CHOICES,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** スロー再生: 実時間 1 秒あたりに見える振動の回数 */
const VISIBLE_CYCLES_PER_SECOND = 0.8;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = {
      showEnvelope: true,
      showTraveling: false,
      showNodes: true,
      showDensity: true,
    };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const kindChoice = createChoice<ResonatorKind>(
      '振動するもの',
      [
        { value: 'string', label: '弦' },
        { value: 'open', label: '開管' },
        { value: 'closed', label: '閉管' },
      ],
      presetChoice(preset?.choices, 'kind', PRESET_CHOICES.kind, 'closed'),
      () => {
        applyParams();
        runner.reset();
      },
    );
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): ResonatorParams => params.values;
    const kind = (): ResonatorKind => kindChoice.value;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 7,
        mobileAspect: 16 / 9,
        ariaLabel:
          '弦または管の中にできる定常波。包絡線、節と腹の位置、気柱では空気の疎密を点の詰まり具合で表示',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, kind(), p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const yGraph = createTimeGraph(
      {
        yLabel: '観測点の変位（腹の振幅を 1）',
        series: [{ label: '変位 y', quantity: 'position' }],
        yRange: [-1.2, 1.2],
        ariaLabel: '観測点での変位の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([{ label: '観測点の変位', graph: yGraph }]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'y', label: '観測点の変位', symbol: 'y', digits: 2, quantity: 'position' },
    ]);
    const constants = createValuePanel([
      { key: 'f', label: '固有振動数', symbol: 'f', unit: 'Hz', digits: 1 },
      { key: 'lambda', label: '波長', symbol: 'λ', unit: 'm', digits: 3 },
      { key: 'f1', label: '基本振動数', symbol: 'f_1', unit: 'Hz', digits: 1 },
      { key: 'mode', label: '振動の種類' },
      { key: 'nodes', label: '節の数（端を含む）', digits: 0 },
      { key: 'antis', label: '腹の数（端を含む）', digits: 0 },
      { key: 'xp', label: '観測点の位置', symbol: 'x', unit: 'm', digits: 3 },
      { key: 'ampY', label: '観測点の変位の振幅', digits: 2 },
      { key: 'ampD', label: '観測点の密度変化の振幅', digits: 2 },
    ]);
    const time = createTimeReadout(5);

    function applyParams() {
      const P = p();
      const K = kind();
      const f = frequency(K, P);
      runner.setTimeScale(VISIBLE_CYCLES_PER_SECOND / f);
      time.setNote(`約 1/${Math.round(f / VISIBLE_CYCLES_PER_SECOND)} 倍のスロー再生`);
      yGraph.setWindow(3 / f);
      const m = harmonic(K, P);
      const xp = probePosition(P);
      constants.update({
        f,
        lambda: wavelength(K, P),
        f1: fundamentalFrequency(K, P),
        mode: m === 1 ? '基本振動' : `${m} 倍振動`,
        nodes: nodePositions(K, P).length,
        antis: antinodePositions(K, P).length,
        xp,
        ampY: Math.abs(modeShape(K, P, xp)),
        ampD: K === 'string' ? '—' : Math.abs(densityChange(K, P, xp, 0)),
      });
    }

    function record(s: ResonatorState, t: number) {
      yGraph.push(t, [displacement(kind(), p(), probePosition(p()), s.t)]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<ResonatorState>({
      dt: DT,
      init: initialState,
      step: (s, _t, dt) => step(s, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        values.update({ y: displacement(kind(), p(), probePosition(p()), s.t) });
      },
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
      playback: createPlaybackControls(runner, disposer, {
        stepDuration: 1e-4,
      }),
      status: time.element,
      params: h('div', null, kindChoice.element, params.element),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('包絡線（振幅の分布）', 'showEnvelope'),
        toggle('入射波と反射波', 'showTraveling'),
        toggle('節と腹の位置', 'showNodes'),
        toggle('空気の疎密（気柱）', 'showDensity'),
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
