import { en, type Messages } from './en';

export type MessageKey = keyof Messages;

/** Locale used for Intl formatting. en-GB gives dd/mm/yyyy dates. */
export const LOCALE = 'en-GB';

const dict: Messages = en;

/** t('timer.ends', { label: 'Rest' }) — "{name}" placeholders are replaced from params. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s: string = dict[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
  return s;
}

/** Simple plural: picks `${key}.one` or `${key}.other`. */
export function tn(key: string, count: number, params?: Record<string, string | number>): string {
  const rule = pluralRules.select(count) === 'one' ? 'one' : 'other';
  return t(`${key}.${rule}` as MessageKey, { count: fmtInt(count), ...params });
}

const pluralRules = new Intl.PluralRules(LOCALE);
const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
export const fmtInt = (n: number) => intFmt.format(n);

export { fmtSet, fmtDate, fmtDayShort, fmtWeekday, fmtNum, fmtKg, fmtSigned, fmtDuration, fmtPct, fmtMonth, fmtTime } from './format';
