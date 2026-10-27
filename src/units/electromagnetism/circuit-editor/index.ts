/**
 * 単元: 回路エディタ
 *
 * 格子の上に部品を置いて回路を組み、スイッチを操作した後の各部品の電流・電圧の時間変化を調べる。
 * 回路（部品・値・向き）を変えたら t = 0 からやり直す。スイッチの開閉は時間を止めずに切り替える
 * （リセットするとスイッチはすべて開いた状態に戻る）。
 */
import { Disposer, h } from '@/core/dom';
import type { Quantity } from '@/core/theme';
import { SimulationRunner } from '@/core/sim/runner';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createChoice, createSlider, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph, type SeriesSpec, type TimeGraph } from '@/ui/timeGraph';
import { createValueTable, type ValueTable } from '@/ui/valuePanel';
import type { UnitModule } from '@/units/types';
import {
  DT,
  PART_INFO,
  PART_KINDS,
  PRESETS,
  acPeak,
  buildSystem,
  flipPart,
  initialState,
  instantValues,
  isSource,
  measuresCurrent,
  measuresVoltage,
  partAt,
  partNames,
  partValue,
  placePart,
  preset,
  removePart,
  setPartPlot,
  setPartValue,
  step,
  type Circuit,
  type CircuitProblem,
  type CircuitSystem,
  type GridPoint,
  type PartKind,
  type SimState,
} from './model';
import { drawScene, hitTestEdge, type SceneOptions } from './scene';
import { buildTheory } from './theory';

/** 操作: 選択（スイッチの開閉）・部品を置く・消す */
type Tool = 'select' | PartKind | 'erase';

const TOOL_LABELS: Record<Tool, string> = {
  select: '選択・スイッチ',
  wire: '導線',
  resistor: '抵抗',
  capacitor: 'コンデンサー',
  coil: 'コイル',
  dc: '直流電源',
  ac: '交流電源',
  switch: 'スイッチ',
  ammeter: '電流計',
  voltmeter: '電圧計',
  erase: '消す',
};

/** 再生の時間尺度（実時間 1 s で進むシミュレーション時間） */
const TIME_SCALES = [
  { value: '10', label: '1/10 倍', scale: 1 / 10 },
  { value: '100', label: '1/100 倍', scale: 1 / 100 },
  { value: '1000', label: '1/1000 倍', scale: 1 / 1000 },
] as const;
type TimeScaleValue = (typeof TIME_SCALES)[number]['value'];

/** グラフの横軸の幅（実時間の秒数。シミュレーション時間ではこれに時間尺度を掛ける） */
const GRAPH_REAL_SECONDS = 8;
/** 電流の流れの点が、それまでの最大の電流のとき実時間 1 s に進む距離 [px] */
const FLOW_PX_PER_SECOND = 40;

/** 部品の種類ごとのグラフの色（抵抗 = 熱、コンデンサー = 電場、コイル = 磁場、電源・電圧計 = 電位） */
const PART_QUANTITY: Record<PartKind, Quantity> = {
  wire: 'energy',
  resistor: 'heat',
  capacitor: 'electric',
  coil: 'magnetic',
  dc: 'potential',
  ac: 'potential',
  switch: 'energy',
  ammeter: 'current',
  voltmeter: 'potential',
};

/** これより小さい電流 [A]・電圧 [V] は丸め誤差とみなして 0 と表示する（部品の値の範囲で意味のある値は mA・mV 以上） */
const DISPLAY_ZERO = 1e-9;
function cleanZero(v: number): number {
  return Math.abs(v) < DISPLAY_ZERO ? 0 : v;
}

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
/** 'R_1' → 'R₁'（ボタン・表の見出し用） */
function nameText(name: string): string {
  const [base = '', sub = ''] = name.split('_');
  return base + [...sub].map((c) => SUBSCRIPTS[Number(c)] ?? c).join('');
}

