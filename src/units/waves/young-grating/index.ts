/**
 * 単元: ヤングの実験と回折格子
 * 光学の単元なので時間グラフは置かず、模式図の光の波だけを時間発展させる。
 */
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createChoice, createParamPanel, createToggle, presetChoice } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createValuePanel } from '@/ui/valuePanel';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  GRATING_PARAMS,
  YOUNG_PARAMS,
  brightFringePosition,
  diffractionAngle,
  fringeSpacing,
  gratingConfig,
  initialState,
  maxOrder,
  mediumWavelength,
  step,
  youngBrightPosition,
  youngConfig,
  youngDarkPosition,
  type SlitConfig,
  type SlitMode,
  type SlitState,
  PRESET_CHOICES,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 実時間 1 秒あたりに進む光の周期の数 */
const TIME_SCALE = 0.6;
const DEG = 180 / Math.PI;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showWaves: true, showCurve: true };

    // --- パラメータ（モードごとに別のパネル。変更したら t = 0 からやり直す） ---
    const onChange = () => {
      applyParams();
      runner.reset();
    };
    const modeChoice = createChoice<SlitMode>(
      '装置',
      [
        { value: 'double', label: 'ダブルスリット' },
        { value: 'grating', label: '回折格子' },
      ],
      presetChoice(preset?.choices, 'mode', PRESET_CHOICES.mode, 'double'),
      onChange,
    );
    const youngParams = createParamPanel(
      YOUNG_PARAMS,
      onChange,
      modeChoice.value === 'double' ? preset?.params : undefined,
    );
    const gratingParams = createParamPanel(
      GRATING_PARAMS,
      onChange,
      modeChoice.value === 'grating' ? preset?.params : undefined,
    );
    const mode = (): SlitMode => modeChoice.value;
    const config = (): SlitConfig =>
      mode() === 'double' ? youngConfig(youngParams.values) : gratingConfig(gratingParams.values);
    const lambdaNm = () =>
      mode() === 'double' ? youngParams.values.lambda : gratingParams.values.lambda;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 4 / 3,
        ariaLabel:
          '左はスリットから広がる光の波の模式図、右はスクリーン上にできる明暗の縞と光の強さのグラフ（実寸の目盛り付き）',
        draw: (ctx, size, pal) =>
          drawScene(ctx, size, pal, mode(), config(), lambdaNm(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- 値（すべてパラメータだけで決まる） ---
    const youngValues = createValuePanel([
      { key: 'lm', label: '媒質中の波長', symbol: 'λ′', unit: 'nm', digits: 0 },
      { key: 'dx', label: '明線の間隔', symbol: 'Δx', unit: 'mm', digits: 3 },
      { key: 'x1', label: '1 次の明線の位置', symbol: 'x_1', unit: 'mm', digits: 3 },
      { key: 'x2', label: '2 次の明線の位置', symbol: 'x_2', unit: 'mm', digits: 3 },
      { key: 'xd', label: '中央に最も近い暗線', symbol: 'x', unit: 'mm', digits: 3 },
      { key: 'th1', label: '1 次の明線の角度', symbol: 'θ_1', unit: '°', digits: 4 },
    ]);
    const gratingValues = createValuePanel([
      { key: 'd', label: '格子定数', symbol: 'd', unit: 'μm', digits: 3 },
      { key: 'th1', label: '1 次の回折角', symbol: 'θ_1', unit: '°', digits: 1 },
      { key: 'th2', label: '2 次の回折角', symbol: 'θ_2', unit: '°', digits: 1 },
      { key: 'x1', label: '1 次の明線の位置', symbol: 'x_1', unit: 'm', digits: 3 },
      { key: 'x2', label: '2 次の明線の位置', symbol: 'x_2', unit: 'm', digits: 3 },
      { key: 'mmax', label: '現れる最大の次数', symbol: 'm', digits: 0 },
      { key: 'count', label: '明線の数（0 次を含む）', digits: 0 },
    ]);
    const time = createTimeReadout(2, { unit: 'T', note: '光の振動をゆっくり表示' });

    function applyParams() {
      const c = config();
      const double = mode() === 'double';
      youngParams.element.hidden = !double;
      gratingParams.element.hidden = double;
      youngValues.element.hidden = !double;
      gratingValues.element.hidden = double;
      if (double) {
        youngValues.update({
          lm: mediumWavelength(c) * 1e9,
          dx: fringeSpacing(c) * 1e3,
          x1: youngBrightPosition(c, 1) * 1e3,
          x2: youngBrightPosition(c, 2) * 1e3,
          xd: youngDarkPosition(c, 0) * 1e3,
          th1: diffractionAngle(c, 1) * DEG,
        });
      } else {
        const m = maxOrder(c);
        const orNone = (v: number) => (Number.isFinite(v) ? v : 'なし');
        gratingValues.update({
          d: c.d * 1e6,
          th1: orNone(diffractionAngle(c, 1) * DEG),
          th2: orNone(diffractionAngle(c, 2) * DEG),
          x1: orNone(brightFringePosition(c, 1)),
          x2: orNone(brightFringePosition(c, 2)),
          mmax: m,
          count: 2 * m + 1,
        });
      }
    }

    // --- 時間発展（模式図の光の波の位相を進める） ---
    const runner = new SimulationRunner<SlitState>({
      dt: DT,
      timeScale: TIME_SCALE,
      init: initialState,
      step: (s, _t, dt) => step(s, dt),
      render: (_s, t) => {
        stage.redraw();
        time.update(t);
      },
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
      playback: createPlaybackControls(runner, disposer, { stepDuration: 0.1 }),
      status: time.element,
      params: h('div', null, modeChoice.element, youngParams.element, gratingParams.element),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('光の波（模式図）', 'showWaves'),
        toggle('光の強さのグラフ', 'showCurve'),
      ),
      values: h('div', { class: 'value-group' }, youngValues.element, gratingValues.element),
      theory: buildTheory(),
    });
  },
};

export default unit;
