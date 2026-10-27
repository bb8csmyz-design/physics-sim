/**
 * 単元: 電場・磁場中の荷電粒子の運動
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
  PARAMS,
  chargeC,
  driftVelocity,
  electricForce,
  energies,
  initialState,
  lorentzForce,
  massKg,
  period,
  radius,
  step,
  type ParticleParams,
  type ParticleState,
} from './model';
import { drawScene, initialCamera, type Camera, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 表示用の単位換算（J → mJ, N → mN） */
const MILLI = 1e3;
const TRAIL_MAX = 4000;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = {
      showVelocity: true,
      showForce: true,
      showTrail: true,
      showOrbit: true,
    };
    let trail: { x: number; y: number }[] = [];
    let camera: Camera = { x: 0, y: 0 };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): ParticleParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 1,
        ariaLabel:
          '紙面に垂直な一様な磁場と上向きの一様な電場の中を、荷電粒子が円運動やドリフトをする様子',
        draw: (ctx, size, pal) =>
          drawScene(ctx, size, pal, p(), runner.state, trail, camera, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const xGraph = createTimeGraph(
      {
        yLabel: '位置 [m]',
        series: [
          { label: 'x', quantity: 'position' },
          { label: 'y', quantity: 'position', dashed: true },
        ],
        ariaLabel: '粒子の x 座標と y 座標の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: '速度 [m/s]',
        series: [
          { label: 'v_x', quantity: 'velocity' },
          { label: 'v_y', quantity: 'velocity', dashed: true },
        ],
        symmetric: true,
        ariaLabel: '速度の x 成分と y 成分の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [mJ]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U = qV', quantity: 'potential' },
          { label: 'K + U', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '運動エネルギー・電場による位置エネルギー・その和の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'v-t', graph: vGraph },
      { label: 'x-t・y-t', graph: xGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'x', label: '位置', symbol: 'x', unit: 'm', digits: 3, quantity: 'position' },
      { key: 'y', label: '位置', symbol: 'y', unit: 'm', digits: 3, quantity: 'position' },
      { key: 'v', label: '速さ', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'f', label: 'ローレンツ力', symbol: 'f', unit: 'mN', digits: 3, quantity: 'force' },
      { key: 'fe', label: '電場からの力', symbol: 'qE', unit: 'mN', digits: 3, quantity: 'force' },
      {
        key: 'K',
        label: '運動エネルギー',
        symbol: 'K',
        unit: 'mJ',
        digits: 3,
        quantity: 'kinetic',
      },
      {
        key: 'U',
        label: '位置エネルギー',
        symbol: 'U',
        unit: 'mJ',
        digits: 3,
        quantity: 'potential',
      },
      {
        key: 'total',
        label: 'エネルギーの和',
        symbol: 'K+U',
        unit: 'mJ',
        digits: 3,
        quantity: 'energy',
      },
    ]);
    const constants = createValuePanel([
      { key: 'r', label: '回転半径', symbol: 'r', unit: 'm' },
      { key: 'T', label: '周期', symbol: 'T', unit: 's' },
      { key: 'vd', label: 'ドリフトの速さ', symbol: 'E/B', unit: 'm/s' },
      { key: 'qm', label: '比電荷', symbol: 'q/m', unit: 'C/kg' },
    ]);
    const time = createTimeReadout();

    function applyParams() {
      const T = period(p());
      const window = Number.isFinite(T) ? Math.min(60, Math.max(10, 2 * T)) : 10;
      for (const g of [xGraph, vGraph, eGraph]) g.setWindow(window);
      constants.update({
        r: radius(p()),
        T,
        vd: driftVelocity(p()),
        qm: chargeC(p()) / massKg(p()),
      });
    }

    function record(s: ParticleState, t: number) {
      const e = energies(p(), s);
      xGraph.push(t, [s.x, s.y]);
      vGraph.push(t, [s.vx, s.vy]);
      eGraph.push(t, [e.kinetic * MILLI, e.potential * MILLI, e.total * MILLI]);
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) > 2e-3) {
        trail.push({ x: s.x, y: s.y });
        if (trail.length > TRAIL_MAX) trail = trail.slice(-TRAIL_MAX);
      }
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<ParticleState>({
      dt: DT,
      init: () => initialState(p()),
      step: (s, _t, dt) => step(p(), s, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        trail = [];
        camera = initialCamera(p());
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        const e = energies(p(), s);
        const f = lorentzForce(p(), s);
        values.update({
          x: s.x,
          y: s.y,
          v: Math.hypot(s.vx, s.vy),
          f: Math.hypot(f.x, f.y) * MILLI,
          fe: Math.abs(electricForce(p())) * MILLI,
          K: e.kinetic * MILLI,
          U: e.potential * MILLI,
          total: e.total * MILLI,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.x + s.y + s.vx + s.vy),
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
        toggle('速度 v', 'showVelocity'),
        toggle('ローレンツ力 f・電場からの力 qE', 'showForce'),
        toggle('軌跡', 'showTrail'),
        toggle('円軌道と回転半径 r（電場が 0 のとき）', 'showOrbit'),
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
