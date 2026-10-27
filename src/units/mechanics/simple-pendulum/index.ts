/**
 * 単元: 単振り子
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
  PARAMS,
  bottomSpeed,
  bottomTension,
  endTension,
  energies,
  exactPeriod,
  initialState,
  position,
  restoringForce,
  smallAnglePeriod,
  smallAngleTheta,
  step,
  tangentialVelocity,
  tension,
  type PendulumParams,
  type PendulumState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const DEG = 180 / Math.PI;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = {
      showVelocity: true,
      showForce: true,
      showComponents: false,
      showApprox: false,
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
    const p = (): PendulumParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 1,
        ariaLabel: '糸につるしたおもりが左右に振れる単振り子の様子と、おもりにはたらく力',
        draw: (ctx, size, pal) =>
          drawScene(ctx, size, pal, p(), runner.state, runner.time, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const thGraph = createTimeGraph(
      {
        yLabel: 'θ [°]',
        series: [
          { label: '振れ角 θ', quantity: 'position' },
          { label: '単振動の近似', quantity: 'position', dashed: true },
        ],
        ariaLabel: '振れ角と、単振動の近似解の時間変化',
      },
      disposer,
    );
    const vGraph = createTimeGraph(
      {
        yLabel: 'v [m/s]',
        series: [{ label: '速度 v', quantity: 'velocity' }],
        ariaLabel: '円弧に沿った速度の時間変化',
      },
      disposer,
    );
    const tGraph = createTimeGraph(
      {
        yLabel: 'T [N]',
        series: [{ label: '張力 T', quantity: 'force' }],
        ariaLabel: '糸の張力の時間変化',
      },
      disposer,
    );
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U', quantity: 'potential' },
          { label: 'E', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '運動エネルギー・位置エネルギー・力学的エネルギーの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'θ-t', graph: thGraph },
      { label: 'v-t', graph: vGraph },
      { label: '張力', graph: tGraph },
      { label: 'エネルギー', graph: eGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'theta', label: '振れ角', symbol: 'θ', unit: '°', digits: 2, quantity: 'position' },
      {
        key: 'x',
        label: '水平方向の変位',
        symbol: 'x',
        unit: 'm',
        digits: 3,
        quantity: 'position',
      },
      { key: 'v', label: '速度', symbol: 'v', unit: 'm/s', digits: 3, quantity: 'velocity' },
      { key: 'T', label: '張力', symbol: 'T', unit: 'N', digits: 3, quantity: 'force' },
      { key: 'F', label: '復元力 −mg sinθ', unit: 'N', digits: 3, quantity: 'force' },
      { key: 'K', label: '運動エネルギー', symbol: 'K', unit: 'J', digits: 4, quantity: 'kinetic' },
      {
        key: 'U',
        label: '位置エネルギー',
        symbol: 'U',
        unit: 'J',
        digits: 4,
        quantity: 'potential',
      },
      {
        key: 'E',
        label: '力学的エネルギー',
        symbol: 'E',
        unit: 'J',
        digits: 4,
        quantity: 'energy',
      },
    ]);
    const constants = createValuePanel([
      { key: 'T0', label: '周期の公式 2π√(L/g)', unit: 's', digits: 4 },
      { key: 'T', label: '厳密な周期', unit: 's', digits: 4 },
      { key: 'diff', label: '公式とのずれ', unit: '%', digits: 2 },
      { key: 'vb', label: '最下点での速さ', unit: 'm/s', digits: 3 },
      { key: 'Tb', label: '最下点での張力', unit: 'N', digits: 3 },
      { key: 'Te', label: '端での張力', unit: 'N', digits: 3 },
    ]);
    const time = createTimeReadout();

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const q = p();
      const [, thHi] = niceBounds(-Math.max(q.theta0, 1), Math.max(q.theta0, 1), 4);
      thGraph.setYRange([-thHi, thHi]);
      const vb = Math.max(bottomSpeed(q), 0.01);
      const [, vHi] = niceBounds(-vb, vb, 4);
      vGraph.setYRange([-vHi, vHi]);
      tGraph.setYRange(niceBounds(0, bottomTension(q), 4));
      eGraph.setYRange(niceBounds(0, Math.max(energies(q, initialState(q)).total, 1e-4), 4));
      const window = Math.min(30, Math.max(5, 4 * exactPeriod(q)));
      for (const g of [thGraph, vGraph, tGraph, eGraph]) g.setWindow(window);
      constants.update({
        T0: smallAnglePeriod(q),
        T: exactPeriod(q),
        diff: (exactPeriod(q) / smallAnglePeriod(q) - 1) * 100,
        vb: bottomSpeed(q),
        Tb: bottomTension(q),
        Te: endTension(q),
      });
    }

    function record(s: PendulumState, t: number) {
      const e = energies(p(), s);
      thGraph.push(t, [s.theta * DEG, smallAngleTheta(p(), t) * DEG]);
      vGraph.push(t, [tangentialVelocity(p(), s)]);
      tGraph.push(t, [tension(p(), s)]);
      eGraph.push(t, [e.kinetic, e.potential, e.total]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<PendulumState>({
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
          theta: s.theta * DEG,
          x: position(p(), s).x,
          v: tangentialVelocity(p(), s),
          T: tension(p(), s),
          F: restoringForce(p(), s),
          K: e.kinetic,
          U: e.potential,
          E: e.total,
        });
      },
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
        toggle('速度ベクトル v', 'showVelocity'),
        toggle('力（張力 T・重力 mg）', 'showForce'),
        toggle('重力の分解（mg sinθ, mg cosθ）', 'showComponents'),
        toggle('単振動の近似（θ₀ cos ωt、点線のおもり）', 'showApprox'),
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
