/**
 * 単元: ボーアの水素原子模型
 */
import { niceBounds } from '@/core/ticks';
import { lightBand } from '@/core/spectrum';
import { ELECTRON_VOLT } from '@/core/physics/constants';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createParamPanel } from '@/ui/params';
import { createPlaybackControls } from '@/ui/playback';
import { createGraphTabs } from '@/ui/timeGraph';
import { createValuePanel } from '@/ui/valuePanel';
import { createXYGraph, sampleCurve } from '@/ui/xyGraph';
import { h } from '@/core/dom';
import type { UnitModule } from '@/units/types';
import {
  DT,
  N_MAX,
  PARAMS,
  RYDBERG,
  electronAt,
  energyLevelEV,
  initialState,
  ionizationEnergyEV,
  kineticEnergy,
  lineWavelengthNm,
  orbitRadius,
  orbitSpeed,
  orbitalPeriod,
  potentialEnergy,
  seriesName,
  step,
  transition,
  type BohrParams,
  type BohrState,
} from './model';
import { drawScene } from './scene';
import { buildTheory } from './theory';

const NM = 1e9; // m → nm
const LEVELS = Array.from({ length: N_MAX }, (_, i) => i + 1);

const unit: UnitModule = {
  mount(root, { disposer, preset }) {
    // --- パラメータ（変更したら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        applyParams();
        runner.reset();
      },
      preset?.params,
    );
    const p = (): BohrParams => params.values;

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 0.85,
        ariaLabel:
          '原子核のまわりの電子の円軌道、エネルギー準位図と準位の間の遷移、水素原子のスペクトル線',
        draw: (ctx, size, pal) => drawScene(ctx, size, pal, p(), runner.state),
      },
      disposer,
    );

    // --- グラフ ---
    const eGraph = createXYGraph(
      {
        xLabel: 'n',
        yLabel: 'E [eV]',
        series: [
          { label: 'Eₙ', quantity: 'energy', style: 'points' },
          { label: '−13.6Z²/n²', quantity: 'energy', dashed: true },
        ],
        xRange: [0, N_MAX + 0.5],
        yRange: [-14, 0],
        ariaLabel: '量子数とエネルギー準位の関係',
      },
      disposer,
    );
    const rydbergGraph = createXYGraph(
      {
        xLabel: '1/n²',
        yLabel: '1/λ [μm⁻¹]',
        series: [
          { label: '線スペクトル', quantity: 'energy', style: 'points' },
          { label: '1/λ = RZ²(1/n′² − 1/n²)', quantity: 'energy', dashed: true },
        ],
        xRange: [0, 0.3],
        yRange: [0, 12],
        ariaLabel: '同じ系列のスペクトル線について、波長の逆数と 1/n² の関係',
      },
      disposer,
    );
    const rGraph = createXYGraph(
      {
        xLabel: 'n',
        yLabel: 'r [nm]',
        series: [
          { label: 'rₙ', quantity: 'position', style: 'points' },
          { label: 'r ∝ n²', quantity: 'position', dashed: true },
        ],
        xRange: [0, N_MAX + 0.5],
        yRange: [0, 3],
        ariaLabel: '量子数と軌道半径の関係',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'エネルギー準位', graph: eGraph },
      { label: '1/λ-1/n²', graph: rydbergGraph },
      { label: '軌道半径', graph: rGraph },
    ]);

    // --- 現在値 ---
    const values = createValuePanel([
      { key: 'n', label: '電子の準位（量子数）', symbol: 'n', digits: 0 },
      { key: 'r', label: '軌道半径', symbol: 'r', unit: 'nm', quantity: 'position' },
      { key: 'v', label: '速さ', symbol: 'v', unit: 'm/s', quantity: 'velocity' },
      {
        key: 'K',
        label: '運動エネルギー',
        symbol: 'K',
        unit: 'eV',
        digits: 2,
        quantity: 'kinetic',
      },
      {
        key: 'U',
        label: '位置エネルギー',
        symbol: 'U',
        unit: 'eV',
        digits: 2,
        quantity: 'potential',
      },
      { key: 'E', label: 'エネルギー', symbol: 'E', unit: 'eV', digits: 2, quantity: 'energy' },
    ]);
    const constants = createValuePanel([
      { key: 'En', label: '初めの準位のエネルギー', symbol: 'E_n', unit: 'eV', digits: 2 },
      { key: 'Enf', label: '移った後のエネルギー', symbol: "E_n'", unit: 'eV', digits: 2 },
      { key: 'hv', label: '光子のエネルギー', symbol: 'hν', unit: 'eV', digits: 2 },
      { key: 'nu', label: '光の振動数', symbol: 'ν', unit: 'Hz' },
      { key: 'lambda', label: '光の波長', symbol: 'λ', unit: 'nm', digits: 1 },
      { key: 'Ei', label: 'イオン化エネルギー', unit: 'eV', digits: 1 },
      { key: 'T', label: '初めの軌道の周期（実際）', symbol: 'T', unit: 's' },
    ]);
    const status = h('div', { class: 'time-readout' });

    /** パラメータに合わせてグラフと定数表示を更新する */
    function applyParams() {
      const q = p();
      const tr = transition(q);
      const E1 = energyLevelEV(q.Z, 1);

      eGraph.setYRange(niceBounds(E1 * 1.05, 0, 4));
      eGraph.setData(
        0,
        LEVELS.map((n) => ({ x: n, y: energyLevelEV(q.Z, n) })),
      );
      eGraph.setData(
        1,
        sampleCurve((x) => E1 / (x * x), 0.95, N_MAX + 0.5),
      );
      eGraph.setMarkers([
        { x: q.n, y: energyLevelEV(q.Z, q.n), series: 0, label: 'n' },
        ...(q.nf !== q.n ? [{ x: q.nf, y: energyLevelEV(q.Z, q.nf), series: 0, label: "n'" }] : []),
      ]);

      // 1/λ-1/n²: 下の準位 L の系列。1/λ を μm⁻¹ で
      const L = tr.lower;
      const coef = (RYDBERG * q.Z * q.Z) / 1e6;
      const xMax = 1 / (L + 1) ** 2;
      rydbergGraph.setXRange([0, Math.max(0.05, xMax * 1.15)]);
      rydbergGraph.setYRange(niceBounds(0, (coef / (L * L)) * 1.05, 4));
      const upper = LEVELS.filter((n) => n > L);
      rydbergGraph.setData(
        0,
        upper.map((n) => ({ x: 1 / (n * n), y: 1e3 / lineWavelengthNm(q.Z, n, L) })),
      );
      rydbergGraph.setData(1, [
        { x: 0, y: coef / (L * L) },
        { x: xMax * 1.15, y: coef * (1 / (L * L) - xMax * 1.15) },
      ]);
      rydbergGraph.setGuides([
        { axis: 'y', value: coef / (L * L), label: `系列の極限（n′ = ${L}）` },
      ]);
      rydbergGraph.setMarkers(
        tr.kind === 'なし'
          ? []
          : [{ x: 1 / tr.upper ** 2, y: 1e3 / tr.wavelengthNm, series: 0, label: '選んだ遷移' }],
      );

      const rMax = orbitRadius(q.Z, N_MAX) * NM;
      rGraph.setYRange(niceBounds(0, rMax * 1.05, 4));
      rGraph.setData(
        0,
        LEVELS.map((n) => ({ x: n, y: orbitRadius(q.Z, n) * NM })),
      );
      rGraph.setData(
        1,
        sampleCurve((x) => orbitRadius(q.Z, 1) * NM * x * x, 0, N_MAX + 0.5),
      );
      rGraph.setMarkers([
        { x: q.n, y: orbitRadius(q.Z, q.n) * NM, series: 0, label: 'n' },
        ...(q.nf !== q.n
          ? [{ x: q.nf, y: orbitRadius(q.Z, q.nf) * NM, series: 0, label: "n'" }]
          : []),
      ]);

      constants.update({
        En: energyLevelEV(q.Z, q.n),
        Enf: energyLevelEV(q.Z, q.nf),
        hv: tr.energyEV,
        nu: tr.frequency,
        lambda: tr.wavelengthNm,
        Ei: ionizationEnergyEV(q.Z),
        T: orbitalPeriod(q.Z, q.n),
      });

      const series = q.Z === 1 ? `${seriesName(L)}・` : '';
      status.textContent =
        tr.kind === 'なし'
          ? '準位は変わらない（光子の出入りなし）'
          : `光子を${tr.kind}（${series}${lightBand(tr.wavelengthNm)}）`;
    }

    // --- 時間発展（模式的な時間） ---
    const runner = new SimulationRunner<BohrState>({
      dt: DT,
      init: initialState,
      step: (s, _t, dt) => step(p(), s, dt),
      render: (s) => {
        stage.redraw();
        graphs.redraw();
        const q = p();
        const n = electronAt(q, s.t).n;
        values.update({
          n,
          r: orbitRadius(q.Z, n) * NM,
          v: orbitSpeed(q.Z, n),
          K: kineticEnergy(q.Z, n) / ELECTRON_VOLT,
          U: potentialEnergy(q.Z, n) / ELECTRON_VOLT,
          E: energyLevelEV(q.Z, n),
        });
      },
      isInvalid: (s) => !Number.isFinite(s.t),
    });
    disposer.add(() => runner.destroy());
    applyParams();

    mountSimulationLayout(root, {
      stage: stage.element,
      playback: createPlaybackControls(runner, disposer, { stepDuration: 0.1 }),
      status,
      params: params.element,
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
