/**
 * 単元: レンズによる像
 */
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createChoice, createParamPanel, createToggle, presetChoice } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  A_MAX,
  DT,
  PARAMS,
  focalLength,
  hasStopped,
  imageDistance,
  imageHeight,
  imageKind,
  initialState,
  magnification,
  step,
  type LensKind,
  type LensParams,
  type LensState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

const KIND_LABEL = {
  real: '実像・倒立',
  virtual: '虚像・正立',
  none: '像はできない',
} as const;

/** グラフに記録する値（像が無限遠のときは線を切る） */
const finite = (v: number) => (Number.isFinite(v) ? v : NaN);

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showRays: true, showVelocity: true };

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const kindChoice = createChoice<LensKind>(
      'レンズの種類',
      [
        { value: 'convex', label: '凸レンズ' },
        { value: 'concave', label: '凹レンズ' },
      ],
      presetChoice(preset?.choices, 'kind', ['convex', 'concave'], 'convex'),
      () => {
        applyParams();
        runner.reset();
      },
    );
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): LensParams => params.values;
    const kind = (): LensKind => kindChoice.value;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 8,
        mobileAspect: 16 / 10,
        ariaLabel:
          'レンズの左に立てた物体と、物体の先端から出る作図の 3 本の光線、レンズがつくる像（実像は実線、虚像は破線の矢印）',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, kind(), p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const posGraph = createTimeGraph(
      {
        yLabel: '位置 [m]（レンズから）',
        series: [
          { label: '物体 a', tone: 'fg' },
          { label: '像 b', quantity: 'position' },
        ],
        yRange: [-0.8, 1.2],
        window: 12,
        ariaLabel: 'レンズから物体までの距離 a と、像までの距離 b の時間変化',
      },
      disposer,
    );
    const heightGraph = createTimeGraph(
      {
        yLabel: '高さ [m]（上向き正）',
        series: [
          { label: '物体 h', tone: 'fg', dashed: true },
          { label: '像 y′', quantity: 'position' },
        ],
        yRange: [-0.4, 0.4],
        window: 12,
        ariaLabel: '物体の高さと像の高さの時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: '位置', graph: posGraph },
      { label: '高さ', graph: heightGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'a', label: '物体の位置', symbol: 'a', unit: 'm', digits: 3 },
      { key: 'b', label: '像の位置', symbol: 'b', unit: 'm', digits: 3, quantity: 'position' },
      { key: 'm', label: '倍率', symbol: 'm', unit: '倍', digits: 2 },
      { key: 'y', label: '像の高さ（上向き正）', symbol: 'y′', unit: 'm', digits: 3 },
      { key: 'kind', label: '像の種類' },
    ]);
    const constants = createValuePanel([
      { key: 'f', label: '焦点距離', symbol: 'f', unit: 'm', digits: 2 },
    ]);
    const time = createTimeReadout(2);

    function applyParams() {
      constants.update({ f: focalLength(kind(), p()) });
    }

    function record(s: LensState, t: number) {
      const P = p();
      posGraph.push(t, [s.a, finite(imageDistance(kind(), s.a, P))]);
      heightGraph.push(t, [P.h, finite(imageHeight(kind(), s.a, P))]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<LensState>({
      dt: DT,
      init: () => initialState(p()),
      step: (s, _t, dt) => step(p(), s, dt),
      onStep: (s, t) => {
        record(s, t);
        if (hasStopped(p(), s)) runner.pause();
      },
      onReset: (s) => {
        graphs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        const K = kind();
        const b = imageDistance(K, s.a, p());
        values.update({
          a: s.a,
          b: Number.isFinite(b) ? b : '無限遠',
          m: Number.isFinite(b) ? magnification(K, s.a, p()) : '—',
          y: Number.isFinite(b) ? imageHeight(K, s.a, p()) : '—',
          kind: KIND_LABEL[imageKind(K, s.a, p())],
        });
      },
      isInvalid: (s) => !Number.isFinite(s.a) || s.a > A_MAX,
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
      params: h('div', null, kindChoice.element, params.element),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('作図の 3 本の光線', 'showRays'),
        toggle('物体の速度ベクトル v', 'showVelocity'),
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
