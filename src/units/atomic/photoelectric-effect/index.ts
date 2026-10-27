/**
 * 単元: 光電効果
 */
import { niceBounds } from '@/core/ticks';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { createXYGraph, sampleCurve } from '@/ui/xyGraph';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  TIME_SCALE,
  current,
  einsteinLine,
  emits,
  frequency,
  initialState,
  maxKineticEnergy,
  maxSpeed,
  measuredCurrent,
  photonEnergyEV,
  photonRate,
  saturationCurrent,
  step,
  stoppingVoltage,
  thresholdFrequency,
  thresholdWavelength,
  type PhotoParams,
  type PhotoState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** グラフ・表示の単位換算 */
const MICRO = 1e6; // A → μA
const NANO = 1e9; // s → ns
const NU_UNIT = 1e14; // Hz → ×10¹⁴ Hz

const V_SPEC = PARAMS.find((s) => s.key === 'V')!;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showPhotons: true, showField: true };
    let seed = 1;

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): PhotoParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 10,
        mobileAspect: 1,
        ariaLabel:
          '真空の光電管の陰極に光を当て、飛び出した光電子が陽極へ向かう様子と、光子のエネルギー hν・仕事関数 W・最大運動エネルギー K の棒グラフ',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const ivGraph = createXYGraph(
      {
        xLabel: 'V [V]',
        yLabel: 'I [μA]',
        series: [{ label: '光電流 I', quantity: 'current' }],
        xRange: [V_SPEC.min, V_SPEC.max],
        yRange: [0, 1],
        ariaLabel: '陽極の電位と光電流の関係（電流-電圧特性）',
      },
      disposer,
    );
    const knGraph = createXYGraph(
      {
        xLabel: 'ν [×10¹⁴ Hz]',
        yLabel: 'Kₘₐₓ [eV]',
        series: [
          { label: 'Kₘₐₓ = hν − W', quantity: 'kinetic' },
          { label: '', quantity: 'kinetic', dashed: true },
        ],
        xRange: [0, 16],
        yRange: [-5, 5],
        ariaLabel: '光の振動数と光電子の最大運動エネルギーの関係',
      },
      disposer,
    );
    const itGraph = createTimeGraph(
      {
        xLabel: 't [ns]',
        yLabel: 'I [μA]',
        series: [
          { label: '測定値', quantity: 'current' },
          { label: '理論値', quantity: 'current', dashed: true },
        ],
        window: 400,
        ariaLabel: '陽極に届いた電子から求めた光電流の時間変化と理論値',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'I-V 特性', graph: ivGraph },
      { label: 'Kₘₐₓ-ν', graph: knGraph },
      { label: 'I-t', graph: itGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      {
        key: 'Im',
        label: '光電流（測定値）',
        symbol: 'I',
        unit: 'μA',
        digits: 1,
        quantity: 'current',
      },
      { key: 'I', label: '光電流（理論値）', symbol: 'I', unit: 'μA', digits: 1 },
    ]);
    const constants = createValuePanel([
      { key: 'E', label: '光子のエネルギー', symbol: 'hν', unit: 'eV', digits: 2 },
      { key: 'nu', label: '光の振動数', symbol: 'ν', unit: 'Hz' },
      { key: 'W', label: '仕事関数', symbol: 'W', unit: 'eV', digits: 2 },
      { key: 'nu0', label: '限界振動数', symbol: 'ν_0', unit: 'Hz' },
      { key: 'lambda0', label: '限界波長', symbol: 'λ_0', unit: 'nm', digits: 0 },
      {
        key: 'K',
        label: '最大運動エネルギー',
        symbol: 'K_max',
        unit: 'eV',
        digits: 2,
        quantity: 'kinetic',
      },
      { key: 'v', label: '光電子の最大の速さ', symbol: 'v_max', unit: 'm/s' },
      { key: 'V0', label: '阻止電圧', symbol: 'V_0', unit: 'V', digits: 2 },
      { key: 'N', label: '毎秒当たる光子の数', symbol: 'N', unit: '個/s' },
      { key: 'I0', label: '飽和電流', symbol: 'I_0', unit: 'μA', digits: 1, quantity: 'current' },
    ]);
    const time = createTimeReadout(1, { unit: 'ns' });

    /** パラメータに合わせてグラフ（理論曲線）と定数表示を更新する */
    function applyParams() {
      const q = p();
      const I0 = saturationCurrent(q) * MICRO;
      const V0 = stoppingVoltage(q);
      ivGraph.setYRange(niceBounds(0, Math.max(I0 * 1.15, 1), 4));
      ivGraph.setData(
        0,
        sampleCurve((V) => current(q, V) * MICRO, V_SPEC.min, V_SPEC.max, 400),
      );
      ivGraph.setGuides(emits(q) ? [{ axis: 'x', value: -V0, label: '−V₀' }] : []);
      ivGraph.setMarkers([
        { x: q.V, y: current(q) * MICRO, series: 0, label: emits(q) ? '' : '電子は出ない' },
      ]);

      const nu0 = thresholdFrequency(q) / NU_UNIT;
      knGraph.setData(
        0,
        sampleCurve((x) => einsteinLine(q.W, x * NU_UNIT), nu0, 16, 50),
      );
      knGraph.setData(
        1,
        sampleCurve((x) => einsteinLine(q.W, x * NU_UNIT), 0, nu0, 50),
      );
      knGraph.setGuides([{ axis: 'x', value: nu0, label: 'ν₀' }]);
      knGraph.setMarkers([
        {
          x: frequency(q) / NU_UNIT,
          y: maxKineticEnergy(q),
          series: 0,
          label: emits(q) ? '' : '電子は出ない',
        },
      ]);

      itGraph.setYRange(niceBounds(0, Math.max(I0 * 1.4, 1), 4));

      constants.update({
        E: photonEnergyEV(q),
        nu: frequency(q),
        W: q.W,
        nu0: thresholdFrequency(q),
        lambda0: thresholdWavelength(q),
        K: maxKineticEnergy(q),
        v: maxSpeed(q),
        V0: stoppingVoltage(q),
        N: photonRate(q),
        I0,
      });
    }

    function record(s: PhotoState, t: number) {
      itGraph.push(t * NANO, [measuredCurrent(s) * MICRO, current(p()) * MICRO]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<PhotoState>({
      dt: DT,
      timeScale: TIME_SCALE,
      init: () => initialState(seed++),
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
        values.update({ Im: measuredCurrent(s) * MICRO, I: current(p()) * MICRO });
      },
      isInvalid: (s) => !Number.isFinite(s.t),
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
      playback: createPlaybackControls(runner, disposer, { stepDuration: 1e-9 }),
      status: time.element,
      params: params.element,
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('光子（光の粒）', 'showPhotons'),
        toggle('極板間の電場 E', 'showField'),
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
