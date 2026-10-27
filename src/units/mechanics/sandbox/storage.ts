/**
 * 配置の保存・読み込み（JSON と URL）。DOM に依存しない純粋な処理のみ。
 *
 * JSON の形式（version 1）:
 *   { "format": "physics-sim/sandbox", "version": 1,
 *     "params": { "g": 9.8, "mu": 0.3, "muk": 0.2, "e": 0.5 },
 *     "bodies": [...], "fixtures": [...], "joints": [...] }   ← model.ts の BodyDef などと同じ形
 * URL には同じ JSON を UTF-8 → base64url にして `#/mechanics/sandbox?s=...` の形で入れる。
 *
 * 読み込むときは型と参照を検査し、数値は UI で選べる範囲に収める（範囲外の値で物理が破綻しないように）。
 */
import { defaultParams, type ParamSpec } from '@/core/params';
import {
  BALL_SPECS,
  BLOCK_SPECS,
  BODY_NAMES,
  INCLINE_SPECS,
  MAX_FIXTURES,
  MAX_JOINTS,
  SPRING_SPECS,
  WALL_SPECS,
  clamp,
} from './design';
import {
  PARAMS,
  WORLD,
  type BodyDef,
  type Endpoint,
  type FixtureDef,
  type JointDef,
  type SandboxDesign,
  type SandboxParams,
} from './model';

export const FORMAT = 'physics-sim/sandbox';
export const VERSION = 1;
/** URL のハッシュに入れるときのパラメータ名 */
export const URL_KEY = 's';

export interface SavedSandbox {
  params: SandboxParams;
  design: SandboxDesign;
}

/** 読み込めないデータのときに投げる（message は画面に出す日本語） */
export class SandboxFormatError extends Error {}

function fail(message: string): never {
  throw new SandboxFormatError(message);
}

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------

/**
 * 小数点以下 6 桁（1 µm）に丸める（ファイル・URL を短くする）。斜面に置いた物体などの位置の丸めで
 * 生じるすき間・重なりは 1 µm 未満なので、読み込んだ配置でも運動は変わらない
 */
function round(v: number): number {
  return Math.round(v * 1e6) / 1e6 + 0;
}

function roundAll<T>(value: T): T {
  if (typeof value === 'number') return round(value) as T;
  if (Array.isArray(value)) return value.map(roundAll) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundAll(v)])) as T;
  }
  return value;
}

export function toSaved(params: SandboxParams, design: SandboxDesign): object {
  return roundAll({
    format: FORMAT,
    version: VERSION,
    params: { g: params.g, mu: params.mu, muk: params.muk, e: params.e },
    bodies: design.bodies,
    fixtures: design.fixtures,
    joints: design.joints,
  });
}

/** JSON 文字列にする（pretty = true ならファイル保存用に整形する） */
export function serialize(params: SandboxParams, design: SandboxDesign, pretty = false): string {
  return JSON.stringify(toSaved(params, design), null, pretty ? 2 : undefined);
}

function toBase64Url(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(bin, (c) => c.charCodeAt(0)),
  );
}

/** URL のハッシュに入れる文字列 */
export function encodeForUrl(params: SandboxParams, design: SandboxDesign): string {
  return toBase64Url(serialize(params, design));
}

// ---------------------------------------------------------------------------
// 読み込み
// ---------------------------------------------------------------------------

export function decodeFromUrl(code: string): SavedSandbox {
  let text: string;
  try {
    text = fromBase64Url(code);
  } catch {
    fail('URL の配置データを読み取れませんでした（URL が途中で切れていないか確かめてください）');
  }
  return parseSandbox(text);
}

