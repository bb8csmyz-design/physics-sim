/**
 * 単元: 剛体のつりあい（壁に立てかけたはしご）
 */
import { niceBounds } from '@/core/ticks';
import { SimulationRunner } from '@/core/sim/runner';
import { G_ACCEL } from '@/core/physics/constants';
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
  PARAMS,
  criticalAngle,
  energies,
  forces,
  inEquilibrium,
  initialState,
  maxClimbDistance,
  staticForces,
  step,
  totalMass,
  type LadderParams,
  type LadderState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const DEG = 180 / Math.PI;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showForce: true, showArms: false };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): LadderParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 10,
        mobileAspect: 1,
        ariaLabel: 'なめらかな壁に立てかけたはしごと、はしごに乗った人。はしごにはたらく力の矢印',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const thGraph = createTimeGraph(
      {
        yLabel: 'θ [°]',
        series: [{ label: '床となす角 θ', quantity: 'position' }],
        ariaLabel: 'はしごと床のなす角の時間変化',
      },
      disposer,
    );
    const fGraph = createTimeGraph(
      {
        yLabel: '力 [N]',
        series: [
          { label: 'N₁', quantity: 'force' },
          { label: 'N₂', quantity: 'force', dashed: true },
          { label: 'f', quantity: 'force', dotted: true },
        ],
        ariaLabel: '床の垂直抗力・壁の垂直抗力・摩擦力の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U', quantity: 'potential' },
          { label: 'Q', quantity: 'heat' },
          { label: 'E', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '運動エネルギー・位置エネルギー・摩擦熱・力学的エネルギーの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'θ-t', graph: thGraph },
      { label: '力', graph: fGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      {
        key: 'theta',
        label: '床となす角',
        symbol: 'θ',
        unit: '°',
        digits: 2,
        quantity: 'position',
      },
      {
        key: 'N1',
        label: '床からの垂直抗力',
        symbol: 'N_1',
        unit: 'N',
        digits: 1,
        quantity: 'force',
      },
      {
        key: 'N2',
        label: '壁からの垂直抗力',
        symbol: 'N_2',
        unit: 'N',
        digits: 1,
        quantity: 'force',
      },
      { key: 'f', label: '床からの摩擦力', symbol: 'f', unit: 'N', digits: 1, quantity: 'force' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', digits: 1, quantity: 'kinetic' },
      { key: 'Q', label: '摩擦による発熱', symbol: 'Q', unit: 'J', digits: 1, quantity: 'heat' },
    ]);
    const constants = createValuePanel([
      { key: 'judge', label: '判定' },
      { key: 'N1', label: 'つりあうときの N₁ = (m+M)g', unit: 'N', digits: 1 },
      { key: 'f', label: '必要な静止摩擦力 f = N₂', unit: 'N', digits: 1 },
      { key: 'fMax', label: '最大静止摩擦力 μN₁', unit: 'N', digits: 1 },
      { key: 'thc', label: '滑り出す限界の角', symbol: 'θ_c', unit: '°', digits: 1 },
      { key: 'dMax', label: '人が上れる限界（下端から）', unit: 'm', digits: 2 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      const st = staticForces(q);
      const ok = inEquilibrium(q);
      thGraph.setYRange([0, 90]);
      fGraph.setYRange(niceBounds(0, Math.max(st.N1, st.N2) * 1.1, 4));
      eGraph.setYRange(niceBounds(0, Math.max(energies(q, initialState(q)).total, 1), 4));
      for (const g of [thGraph, fGraph, eGraph]) g.setWindow(3);
      const dMax = maxClimbDistance(q);
      constants.update({
        judge: ok ? 'つりあう（滑らない）' : '滑り出す',
        N1: totalMass(q) * G_ACCEL,
        f: st.f,
        fMax: st.fMax,
        thc: criticalAngle(q),
        dMax: q.M === 0 ? '—' : Number.isNaN(dMax) ? '乗れない' : dMax,
      });
    }

    function record(s: LadderState, t: number) {
      const F = forces(p(), s);
      const e = energies(p(), s);
      thGraph.push(t, [s.theta * DEG]);
      fGraph.push(t, [F.N1, F.N2, F.f]);
      eGraph.push(t, [e.kinetic, e.potential, e.heat, e.total]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<LadderState>({
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
        const F = forces(p(), s);
        const e = energies(p(), s);
        values.update({
          theta: s.theta * DEG,
          N1: F.N1,
          N2: F.N2,
          f: F.f,
          K: e.kinetic,
          Q: e.heat,
        });
      },
      endTime: 3,
      isFinished: (s) => s.ended !== null,
      isInvalid: (s) => !Number.isFinite(s.theta) || !Number.isFinite(s.omega),
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
        toggle('力（重力・垂直抗力・摩擦力）', 'showForce'),
        toggle('下端のまわりのモーメントのうで', 'showArms'),
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
