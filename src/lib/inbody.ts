import type { DateKey } from './dates';
import type { BodyEntry, BodyValue } from './types';

/** The 45 InBody columns, in file order, spelled exactly as the export writes them. */
export const INBODY_COLUMNS = [
  'Date',
  'Measurement device.',
  'Weight(kg)',
  'Skeletal Muscle Mass(kg)',
  'Soft Lean Mass(kg)',
  'Body Fat Mass(kg)',
  'BMI(kg/m²)',
  'Percent Body Fat(%)',
  'Basal Metabolic Rate(kcal)',
  'InBody Age',
  'InBody Score',
  'Right Arm Lean Mass(kg)',
  'Left Arm Lean Mass(kg)',
  'Trunk Lean Mass(kg)',
  'Right Leg Lean Mass(kg)',
  'Left leg Lean Mass(kg)',
  'Right Arm Fat Mass(kg)',
  'Left Arm Fat Mass(kg)',
  'Trunk Fat Mass(kg)',
  'Right Leg Fat Mass(kg)',
  'Left Leg Fat Mass(kg)',
  'Right Arm ECW Ratio',
  'Left Arm ECW Ratio',
  'Trunk ECW Ratio',
  'Right Leg ECW Ratio',
  'Left Leg ECW Ratio',
  'Waist Hip Ratio',
  'Waist Circumference(cm)',
  'Visceral Fat Area(cm²)',
  'Visceral Fat Level(Level)',
  'Total Body Water(L)',
  'Intracellular Water(L)',
  'Extracellular Water(L)',
  'ECW Ratio',
  'Upper-Lower',
  'Upper',
  'Lower',
  'Leg Muscle Level(Level)',
  'Leg Lean Mass(kg)',
  'Protein(kg)',
  'Mineral(kg)',
  'Bone Mineral Content(kg)',
  'Body Cell Mass(kg)',
  'SMI(kg/m²)',
  'Whole Body Phase Angle(°)',
] as const;

export type InbodyColumn = (typeof INBODY_COLUMNS)[number];
export const DEVICE_COLUMN: InbodyColumn = 'Measurement device.';
/** Text columns; everything else (except Date) is numeric. */
const TEXT_COLUMNS = new Set<string>([DEVICE_COLUMN]);

/** Metrics charted on the Body screen. */
export const KEY_METRICS = [
  'Weight(kg)',
  'Skeletal Muscle Mass(kg)',
  'Body Fat Mass(kg)',
  'Percent Body Fat(%)',
  'Visceral Fat Level(Level)',
  'InBody Score',
] as const satisfies readonly InbodyColumn[];

export function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const CANONICAL = new Map(INBODY_COLUMNS.map((c) => [normalizeHeader(c), c] as const));

/**
 * RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and newlines
 * inside quotes, CRLF / LF / CR line endings, and a leading BOM.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines (including the trailing one).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** "20261004085416" → local Date, or null when invalid. */
export function parseTimestamp(ts: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    h > 23 ||
    mi > 59 ||
    s > 59
  )
    return null;
  return date;
}