export function parseSandbox(text: string): SavedSandbox {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('JSON として読み取れませんでした');
  }
  return validate(raw);
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where} の ${key} が数値ではありません`);
  return v;
}

/** スライダーの範囲に収めた値 */
function ranged<K extends string>(o: Obj, spec: ParamSpec<K>, where: string): number {
  return clamp(num(o, spec.key, where), spec.min, spec.max);
}

function specOf<K extends string>(specs: readonly ParamSpec<K>[], key: K): ParamSpec<K> {
  return specs.find((s) => s.key === key)!;
}

function inWorldX(v: number): number {
  return clamp(v, WORLD.xMin, WORLD.xMax);
}
function inWorldY(v: number): number {
  return clamp(v, WORLD.yMin, WORLD.yMax);
}

function array(o: Obj, key: string): unknown[] {
  const v = o[key] ?? [];
  if (!Array.isArray(v)) fail(`${key} が配列ではありません`);
  return v;
}

const FIXTURE_ID = /^[a-z][a-z0-9]{0,7}$/;

function body(v: unknown, i: number): BodyDef {
  const where = `物体 ${i + 1}`;
  if (!isObj(v)) fail(`${where} の形式が正しくありません`);
  const id = v.id;
  if (typeof id !== 'string' || id.length !== 1 || !BODY_NAMES.includes(id))
    fail(`${where} の名前（id）は ${BODY_NAMES[0]}〜${BODY_NAMES.at(-1)} の 1 文字にしてください`);
  const x = inWorldX(num(v, 'x', where));
  const y = inWorldY(num(v, 'y', where));
  if (v.kind === 'ball') {
    const s = (k: 'm' | 'r' | 'vx' | 'vy') => ranged(v, specOf(BALL_SPECS, k), where);
    return { kind: 'ball', id, x, y, r: s('r'), m: s('m'), vx: s('vx'), vy: s('vy') };
  }
  if (v.kind === 'block') {
    const s = (k: 'm' | 'w' | 'h' | 'angle' | 'vx' | 'vy') =>
      ranged(v, specOf(BLOCK_SPECS, k), where);
    return {
      kind: 'block',
      id,
      x,
      y,
      w: s('w'),
      h: s('h'),
      angle: s('angle'),
      m: s('m'),
      vx: s('vx'),
      vy: s('vy'),
    };
  }
  fail(`${where} の種類（kind）は "ball" か "block" にしてください`);
}

function fixture(v: unknown, i: number): FixtureDef {
  const where = `固定物 ${i + 1}`;
  if (!isObj(v)) fail(`${where} の形式が正しくありません`);
  const id = v.id;
  if (typeof id !== 'string' || !FIXTURE_ID.test(id))
    fail(`${where} の id は英小文字で始まる 8 文字以内の英数字にしてください`);
  const x = inWorldX(num(v, 'x', where));
  const y = inWorldY(num(v, 'y', where));
  switch (v.kind) {
    case 'wall':
      return {
        kind: 'wall',
        id,
        x,
        y,
        w: ranged(v, specOf(WALL_SPECS, 'w'), where),
        h: ranged(v, specOf(WALL_SPECS, 'h'), where),
      };
    case 'incline':
      return {
        kind: 'incline',
        id,
        x,
        y,
        w: ranged(v, specOf(INCLINE_SPECS, 'w'), where),
        angle: ranged(v, specOf(INCLINE_SPECS, 'angle'), where),
        flip: v.flip === true,
      };
    case 'pulley':
      return { kind: 'pulley', id, x, y };
    default:
      fail(`${where} の種類（kind）は "wall"・"incline"・"pulley" のどれかにしてください`);
  }
}

function endpoint(v: unknown, where: string, d: SandboxDesign): Endpoint {
  if (!isObj(v)) fail(`${where} の端の形式が正しくありません`);
  if (typeof v.body === 'string') {
    if (!d.bodies.some((b) => b.id === v.body)) fail(`${where} の端の物体 ${v.body} がありません`);
    return { body: v.body };
  }
  if (typeof v.pulley === 'string') {
    if (!d.fixtures.some((f) => f.kind === 'pulley' && f.id === v.pulley))
      fail(`${where} の端の滑車 ${v.pulley} がありません`);
    return { pulley: v.pulley };
  }
  return { x: inWorldX(num(v, 'x', where)), y: inWorldY(num(v, 'y', where)) };
}

function joint(v: unknown, i: number, d: SandboxDesign): JointDef {
  const where = `糸・ばね ${i + 1}`;
  if (!isObj(v)) fail(`${where} の形式が正しくありません`);
  const id = v.id;
  if (typeof id !== 'string' || !FIXTURE_ID.test(id))
    fail(`${where} の id は英小文字で始まる 8 文字以内の英数字にしてください`);
  const a = endpoint(v.a, where, d);
  const b = endpoint(v.b, where, d);
  if (!('body' in a) && !('body' in b)) fail(`${where} は少なくとも一方の端を物体にしてください`);
  if ('body' in a && 'body' in b && a.body === b.body)
    fail(`${where} の両端が同じ物体になっています`);
  if (v.kind === 'spring') {
    return {
      kind: 'spring',
      id,
      a,
      b,
      k: ranged(v, specOf(SPRING_SPECS, 'k'), where),
      L0: ranged(v, specOf(SPRING_SPECS, 'L0'), where),
    };
  }
  if (v.kind === 'string') {
    const via = v.via ?? null;
    if (via !== null && !d.fixtures.some((f) => f.kind === 'pulley' && f.id === via))
      fail(`${where} をかける滑車 ${String(via)} がありません`);
    return {
      kind: 'string',
      id,
      a,
      b,
      via: via as string | null,
      L: Math.max(0, num(v, 'L', where)),
    };
  }
  fail(`${where} の種類（kind）は "spring" か "string" にしてください`);
}

/** 読み込んだ値を検査して配置に直す */
export function validate(raw: unknown): SavedSandbox {
  if (!isObj(raw) || raw.format !== FORMAT)
    fail('このアプリのサンドボックスで保存したデータではありません');
  if (typeof raw.version !== 'number' || raw.version > VERSION)
    fail('新しいバージョンで保存されたデータのため読み込めません');

  const params = defaultParams(PARAMS);
  if (raw.params !== undefined) {
    if (!isObj(raw.params)) fail('params の形式が正しくありません');
    for (const spec of PARAMS) {
      if (raw.params[spec.key] !== undefined) params[spec.key] = ranged(raw.params, spec, 'params');
    }
  }

  const bodiesRaw = array(raw, 'bodies');
  const fixturesRaw = array(raw, 'fixtures');
  const jointsRaw = array(raw, 'joints');
  if (bodiesRaw.length > BODY_NAMES.length) fail(`物体は ${BODY_NAMES.length} 個までです`);
  if (fixturesRaw.length > MAX_FIXTURES) fail(`固定物は ${MAX_FIXTURES} 個までです`);
  if (jointsRaw.length > MAX_JOINTS) fail(`糸・ばねは ${MAX_JOINTS} 本までです`);

  const design: SandboxDesign = { bodies: [], fixtures: [], joints: [] };
  design.bodies = bodiesRaw.map(body);
  design.fixtures = fixturesRaw.map(fixture);
  design.joints = jointsRaw.map((v, i) => joint(v, i, design));

  const ids = [...design.fixtures, ...design.joints].map((x) => x.id);
  if (new Set(design.bodies.map((b) => b.id)).size !== design.bodies.length)
    fail('同じ名前の物体があります');
  if (new Set(ids).size !== ids.length) fail('同じ id の部品があります');
  return { params, design };
}
