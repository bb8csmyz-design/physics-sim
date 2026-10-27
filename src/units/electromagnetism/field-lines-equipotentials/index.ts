/**
 * 単元: 等電位線と電気力線
 */
import { h } from '@/core/dom';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import type { UnitModule } from '@/units/types';
import {
  DT,
  NANO,
  PARAMS,
  TEST_CHARGE,
  TEST_MASS,
  energies,
  field,
  initialState,
  midpointValues,
  potential,
  step,
  type FieldParams,
  type TestChargeState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 表示用の単位換算 */
const MICRO = 1e6;
/** 軌跡として残す点の数の上限 */
const TRAIL_MAX = 3000;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = {
      showFieldLines: true,
      showEquipotentials: true,
      showTrail: true,
      showVectors: true,
    };
    let trail: { x: number; y: number }[] = [];

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): FieldParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 1.6,
        ariaLabel:
          '2 つの点電荷のまわりの電気力線と等電位線、および静かに放した正の試験電荷が動く様子（真上から見た図）',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, trail, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [μJ]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U = qV', quantity: 'potential' },
          { label: 'K + U', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '試験電荷の運動エネルギー・静電気力による位置エネルギー・その和の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'V [V]',
        series: [{ label: '試験電荷の位置の電位 V', quantity: 'potential' }],
        ariaLabel: '試験電荷の位置の電位の時間変化',
      },
      disposer,
    );
    const speedGraph = createTimeGraph(
      {
        yLabel: 'v [m/s]',
        series: [{ label: '速さ v', quantity: 'velocity' }],
        ariaLabel: '試験電荷の速さの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'エネルギー', graph: eGraph },
      { label: '電位 V', graph: vGraph },
      { label: '速さ v', graph: speedGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'V', label: '電位', symbol: 'V', unit: 'V', quantity: 'potential' },
      { key: 'E', label: '電場の強さ', symbol: 'E', unit: 'V/m', quantity: 'electric' },
      { key: 'F', label: '静電気力', symbol: 'F', unit: 'μN', quantity: 'force' },
      { key: 'v', label: '速さ', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'μJ', quantity: 'kinetic' },
      { key: 'U', label: '位置エネルギー', symbol: 'U', unit: 'μJ', quantity: 'potential' },
      { key: 'total', label: 'エネルギーの和', symbol: 'K+U', unit: 'μJ', quantity: 'energy' },
    ]);
    const constants = createValuePanel([
      { key: 'VM', label: '中点 M の電位', symbol: 'V_M', unit: 'V' },
      { key: 'EM', label: '中点 M の電場の強さ', symbol: 'E_M', unit: 'V/m' },
      { key: 'V0', label: '出発点の電位', symbol: 'V_0', unit: 'V' },
      { key: 'q', label: '試験電荷', symbol: 'q', unit: 'nC', digits: 1 },
      { key: 'm', label: '試験電荷の質量', symbol: 'm', unit: 'g', digits: 2 },
    ]);
    const time = createTimeReadout();

    function applyParams() {
      const m = midpointValues(p());
      constants.update({
        // 等量異符号で打ち消し合うときの丸め誤差（10⁻¹³ V 程度）は 0 と表示する
        VM: Math.abs(m.V) < 1e-9 ? 0 : m.V,
        EM: m.E,
        V0: potential(p(), p().x0, p().y0),
        q: TEST_CHARGE / NANO,
        m: TEST_MASS * 1e3,
      });
    }

    function record(s: TestChargeState, t: number) {
      const e = energies(p(), s);
      eGraph.push(t, [e.kinetic * MICRO, e.potential * MICRO, e.total * MICRO]);
      vGraph.push(t, [potential(p(), s.x, s.y)]);
      speedGraph.push(t, [Math.hypot(s.vx, s.vy)]);
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) > 5e-4) {
        trail.push({ x: s.x, y: s.y });
        if (trail.length > TRAIL_MAX) trail = trail.slice(-TRAIL_MAX);
      }
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<TestChargeState>({
      dt: DT,
      init: () => initialState(p()),
      step: (s, _t, dt) => step(p(), s, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        trail = [];
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        const e = energies(p(), s);
        const E = field(p(), s.x, s.y);
        const Em = Math.hypot(E.x, E.y);
        values.update({
          V: potential(p(), s.x, s.y),
          E: Em,
          F: TEST_CHARGE * Em * MICRO,
          v: Math.hypot(s.vx, s.vy),
          K: e.kinetic * MICRO,
          U: e.potential * MICRO,
          total: e.total * MICRO,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.x + s.y + s.vx + s.vy),
      // 電荷に衝突したか領域の外へ出たら止める
      isFinished: (s) => s.status !== 'moving',
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
        toggle('電気力線', 'showFieldLines'),
        toggle('等電位線', 'showEquipotentials'),
        toggle('試験電荷の軌跡', 'showTrail'),
        toggle('速度 v と静電気力 F', 'showVectors'),
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
