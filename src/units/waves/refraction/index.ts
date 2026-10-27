/**
 * 単元: 光の屈折と全反射
 * 静的な光学の単元なので時間グラフは置かず、光の波（電場）の動きだけを時間発展させる。
 */
import { formatSig } from '@/core/format';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { createFieldRenderer } from '@/ui/fieldImage';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createValuePanel } from '@/ui/valuePanel';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PARAMS,
  criticalAngle,
  initialState,
  isTotalReflection,
  lightFrequency,
  reflectance,
  refractionAngle,
  relativeIndex,
  speedIn,
  step,
  transmittance,
  wavelengthIn,
  type RefractionParams,
  type RefractionState,
} from './model';
import { drawScene, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 実時間 1 秒あたりに進む光の周期の数 */
const TIME_SCALE = 0.6;
const DEG = 180 / Math.PI;

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    const sceneOpt: SceneOptions = { showField: true, showRays: true };
    const field = createFieldRenderer();

    // --- パラメータ ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): RefractionParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 10,
        mobileAspect: 4 / 3,
        ariaLabel:
          '上の媒質 1 から下の媒質 2 へ進む光。電場の濃淡で波面を、矢印で入射光・反射光・屈折光を表示',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, field, p(), runner.state, sceneOpt),
      },
      disposer,
    );

    // --- 値（すべてパラメータだけで決まる） ---
    const values = createValuePanel([
      { key: 'th2', label: '屈折角', symbol: 'θ_2', unit: '°', digits: 1 },
      { key: 'n12', label: '相対屈折率', symbol: 'n_12', digits: 3 },
      { key: 'thc', label: '臨界角', symbol: 'θ_c', unit: '°', digits: 1 },
      { key: 'v1', label: '媒質 1 での光の速さ', symbol: 'v_1', unit: 'm/s' },
      { key: 'v2', label: '媒質 2 での光の速さ', symbol: 'v_2', unit: 'm/s' },
      { key: 'l1', label: '媒質 1 での波長', symbol: 'λ_1', unit: 'nm', digits: 0 },
      { key: 'l2', label: '媒質 2 での波長', symbol: 'λ_2', unit: 'nm', digits: 0 },
      { key: 'f', label: '光の振動数（共通）', symbol: 'f', unit: 'Hz' },
      { key: 'R', label: '反射率（発展）', symbol: 'R', unit: '%', digits: 1 },
      { key: 'T', label: '透過率（発展）', symbol: 'T', unit: '%', digits: 1 },
    ]);
    const time = createTimeReadout(2, { unit: 'T' });

    function applyParams() {
      const P = p();
      const total = isTotalReflection(P);
      const thc = criticalAngle(P);
      values.update({
        th2: total ? '全反射' : refractionAngle(P) * DEG,
        n12: relativeIndex(P),
        thc: Number.isNaN(thc) ? 'なし（n₁ ≤ n₂）' : thc * DEG,
        v1: speedIn(P, 1),
        v2: speedIn(P, 2),
        l1: wavelengthIn(P, 1) * 1e9,
        l2: wavelengthIn(P, 2) * 1e9,
        f: lightFrequency(P),
        R: reflectance(P) * 100,
        T: transmittance(P) * 100,
      });
      time.setNote(`光の振動（${formatSig(lightFrequency(P), 2)} Hz）をゆっくり表示`);
    }

    // --- 時間発展（光の波の位相を進める） ---
    const runner = new SimulationRunner<RefractionState>({
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
      params: params.element,
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('光の波（電場の濃淡）', 'showField'),
        toggle('光線と角度', 'showRays'),
      ),
      values: values.element,
      theory: buildTheory(),
    });
  },
};

export default unit;
