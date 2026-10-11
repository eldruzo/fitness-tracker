import {
  sanitizeBody,
  sanitizeCounters,
  sanitizeHints,
  sanitizeLog,
  sanitizeOverride,
  sanitizeProgram,
  sanitizeSettings,
} from './validate';
import type { BodyEntry, Counters, DayLog, DayOverride, HintState, Program, Settings } from './types';

export const BACKUP_APP = 'gym-log';
/** Bump when the backup shape changes; add a step to MIGRATIONS. */
export const BACKUP_FORMAT = 1;

export interface BackupData {
  program: Program;
  settings: Settings;
  days: DayLog[];
  overrides: DayOverride[];
  body: BodyEntry[];
  counters: Counters[];
  hints: HintState;
}

export interface Backup {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  data: BackupData;
}

/** format N → N+1. Each step receives the raw `data` object and returns the next shape. */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (d) => ({ ...d, newField: [] }),
};

export function makeBackup(data: BackupData, now = new Date()): Backup {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: now.toISOString(), data };
}

export class BackupError extends Error {
  constructor(public code: 'notJson' | 'notBackup' | 'tooNew') {
    super(code);
  }
}

export interface ParsedBackup {
  data: BackupData;
  exportedAt: string | null;
  /** records dropped because they failed validation */
  dropped: number;
}

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('notJson');
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== BACKUP_APP) throw new BackupError('notBackup');
  const r = raw as { format?: unknown; exportedAt?: unknown; data?: unknown };
  let format = typeof r.format === 'number' ? r.format : 0;
  if (format > BACKUP_FORMAT) throw new BackupError('tooNew');
  let data = (typeof r.data === 'object' && r.data ? r.data : {}) as Record<string, unknown>;
  while (format < BACKUP_FORMAT) {
    const step = MIGRATIONS[format];
    if (step) data = step(data);
    format++;
  }
  let dropped = 0;
  const list = <T>(v: unknown, fn: (x: unknown) => T | null): T[] => {
    if (!Array.isArray(v)) return [];
    const out: T[] = [];
    for (const x of v) {
      const s = fn(x);
      if (s) out.push(s);
      else dropped++;
    }
    return out;
  };
  return {
    data: {
      program: sanitizeProgram(data.program),
      settings: sanitizeSettings(data.settings),
      days: list(data.days, sanitizeLog),
      overrides: list(data.overrides, sanitizeOverride),
      body: list(data.body, sanitizeBody),
      counters: list(data.counters, sanitizeCounters),
      hints: sanitizeHints(data.hints),
    },
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : null,
    dropped,
  };
}

/** Merge keeps every existing record and adds only what is missing. */
export function mergeBackup(current: BackupData, incoming: BackupData): BackupData {
  const by = <T, K>(cur: T[], inc: T[], key: (x: T) => K) => {
    const have = new Set(cur.map(key));
    return [...cur, ...inc.filter((x) => !have.has(key(x)))];
  };
  return {
    program: current.program,
    settings: current.settings,
    days: by(current.days, incoming.days, (d) => d.date),
    overrides: by(current.overrides, incoming.overrides, (o) => o.date),
    body: by(current.body, incoming.body, (b) => b.ts),
    counters: by(current.counters, incoming.counters, (c) => c.date),
    hints: current.hints,
  };
}

export function backupFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `gym-log-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
