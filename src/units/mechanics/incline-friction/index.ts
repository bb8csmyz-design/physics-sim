/**
 * 単元: 斜面上の運動と摩擦
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
import { G_ACCEL } from '@/core/physics/constants';
import type { UnitModule } from '@/units/types';
import {
  DT,
  FOOT_DISTANCE,
  PARAMS,
  acceleration,
  accelerationDown,
  accelerationUp,
  energies,
  frictionAngle,
  frictionForce,
  initialState,
  maxStaticFriction,
  normalForce,
  returnSpeed,
  slidesFromRest,
  step,
  stopDistance,
  stopTime,
  type InclineParams,
  type InclineState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer }) {
    const sceneOpt: SceneOptions = { showVelocity: true, showForce: true, showComponents: false };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(PARAMS, (v, key) => {
      // 動摩擦係数は静止摩擦係数を超えない（μ′ ≤ μ）ようにスライダーをそろえる
      if (key === 'mu' && v.muk > v.mu) params.set('muk', v.mu);
      else if (key === 'muk' && v.muk > v.mu) params.set('mu', v.muk);
      applyParams();
      runner.reset();
    });
    const p = (): InclineParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 3,
        ariaLabel:
          '粗い斜面を物体が滑り上がり、止まった後に滑り降りるか静止する様子と、物体にはたらく力',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const sGraph = createTimeGraph(
      {
        yLabel: 's [m]',
        series: [{ label: '位置 s', quantity: 'position' }],
        ariaLabel: '斜面に沿った位置の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'v [m/s]',
        series: [{ label: '速度 v', quantity: 'velocity' }],
        ariaLabel: '斜面に沿った速度の時間変化',
      },
      disposer,
    );
    const fGraph = createTimeGraph(
      {
        yLabel: 'f [N]',
        series: [{ label: '摩擦力 f', quantity: 'force' }],
        ariaLabel: '摩擦力（斜面に沿って上向き正）の時間変化',
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
      { label: 's-t', graph: sGraph },
      { label: 'v-t', graph: vGraph },
      { label: '摩擦力', graph: fGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 's', label: '位置', symbol: 's', unit: 'm', digits: 3, quantity: 'position' },
      { key: 'v', label: '速度', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'a', label: '加速度', symbol: 'a', unit: 'm/s²', digits: 2, quantity: 'acceleration' },
      { key: 'f', label: '摩擦力', symbol: 'f', unit: 'N', digits: 2, quantity: 'force' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', quantity: 'kinetic' },
      { key: 'U', label: '位置エネルギー', symbol: 'U', unit: 'J', quantity: 'potential' },
      { key: 'Q', label: '摩擦による発熱', symbol: 'Q', unit: 'J', quantity: 'heat' },
    ]);
    const constants = createValuePanel([
      { key: 'N', label: '垂直抗力', symbol: 'N', unit: 'N', digits: 2 },
      { key: 'fmax', label: '最大静止摩擦力', symbol: 'μN', unit: 'N', digits: 2 },
      { key: 'a1', label: '上昇中の加速度の大きさ', symbol: 'a_1', unit: 'm/s²', digits: 2 },
      { key: 'L', label: '最高到達距離', symbol: 'L', unit: 'm', digits: 3 },
      { key: 't1', label: '最高点に達する時刻', symbol: 't_1', unit: 's', digits: 3 },
      { key: 'judge', label: '最高点で止まった後' },
      { key: 'a2', label: '下降中の加速度の大きさ', symbol: 'a_2', unit: 'm/s²', digits: 2 },
      { key: 'vBack', label: '出発点に戻る速さ', unit: 'm/s', digits: 3 },
      { key: 'theta0', label: '摩擦角（滑り出す角）', symbol: 'θ_0', unit: '°', digits: 1 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      const L = stopDistance(q);
      const slides = slidesFromRest(q);
      const reach = Number.isFinite(L) ? L : 12;
      sGraph.setYRange(niceBounds(-FOOT_DISTANCE, Math.max(reach, 0.5), 4));
      const [, vHi] = niceBounds(-Math.max(q.v0, 1), Math.max(q.v0, 1), 4);
      vGraph.setYRange([-vHi, vHi]);
      const fMax = Math.max(
        maxStaticFriction(q),
        q.m * G_ACCEL * Math.sin((q.theta * Math.PI) / 180),
        0.1,
      );
      const [, fHi] = niceBounds(-fMax, fMax, 4);
      fGraph.setYRange([-fHi, fHi]);
      eGraph.setYRange(niceBounds(0, Math.max(energies(q, initialState(q)).total, 1e-3), 4));
      const t1 = stopTime(q);
      const window = Math.min(20, Math.max(3, 3 * (Number.isFinite(t1) ? t1 : 2)));
      for (const g of [sGraph, vGraph, fGraph, eGraph]) g.setWindow(window);
      constants.update({
        N: normalForce(q),
        fmax: maxStaticFriction(q),
        a1: -accelerationUp(q),
        L: Number.isFinite(L) ? L : '止まらない',
        t1: Number.isFinite(t1) ? t1 : '止まらない',
        judge: slides ? '滑り降りる（tan θ > μ）' : '静止する（tan θ ≤ μ）',
        a2: slides ? -accelerationDown(q) : '—',
        vBack: slides && Number.isFinite(L) ? returnSpeed(q) : '—',
        theta0: frictionAngle(q),
      });
    }

    function record(s: InclineState, t: number) {
      const e = energies(p(), s);
      sGraph.push(t, [s.s]);
      vGraph.push(t, [s.v]);
      fGraph.push(t, [frictionForce(p(), s)]);
      eGraph.push(t, [e.kinetic, e.potential, e.heat, e.total]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<InclineState>({
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
        const e = energies(p(), s);
        values.update({
          s: s.s,
          v: s.v,
          a: acceleration(p(), s),
          f: frictionForce(p(), s),
          K: e.kinetic,
          U: e.potential,
          Q: e.heat,
        });
      },
      endTime: 30,
      isFinished: (s) => s.exited,
      isInvalid: (s) => !Number.isFinite(s.s) || !Number.isFinite(s.v),
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
        toggle('力（重力 mg・垂直抗力 N・摩擦力 f）', 'showForce'),
        toggle('重力の分解（mg sinθ, mg cosθ）', 'showComponents'),
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
