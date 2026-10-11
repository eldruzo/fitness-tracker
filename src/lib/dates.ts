/**
 * Calendar dates are handled as local "YYYY-MM-DD" keys. All arithmetic runs on
 * the UTC representation of the key, so DST changes and device timezone changes
 * can never produce 23/25-hour days or off-by-one errors.
 */
export type DateKey = string;

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(k: unknown): k is DateKey {
  if (typeof k !== 'string') return false;
  const m = KEY_RE.exec(k);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local calendar date of a Date instant, in the device's current timezone. */
export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

function parts(k: DateKey): [number, number, number] {
  const m = KEY_RE.exec(k);
  if (!m) throw new Error(`Invalid date key: ${k}`);
  return [+m[1], +m[2], +m[3]];
}

function utc(k: DateKey): number {
  const [y, m, d] = parts(k);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(t: number): DateKey {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local midnight of the key, as a Date (for Intl formatting). */
export function keyToDate(k: DateKey): Date {
  const [y, m, d] = parts(k);
  return new Date(y, m - 1, d, 12); // noon avoids DST-edge surprises when formatting
}

export function addDays(k: DateKey, n: number): DateKey {
  return fromUtc(utc(k) + n * 86_400_000);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export function weekday(k: DateKey): Weekday {
  return new Date(utc(k)).getUTCDay() as Weekday;
}

export function eachDay(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

export function minKey(a: DateKey, b: DateKey): DateKey {
  return a < b ? a : b;
}
export function maxKey(a: DateKey, b: DateKey): DateKey {
  return a > b ? a : b;
}

/** Monday of the week containing k. */
export function startOfWeek(k: DateKey): DateKey {
  const wd = weekday(k);
  return addDays(k, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(k: DateKey): DateKey {
  return k.slice(0, 8) + '01';
}

export function addMonths(k: DateKey, n: number): DateKey {
  const [y, m] = parts(k);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUtc(t.getTime());
}

export function inRange(k: DateKey, start: DateKey, end: DateKey): boolean {
  return k >= start && k <= end;
}

/** "dd/mm/yyyy" → DateKey, or null. */
export function parseDisplayDate(s: string): DateKey | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s);
  if (!m) return null;
  const k = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return isDateKey(k) ? k : null;
}
