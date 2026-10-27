/**
 * 単元: 力学サンドボックス（物体・ばね・糸・斜面・滑車・壁や床を自由に配置して動かす）
 */
import { h } from '@/core/dom';
import { SimulationRunner } from '@/core/sim/runner';
import type { ParamSpec } from '@/core/params';
import { parseHashQuery } from '@/router';
import { createResponsiveCanvas } from '@/ui/canvas';
import { mountSimulationLayout } from '@/ui/layout';
import { createChoice, createParamPanel, createSlider, createToggle } from '@/ui/params';
import { createPlaybackControls, createTimeReadout } from '@/ui/playback';
import { createGraphTabs, createTimeGraph } from '@/ui/timeGraph';
import { showToast } from '@/ui/toast';
import { createValuePanel, createValueTable } from '@/ui/valuePanel';
import type { UnitModule } from '@/units/types';
import type { Vec2 } from './collide';
import {
  BALL_SPECS,
  BLOCK_SPECS,
  INCLINE_SPECS,
  SPRING_SPECS,
  WALL_SPECS,
  findBody,
  findFixture,
  remove,
  updateProps,
  type Selection,
} from './design';
import { attachEditor, type ChangeKind, type Tool } from './editor';
import {
  DT,
  PARAMS,
  PULLEY_RADIUS,
  bodyKinetic,
  compile,
  energies,
  initialState,
  isBroken,
  momentum,
  outOfBounds,
  step,
  type SandboxDesign,
  type SandboxParams,
  type SandboxState,
  type SandboxWorld,
} from './model';
import { DEFAULT_PRESET, preset, presets } from './presets';
import { drawSandbox, type SceneOptions } from './scene';
import {
  SandboxFormatError,
  URL_KEY,
  decodeFromUrl,
  encodeForUrl,
  parseSandbox,
  serialize,
  type SavedSandbox,
} from './storage';
import { buildTheory } from './theory';

const TOOLS: readonly { value: Tool; label: string }[] = [
  { value: 'select', label: '選択・移動' },
  { value: 'ball', label: '球' },
  { value: 'block', label: '箱' },
  { value: 'floor', label: '床' },
  { value: 'wall', label: '壁' },
  { value: 'incline', label: '斜面' },
  { value: 'pulley', label: '滑車' },
  { value: 'spring', label: 'ばね' },
  { value: 'string', label: '糸' },
];

const TOOL_HINTS: Record<Tool, string> = {
  select:
    '部品をドラッグして動かす。タップして選ぶと「パラメータ」の欄で値を変えられ、物体なら初速度のつまみ v₀ が出る。',
  ball: '球を置く場所をタップ。',
  block: '箱を置く場所をタップ（斜面の上に置くと斜面にそろう）。',
  floor: '床（台）を置く場所をタップ。幅・高さはあとから変えられる。',
  wall: '壁を置く場所をタップ。幅・高さはあとから変えられる。',
  incline: '斜面の底辺の中央にする場所をタップ。傾斜角・向きはあとから変えられる。',
  pulley: '滑車を置く場所をタップ。糸で「物体 → 滑車」「滑車 → 別の物体」とつなぐと滑車にかかる。',
  spring: '物体から、別の物体・壁などの場所へドラッグしてばねでつなぐ。',
  string: '物体から、別の物体・滑車・天井などの場所へドラッグして糸でつなぐ。',
};

/** 軌跡を記録する間隔 [s] と、1 物体あたりの点の上限 */
const TRAIL_INTERVAL = 0.02;
const TRAIL_POINTS = 400;

function initialSandbox(state: string | undefined): { saved: SavedSandbox; error: string | null } {
  // 演習問題の答え合わせから開いたときは、問題の配置（serialize した JSON）を読み込む
  if (state !== undefined) {
    try {
      return { saved: parseSandbox(state), error: null };
    } catch (err) {
      const message = err instanceof SandboxFormatError ? err.message : '読み込めませんでした';
      return { saved: preset(DEFAULT_PRESET), error: message };
    }
  }
  const code = parseHashQuery(location.hash).get(URL_KEY);
  if (code) {
    try {
      return { saved: decodeFromUrl(code), error: null };
    } catch (err) {
      const message = err instanceof SandboxFormatError ? err.message : '読み込めませんでした';
      return { saved: preset(DEFAULT_PRESET), error: message };
    }
  }
  return { saved: preset(DEFAULT_PRESET), error: null };
}

