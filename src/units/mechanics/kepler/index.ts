/**
 * 単元: 万有引力とケプラーの法則
 */
import { niceBounds } from '@/core/ticks';
import { SimulationRunner } from '@/core/sim/runner';
import { EARTH_RADIUS } from '@/core/physics/constants';
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
  GM,
  PARAMS,
  arealVelocity,
  circularSpeed,
  distance,
  energies,
  escapeRadius,
  escapeSpeed,
  gravityForce,
  initialState,
  launchRadius,
  launchSpeed,
  orbit,
  orbitKind,
  speed,
  step,
  type KeplerParams,
  type KeplerState,
  type OrbitKind,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 実時間 1 秒あたりに進むシミュレーション時間 [s] */
const TIME_SCALE = 2000;

const KIND_LABEL: Record<OrbitKind, string> = {
  circle: '円軌道',
  ellipse: '楕円軌道',
  escape: '脱出する',
  crash: '地表に落下する',
};

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = {
      showVelocity: true,
      showForce: true,
      showOrbit: true,
      showArea: false,
    };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): KeplerParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 10,
        mobileAspect: 1,
        ariaLabel: '地球のまわりを人工衛星が回る様子。軌道と、衛星の速度と万有引力の向き',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const rGraph = createTimeGraph(
      {
        yLabel: 'r [km]',
        series: [{ label: '地球の中心からの距離 r', quantity: 'position' }],
        ariaLabel: '地球の中心からの距離の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'v [km/s]',
        series: [{ label: '速さ v', quantity: 'velocity' }],
        ariaLabel: '速さの時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [×10⁹ J]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U', quantity: 'potential' },
          { label: 'E', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '運動エネルギー・万有引力による位置エネルギー・力学的エネルギーの時間変化',
      },
      disposer,
    );
    const aGraph = createTimeGraph(
      {
        yLabel: '面積速度 [×10¹⁰ m²/s]',
        series: [{ label: '面積速度 ½rv sinθ', quantity: 'momentum' }],
        ariaLabel: '面積速度の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'r-t', graph: rGraph },
      { label: 'v-t', graph: vGraph },
      { label: 'エネルギー', graph: eGraph },
      { label: '面積速度', graph: aGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      {
        key: 'r',
        label: '地球の中心からの距離',
        symbol: 'r',
        unit: 'km',
        digits: 0,
        quantity: 'position',
      },
      { key: 'rR', label: '（地球半径の何倍か）', symbol: 'r/R', digits: 3, quantity: 'position' },
      { key: 'v', label: '速さ', symbol: 'v', unit: 'km/s', digits: 3, quantity: 'velocity' },
      { key: 'F', label: '万有引力', symbol: 'F', unit: 'N', quantity: 'force' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', quantity: 'kinetic' },
      { key: 'U', label: '位置エネルギー', symbol: 'U', unit: 'J', quantity: 'potential' },
      { key: 'E', label: '力学的エネルギー', symbol: 'E', unit: 'J', quantity: 'energy' },
      { key: 'A', label: '面積速度', unit: 'm²/s', quantity: 'momentum' },
    ]);
    const constants = createValuePanel([
      { key: 'kind', label: '軌道の種類' },
      { key: 'vc', label: '円軌道の速さ √(GM/r₀)', unit: 'km/s', digits: 2 },
      { key: 've', label: '脱出速度 √(2GM/r₀)', unit: 'km/s', digits: 2 },
      { key: 'e', label: '離心率', symbol: 'e', digits: 3 },
      { key: 'rp', label: '近地点の距離', unit: 'km', digits: 0 },
      { key: 'ra', label: '遠地点の距離', unit: 'km', digits: 0 },
      { key: 'vp', label: '近地点での速さ', unit: 'km/s', digits: 3 },
      { key: 'va', label: '遠地点での速さ', unit: 'km/s', digits: 3 },
      { key: 'a', label: '長半径', symbol: 'a', unit: 'km', digits: 0 },
      { key: 'T', label: '周期', symbol: 'T', unit: 's', digits: 0 },
      { key: 'T2a3', label: 'T²/a³', unit: 's²/m³' },
    ]);
    const time = createTimeReadout(0);

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      const o = orbit(q);
      const kind = orbitKind(q);
      const bound = kind === 'ellipse' || kind === 'circle';
      const rMax = bound ? o.apogee : kind === 'escape' ? escapeRadius(q) : launchRadius(q);
      rGraph.setYRange(niceBounds(0, rMax / 1000, 4));
      const vMax = Math.max(o.h / Math.max(o.perigee, EARTH_RADIUS), launchSpeed(q)) / 1000;
      vGraph.setYRange(niceBounds(0, vMax, 4));
      const uMin = (-GM * q.m) / Math.max(o.perigee, EARTH_RADIUS) / 1e9;
      const kMax = (0.5 * q.m * (vMax * 1000) ** 2) / 1e9;
      eGraph.setYRange(niceBounds(uMin, kMax, 4));
      aGraph.setYRange(niceBounds(0, (o.arealVelocity / 1e10) * 1.2, 4));
      const window = bound ? 1.5 * o.period : 4e4;
      for (const g of [rGraph, vGraph, eGraph, aGraph]) g.setWindow(window);
      constants.update({
        kind: KIND_LABEL[kind],
        vc: circularSpeed(q) / 1000,
        ve: escapeSpeed(q) / 1000,
        e: o.e,
        rp: kind === 'crash' ? '地球の内側' : o.perigee / 1000,
        ra: bound ? o.apogee / 1000 : '—',
        vp: kind === 'crash' ? '—' : o.h / o.perigee / 1000,
        va: bound ? o.h / o.apogee / 1000 : '—',
        a: bound ? o.a / 1000 : '—',
        T: bound ? o.period : '—',
        T2a3: bound ? o.period ** 2 / o.a ** 3 : '—',
      });
    }

    function record(s: KeplerState, t: number) {
      const e = energies(p(), s);
      rGraph.push(t, [distance(s) / 1000]);
      vGraph.push(t, [speed(s) / 1000]);
      eGraph.push(t, [e.kinetic / 1e9, e.potential / 1e9, e.total / 1e9]);
      aGraph.push(t, [arealVelocity(s) / 1e10]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<KeplerState>({
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
          r: distance(s) / 1000,
          rR: distance(s) / EARTH_RADIUS,
          v: speed(s) / 1000,
          F: gravityForce(p(), s),
          K: e.kinetic,
          U: e.potential,
          E: e.total,
          A: arealVelocity(s),
        });
      },
      isFinished: (s) => s.crashed || s.escaped,
      isInvalid: (s) => !Number.isFinite(s.x) || !Number.isFinite(s.y),
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
        speeds: [0.25, 0.5, 1, 2, 4],
        stepDuration: 60,
      }),
      status: time.element,
      params: params.element,
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('速度ベクトル v', 'showVelocity'),
        toggle('万有引力 F', 'showForce'),
        toggle('予想される軌道（破線）', 'showOrbit'),
        toggle('面積速度（等しい時間に掃く面積）', 'showArea'),
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
