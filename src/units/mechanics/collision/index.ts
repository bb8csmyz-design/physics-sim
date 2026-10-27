/**
 * 単元: 運動量保存と衝突
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
  FLOOR_HALF_WIDTH,
  PARAMS,
  afterCollision,
  centerOfMassVelocity,
  collisionTime,
  energies,
  energyLoss,
  impulseOnA,
  initialState,
  isOutOfFloor,
  momenta,
  step,
  type CollisionParams,
  type CollisionState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer }) {
    const sceneOpt: SceneOptions = { showVelocity: true, showMomentum: false, showCenter: false };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, () => {
      applyParams();
      runner.reset();
    });
    const p = (): CollisionParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 7,
        mobileAspect: 16 / 10,
        ariaLabel: 'なめらかな床の上で 2 つの物体 A と B が正面衝突する様子',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const xGraph = createTimeGraph(
      {
        yLabel: 'x [m]',
        series: [
          { label: 'A', quantity: 'position' },
          { label: 'B', quantity: 'position', dashed: true },
        ],
        ariaLabel: '物体 A と B の位置の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'v [m/s]',
        series: [
          { label: 'A', quantity: 'velocity' },
          { label: 'B', quantity: 'velocity', dashed: true },
          { label: '重心', quantity: 'energy', dotted: true },
        ],
        ariaLabel: '物体 A と B の速度、重心の速度の時間変化',
      },
      disposer,
    );
    const pGraph = createTimeGraph(
      {
        yLabel: 'p [kg·m/s]',
        series: [
          { label: 'A', quantity: 'momentum', dashed: true },
          { label: 'B', quantity: 'momentum', dotted: true },
          { label: '和', quantity: 'momentum' },
        ],
        ariaLabel: '物体 A と B の運動量と、運動量の和の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'A', quantity: 'kinetic', dashed: true },
          { label: 'B', quantity: 'kinetic', dotted: true },
          { label: '和', quantity: 'kinetic' },
          { label: '失われた分', quantity: 'heat' },
        ],
        ariaLabel: '運動エネルギーと、衝突で失われた運動エネルギーの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'x-t', graph: xGraph },
      { label: 'v-t', graph: vGraph },
      { label: '運動量', graph: pGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'vA', label: 'A の速度', symbol: 'v_A', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'vB', label: 'B の速度', symbol: 'v_B', unit: 'm/s', digits: 3, quantity: 'velocity' },
      {
        key: 'pA',
        label: 'A の運動量',
        symbol: 'p_A',
        unit: 'kg·m/s',
        digits: 3,
        quantity: 'momentum',
      },
      {
        key: 'pB',
        label: 'B の運動量',
        symbol: 'p_B',
        unit: 'kg·m/s',
        digits: 3,
        quantity: 'momentum',
      },
      { key: 'P', label: '運動量の和', unit: 'kg·m/s', digits: 3, quantity: 'momentum' },
      {
        key: 'K',
        label: '運動エネルギーの和',
        symbol: 'K',
        unit: 'J',
        digits: 3,
        quantity: 'kinetic',
      },
    ]);
    const constants = createValuePanel([
      { key: 'vA2', label: '衝突後の A の速度', symbol: "v_A'", unit: 'm/s', digits: 3 },
      { key: 'vB2', label: '衝突後の B の速度', symbol: "v_B'", unit: 'm/s', digits: 3 },
      { key: 'dK', label: '失われる運動エネルギー', symbol: 'ΔK', unit: 'J', digits: 3 },
      { key: 'I', label: 'A が受ける力積', unit: 'N·s', digits: 3 },
      { key: 'vG', label: '重心の速度', symbol: 'v_G', unit: 'm/s', digits: 3 },
      { key: 'tc', label: '衝突する時刻', unit: 's', digits: 3 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      const tc = collisionTime(q);
      const after = afterCollision(q);
      const collides = Number.isFinite(tc);
      xGraph.setYRange([-FLOOR_HALF_WIDTH, FLOOR_HALF_WIDTH]);
      const vMax = Math.max(
        Math.abs(q.vA),
        Math.abs(q.vB),
        Math.abs(after.vA),
        Math.abs(after.vB),
        0.5,
      );
      const [, vHi] = niceBounds(-vMax, vMax, 4);
      vGraph.setYRange([-vHi, vHi]);
      const pMax = Math.max(
        Math.abs(q.mA * q.vA),
        Math.abs(q.mB * q.vB),
        Math.abs(q.mA * q.vA + q.mB * q.vB),
        0.5,
      );
      const pAfter = Math.max(Math.abs(q.mA * after.vA), Math.abs(q.mB * after.vB));
      const [, pHi] = niceBounds(-Math.max(pMax, pAfter), Math.max(pMax, pAfter), 4);
      pGraph.setYRange([-pHi, pHi]);
      eGraph.setYRange(niceBounds(0, Math.max(energies(q, initialState(q)).total, 0.1), 4));
      const window = collides ? Math.min(10, Math.max(2, 2.5 * tc)) : 4;
      for (const g of [xGraph, vGraph, pGraph, eGraph]) g.setWindow(window);
      constants.update({
        vA2: collides ? after.vA : '衝突しない',
        vB2: collides ? after.vB : '衝突しない',
        dK: energyLoss(q),
        I: impulseOnA(q),
        vG: centerOfMassVelocity(q),
        tc: collides ? tc : '衝突しない',
      });
    }

    function record(s: CollisionState, t: number) {
      const m = momenta(p(), s);
      const e = energies(p(), s);
      xGraph.push(t, [s.xA, s.xB]);
      vGraph.push(t, [s.vA, s.vB, centerOfMassVelocity(p())]);
      pGraph.push(t, [m.pA, m.pB, m.total]);
      eGraph.push(t, [e.kineticA, e.kineticB, e.total, e.lost]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<CollisionState>({
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
        const m = momenta(p(), s);
        values.update({
          vA: s.vA,
          vB: s.vB,
          pA: m.pA,
          pB: m.pB,
          P: m.total,
          K: energies(p(), s).total,
        });
      },
      endTime: 10,
      isFinished: isOutOfFloor,
      isInvalid: (s) => !Number.isFinite(s.xA) || !Number.isFinite(s.xB),
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
        toggle('速度ベクトル v', 'showVelocity'),
        toggle('運動量ベクトル p', 'showMomentum'),
        toggle('重心 G', 'showCenter'),
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
