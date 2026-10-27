/**
 * 配置の保存・読み込み（JSON・URL）のテスト。
 */
import { describe, expect, it } from 'vitest';
import { compile, energies, initialState, step, DT } from './model';
import { presets } from './presets';
import {
  FORMAT,
  SandboxFormatError,
  decodeFromUrl,
  encodeForUrl,
  parseSandbox,
  serialize,
  toSaved,
} from './storage';

/** 保存は 1 µm（小数点以下 6 桁）に丸める */
const ROUND = 5e-7;

function expectClose(actual: unknown, expected: unknown, path = ''): void {
  if (typeof expected === 'number') {
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(ROUND);
  } else if (Array.isArray(expected)) {
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((v, i) => expectClose((actual as unknown[])[i], v, `${path}[${i}]`));
  } else if (expected && typeof expected === 'object') {
    for (const [k, v] of Object.entries(expected)) {
      expectClose((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}

describe('JSON', () => {
  it('すべてのサンプルが保存 → 読み込みで同じ配置・パラメータに戻る', () => {
    for (const pr of presets()) {
      const loaded = parseSandbox(serialize(pr.params, pr.design, true));
      expectClose(loaded.params, pr.params, pr.id);
      expectClose(loaded.design, pr.design, pr.id);
    }
  });

  it('読み込んだ配置でも同じ運動になる（丸めの影響は 0.5 s 後の位置で 0.01 mm 未満）', () => {
    for (const pr of presets()) {
      const loaded = parseSandbox(serialize(pr.params, pr.design));
      const w1 = compile(pr.design, pr.params);
      const w2 = compile(loaded.design, loaded.params);
      let s1 = initialState(w1);
      let s2 = initialState(w2);
      for (let i = 0; i < 0.5 / DT; i++) {
        s1 = step(w1, s1, DT);
        s2 = step(w2, s2, DT);
      }
      s1.x.forEach((x, i) => expect(Math.abs(x - s2.x[i]!), pr.id).toBeLessThan(1e-5));
      const e1 = energies(w1, s1).budget;
      expect(Math.abs(e1 - energies(w2, s2).budget), pr.id).toBeLessThan(1e-4 * Math.max(1, e1));
    }
  });

  it('形式の名前とバージョンを書き出す', () => {
    const pr = presets()[0]!;
    const saved = toSaved(pr.params, pr.design) as Record<string, unknown>;
    expect(saved.format).toBe(FORMAT);
    expect(saved.version).toBe(1);
  });
});

describe('URL', () => {
  it('URL に使える文字（base64url）だけで、デコードすると元に戻る', () => {
    for (const pr of presets()) {
      const code = encodeForUrl(pr.params, pr.design);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      // 共有しやすい長さ（サンプルは 2000 文字未満）
      expect(code.length).toBeLessThan(2000);
      const loaded = decodeFromUrl(code);
      expectClose(loaded.design, pr.design, pr.id);
    }
  });

  it('壊れた URL は日本語のエラーになる', () => {
    expect(() => decodeFromUrl('***')).toThrow(SandboxFormatError);
    expect(() => decodeFromUrl('YWJj')).toThrow(/JSON/); // "abc"
  });
});

describe('読み込み時の検査', () => {
  const base = () => ({
    format: FORMAT,
    version: 1,
    params: { g: 9.8, mu: 0.3, muk: 0.2, e: 0.5 },
    bodies: [{ kind: 'ball', id: 'A', x: 1, y: 1, r: 0.1, m: 1, vx: 0, vy: 0 }] as unknown[],
    fixtures: [{ kind: 'pulley', id: 'p1', x: 2, y: 2 }] as unknown[],
    joints: [] as unknown[],
  });
  const load = (o: unknown) => parseSandbox(JSON.stringify(o));

  it('JSON でない・別のデータ・新しいバージョンは読み込まない', () => {
    expect(() => parseSandbox('{')).toThrow(SandboxFormatError);
    expect(() => load({ ...base(), format: 'other' })).toThrow(/サンドボックス/);
    expect(() => load({ ...base(), version: 2 })).toThrow(/バージョン/);
  });

  it('範囲外の数値は UI で選べる範囲に収める（物理が破綻しないように）', () => {
    const o = base();
    o.params = { g: 100, mu: -1, muk: 0.2, e: 3 };
    o.bodies = [{ kind: 'ball', id: 'A', x: 100, y: -5, r: 9, m: 1e6, vx: -99, vy: 0 }];
    const { params, design } = load(o);
    expect(params).toEqual({ g: 20, mu: 0, muk: 0.2, e: 1 });
    expect(design.bodies[0]).toMatchObject({ x: 6.4, y: -0.2, r: 0.5, m: 10, vx: -10 });
  });

  it('型や参照が正しくなければ、理由を日本語で示して読み込まない', () => {
    const bad = (patch: (o: ReturnType<typeof base>) => void, msg: RegExp) => {
      const o = base();
      patch(o);
      expect(() => load(o)).toThrow(msg);
    };
    bad((o) => (o.bodies = [{ kind: 'cube', id: 'A', x: 1, y: 1 }]), /種類/);
    bad(
      (o) => (o.bodies = [{ kind: 'ball', id: 'Z', x: 1, y: 1, r: 0.1, m: 1, vx: 0, vy: 0 }]),
      /名前/,
    );
    bad((o) => (o.bodies = [{ kind: 'ball', id: 'A', x: '1', y: 1 }]), /数値/);
    bad((o) => o.bodies.push(o.bodies[0]), /同じ名前/);
    bad(
      (o) =>
        (o.joints = [
          { kind: 'string', id: 'c1', a: { body: 'B' }, b: { x: 1, y: 2 }, via: null, L: 1 },
        ]),
      /物体 B がありません/,
    );
    bad(
      (o) =>
        (o.joints = [
          { kind: 'string', id: 'c1', a: { body: 'A' }, b: { x: 1, y: 2 }, via: 'p9', L: 1 },
        ]),
      /滑車 p9 がありません/,
    );
    bad(
      (o) =>
        (o.joints = [
          { kind: 'spring', id: 's1', a: { x: 0, y: 0 }, b: { x: 1, y: 2 }, k: 1, L0: 1 },
        ]),
      /物体にしてください/,
    );
    bad((o) => (o.fixtures = [{ kind: 'pulley', id: 'P!', x: 1, y: 1 }]), /id/);
  });

  it('省略したパラメータは既定値になり、物体がなくても読み込める', () => {
    const { params, design } = load({ format: FORMAT, version: 1 });
    expect(params.g).toBe(9.8);
    expect(design).toEqual({ bodies: [], fixtures: [], joints: [] });
  });
});
