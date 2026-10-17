import { isDateKey } from './dates';
import { defaultSettings, seedProgram } from './program';
import type {
  Accent,
  BodyEntry,
  Counters,
  DayLog,
  DayOverride,
  HintState,
  LogStatus,
  MoveLog,
  MoveTemplate,
  MuscleGroup,
  Program,
  Settings,
  SetLog,
} from './types';

/** Defensive readers: storage may be corrupted or hand-edited. Bad records are dropped, never thrown. */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

export const ACCENTS: Accent[] = ['orange', 'blue', 'teal', 'purple', 'pink'];

export const KG_MIN = 0;
export const KG_MAX = 500;
export const REPS_MIN = 0;
export const REPS_MAX = 100;

export function validKg(v: unknown): number | null {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.replace(',', '.'))) : v;
  const r = num(n, KG_MIN, KG_MAX);
  return r === null ? null : Math.round(r * 100) / 100;
}

export function validReps(v: unknown): number | null {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : v;
  const r = num(n, REPS_MIN, REPS_MAX);
  return r !== null && Number.isInteger(r) ? r : null;
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const bool = (k: keyof Settings) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : (d[k] as boolean));
  const pauses = Array.isArray(raw.pauses)
    ? raw.pauses.filter(
        (p): p is Settings['pauses'][number] =>
          isObj(p) && typeof p.id === 'string' && isDateKey(p.start) && isDateKey(p.end) && p.start <= p.end,
      )
    : [];
  return {
    deload: bool('deload'),
    deloadPct: num(raw.deloadPct, 30, 100) ?? d.deloadPct,
    theme: raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : d.theme,
    accent: ACCENTS.includes(raw.accent as Accent) ? (raw.accent as Accent) : d.accent,
    unit: 'kg',
    hints: bool('hints'),
    progression: bool('progression'),
    progressionStepKg: num(raw.progressionStepKg, 0.5, 20) ?? d.progressionStepKg,
    shiftPlan: bool('shiftPlan'),
    counters: bool('counters'),
    counterTarget: num(raw.counterTarget, 5, 1000) ?? d.counterTarget,
    sound: bool('sound'),
    vibrate: bool('vibrate'),
    autoStart: bool('autoStart'),
    pauses,
  };
}

function sanitizeMove(m: unknown): MoveTemplate | null {
  if (!isObj(m) || typeof m.name !== 'string' || !m.name.trim()) return null;
  return { name: m.name.trim().slice(0, 80), bodyweight: m.bodyweight === true };
}

export function sanitizeProgram(raw: unknown): Program {
  const seed = seedProgram();
  if (!isObj(raw)) return seed;
  try {
    if (!isDateKey(raw.startDate) || !isDateKey(raw.endDate) || raw.startDate > raw.endDate) return seed;
    if (!Array.isArray(raw.phases) || !raw.phases.length) return seed;
    const phases = raw.phases.map((p) => {
      if (!isObj(p) || typeof p.id !== 'string' || !isDateKey(p.start) || !isDateKey(p.end)) throw 0;
      return { id: p.id, name: typeof p.name === 'string' ? p.name : p.id, start: p.start, end: p.end };
    });
    if (!Array.isArray(raw.weekdays) || raw.weekdays.length !== 7) return seed;
    const weekdays = raw.weekdays.map((w, i) => {
      if (!isObj(w)) return seed.weekdays[i];
      return {
        focus: typeof w.focus === 'string' ? w.focus : seed.weekdays[i].focus,
        intensity: typeof w.intensity === 'string' ? w.intensity : '',
        rest: w.rest === true,
        groups: Array.isArray(w.groups)
          ? (w.groups.filter((g) => ['push', 'pull', 'hinge', 'arms', 'core'].includes(g as string)) as Program['weekdays'][number]['groups'])
          : seed.weekdays[i].groups,
      };
    });
    const moves: Program['moves'] = {};
    const rawMoves = isObj(raw.moves) ? raw.moves : {};
    for (const p of phases) {
      const days = rawMoves[p.id];
      moves[p.id] = Array.from({ length: 7 }, (_, wd) => {
        const list = Array.isArray(days) ? days[wd] : null;
        return Array.isArray(list) ? (list.map(sanitizeMove).filter(Boolean) as MoveTemplate[]) : [];
      });
    }
    const s = isObj(raw.session) ? raw.session : {};
    const session = {
      warmupMin: num(s.warmupMin, 0, 60) ?? seed.session.warmupMin,
      cardioMin: num(s.cardioMin, 0, 120) ?? seed.session.cardioMin,
      cooldownMin: num(s.cooldownMin, 0, 60) ?? seed.session.cooldownMin,
      sets: num(s.sets, 1, 10) ?? seed.session.sets,
      reps: num(s.reps, 1, 100) ?? seed.session.reps,
      restSetSec: num(s.restSetSec, 0, 900) ?? seed.session.restSetSec,
      restMoveSec: num(s.restMoveSec, 0, 1200) ?? seed.session.restMoveSec,
    };
    return { startDate: raw.startDate, endDate: raw.endDate, phases, weekdays, moves, session };
  } catch {
    return seed;
  }
}

