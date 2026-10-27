/**
 * 単元: p-V 図と熱サイクル
 */
import { h } from '@/core/dom';
import { SimulationRunner } from '@/core/sim/runner';
import { niceBounds } from '@/core/ticks';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import {
  createChoice,
  createParamPanel,
  createToggle,
  presetChoice,
  type ParamPanel,
} from '@/ui/params';
import { createPlaybackControls } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel, createValueTable, type ValueTable } from '@/ui/valuePanel';
import type { UnitModule } from '@/units/types';
import {
  CYCLES,
  CYCLE_OPTIONS,
  DT,
  GAS_OPTIONS,
  PROCESS_DURATION,
  buildCycle,
  currentState,
  initialProgress,
  lapEnergy,
  processLabel,
  processShortLabel,
  step,
  summarize,
  type Cycle,
  type CycleId,
  type CycleParamKey,
  type CycleSummary,
  type EnergyBalance,
  type GasKind,
  type Progress,
} from './model';
import { P_UNIT, V_UNIT, drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

type EnergyKey = 'Q' | 'W' | 'dU';
type StateKey = 'p' | 'V' | 'T';

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showIsotherms: true, showArea: true, showArrows: true };
    let cycleId: CycleId = presetChoice(preset?.choices, 'cycle', CYCLE_OPTIONS, 'rectangle');
    let gas: GasKind = presetChoice(preset?.choices, 'gas', GAS_OPTIONS, 'monatomic');
    // 初期条件のスライダーの値は、最初に開いたサイクルにだけ使う
    let initialParams = preset?.params;

    // --- パラメータ（サイクルの種類ごとにスライダーが変わる。変更したら状態 A からやり直す） ---
    const sliderHost = h('div', null);
    let params: ParamPanel<CycleParamKey>;
    let cycle: Cycle;
    let sum: CycleSummary;
    const makeSliders = () => {
      params = createParamPanel(
        CYCLES[cycleId].params,
        () => {
          applyParams();
          runner.reset();
        },
        initialParams,
      );
      initialParams = undefined;
      sliderHost.replaceChildren(params.element);
    };
    const cycleChoice = createChoice('サイクルの種類', CYCLE_OPTIONS, cycleId, (v) => {
      cycleId = v;
      makeSliders();
      applyParams();
      runner.reset();
    });
    const gasChoice = createChoice('気体の種類', GAS_OPTIONS, gas, (v) => {
      gas = v;
      applyParams();
      runner.reset();
    });
    makeSliders();

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 5,
        ariaLabel:
          'ピストン付きシリンダーの中の気体が熱サイクルを行う様子と、その状態変化を表す p-V 図',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, cycle, sum, runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const pGraph = createTimeGraph(
      {
        yLabel: 'p [×10⁵ Pa]',
        series: [{ label: '圧力 p', quantity: 'pressure' }],
        ariaLabel: '圧力の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'V [×10⁻³ m³]',
        series: [{ label: '体積 V', quantity: 'volume' }],
        ariaLabel: '体積の時間変化',
      },
      disposer,
    );
    const tGraph = createTimeGraph(
      {
        yLabel: 'T [K]',
        series: [{ label: '温度 T', quantity: 'temperature' }],
        ariaLabel: '温度の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'Q', quantity: 'heat' },
          { label: 'W', quantity: 'work' },
          { label: 'ΔU', quantity: 'internal', dashed: true },
        ],
        ariaLabel: '状態 A を出てからの吸収した熱量・気体がした仕事・内部エネルギー変化の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'Q・W・ΔU', graph: eGraph },
      { label: 'p-t', graph: pGraph },
      { label: 'V-t', graph: vGraph },
      { label: 'T-t', graph: tGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'p', label: '圧力', symbol: 'p', unit: 'Pa', quantity: 'pressure' },
      { key: 'V', label: '体積', symbol: 'V', unit: 'm³', quantity: 'volume' },
      { key: 'T', label: '温度', symbol: 'T', unit: 'K', digits: 1, quantity: 'temperature' },
      { key: 'Q', label: '吸収した熱量（A から）', symbol: 'Q', unit: 'J', quantity: 'heat' },
      { key: 'W', label: '気体がした仕事（A から）', symbol: 'W', unit: 'J', quantity: 'work' },
      {
        key: 'dU',
        label: '内部エネルギーの変化（A から）',
        symbol: 'ΔU',
        unit: 'J',
        quantity: 'internal',
      },
    ]);
    const summaryPanel = createValuePanel([
      { key: 'W', label: '正味の仕事', symbol: 'W', unit: 'J', quantity: 'work' },
      { key: 'Qin', label: '吸収した熱量の和', symbol: 'Q_in', unit: 'J', quantity: 'heat' },
      { key: 'Qout', label: '放出した熱量の和', symbol: 'Q_out', unit: 'J', quantity: 'heat' },
      { key: 'e', label: '熱効率', symbol: 'e', unit: '%', digits: 1 },
      { key: 'eC', label: 'カルノー効率 1 − Tₘᵢₙ/Tₘₐₓ', unit: '%', digits: 1 },
    ]);
    const processTableHost = h('div', null);
    const stateTableHost = h('div', null);
    let processTable: ValueTable<string, EnergyKey>;
    const status = h('div', { class: 'time-readout' });

    /** 丸め誤差で 1e-13 J のように表示されないよう、ごく小さい値は 0 にする */
    const clean = (v: number) => (Math.abs(v) < 1e-9 * sum.Qin ? 0 : v);
    const cleanEnergy = (e: EnergyBalance) => ({ Q: clean(e.Q), W: clean(e.W), dU: clean(e.dU) });

    /** パラメータに合わせてサイクル・表・グラフの縦軸を作り直す */
    function applyParams() {
      cycle = buildCycle(cycleId, gas, params.values);
      sum = summarize(cycle);
      const procs = cycle.processes;

      processTable = createValueTable<string, EnergyKey>(
        [
          { key: 'Q', label: '', symbol: 'Q', unit: 'J', quantity: 'heat' },
          { key: 'W', label: '', symbol: 'W', unit: 'J', quantity: 'work' },
          { key: 'dU', label: '', symbol: 'ΔU', unit: 'J', quantity: 'internal' },
        ],
        [
          ...procs.map((p, i) => ({ key: String(i), label: processShortLabel(p) })),
          { key: 'total', label: '1 サイクル', total: true },
        ],
        '各過程で気体が吸収した熱量・気体がした仕事・内部エネルギーの変化',
      );
      processTable.update({
        ...Object.fromEntries(sum.perProcess.map((e, i) => [String(i), cleanEnergy(e)])),
        total: cleanEnergy(sum.total),
      });
      processTableHost.replaceChildren(processTable.element);

      const stateTable = createValueTable<string, StateKey>(
        [
          { key: 'p', label: '', symbol: 'p', unit: 'Pa', quantity: 'pressure' },
          { key: 'V', label: '', symbol: 'V', unit: 'm³', quantity: 'volume' },
          { key: 'T', label: '', symbol: 'T', unit: 'K', digits: 0, quantity: 'temperature' },
        ],
        procs.map((p) => ({ key: p.from, label: `状態 ${p.from}` })),
        '各状態の圧力・体積・温度',
      );
      stateTable.update(Object.fromEntries(procs.map((p) => [p.from, p.start])));
      stateTableHost.replaceChildren(stateTable.element);

      summaryPanel.update({
        W: clean(sum.total.W),
        Qin: sum.Qin,
        Qout: sum.Qout,
        e: 100 * sum.efficiency,
        eC: 100 * sum.carnotEfficiency,
      });

      const pmax = Math.max(...procs.map((p) => p.start.p)) / P_UNIT;
      const vmax = Math.max(...procs.map((p) => p.start.V)) / V_UNIT;
      pGraph.setYRange(niceBounds(0, pmax, 4));
      vGraph.setYRange(niceBounds(0, vmax, 4));
      tGraph.setYRange(niceBounds(0, sum.Tmax, 4));
      eGraph.setYRange(null);
      const window = 2 * procs.length * PROCESS_DURATION;
      for (const g of [pGraph, vGraph, tGraph, eGraph]) g.setWindow(window);
    }

    function record(pr: Progress, t: number) {
      const x = currentState(cycle, pr);
      const e = lapEnergy(cycle, pr);
      pGraph.push(t, [x.p / P_UNIT]);
      vGraph.push(t, [x.V / V_UNIT]);
      tGraph.push(t, [x.T]);
      eGraph.push(t, [e.Q, e.W, e.dU]);
    }

    // --- 時間発展（サイクルを一定の速さでたどる） ---
    applyParams();
    const runner: SimulationRunner<Progress> = new SimulationRunner<Progress>({
      dt: DT,
      init: initialProgress,
      step: (pr, _t, dt) => step(cycle, pr, dt),
      onStep: record,
      onReset: (pr) => {
        graphs.clear();
        record(pr, 0);
      },
      render: (pr) => {
        stage.redraw();
        graphs.redraw();
        const proc = cycle.processes[pr.index]!;
        status.textContent = processLabel(cycle.gas, cycle.n, proc);
        processTable.setActive(String(pr.index));
        const x = currentState(cycle, pr);
        values.update({ ...x, ...cleanEnergy(lapEnergy(cycle, pr)) });
      },
    });
    disposer.add(() => runner.destroy());

    // --- 表示オプション ---
    const toggle = (label: string, key: keyof SceneOptions) =>
      createToggle(label, sceneOpt[key], (on) => {
        sceneOpt[key] = on;
        runner.requestRender();
      }).element;

    mountSimulationLayout(root, {
      stage: stage.element,
      playback: createPlaybackControls(runner, disposer, { stepDuration: PROCESS_DURATION / 10 }),
      status,
      params: h(
        'div',
        { class: 'param-panel' },
        cycleChoice.element,
        gasChoice.element,
        sliderHost,
      ),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('等温線（最高温度・最低温度）', 'showIsotherms'),
        toggle('サイクルが囲む面積（正味の仕事）', 'showArea'),
        toggle('熱 Q と仕事 W の矢印', 'showArrows'),
      ),
      values: h(
        'div',
        { class: 'value-group' },
        values.element,
        h('h3', { class: 'panel-subtitle' }, '各過程の熱量・仕事・内部エネルギー変化'),
        processTableHost,
        h('h3', { class: 'panel-subtitle' }, '1 サイクルの値'),
        summaryPanel.element,
        h('h3', { class: 'panel-subtitle' }, '各状態の値'),
        stateTableHost,
      ),
      graphs: graphs.element,
      theory: buildTheory(),
    });
  },
};

export default unit;