const unit: UnitModule = {
  mount(root, { disposer }) {
    const first = preset('rc');
    let circuit: Circuit = first.circuit;
    let names = partNames(circuit);
    let closed: boolean[] = circuit.parts.map(() => false);
    let sys: CircuitSystem | CircuitProblem = buildSystem(circuit, closed);
    let selectedId: number | null = null;
    let tool: Tool = 'select';
    let hover: [GridPoint, GridPoint] | null = null;
    let timeScale: number = first.timeScale;
    /** スイッチを切り替えた直後の値（次のステップまで表示する） */
    let override: { I: number[]; V: number[] } | null = null;
    /** これまでの最大の電流 [A]（電流の流れの表示の基準） */
    let iRef = 0;
    const sceneOpt: SceneOptions = { showFlow: true, showLabels: true };

    const graphWindow = () => GRAPH_REAL_SECONDS * timeScale;
    /** 表示する電流・電圧（切り替え直後の値があればそれ。丸め誤差の大きさの値は 0 にする） */
    const shown = (s: SimState) => {
      const v = override ?? s;
      return { I: v.I.map(cleanZero), V: v.V.map(cleanZero) };
    };

    // --- 描画 ---
    const stage = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        mobileAspect: 1.3,
        ariaLabel:
          '回路図の編集画面。格子の点と点の間に、抵抗・コンデンサー・コイル・電源・スイッチ・電流計・電圧計を置いて回路を組む。電流の流れと計器の読みが表示される',
        draw: (ctx, size, pal) => {
          const s = runner.state;
          drawScene(ctx, size, pal, {
            circuit,
            names,
            closed,
            state: { ...s, ...shown(s) },
            selectedId,
            hover,
            problemPart: sys.ok ? null : sys.part,
            flowPxPerCoulomb: iRef > 0 ? FLOW_PX_PER_SECOND / (iRef * timeScale) : 0,
            voltageRef: voltageRef(),
            options: sceneOpt,
          });
        },
      },
      disposer,
    );

    /** 極板の電荷の記号の数の基準: 回路の電源の電圧の最大値・コンデンサーのはじめの電圧のうち最大 */
    function voltageRef(): number {
      let v = 1;
      for (const p of circuit.parts) {
        if (p.kind === 'dc') v = Math.max(v, partValue(p, 'E'));
        if (p.kind === 'ac') v = Math.max(v, acPeak(p));
        if (p.kind === 'capacitor') v = Math.max(v, partValue(p, 'V0'));
      }
      return v;
    }

    // --- 部品の選択（ツール） ---
    const toolChoice = createChoice<Tool>(
      '操作（部品を選んで、格子の点と点の間をタップ）',
      (['select', ...PART_KINDS, 'erase'] as const).map((t) => ({
        value: t,
        label: TOOL_LABELS[t],
      })),
      'select',
      (v) => {
        tool = v;
        hover = null;
        runner.requestRender();
      },
    );

    function partIndex(id: number | null): number {
      return circuit.parts.findIndex((p) => p.id === id);
    }

    function handleTap(px: number, py: number) {
      const rect = stage.canvas.getBoundingClientRect();
      const edge = hitTestEdge({ width: rect.width, height: rect.height }, px, py);
      const existing = edge ? partAt(circuit, edge[0], edge[1]) : undefined;
      if (tool === 'select') {
        if (existing?.kind === 'switch') toggleSwitch(partIndex(existing.id));
        select(existing?.id ?? null);
        return;
      }
      if (!edge) return;
      if (tool === 'erase') {
        if (existing) editCircuit(removePart(circuit, existing.id));
        return;
      }
      const r = placePart(circuit, tool, edge[0], edge[1]);
      selectedId = r.id;
      if (r.circuit !== circuit) editCircuit(r.circuit);
      else select(r.id);
    }

    const onClick = (ev: MouseEvent) => {
      const rect = stage.canvas.getBoundingClientRect();
      handleTap(ev.clientX - rect.left, ev.clientY - rect.top);
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse' || tool === 'select') return;
      const rect = stage.canvas.getBoundingClientRect();
      const size = { width: rect.width, height: rect.height };
      const next = hitTestEdge(size, ev.clientX - rect.left, ev.clientY - rect.top);
      const same = next && hover ? sameEdge(next, hover) : next === hover;
      if (!same) {
        hover = next;
        runner.requestRender();
      }
    };
    const onLeave = () => {
      hover = null;
      runner.requestRender();
    };
    stage.canvas.addEventListener('click', onClick);
    stage.canvas.addEventListener('pointermove', onMove);
    stage.canvas.addEventListener('pointerleave', onLeave);
    disposer.add(() => {
      stage.canvas.removeEventListener('click', onClick);
      stage.canvas.removeEventListener('pointermove', onMove);
      stage.canvas.removeEventListener('pointerleave', onLeave);
    });

    // --- 回路の例 ---
    const presetButtons = h(
      'div',
      { class: 'btn-row', role: 'group', 'aria-label': '回路の例' },
      PRESETS.map((pr) =>
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onclick: () => {
              setTimeScale(pr.timeScale);
              selectedId = null;
              editCircuit(pr.circuit);
            },
          },
          pr.label,
        ),
      ),
    );

    // --- スイッチの開閉 ---
    const switchHost = h('div');
    let switchChoices = new Map<number, { value: 'open' | 'closed' }>();
    function rebuildSwitches() {
      switchChoices = new Map();
      const items = circuit.parts.flatMap((p, i) => {
        if (p.kind !== 'switch') return [];
        const c = createChoice<'open' | 'closed'>(
          `スイッチ ${nameText(names[i]!)}`,
          [
            { value: 'open', label: '開く' },
            { value: 'closed', label: '閉じる' },
          ],
          closed[i] ? 'closed' : 'open',
          () => toggleSwitch(i),
        );
        switchChoices.set(i, c);
        return [c.element];
      });
      switchHost.replaceChildren(
        ...(items.length
          ? items
          : [h('p', { class: 'panel-note' }, 'スイッチを置くと、ここでも開閉できます。')]),
      );
    }
    function syncSwitches() {
      for (const [i, c] of switchChoices) c.value = closed[i] ? 'closed' : 'open';
    }

    function toggleSwitch(i: number) {
      if (i < 0) return;
      closed = closed.map((c, j) => (j === i ? !c : c));
      sys = buildSystem(circuit, closed);
      // 切り替えた直後の値（コンデンサーの電圧・コイルの電流はそのまま）
      override = sys.ok ? instantValues(sys, runner.state, runner.time) : null;
      syncSwitches();
      updateStatus();
      runner.requestRender();
    }

    // --- 選択中の部品の値 ---
    const editorHost = h('div');
    function rebuildEditor() {
      const i = partIndex(selectedId);
      const part = circuit.parts[i];
      table.setActive(part ? String(part.id) : null);
      if (!part) {
        editorHost.replaceChildren(
          h(
            'p',
            { class: 'panel-note' },
            '回路図の部品をタップすると、値を変えたり、向きを反転したり、グラフに表示するかを選んだりできます。',
          ),
        );
        return;
      }
      const info = PART_INFO[part.kind];
      const id = part.id;
      const sliders = info.params.map((spec) => {
        const slider = createSlider(spec, (v) =>
          editCircuit(setPartValue(circuit, id, spec.key, v), { keepEditor: true }),
        );
        slider.value = partValue(part, spec.key);
        return slider.element;
      });
      const orientation = isSource(part.kind)
        ? '端子 2 の側が正極。電流は電源の中を負極 → 正極へ流れる向きを正とする。'
        : part.kind === 'ammeter' || part.kind === 'voltmeter'
          ? '「+」の側が + 端子。'
          : part.kind === 'wire'
            ? ''
            : '電流は端子 1 → 2 の向きを正、電圧は φ(端子 1) − φ(端子 2)（端子 1 は左または上）。';
      editorHost.replaceChildren(
        h(
          'div',
          null,
          h(
            'p',
            { class: 'slider-label' },
            names[i] ? `${nameText(names[i])}（${info.label}）` : info.label,
          ),
          orientation ? h('p', { class: 'panel-note' }, orientation) : null,
          sliders.length ? h('div', { class: 'param-panel' }, sliders) : null,
          part.kind === 'wire'
            ? null
            : h(
                'div',
                { class: 'toggle-list', style: { margin: '12px 0' } },
                createToggle('グラフに表示', part.plot, (on) => {
                  circuit = setPartPlot(circuit, id, on);
                  rebuildGraphs();
                }).element,
              ),
          h(
            'div',
            { class: 'btn-row' },
            part.kind === 'wire'
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-small',
                    onclick: () => editCircuit(flipPart(circuit, id)),
                  },
                  '向きを反転',
                ),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-small',
                onclick: () => {
                  selectedId = null;
                  editCircuit(removePart(circuit, id));
                },
              },
              '削除',
            ),
          ),
        ),
      );
    }

    function select(id: number | null) {
      selectedId = id;
      rebuildEditor();
      runner.requestRender();
    }

    // --- グラフ（グラフに表示する部品ごとに線を引く。回路が変わったら作り直す） ---
    const graphHost = h('div');
    let graphDisposer = new Disposer();
    disposer.add(() => graphDisposer.dispose());
    let graphSet: {
      tabs: ReturnType<typeof createGraphTabs>;
      iGraph: TimeGraph;
      vGraph: TimeGraph;
      iParts: number[];
      vParts: number[];
    } | null = null;
    /** 記録（グラフを作り直したときに描き直すため。グラフと同じ間隔に間引く） */
    let history: { t: number; I: readonly number[]; V: readonly number[] }[] = [];

    function seriesFor(parts: number[]): SeriesSpec[] {
      const count = new Map<Quantity, number>();
      return parts.map((i) => {
        const q = PART_QUANTITY[circuit.parts[i]!.kind];
        const k = count.get(q) ?? 0;
        count.set(q, k + 1);
        return {
          label: nameText(names[i]!),
          quantity: q,
          dashed: k % 3 === 1,
          dotted: k % 3 === 2,
        };
      });
    }

    function rebuildGraphs() {
      graphDisposer.dispose();
      graphDisposer = new Disposer();
      const plotted = circuit.parts.flatMap((p, i) => (p.plot && names[i] ? [i] : []));
      const iParts = plotted.filter((i) => measuresCurrent(circuit.parts[i]!.kind));
      const vParts = plotted.filter((i) => measuresVoltage(circuit.parts[i]!.kind));
      const iGraph = createTimeGraph(
        {
          yLabel: 'I [mA]',
          series: seriesFor(iParts),
          window: graphWindow(),
          timeUnit: 'ms',
          ariaLabel: 'グラフに表示する部品を流れる電流の時間変化',
        },
        graphDisposer,
      );
      const vGraph = createTimeGraph(
        {
          yLabel: 'V [V]',
          series: seriesFor(vParts),
          window: graphWindow(),
          timeUnit: 'ms',
          ariaLabel: 'グラフに表示する部品の電圧の時間変化',
        },
        graphDisposer,
      );
      const tabs = createGraphTabs([
        { label: '電流 I', graph: iGraph },
        { label: '電圧 V', graph: vGraph },
      ]);
      graphSet = { tabs, iGraph, vGraph, iParts, vParts };
      for (const r of history) pushGraphs(r.t, r.I, r.V);
      graphHost.replaceChildren(
        tabs.element,
        h(
          'p',
          { class: 'panel-note' },
          plotted.length
            ? '電流は端子 1 → 2 の向き、電圧は φ(端子 1) − φ(端子 2)（電源は起電力の向き）を正とする。'
            : '部品をタップして「グラフに表示」を選ぶと、その部品の電流・電圧のグラフが描かれます。',
        ),
      );
      tabs.redraw();
    }

    function pushGraphs(t: number, I: readonly number[], V: readonly number[]) {
      if (!graphSet) return;
      graphSet.iGraph.push(
        t,
        graphSet.iParts.map((i) => I[i]! * 1e3),
      );
      graphSet.vGraph.push(
        t,
        graphSet.vParts.map((i) => V[i]!),
      );
    }

    function record(s: SimState, t: number) {
      for (let i = 0; i < s.I.length; i++) {
        if (circuit.parts[i]!.kind !== 'voltmeter') iRef = Math.max(iRef, Math.abs(s.I[i]!));
      }
      pushGraphs(t, s.I, s.V);
      const prev = history[history.length - 1];
      if (!prev || t - prev.t >= graphWindow() / 600) {
        history.push({ t, I: s.I, V: s.V });
        if (history.length > 1500) history = history.filter((r) => r.t >= t - graphWindow());
      }
    }

    // --- 現在の値（部品ごとの電流・電圧の表） ---
    const tableHost = h('div');
    let table: ValueTable<string, 'I' | 'V'> = createValueTable([], []);
    function rebuildTable() {
      const rows = circuit.parts.flatMap((p, i) =>
        names[i]
          ? [{ key: String(p.id), label: `${nameText(names[i])} ${PART_INFO[p.kind].label}` }]
          : [],
      );
      table = createValueTable<string, 'I' | 'V'>(
        [
          { key: 'I', label: '電流', symbol: 'I', unit: 'mA', quantity: 'current' },
          { key: 'V', label: '電圧', symbol: 'V', unit: 'V', quantity: 'potential' },
        ],
        rows,
        '各部品の電流と電圧',
      );
      tableHost.replaceChildren(
        rows.length ? table.element : h('p', { class: 'panel-note' }, '部品がありません。'),
      );
      table.setActive(selectedId === null ? null : String(selectedId));
    }

    // --- 状態の表示 ---
    const time = createTimeReadout(1, { unit: 'ms' });
    const statusMessage = h('span', { class: 'status-message', role: 'status' });
    function updateStatus() {
      statusMessage.textContent = sys.ok ? '' : sys.message;
      time.setNote(`1/${Math.round(1 / timeScale)} 倍のスロー再生`);
    }

    const timeChoice = createChoice<TimeScaleValue>(
      '再生の速さ（時間の尺度）',
      TIME_SCALES.map((o) => ({ value: o.value, label: o.label })),
      '10',
      (v) => setTimeScale(TIME_SCALES.find((o) => o.value === v)!.scale),
    );
    function setTimeScale(scale: number) {
      timeScale = scale;
      timeChoice.value = TIME_SCALES.find((o) => o.scale === scale)?.value ?? '100';
      runner.setTimeScale(scale);
      graphSet?.iGraph.setWindow(graphWindow());
      graphSet?.vGraph.setWindow(graphWindow());
      updateStatus();
      graphSet?.tabs.redraw();
      runner.requestRender();
    }

    // --- 回路の変更（t = 0 からやり直す） ---
    function editCircuit(next: Circuit, opts: { keepEditor?: boolean } = {}) {
      circuit = next;
      names = partNames(circuit);
      if (partIndex(selectedId) < 0) selectedId = null;
      history = [];
      graphSet = null;
      runner.reset();
      rebuildTable();
      rebuildSwitches();
      rebuildGraphs();
      if (!opts.keepEditor) rebuildEditor();
      else table.setActive(selectedId === null ? null : String(selectedId));
    }

    // --- 時間発展 ---
    const runner = new SimulationRunner<SimState>({
      dt: DT,
      timeScale,
      init: () => {
        // リセットするとスイッチはすべて開く
        closed = circuit.parts.map(() => false);
        sys = buildSystem(circuit, closed);
        return initialState(sys, circuit);
      },
      step: (s, t, dt) => (sys.ok ? step(sys, s, t, dt) : s),
      onStep: (s, t) => {
        override = null;
        record(s, t);
      },
      onReset: (s) => {
        override = null;
        iRef = 0;
        history = [];
        syncSwitches();
        updateStatus();
        graphSet?.tabs.clear();
        record(s, 0);
      },
      render: (s, t) => {
        stage.redraw();
        graphSet?.tabs.redraw();
        time.update(t);
        const v = shown(s);
        const values: Record<string, { I: number; V: number }> = {};
        circuit.parts.forEach((p, i) => {
          values[String(p.id)] = { I: v.I[i]! * 1e3, V: v.V[i]! };
        });
        table.update(values);
      },
      isInvalid: (s) => s.x.some((x) => !Number.isFinite(x)),
      // 電源が短絡した回路は解けないので止める
      isFinished: () => !sys.ok,
    });
    disposer.add(() => runner.destroy());

    rebuildTable();
    rebuildSwitches();
    rebuildGraphs();
    rebuildEditor();
    setTimeScale(timeScale);

    // --- 表示オプション ---
    const toggle = (label: string, key: keyof SceneOptions) =>
      createToggle(label, sceneOpt[key], (on) => {
        sceneOpt[key] = on;
        runner.requestRender();
      }).element;

    mountSimulationLayout(root, {
      stage: h('div', null, stage.element, h('div', { class: 'stage-tools' }, toolChoice.element)),
      playback: createPlaybackControls(runner, disposer),
      status: h('div', null, time.element, statusMessage),
      params: h(
        'div',
        null,
        h('p', { class: 'slider-label' }, '回路の例'),
        presetButtons,
        h('div', null, switchHost),
        h('h3', { class: 'panel-subtitle' }, '選んだ部品'),
        editorHost,
      ),
      options: h(
        'div',
        null,
        timeChoice.element,
        h(
          'div',
          { class: 'toggle-list' },
          toggle('電流の流れ', 'showFlow'),
          toggle('部品の名前・値・計器の読み', 'showLabels'),
        ),
      ),
      values: tableHost,
      graphs: graphHost,
      theory: buildTheory(),
    });
  },
};

function sameEdge(a: readonly [GridPoint, GridPoint], b: readonly [GridPoint, GridPoint]): boolean {
  return a[0].x === b[0].x && a[0].y === b[0].y && a[1].x === b[1].x && a[1].y === b[1].y;
}

export default unit;
