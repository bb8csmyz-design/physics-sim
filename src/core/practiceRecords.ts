/**
 * 演習の成績の記録（端末内の localStorage に保存。サーバーには送らない）。
 *
 * 単元ごと・出題パターンごとに解答数と正答数、単元ごとに直近の正誤を持つ。
 * 記録の計算（集計・苦手の判定）は純粋関数にしてテストする。保存・読み込みは失敗しても動くようにする
 * （プライベートモードやストレージの無効化で localStorage が使えないことがある）。
 */

export const RECORDS_STORAGE_KEY = 'physics-sim:practice';
const VERSION = 1;
/** 単元ごとに残す直近の正誤の数 */
export const RECENT_LENGTH = 10;
/** 苦手かどうかを判定するのに必要な解答数 */
export const WEAK_MIN_ATTEMPTS = 3;
/** 正答率（補正後）がこれ未満なら苦手とする */
export const WEAK_THRESHOLD = 0.6;

export interface Tally {
  attempts: number;
  correct: number;
}

export interface UnitRecord extends Tally {
  /** 出題パターン（ExerciseTemplate.id）ごとの集計 */
  templates: Record<string, Tally>;
  /** 直近の正誤（古い順、最大 RECENT_LENGTH 件） */
  recent: boolean[];
  /** 最後に解いた時刻（ms） */
  lastAt: number;
}

export interface PracticeRecords {
  version: typeof VERSION;
  /** キーは '<分野>/<単元>'（例: 'mechanics/spring-oscillation'） */
  units: Record<string, UnitRecord>;
}

export function emptyRecords(): PracticeRecords {
  return { version: VERSION, units: {} };
}

export function unitKey(field: string, slug: string): string {
  return `${field}/${slug}`;
}

/** 1 問の結果を加えた新しい記録を返す（元の記録は変えない） */
export function addResult(
  records: PracticeRecords,
  key: string,
  templateId: string,
  correct: boolean,
  now: number,
): PracticeRecords {
  const prev = records.units[key];
  const tPrev = prev?.templates[templateId] ?? { attempts: 0, correct: 0 };
  const inc = correct ? 1 : 0;
  const unit: UnitRecord = {
    attempts: (prev?.attempts ?? 0) + 1,
    correct: (prev?.correct ?? 0) + inc,
    templates: {
      ...prev?.templates,
      [templateId]: { attempts: tPrev.attempts + 1, correct: tPrev.correct + inc },
    },
    recent: [...(prev?.recent ?? []), correct].slice(-RECENT_LENGTH),
    lastAt: now,
  };
  return { ...records, units: { ...records.units, [key]: unit } };
}

/** 正答率（解答がなければ null） */
export function accuracy(t: Tally | undefined): number | null {
  return t && t.attempts > 0 ? t.correct / t.attempts : null;
}

/**
 * 苦手度の判定に使う正答率。直近の結果を重く見るため、通算と直近の正答率の平均をとり、
 * 解答数が少ないときに極端な値にならないよう (正答 + 1)/(解答 + 2) で補正する。
 */
export function masteryScore(r: UnitRecord): number {
  const total = (r.correct + 1) / (r.attempts + 2);
  const recentCorrect = r.recent.filter(Boolean).length;
  const recent = (recentCorrect + 1) / (r.recent.length + 2);
  return (total + recent) / 2;
}

export type UnitStatus = 'untried' | 'learning' | 'weak' | 'good';

/** 単元の状態: 未挑戦 / 練習中（解答が少ない）/ 苦手 / 得意 */
export function unitStatus(r: UnitRecord | undefined): UnitStatus {
  if (!r || r.attempts === 0) return 'untried';
  if (r.attempts < WEAK_MIN_ATTEMPTS) return 'learning';
  const score = masteryScore(r);
  if (score < WEAK_THRESHOLD) return 'weak';
  return score >= 0.75 ? 'good' : 'learning';
}

/** 苦手な単元のキー（苦手度の高い順） */
export function weakUnits(records: PracticeRecords): string[] {
  return Object.entries(records.units)
    .filter(([, r]) => unitStatus(r) === 'weak')
    .sort(([, a], [, b]) => masteryScore(a) - masteryScore(b))
    .map(([k]) => k);
}

/** 全体の集計 */
export function totals(records: PracticeRecords): Tally {
  let attempts = 0;
  let correct = 0;
  for (const r of Object.values(records.units)) {
    attempts += r.attempts;
    correct += r.correct;
  }
  return { attempts, correct };
}

// ---------------------------------------------------------------------------
// 保存と読み込み

function isTally(x: unknown): x is Tally {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  return (
    Number.isInteger(t.attempts) &&
    Number.isInteger(t.correct) &&
    (t.attempts as number) >= 0 &&
    (t.correct as number) >= 0 &&
    (t.correct as number) <= (t.attempts as number)
  );
}

/** JSON から記録を復元する。壊れた項目は読み飛ばす */
export function parseRecords(text: string | null): PracticeRecords {
  if (!text) return emptyRecords();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyRecords();
  }
  if (typeof raw !== 'object' || raw === null) return emptyRecords();
  const obj = raw as Record<string, unknown>;
  if (obj.version !== VERSION || typeof obj.units !== 'object' || obj.units === null) {
    return emptyRecords();
  }
  const units: Record<string, UnitRecord> = {};
  for (const [key, value] of Object.entries(obj.units as Record<string, unknown>)) {
    if (!isTally(value)) continue;
    const v = value as unknown as Record<string, unknown>;
    const templates: Record<string, Tally> = {};
    if (typeof v.templates === 'object' && v.templates !== null) {
      for (const [id, t] of Object.entries(v.templates as Record<string, unknown>)) {
        if (isTally(t)) templates[id] = { attempts: t.attempts, correct: t.correct };
      }
    }
    const recent = Array.isArray(v.recent)
      ? v.recent.filter((b): b is boolean => typeof b === 'boolean').slice(-RECENT_LENGTH)
      : [];
    units[key] = {
      attempts: value.attempts,
      correct: value.correct,
      templates,
      recent,
      lastAt: typeof v.lastAt === 'number' && Number.isFinite(v.lastAt) ? v.lastAt : 0,
    };
  }
  return { version: VERSION, units };
}

/** 端末に保存された記録を読む（読めなければ空の記録） */
export function loadRecords(): PracticeRecords {
  try {
    return parseRecords(localStorage.getItem(RECORDS_STORAGE_KEY));
  } catch {
    return emptyRecords();
  }
}

/** 記録を保存する。保存できなかったら false */
export function saveRecords(records: PracticeRecords): boolean {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/** 1 問の結果を記録して保存する。保存できなかったら false */
export function recordResult(key: string, templateId: string, correct: boolean): boolean {
  return saveRecords(addResult(loadRecords(), key, templateId, correct, Date.now()));
}

export function clearRecords(): void {
  try {
    localStorage.removeItem(RECORDS_STORAGE_KEY);
  } catch {
    // 保存できない環境では消すものもない
  }
}
