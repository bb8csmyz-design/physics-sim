import { describe, expect, it } from 'vitest';
import {
  RECENT_LENGTH,
  accuracy,
  addResult,
  emptyRecords,
  parseRecords,
  totals,
  unitStatus,
  weakUnits,
  type PracticeRecords,
} from './practiceRecords';

function play(results: [string, boolean][], base = emptyRecords()): PracticeRecords {
  return results.reduce((r, [key, ok], i) => addResult(r, key, 'p', ok, i), base);
}

describe('成績の記録', () => {
  it('解答数・正答数をパターンごと・単元ごとに数える', () => {
    let r = emptyRecords();
    r = addResult(r, 'a/x', 'p1', true, 1);
    r = addResult(r, 'a/x', 'p2', false, 2);
    r = addResult(r, 'a/x', 'p1', true, 3);
    const u = r.units['a/x']!;
    expect(u).toMatchObject({ attempts: 3, correct: 2, lastAt: 3 });
    expect(u.templates).toEqual({
      p1: { attempts: 2, correct: 2 },
      p2: { attempts: 1, correct: 0 },
    });
    expect(u.recent).toEqual([true, false, true]);
    expect(accuracy(u)).toBeCloseTo(2 / 3, 12);
    expect(totals(r)).toEqual({ attempts: 3, correct: 2 });
  });

  it('元の記録は変更しない', () => {
    const r0 = emptyRecords();
    addResult(r0, 'a/x', 'p', true, 0);
    expect(r0.units).toEqual({});
  });

  it(`直近の正誤は ${RECENT_LENGTH} 件まで`, () => {
    const r = play(Array.from({ length: 25 }, (_, i) => ['a/x', i % 2 === 0] as [string, boolean]));
    expect(r.units['a/x']!.recent).toHaveLength(RECENT_LENGTH);
    expect(r.units['a/x']!.attempts).toBe(25);
  });
});

describe('苦手の判定', () => {
  it('解答が少ないうちは苦手と判定しない', () => {
    expect(unitStatus(undefined)).toBe('untried');
    const r = play([
      ['a/x', false],
      ['a/x', false],
    ]);
    expect(unitStatus(r.units['a/x'])).toBe('learning');
  });

  it('正答率が低い単元は苦手、高い単元は得意', () => {
    const r = play([
      ...Array.from({ length: 5 }, () => ['a/weak', false] as [string, boolean]),
      ...Array.from({ length: 5 }, () => ['a/good', true] as [string, boolean]),
    ]);
    expect(unitStatus(r.units['a/weak'])).toBe('weak');
    expect(unitStatus(r.units['a/good'])).toBe('good');
    expect(weakUnits(r)).toEqual(['a/weak']);
  });

  it('苦手な単元は苦手度の高い順に並ぶ', () => {
    const r = play([
      ['a/x', false],
      ['a/x', false],
      ['a/x', true],
      ['a/x', false],
      ['a/y', false],
      ['a/y', false],
      ['a/y', false],
      ['a/y', false],
    ]);
    expect(weakUnits(r)).toEqual(['a/y', 'a/x']);
  });

  it('最近正解が続けば苦手から外れる', () => {
    const wrong = Array.from({ length: 6 }, () => ['a/x', false] as [string, boolean]);
    const right = Array.from({ length: 10 }, () => ['a/x', true] as [string, boolean]);
    expect(unitStatus(play(wrong).units['a/x'])).toBe('weak');
    expect(unitStatus(play([...wrong, ...right]).units['a/x'])).not.toBe('weak');
  });
});

describe('保存形式', () => {
  it('JSON で往復できる', () => {
    const r = play([
      ['a/x', true],
      ['b/y', false],
    ]);
    expect(parseRecords(JSON.stringify(r))).toEqual(r);
  });

  it('壊れたデータは読み飛ばす', () => {
    expect(parseRecords(null)).toEqual(emptyRecords());
    expect(parseRecords('{')).toEqual(emptyRecords());
    expect(parseRecords('{"version":99,"units":{}}')).toEqual(emptyRecords());
    const r = parseRecords(
      JSON.stringify({
        version: 1,
        units: {
          ok: {
            attempts: 2,
            correct: 1,
            templates: { p: { attempts: 2, correct: 1 }, bad: 3 },
            recent: [true, 'x'],
          },
          bad: { attempts: 1, correct: 2 },
        },
      }),
    );
    expect(Object.keys(r.units)).toEqual(['ok']);
    expect(r.units.ok!.templates).toEqual({ p: { attempts: 2, correct: 1 } });
    expect(r.units.ok!.recent).toEqual([true]);
    expect(r.units.ok!.lastAt).toBe(0);
  });
});