/** Date key straight from the digits (no timezone conversion). */
export function timestampToKey(ts: string): DateKey {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

export function makeTimestamp(date: DateKey, time = '00:00:00'): string {
  const [h = '00', mi = '00', s = '00'] = time.split(':');
  return date.replace(/-/g, '') + h.padStart(2, '0') + mi.padStart(2, '0') + s.padStart(2, '0');
}

export function timestampTime(ts: string): string {
  return `${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}`;
}

export function parseValue(column: string, raw: string): { value: BodyValue; bad: boolean } {
  const t = raw.trim();
  if (t === '-' || t === '') return { value: null, bad: false };
  if (TEXT_COLUMNS.has(column)) return { value: t, bad: false };
  const num = Number(t);
  if (!Number.isFinite(num)) return { value: null, bad: true };
  return { value: num, bad: false };
}

export interface ParsedRow {
  line: number;
  ts: string;
  date: DateKey;
  values: Record<string, BodyValue>;
  /** Original text of numeric cells whose formatting differs from String(value), e.g. "26.0". */
  raw: Record<string, string>;
  extra: Record<string, string>;
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  unknownColumns: string[];
  missingColumns: string[];
  /** Rows that could not be read at all. */
  errors: { line: number; message: string }[];
  /** Timestamps that appear more than once in the file. */
  duplicateInFile: string[];
}

export class CsvFormatError extends Error {}

export function parseInbodyCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (!table.length) throw new CsvFormatError('empty');
  const header = table[0];
  const mapped = header.map((h) => CANONICAL.get(normalizeHeader(h)) ?? null);
  const dateIdx = mapped.indexOf('Date');
  if (dateIdx < 0) throw new CsvFormatError('noDate');

  const unknownColumns = header.filter((_, i) => mapped[i] === null).map((h) => h.trim()).filter(Boolean);
  const present = new Set(mapped.filter(Boolean));
  const missingColumns = INBODY_COLUMNS.filter((c) => !present.has(c));

  const rows: ParsedRow[] = [];
  const errors: ParseResult['errors'] = [];
  const seen = new Map<string, number>();
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const line = r + 1;
    const ts = (cells[dateIdx] ?? '').trim();
    if (!parseTimestamp(ts)) {
      errors.push({ line, message: 'badDate' });
      continue;
    }
    const values: Record<string, BodyValue> = {};
    for (const c of INBODY_COLUMNS) if (c !== 'Date') values[c] = null;
    const extra: Record<string, string> = {};
    const rawText: Record<string, string> = {};
    const warnings: string[] = [];
    header.forEach((h, i) => {
      const col = mapped[i];
      const raw = cells[i] ?? '';
      if (col === 'Date') return;
      if (!col) {
        if (h.trim()) extra[h.trim()] = raw;
        return;
      }
      const { value, bad } = parseValue(col, raw);
      if (bad) warnings.push(col);
      values[col] = value;
      if (typeof value === 'number' && String(value) !== raw.trim()) rawText[col] = raw.trim();
    });
    seen.set(ts, (seen.get(ts) ?? 0) + 1);
    rows.push({ line, ts, date: timestampToKey(ts), values, raw: rawText, extra, warnings });
  }
  const duplicateInFile = [...seen].filter(([, n]) => n > 1).map(([ts]) => ts);
  return { rows, unknownColumns, missingColumns, errors, duplicateInFile };
}

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function formatValue(v: BodyValue, raw?: string): string {
  if (v === null || v === undefined || v === '') return '-';
  // Keep the file's own number formatting ("9.0") when the value is unchanged.
  if (typeof v === 'number' && raw !== undefined && Number(raw) === v) return raw;
  return String(v);
}

/** Writes entries back in the exact InBody format (same headers, timestamps, "-" for empty). */
export function exportInbodyCsv(entries: BodyEntry[]): string {
  const lines = [INBODY_COLUMNS.map(csvField).join(',')];
  const sorted = [...entries].sort((a, b) => (a.ts < b.ts ? -1 : 1));
  for (const e of sorted) {
    lines.push(
      INBODY_COLUMNS.map((c) => (c === 'Date' ? e.ts : csvField(formatValue(e.values[c] ?? null, e.raw?.[c])))).join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

export type ImportStatus = 'new' | 'same' | 'conflict' | 'fileDuplicate';

export interface ImportPlanRow extends ParsedRow {
  status: ImportStatus;
}

function sameValues(a: Record<string, BodyValue>, b: Record<string, BodyValue>): boolean {
  return INBODY_COLUMNS.every((c) => c === 'Date' || (a[c] ?? null) === (b[c] ?? null));
}

/**
 * Classifies each parsed row against what is stored. Only "new" rows are saved
 * by default; existing rows are never overwritten silently.
 */
export function planImport(parsed: ParseResult, existing: Map<string, BodyEntry>): ImportPlanRow[] {
  const firstSeen = new Set<string>();
  return parsed.rows.map((row) => {
    let status: ImportStatus;
    if (firstSeen.has(row.ts)) status = 'fileDuplicate';
    else {
      const ex = existing.get(row.ts);
      status = !ex ? 'new' : sameValues(ex.values, row.values) ? 'same' : 'conflict';
    }
    firstSeen.add(row.ts);
    return { ...row, status };
  });
}

export function rowToEntry(row: ParsedRow): BodyEntry {
  const e: BodyEntry = { ts: row.ts, date: row.date, values: row.values, source: 'csv' };
  if (Object.keys(row.raw).length) e.raw = row.raw;
  if (Object.keys(row.extra).length) e.extra = row.extra;
  return e;
}
