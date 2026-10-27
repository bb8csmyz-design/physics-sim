/**
 * パラメータスライダー。単元は ParamSpec の配列を宣言するだけでよい。
 */
import { h, symbol } from '@/core/dom';
import { digitsForStep, formatFixed } from '@/core/format';
import { defaultParams, type ParamSpec, type ParamValues } from '@/core/params';

export type { ParamSpec, ParamValues } from '@/core/params';

export interface Slider {
  readonly element: HTMLElement;
  get value(): number;
  set value(v: number);
}

/** 単独のスライダー。onInput はドラッグ中も呼ばれる */
export function createSlider(spec: ParamSpec, onInput: (value: number) => void): Slider {
  const digits = spec.digits ?? digitsForStep(spec.step);
  const id = `param-${spec.key}-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', {
    type: 'range',
    id,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    value: spec.default,
    class: 'slider-input',
  });
  const output = h('output', { for: id, class: 'slider-value' });
  const show = (v: number) => {
    output.textContent = formatFixed(v, digits);
    input.setAttribute('aria-valuetext', `${formatFixed(v, digits)} ${spec.unit ?? ''}`.trim());
    const ratio = (v - spec.min) / (spec.max - spec.min);
    input.style.setProperty('--fill', `${(ratio * 100).toFixed(2)}%`);
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    show(v);
    onInput(v);
  });
  show(spec.default);

  const element = h(
    'div',
    { class: 'slider' },
    h(
      'div',
      { class: 'slider-head' },
      h(
        'label',
        { for: id, class: 'slider-label' },
        spec.label,
        spec.symbol ? [' ', symbol(spec.symbol)] : null,
      ),
      h(
        'span',
        { class: 'slider-reading' },
        output,
        spec.unit ? h('span', { class: 'unit' }, spec.unit) : null,
      ),
    ),
    input,
    spec.hint ? h('p', { class: 'slider-hint' }, spec.hint) : null,
  );

  return {
    element,
    get value() {
      return Number(input.value);
    },
    set value(v: number) {
      input.value = String(v);
      show(Number(input.value));
    },
  };
}

export interface ParamPanel<K extends string> {
  readonly element: HTMLElement;
  /** 現在の値（読み取り専用のスナップショットではなく常に最新） */
  readonly values: Readonly<ParamValues<K>>;
  /** 全パラメータを既定値に戻す（onChange も呼ぶ） */
  resetToDefaults(): void;
  set(key: K, value: number): void;
}

/**
 * パラメータ群のパネル。値が変わるたびに onChange(values, changedKey) を呼ぶ。
 * 「初期値に戻す」ボタン付き。
 * initial（単元を開くときの初期条件 ctx.preset?.params）があれば、その値から始める
 * （範囲外・刻み外の値はスライダーに合わせて丸める。「初期値に戻す」では既定値に戻る）。
 */
export function createParamPanel<K extends string>(
  specs: readonly ParamSpec<K>[],
  onChange: (values: Readonly<ParamValues<K>>, key: K | null) => void,
  initial?: Readonly<Record<string, number>>,
): ParamPanel<K> {
  const values = defaultParams(specs);
  const sliders = new Map<K, Slider>();
  for (const spec of specs) {
    const v0 = initial?.[spec.key];
    const slider = createSlider(spec, (v) => {
      values[spec.key] = v;
      onChange(values, spec.key);
    });
    if (v0 !== undefined && Number.isFinite(v0)) {
      slider.value = v0;
      values[spec.key] = slider.value; // input[type=range] が範囲と刻みに丸めた値
    }
    sliders.set(spec.key, slider);
  }
  const resetToDefaults = () => {
    for (const spec of specs) {
      values[spec.key] = spec.default;
      sliders.get(spec.key)!.value = spec.default;
    }
    onChange(values, null);
  };
  const element = h(
    'div',
    { class: 'param-panel' },
    [...sliders.values()].map((s) => s.element),
    h(
      'button',
      { type: 'button', class: 'btn btn-ghost btn-small', onclick: resetToDefaults },
      'パラメータを初期値に戻す',
    ),
  );
  return {
    element,
    values,
    resetToDefaults,
    set(key, value) {
      values[key] = value;
      sliders.get(key)!.value = value;
      onChange(values, key);
    },
  };
}

/** チェックボックス式の表示切り替え（「力の矢印を表示」など） */
export function createToggle(
  label: string,
  initial: boolean,
  onChange: (on: boolean) => void,
): { element: HTMLElement; get checked(): boolean } {
  const input = h('input', { type: 'checkbox', class: 'toggle-input' });
  input.checked = initial;
  input.addEventListener('change', () => onChange(input.checked));
  return {
    element: h('label', { class: 'toggle' }, input, h('span', { class: 'toggle-track' }), label),
    get checked() {
      return input.checked;
    },
  };
}

export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
}

/**
 * 択一の切り替え（「弦 / 開管 / 閉管」「凸レンズ / 凹レンズ」、回路のスイッチの接続先など、
 * スライダーで表せない条件）。パラメータパネルの上に置く。
 * ユーザーの操作で値が変わったら onChange を呼ぶ。value への代入（リセット時に戻すなど）では呼ばない。
 */
export function createChoice<V extends string>(
  label: string,
  options: readonly ChoiceOption<V>[],
  initial: V,
  onChange: (value: V) => void,
): { readonly element: HTMLElement; value: V } {
  let value = initial;
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'seg-btn',
        'aria-checked': String(o.value === initial),
        onclick: () => {
          if (o.value === value) return;
          select(o.value);
          onChange(o.value);
        },
      },
      o.label,
    ),
  );
  function select(v: V) {
    value = v;
    options.forEach((o, i) => buttons[i]!.setAttribute('aria-checked', String(o.value === v)));
  }
  const element = h(
    'div',
    { class: 'choice' },
    h('span', { class: 'slider-label' }, label),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, buttons),
  );
  return {
    element,
    get value() {
      return value;
    },
    set value(v: V) {
      select(v);
    },
  };
}

/**
 * 択一の初期値を単元の初期条件（ctx.preset?.choices）から選ぶ。指定がないか選択肢にない値なら fallback
 */
export function presetChoice<V extends string>(
  choices: Readonly<Record<string, string>> | undefined,
  key: string,
  options: readonly ChoiceOption<V>[] | readonly V[],
  fallback: V,
): V {
  const v = choices?.[key];
  const values = options.map((o) => (typeof o === 'string' ? o : o.value));
  return values.find((x) => x === v) ?? fallback;
}