const unit: UnitModule = {
  mount(root, { disposer, preset: unitPreset }) {
    const first = initialSandbox(unitPreset?.state);
    let design: SandboxDesign = first.saved.design;
    let selection: Selection | null = null;
    let tool: Tool = 'select';
    let snap = true;
    let preview: { from: Vec2; to: Vec2 } | null = null;
    let trails: Vec2[][] = [];
    /** 読み込んでから配置を変えたか（サンプルを読み込む前に確認する） */
    let dirty = false;
    /** パラメータをまとめて変えている間は、やり直しを 1 回にする */
    let suspend = true;
    const sceneOpt: SceneOptions = {
      showVelocity: true,
      showValues: false,
      showTrail: false,
      showGrid: true,
    };

    // --- 全体のパラメータ（変えたら t = 0 からやり直す） ---
    const params = createParamPanel(
      PARAMS,
      () => {
        if (suspend) return;
        dirty = true;
        runner.reset();
      },
      unitPreset?.params,
    );
    const p = (): SandboxParams => params.values;
    for (const spec of PARAMS) params.set(spec.key, first.saved.params[spec.key]);

    // --- 描画と編集 ---
    const toolChoice = createChoice('配置する部品', TOOLS, 'select', (t) => setTool(t));
    const hint = h('p', { class: 'sandbox-hint' }, TOOL_HINTS.select);
    const canvas = createResponsiveCanvas(
      {
        aspect: 16 / 9,
        ariaLabel:
          '物体・ばね・糸・斜面・滑車・壁や床を配置して運動させる画面。部品はドラッグで動かせる',
        className: 'sandbox-canvas',
        draw: (ctx, size, pal) =>
          drawSandbox(ctx, size, pal, {
            design,
            world,
            state: runner.state,
            options: sceneOpt,
            selection,
            editing: !runner.playing && runner.time === 0,
            trails,
            preview,
          }),
      },
      disposer,
    );
    const stage = h(
      'div',
      { class: 'sandbox-stage' },
      h('div', { class: 'sandbox-tools' }, toolChoice.element, hint),
      canvas.element,
    );

    function setTool(t: Tool) {
      tool = t;
      toolChoice.value = t;
      hint.textContent = TOOL_HINTS[t];
      canvas.canvas.classList.toggle('is-placing', t !== 'select');
    }

    // --- グラフ ---
    const eGraph = createTimeGraph(
      {
        yLabel: 'エネルギー [J]',
        series: [
          { label: 'K', quantity: 'kinetic' },
          { label: 'U', quantity: 'potential' },
          { label: 'E', quantity: 'energy' },
          { label: 'Q', quantity: 'heat' },
          { label: 'E+Q', tone: 'fg', dashed: true },
        ],
        ariaLabel:
          '運動エネルギーの和 K、位置エネルギーの和 U、力学的エネルギー E、失われたエネルギー Q、E+Q の時間変化',
      },
      disposer,
    );
    const pGraph = createTimeGraph(
      {
        yLabel: '運動量 [kg·m/s]',
        series: [
          { label: 'x 成分', quantity: 'momentum' },
          { label: 'y 成分', quantity: 'momentum', dashed: true },
        ],
        symmetric: true,
        ariaLabel: '運動量の和の x 成分・y 成分の時間変化',
      },
      disposer,
    );
    const graphs = createGraphTabs([
      { label: 'エネルギー', graph: eGraph },
      { label: '運動量', graph: pGraph },
    ]);

    // --- 現在の値 ---
    const totals = createValuePanel([
      {
        key: 'K',
        label: '運動エネルギーの和',
        symbol: 'K',
        unit: 'J',
        digits: 3,
        quantity: 'kinetic',
      },
      { key: 'Ug', label: '重力による位置エネルギー', unit: 'J', digits: 3, quantity: 'potential' },
      { key: 'Us', label: '弾性エネルギー', unit: 'J', digits: 3, quantity: 'potential' },
      {
        key: 'E',
        label: '力学的エネルギー',
        symbol: 'E',
        unit: 'J',
        digits: 3,
        quantity: 'energy',
      },
      { key: 'Qf', label: '摩擦熱', unit: 'J', digits: 3, quantity: 'heat' },
      { key: 'Qc', label: '衝突などで失われた分', unit: 'J', digits: 3, quantity: 'heat' },
      { key: 'EQ', label: '合計', symbol: 'E+Q', unit: 'J', digits: 3 },
      {
        key: 'px',
        label: '運動量の和',
        symbol: 'p_x',
        unit: 'kg·m/s',
        digits: 3,
        quantity: 'momentum',
      },
      {
        key: 'py',
        label: '運動量の和',
        symbol: 'p_y',
        unit: 'kg·m/s',
        digits: 3,
        quantity: 'momentum',
      },
    ]);
    const tableHost = h('div', null);
    type Column = 'v' | 'vx' | 'vy' | 'K' | 'U';
    let table = buildTable();
    function buildTable() {
      const t = createValueTable<string, Column>(
        [
          { key: 'v', label: '', symbol: 'v', unit: 'm/s', digits: 2, quantity: 'velocity' },
          { key: 'vx', label: '', symbol: 'v_x', unit: 'm/s', digits: 2 },
          { key: 'vy', label: '', symbol: 'v_y', unit: 'm/s', digits: 2 },
          { key: 'K', label: '', symbol: 'K', unit: 'J', digits: 2, quantity: 'kinetic' },
          { key: 'U', label: '', symbol: 'mgy', unit: 'J', digits: 2, quantity: 'potential' },
        ],
        design.bodies.map((b) => ({ key: b.id, label: `物体 ${b.id}` })),
        '各物体の速さ・速度・運動エネルギー・重力による位置エネルギー',
      );
      tableHost.replaceChildren(
        design.bodies.length
          ? t.element
          : h('p', { class: 'sandbox-note' }, '物体を置くと、ここに速度とエネルギーが出る。'),
      );
      return t;
    }
    const time = createTimeReadout();

    function updateValues(s: SandboxState) {
      const e = energies(world, s);
      const mom = momentum(world, s);
      totals.update({
        K: e.kinetic,
        Ug: e.gravity,
        Us: e.elastic,
        E: e.total,
        Qf: e.friction,
        Qc: e.collision,
        EQ: e.budget,
        px: mom.px,
        py: mom.py,
      });
      table.update(
        Object.fromEntries(
          world.bodies.map((b, i) => [
            b.id,
            {
              v: Math.hypot(s.vx[i]!, s.vy[i]!),
              vx: s.vx[i]!,
              vy: s.vy[i]!,
              K: bodyKinetic(world, s, i),
              U: b.m * world.g * s.y[i]!,
            },
          ]),
        ),
      );
    }

    let lastTrail = 0;
    function record(s: SandboxState, t: number) {
      const e = energies(world, s);
      const mom = momentum(world, s);
      eGraph.push(t, [e.kinetic, e.potential, e.total, e.heat, e.budget]);
      pGraph.push(t, [mom.px, mom.py]);
      if (t === 0 || t - lastTrail >= TRAIL_INTERVAL - 1e-9) {
        lastTrail = t;
        trails.forEach((tr, i) => {
          tr.push({ x: s.x[i]!, y: s.y[i]! });
          if (tr.length > TRAIL_POINTS) tr.shift();
        });
      }
    }

    // --- 時間発展 ---
    let world: SandboxWorld = compile(design, p());
    const runner = new SimulationRunner<SandboxState>({
      dt: DT,
      init: () => {
        world = compile(design, p());
        return initialState(world);
      },
      step: (s, _t, dt) => step(world, s, dt),
      onStep: record,
      onReset: (s) => {
        graphs.clear();
        trails = world.bodies.map(() => []);
        lastTrail = 0;
        record(s, 0);
      },
      render: (s, t) => {
        canvas.redraw();
        graphs.redraw();
        time.update(t);
        updateValues(s);
      },
      isInvalid: isBroken,
      isFinished: outOfBounds,
    });
    disposer.add(() => runner.destroy());
    disposer.add(
      runner.on((ev) => {
        if (ev === 'pause' && outOfBounds(runner.state))
          time.setNote('物体が画面の外に出たので止めた');
        else if (ev === 'play' || ev === 'reset') time.setNote('');
        if (ev === 'play' || ev === 'reset') runner.requestRender();
      }),
    );
    suspend = false;

    // --- 選択中の部品の値 ---
    const selHost = h('div', { class: 'sandbox-selection' });
    let selSliders: { key: string; set(v: number): void }[] = [];

    function sliderFor<K extends string>(
      spec: ParamSpec<K>,
      value: number,
      sel: Selection,
    ): HTMLElement {
      const s = createSlider(spec, (v) => {
        updateProps(design, sel, { [spec.key]: v });
        changed('props', false);
      });
      s.value = value;
      selSliders.push({ key: spec.key, set: (v) => (s.value = v) });
      return s.element;
    }

    function deleteButton(label: string): HTMLElement {
      return h(
        'button',
        { type: 'button', class: 'btn', onclick: () => deleteSelection() },
        `${label}を削除`,
      );
    }

    const fill = (...parts: (Node | Node[])[]) => selHost.replaceChildren(...parts.flat());

    function renderSelection() {
      selSliders = [];
      const sel = selection;
      const note = (text: string) => h('p', { class: 'sandbox-note' }, text);
      if (!sel) {
        fill(note('画面の部品をタップすると、ここで質量・大きさ・ばね定数などを変えられる。'));
        return;
      }
      if (sel.type === 'body') {
        const b = findBody(design, sel.id);
        if (!b) return select(null);
        const specs = (b.kind === 'ball' ? BALL_SPECS : BLOCK_SPECS) as readonly ParamSpec[];
        fill(
          h(
            'p',
            { class: 'sandbox-sel-title' },
            `物体 ${b.id}（${b.kind === 'ball' ? '球' : '箱'}）`,
          ),
          specs.map((spec) =>
            sliderFor(spec, (b as unknown as Record<string, number>)[spec.key]!, sel),
          ),
          deleteButton(`物体 ${b.id} `),
        );
        return;
      }
      if (sel.type === 'fixture') {
        const f = findFixture(design, sel.id);
        if (!f) return select(null);
        if (f.kind === 'wall') {
          fill(
            h('p', { class: 'sandbox-sel-title' }, '壁・床（固定）'),
            WALL_SPECS.map((spec) => sliderFor(spec, f[spec.key], sel)),
            deleteButton('この壁・床'),
          );
        } else if (f.kind === 'incline') {
          const dir = createChoice(
            '向き',
            [
              { value: 'right', label: '右が高い' },
              { value: 'left', label: '左が高い' },
            ] as const,
            f.flip ? 'left' : 'right',
            (v) => {
              updateProps(design, sel, { flip: v === 'left' });
              changed('props', false);
            },
          );
          fill(
            h('p', { class: 'sandbox-sel-title' }, '斜面（固定）'),
            INCLINE_SPECS.map((spec) => sliderFor(spec, f[spec.key], sel)),
            dir.element,
            deleteButton('この斜面'),
          );
        } else {
          fill(
            h('p', { class: 'sandbox-sel-title' }, '滑車（固定）'),
            note(
              `軽くなめらかな滑車（半径 ${PULLEY_RADIUS} m）。糸を「物体 → 滑車」「滑車 → 別の物体」とつなぐと、この滑車にかかる。`,
            ),
            deleteButton('この滑車'),
          );
        }
        return;
      }
      const j = design.joints.find((x) => x.id === sel.id);
      if (!j) return select(null);
      if (sel.type === 'pin') {
        fill(
          h('p', { class: 'sandbox-sel-title' }, `${j.kind === 'spring' ? 'ばね' : '糸'}の固定点`),
          note('ドラッグで動かせる。'),
          deleteButton(j.kind === 'spring' ? 'このばね' : 'この糸'),
        );
      } else if (j.kind === 'spring') {
        fill(
          h('p', { class: 'sandbox-sel-title' }, 'ばね'),
          SPRING_SPECS.map((spec) => sliderFor(spec, j[spec.key], sel)),
          deleteButton('このばね'),
        );
      } else {
        fill(
          h('p', { class: 'sandbox-sel-title' }, j.via ? '滑車にかけた糸' : '糸'),
          note(
            `長さ ${j.L.toFixed(2)} m（軽くて伸びない糸。端を動かすと、張った状態の長さに合わせて変わる）`,
          ),
          deleteButton('この糸'),
        );
      }
    }

    /** キャンバスから値が変わったとき（初速度のつまみ）にスライダーを合わせる */
    function syncSliders() {
      if (selection?.type !== 'body') return;
      const b = findBody(design, selection.id);
      if (!b) return;
      for (const s of selSliders) {
        const v = (b as unknown as Record<string, number>)[s.key];
        if (v !== undefined) s.set(v);
      }
    }

    function select(sel: Selection | null) {
      selection = sel;
      renderSelection();
      runner.requestRender();
    }

    function deleteSelection() {
      if (!selection) return;
      if (runner.time > 0 || runner.playing) runner.reset();
      remove(design, selection);
      select(null);
      changed('structure');
    }

    /** 配置を変えたあと: t = 0 からやり直し、必要なら表や選択中の値を作り直す */
    function changed(kind: ChangeKind, fromCanvas = true) {
      dirty = true;
      runner.reset();
      if (kind === 'structure') {
        table = buildTable();
        renderSelection();
      } else if (fromCanvas) {
        syncSliders();
      }
    }

    attachEditor(
      {
        canvas: canvas.canvas,
        design: () => design,
        tool: () => tool,
        setTool,
        selection: () => selection,
        select,
        snap: () => snap,
        beginEdit: () => {
          if (runner.time > 0 || runner.playing) runner.reset();
        },
        changed,
        setPreview: (pv) => {
          preview = pv;
          runner.requestRender();
        },
        notify: (m) => showToast(m),
      },
      disposer,
    );

    disposer.listen(document, 'keydown', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && selection) {
        ev.preventDefault();
        deleteSelection();
      } else if (ev.key === 'Escape') {
        setTool('select');
        select(null);
      }
    });

    // --- 読み込み・保存 ---
    function load(saved: SavedSandbox) {
      suspend = true;
      for (const spec of PARAMS) params.set(spec.key, saved.params[spec.key]);
      suspend = false;
      design = saved.design;
      dirty = false;
      setTool('select');
      selection = null;
      runner.reset();
      table = buildTable();
      renderSelection();
    }

    const presetSelect = h(
      'select',
      {
        class: 'select',
        'aria-label': 'サンプルを読み込む',
        onchange: () => {
          const id = presetSelect.value;
          presetSelect.value = '';
          if (!id) return;
          if (dirty && !confirm('今の配置は消えます。サンプルを読み込みますか？')) return;
          load(preset(id));
        },
      },
      h('option', { value: '' }, 'サンプルを選ぶ…'),
      presets().map((x) => h('option', { value: x.id }, x.label)),
    );

    const routePath = () => location.hash.split('?')[0] || '#/mechanics/sandbox';
    const copyUrl = () => {
      const url = `${location.href.split('#')[0]}${routePath()}?${URL_KEY}=${encodeForUrl(p(), design)}`;
      history.replaceState(null, '', url);
      const fallback = () => showToast('アドレスバーの URL を共有すると、同じ配置で開けます。');
      if (!navigator.clipboard) return fallback();
      navigator.clipboard
        .writeText(url)
        .then(() => showToast('URL をコピーしました。開くと同じ配置になります。'), fallback);
    };
    const saveJson = () => {
      const blob = new Blob([serialize(p(), design, true)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: 'sandbox.json' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    const fileInput = h('input', {
      type: 'file',
      accept: '.json,application/json',
      class: 'visually-hidden',
      tabindex: -1,
      'aria-hidden': 'true',
      onchange: async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        try {
          load(parseSandbox(await file.text()));
          showToast(`${file.name} を読み込みました。`);
        } catch (err) {
          showToast(
            err instanceof SandboxFormatError
              ? `読み込めませんでした: ${err.message}`
              : '読み込めませんでした',
          );
        }
      },
    });
    const clearAll = () => {
      if (dirty && !confirm('すべての部品を消して、床だけにしますか？')) return;
      load(preset('empty'));
    };

    const btn = (label: string, onclick: () => void) =>
      h('button', { type: 'button', class: 'btn', onclick }, label);

    // --- 表示オプション ---
    const toggle = (label: string, key: keyof SceneOptions) =>
      createToggle(label, sceneOpt[key], (on) => {
        sceneOpt[key] = on;
        runner.requestRender();
      }).element;

    renderSelection();
    mountSimulationLayout(root, {
      stage,
      playback: createPlaybackControls(runner, disposer),
      status: time.element,
      params: h(
        'div',
        { class: 'sandbox-params' },
        params.element,
        h('h3', { class: 'panel-subtitle' }, '選択中の部品'),
        selHost,
        h('h3', { class: 'panel-subtitle' }, 'サンプル'),
        presetSelect,
        h('h3', { class: 'panel-subtitle' }, '保存・読み込み'),
        h(
          'div',
          { class: 'sandbox-actions' },
          btn('URL をコピー', copyUrl),
          btn('JSON を保存', saveJson),
          btn('JSON を読み込む', () => fileInput.click()),
          btn('すべて消去', clearAll),
          fileInput,
        ),
      ),
      options: h(
        'div',
        { class: 'toggle-list' },
        toggle('速度ベクトル v', 'showVelocity'),
        toggle('各物体の速さ', 'showValues'),
        toggle('軌跡', 'showTrail'),
        toggle('方眼（0.5 m）', 'showGrid'),
        createToggle('配置を方眼（5 cm）にそろえる', snap, (on) => (snap = on)).element,
      ),
      values: h(
        'div',
        { class: 'value-group' },
        tableHost,
        h('h3', { class: 'panel-subtitle' }, '全体'),
        totals.element,
      ),
      graphs: graphs.element,
      theory: buildTheory(),
    });

    if (first.error) showToast(`URL の配置を読み込めませんでした: ${first.error}`);
  },
};

export default unit;