const STATUSES: LogStatus[] = ['active', 'done', 'partial', 'skipped', 'missed', 'pending'];

function sanitizeSet(s: unknown): SetLog | null {
  if (!isObj(s)) return null;
  const reps = validReps(s.reps);
  if (reps === null) return null;
  const kg = s.kg === null ? null : validKg(s.kg);
  return { kg, reps, at: typeof s.at === 'number' ? s.at : 0 };
}

function sanitizeMoveLog(m: unknown): MoveLog | null {
  const t = sanitizeMove(m);
  if (!t || !isObj(m)) return null;
  const sets = Array.isArray(m.sets) ? (m.sets.map(sanitizeSet).filter(Boolean) as SetLog[]) : [];
  const out: MoveLog = { ...t, sets };
  if (m.skipped === true) out.skipped = true;
  return out;
}

export function sanitizeLog(raw: unknown): DayLog | null {
  if (!isObj(raw) || !isDateKey(raw.date) || !STATUSES.includes(raw.status as LogStatus)) return null;
  const log: DayLog = {
    date: raw.date,
    status: raw.status as LogStatus,
    warmup: raw.warmup === true,
    cardio: raw.cardio === true,
    moves: Array.isArray(raw.moves) ? (raw.moves.map(sanitizeMoveLog).filter(Boolean) as MoveLog[]) : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
  if (raw.cooldown === true) log.cooldown = true;
  if (typeof raw.startedAt === 'number') log.startedAt = raw.startedAt;
  if (typeof raw.finishedAt === 'number') log.finishedAt = raw.finishedAt;
  if (raw.ack === true) log.ack = true;
  if (raw.autoMissed === true) log.autoMissed = true;
  if (isDateKey(raw.shiftedTo)) log.shiftedTo = raw.shiftedTo;
  if (typeof raw.note === 'string') log.note = raw.note.slice(0, 500);
  return log;
}

export function sanitizeOverride(raw: unknown): DayOverride | null {
  if (!isObj(raw) || !isDateKey(raw.date)) return null;
  const o: DayOverride = { date: raw.date };
  if (typeof raw.phaseId === 'string') o.phaseId = raw.phaseId;
  if (typeof raw.sessionOf === 'number' && Number.isInteger(raw.sessionOf) && raw.sessionOf >= 0 && raw.sessionOf <= 6)
    o.sessionOf = raw.sessionOf as DayOverride['sessionOf'];
  if (raw.reason === 'swap' || raw.reason === 'shift' || raw.reason === 'manual') o.reason = raw.reason;
  if (typeof raw.shiftId === 'string') o.shiftId = raw.shiftId;
  if (Array.isArray(raw.moves)) o.moves = raw.moves.map(sanitizeMove).filter(Boolean) as MoveTemplate[];
  return o;
}

export function sanitizeCounters(raw: unknown): Counters | null {
  if (!isObj(raw) || !isDateKey(raw.date)) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((n) => num(n, -1000, 1000) !== null) as number[] : []);
  return { date: raw.date, squats: list(raw.squats), tiptoe: list(raw.tiptoe) };
}

export function sanitizeBody(raw: unknown): BodyEntry | null {
  if (!isObj(raw) || typeof raw.ts !== 'string' || !/^\d{14}$/.test(raw.ts) || !isObj(raw.values)) return null;
  const values: BodyEntry['values'] = {};
  for (const [k, v] of Object.entries(raw.values)) {
    if (v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) values[k] = v;
  }
  const date = `${raw.ts.slice(0, 4)}-${raw.ts.slice(4, 6)}-${raw.ts.slice(6, 8)}`;
  if (!isDateKey(date)) return null;
  const e: BodyEntry = { ts: raw.ts, date, values, source: raw.source === 'manual' ? 'manual' : 'csv' };
  if (isObj(raw.raw)) e.raw = Object.fromEntries(Object.entries(raw.raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  if (isObj(raw.extra)) e.extra = Object.fromEntries(Object.entries(raw.extra).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  return e;
}

export function sanitizeHints(raw: unknown): HintState {
  if (!isObj(raw)) return { dismissed: [], snoozed: null };
  const dismissed = Array.isArray(raw.dismissed) ? raw.dismissed.filter((x): x is string => typeof x === 'string') : [];
  const s = raw.snoozed;
  const snoozed =
    isObj(s) && typeof s.id === 'string' && typeof s.group === 'string' && isDateKey(s.until)
      ? { id: s.id, group: s.group as MuscleGroup, until: s.until }
      : null;
  return { dismissed, snoozed };
}
