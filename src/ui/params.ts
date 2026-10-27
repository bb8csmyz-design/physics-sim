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
 */
export function createParamPanel<K extends string>(
  specs: readonly ParamSpec<K>[],
  onChange: (values: Readonly<ParamValues<K>>, key: K | null) => void,
): ParamPanel<K> {
  const values = defaultParams(specs);
  const sliders = new Map<K, Slider>();
  for (const spec of specs) {
    sliders.set(
      spec.key,
      createSlider(spec, (v) => {
        values[spec.key] = v;
        onChange(values, spec.key);
      }),
    );
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
 * 択一の切り替え（「弦 / 開管 / 閉管」「凸レンズ / 凹レンズ」など、スライダーで表せない条件）。
 * パラメータパネルの上に置く。値が変わったら onChange を呼ぶ。
 */
export function createChoice<V extends string>(
  label: string,
  options: readonly ChoiceOption<V>[],
  initial: V,
  onChange: (value: V) => void,
): { readonly element: HTMLElement; readonly value: V } {
  let value = initial;
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'seg-btn',
        'aria-checked': String(o.value === initial),
        onclick: () => select(o.value),
      },
      o.label,
    ),
  );
  function select(v: V) {
    if (v === value) return;
    value = v;
    options.forEach((o, i) => buttons[i]!.setAttribute('aria-checked', String(o.value === v)));
    onChange(v);
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
  };
}
