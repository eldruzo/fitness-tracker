import { keyToDate, type DateKey } from '../lib/dates';

const LOCALE = 'en-GB';

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayMonthFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' });
const wdShort = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const wdLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

/** dd/mm/yyyy */
export function fmtDate(k: DateKey | Date): string {
  return dateFmt.format(typeof k === 'string' ? keyToDate(k) : k);
}

/** "Thu 08/10" */
export function fmtDayShort(k: DateKey): string {
  const d = keyToDate(k);
  return `${wdShort.format(d)} ${dayMonthFmt.format(d)}`;
}

export function fmtWeekday(k: DateKey, style: 'short' | 'long' = 'long'): string {
  return (style === 'short' ? wdShort : wdLong).format(keyToDate(k));
}

export function fmtMonth(k: DateKey): string {
  return monthFmt.format(keyToDate(k));
}

export function fmtTime(d: Date): string {
  return timeFmt.format(d);
}

const numFmts = new Map<string, Intl.NumberFormat>();
export function fmtNum(n: number, maxDigits = 1, minDigits = 0): string {
  const key = `${maxDigits}:${minDigits}`;
  let f = numFmts.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits });
    numFmts.set(key, f);
  }
  return f.format(n);
}

export function fmtKg(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : `${fmtNum(n, 2)} kg`;
}

/** One logged set: "5 kg × 12", or "12 reps" for bodyweight. */
export function fmtSet(bodyweight: boolean, kg: number | null, reps: number): string {
  return bodyweight || kg === null ? `${reps} reps` : `${fmtKg(kg)} × ${reps}`;
}

/** "+2.5", "−1", "0" — uses a real minus sign. */
export function fmtSigned(n: number, digits = 1): string {
  if (n === 0) return fmtNum(0, digits);
  return (n > 0 ? '+' : '−') + fmtNum(Math.abs(n), digits);
}

export function fmtPct(n: number): string {
  return `${fmtNum(n, 0)}%`;
}

/** 185000 → "3:05"; negative values clamp to 0:00 */
export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
