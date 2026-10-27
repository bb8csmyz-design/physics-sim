/**
 * 単元: 2 つの波源による干渉
 */
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { createFieldRenderer } from '@/ui/fieldImage';
import { mountSimulationLayout } from '@/ui/layout';
import { createChoice, createParamPanel, createToggle, presetChoice } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  FREQUENCY,
  PARAMS,
  displacements,
  distances,
  initialState,
  interferenceKind,
  lineCount,
  pathDifference,
  resultantAmplitude,
  step,
  waveSpeed,
  type InterferenceParams,
  type InterferenceState,
  type SourcePhase,
  PRESET_CHOICES,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 実時間 1 秒あたりに進むシミュレーション時間（5 Hz の波を 1 秒に 1 回の振動に見せる） */
const TIME_SCALE = 1 / 5;

const KIND_LABEL = {
  constructive: '強め合う',
  destructive: '弱め合う',
  partial: '中間',
} as const;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = {
      showConstructive: true,
      showDestructive: false,
      showPathToP: true,
    };
    const field = createFieldRenderer();

    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const phaseChoice = createChoice<SourcePhase>(
      '波源の位相',
      [
        { value: 'same', label: '同位相' },
        { value: 'opposite', label: '逆位相' },
      ],
      presetChoice(preset?.choices, 'phase', PRESET_CHOICES.phase, 'same'),
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
    const p = (): InterferenceParams => params.values;
    const phase = (): SourcePhase => phaseChoice.value;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 16 / 10,
        ariaLabel:
          '2 つの波源から広がる水面波の重なり。濃い部分が山。強め合う線（実線）と弱め合う線（破線）、点 P を表示',
        draw: (ctx, size, pal) =>
          drawScene(ctx, size, pal, field, p(), phase(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- グラフ ---
    const pGraph = createTimeGraph(
      {
        yLabel: '点 P の変位（A を 1 とする）',
        series: [
          { label: '合成波', quantity: 'position' },
          { label: 'S₁ からの波', tone: 'fg', dashed: true },
          { label: 'S₂ からの波', tone: 'muted', dashed: true },
        ],
        yRange: [-2.2, 2.2],
        window: 1,
        ariaLabel: '点 P での、2 つの波源からの波とその合成波の変位の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([{ label: '点 P の変位', graph: pGraph }]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'y', label: '点 P の変位（合成波）', symbol: 'y', digits: 2, quantity: 'position' },
    ]);
    const constants = createValuePanel([
      { key: 'r1', label: '距離 S₁P', symbol: 'r_1', unit: 'm', digits: 4 },
      { key: 'r2', label: '距離 S₂P', symbol: 'r_2', unit: 'm', digits: 4 },
      { key: 'dl', label: '経路差 |S₁P − S₂P|', symbol: 'Δ', unit: 'm', digits: 4 },
      { key: 'ratio', label: '経路差 / 波長', symbol: 'Δ/λ', digits: 2 },
      { key: 'amp', label: '点 P の振幅（A を 1）', digits: 2 },
      { key: 'kind', label: '点 P では' },
      { key: 'nc', label: '強め合う線の本数（S₁S₂ 間）', digits: 0 },
      { key: 'nd', label: '弱め合う線の本数（S₁S₂ 間）', digits: 0 },
      { key: 'v', label: '波の速さ', symbol: 'v', unit: 'm/s', digits: 3 },
      { key: 'f', label: '振動数', symbol: 'f', unit: 'Hz', digits: 0 },
    ]);
    const time = createTimeReadout(2, { note: '1/5 倍のスロー再生' });

    function applyParams() {
      const P = p();
      const [r1, r2] = distances(P, P.xP, P.yP);
      const dl = pathDifference(P, P.xP, P.yP);
      constants.update({
        r1,
        r2,
        dl,
        ratio: dl / P.lambda,
        amp: resultantAmplitude(P, phase(), P.xP, P.yP),
        kind: KIND_LABEL[interferenceKind(P, phase(), P.xP, P.yP)],
        nc: lineCount(P, phase(), 'constructive'),
        nd: lineCount(P, phase(), 'destructive'),
        v: waveSpeed(P),
        f: FREQUENCY,
      });
    }

    function record(s: InterferenceState, t: number) {
      const d = displacements(p(), phase(), p().xP, p().yP, s.t);
      pGraph.push(t, [d.total, d.y1, d.y2]);
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<InterferenceState>({
      dt: DT,
      timeScale: TIME_SCALE,
      init: initialState,
      step: (s, _t, dt) => step(s, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphs.redraw();
        time.update(t);
        values.update({ y: displacements(p(), phase(), p().xP, p().yP, s.t).total });
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
      playback: createPlaybackControls(runner, disposer, { stepDuration: 0.01 }),
      status: time.element,
      params: h('div', null, phaseChoice.element, params.element),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('強め合う線（腹線）', 'showConstructive'),
        toggle('弱め合う線（節線）', 'showDestructive'),
        toggle('S₁P, S₂P を結ぶ線', 'showPathToP'),
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
