/**
 * 単元: 気体分子運動論
 */
import { h } from '@/core/dom';
import { powerOfTen } from '@/core/format';
import { SimulationRunner } from '@/core/sim/runner';
import { niceBounds } from '@/core/ticks';
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
  TIME_SCALE,
  crossingTime,
  idealGasPressure,
  initialState,
  internalEnergy,
  kineticPressure,
  meanKineticEnergy,
  measuredPressure,
  measuredRightWallForce,
  moleculeMass,
  pressureBetween,
  rightWallForce,
  rmsSpeed,
  step,
  volume,
  type GasState,
  type ImpulseRecord,
  type KineticParams,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showTracked: true, showHistogram: true };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): KineticParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 5,
        ariaLabel:
          '立方体の容器の中を気体分子が飛び回り、壁で弾性衝突する様子と、分子の速さの分布のヒストグラム',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const pGraph = createTimeGraph(
      {
        yLabel: 'p [Pa]',
        series: [
          { label: '直近', quantity: 'pressure' },
          { label: '平均', quantity: 'force' },
          { label: 'NkT/V', quantity: 'energy', dashed: true },
        ],
        ariaLabel: '壁が受けた力積から測った圧力の時間変化と、状態方程式による理論値',
        timeUnit: 'ms',
      },
      disposer,
    );
    const fGraph = createTimeGraph(
      {
        yLabel: 'F [N]',
        series: [
          { label: '平均', quantity: 'force' },
          { label: 'Nm⟨vₓ²⟩/L', quantity: 'energy', dashed: true },
        ],
        ariaLabel: 'x = L の壁が受ける力の時間平均と理論値',
        timeUnit: 'ms',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: '圧力', graph: pGraph },
      { label: '壁が受ける力', graph: fGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      {
        key: 'pAvg',
        label: '測った圧力（t = 0 からの平均）',
        symbol: 'p',
        unit: 'Pa',
        quantity: 'force',
      },
      {
        key: 'pRecent',
        label: '測った圧力（直近の平均）',
        symbol: 'p',
        unit: 'Pa',
        quantity: 'pressure',
      },
      { key: 'ratio', label: '状態方程式との比 pV/(NkT)', digits: 3 },
      { key: 'F', label: 'x = L の壁が受ける力（平均）', symbol: 'F', unit: 'N' },
      { key: 'hits', label: '壁への衝突回数', unit: '回', digits: 0 },
    ]);
    const constants = createValuePanel([
      { key: 'm', label: '分子 1 個の質量', symbol: 'm', unit: 'kg' },
      { key: 'V', label: '体積', symbol: 'V', unit: 'm³', quantity: 'volume' },
      {
        key: 'vrms',
        label: '二乗平均速度 √⟨v²⟩',
        unit: 'm/s',
        quantity: 'velocity',
      },
      {
        key: 'ke',
        label: '平均運動エネルギー ½m⟨v²⟩',
        unit: 'J',
        quantity: 'kinetic',
      },
      { key: 'pKin', label: '圧力 Nm⟨v²⟩/(3V)', unit: 'Pa', quantity: 'pressure' },
      { key: 'pIdeal', label: '圧力 NkT/V', unit: 'Pa', quantity: 'pressure' },
      { key: 'U', label: '内部エネルギー', symbol: 'U', unit: 'J', quantity: 'internal' },
    ]);
    const time = createTimeReadout(3, { unit: 'ms', note: `1/${1 / TIME_SCALE} 倍のスロー再生` });

    /** 直近の圧力を求めるための、最近の状態の記録（時刻の古い順） */
    let recent: ImpulseRecord[] = [];
    /** グラフの縦軸の単位（圧力・力は 10⁻¹⁶ Pa のように小さいので、桁をそろえて表示する） */
    let pUnit = 1;
    let fUnit = 1;

    /** パラメータに合わせてグラフの縦軸・時間幅と定数表示を更新する */
    function applyParams() {
      const pIdeal = idealGasPressure(p());
      const s0 = initialState(p());
      const F = rightWallForce(p(), s0);
      const pExp = Math.floor(Math.log10(pIdeal));
      const fExp = Math.floor(Math.log10(F));
      pUnit = 10 ** pExp;
      fUnit = 10 ** fExp;
      pGraph.setYLabel(`p [×${powerOfTen(pExp)} Pa]`);
      fGraph.setYLabel(`F [×${powerOfTen(fExp)} N]`);
      pGraph.setYRange(niceBounds(0, (2 * pIdeal) / pUnit, 4));
      fGraph.setYRange(niceBounds(0, (2 * F) / fUnit, 4));
      const window = 40 * crossingTime(p());
      pGraph.setWindow(window);
      fGraph.setWindow(window);
      constants.update({
        m: moleculeMass(p()),
        V: volume(p()),
        vrms: rmsSpeed(p()),
        ke: meanKineticEnergy(p()),
        pKin: kineticPressure(p(), s0),
        pIdeal,
        U: internalEnergy(p()),
      });
    }

    /** 直近 L/√⟨v²⟩（分子が容器を横切る時間）の平均の圧力 */
    function recentPressure(s: GasState): number {
      const span = crossingTime(p());
      while (recent.length > 1 && recent[1]!.t <= s.t - span) recent.shift();
      const from = recent[0];
      return from && s.t - from.t >= span * 0.999 ? pressureBetween(p(), from, s) : NaN;
    }

    function record(s: GasState, t: number) {
      recent.push({ t: s.t, impulse: s.impulse });
      pGraph.push(t, [
        recentPressure(s) / pUnit,
        measuredPressure(p(), s) / pUnit,
        idealGasPressure(p()) / pUnit,
      ]);
      fGraph.push(t, [measuredRightWallForce(s) / fUnit, rightWallForce(p(), s) / fUnit]);
    }

    // --- 時間発展 ---
    const runner: SimulationRunner<GasState> = new SimulationRunner<GasState>({
      dt: DT,
      timeScale: TIME_SCALE,
      init: () => initialState(p()),
      step: (s, _t, dt) => step(p(), s, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        recent = [{ t: s.t, impulse: s.impulse }];
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        const pAvg = measuredPressure(p(), s);
        values.update({
          pAvg,
          pRecent: recentPressure(s),
          ratio: pAvg / idealGasPressure(p()),
          F: measuredRightWallForce(s),
          hits: s.hits,
        });
      },
      isInvalid: (s) => !Number.isFinite(s.impulse),
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
      playback: createPlaybackControls(runner, disposer, { stepDuration: DT * 50 }),
      status: time.element,
      params: params.element,
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('注目する分子と速度 v', 'showTracked'),
        toggle('速さの分布（ヒストグラム）', 'showHistogram'),
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
