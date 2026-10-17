import { batch, computed, signal } from '@preact/signals';
import { makeBackup, mergeBackup, parseBackup, type BackupData } from './lib/backup';
import * as store from './lib/db';
import { addDays, todayKey, type DateKey, type Weekday } from './lib/dates';
import { pickHint } from './lib/gaps';
import { planFor } from './lib/program';
import { defaultSettings, seedProgram } from './lib/program';
import { buildHistories } from './lib/progress';
import { detectMissed, previewShift, unacknowledgedMissed, type ScheduleContext, type ShiftPreview } from './lib/schedule';
import type {
  ActiveSession,
  BodyEntry,
  Counters,
  DayLog,
  DayOverride,
  HintState,
  MoveTemplate,
  MuscleGroup,
  Program,
  Settings,
  TimerKind,
  TimerState,
} from './lib/types';
import type { TimedStepKind } from './lib/session';
import {
  sanitizeBody,
  sanitizeCounters,
  sanitizeHints,
  sanitizeLog,
  sanitizeOverride,
  sanitizeProgram,
  sanitizeSettings,
} from './lib/validate';

// ─── State ──────────────────────────────────────────────────────────────────

export type LoadState = 'loading' | 'ready' | 'error';
export type PersistState = 'unknown' | 'granted' | 'denied' | 'unsupported';

export interface Meta {
  firstRunDone: boolean;
  createdAt: number;
  lastExport: number | null;
  backupSnoozeUntil: number | null;
  persistBannerDismissed: boolean;
  installDismissed: boolean;
}

const defaultMeta = (): Meta => ({
  firstRunDone: false,
  createdAt: Date.now(),
  lastExport: null,
  backupSnoozeUntil: null,
  persistBannerDismissed: false,
  installDismissed: false,
});

export const loadState = signal<LoadState>('loading');
export const loadError = signal<string | null>(null);
export const saveError = signal<boolean>(false);
export const persistState = signal<PersistState>('unknown');

export const program = signal<Program>(seedProgram());
export const settings = signal<Settings>(defaultSettings());
export const logs = signal<Map<DateKey, DayLog>>(new Map());
export const overrides = signal<Map<DateKey, DayOverride>>(new Map());
export const body = signal<Map<string, BodyEntry>>(new Map());
export const counters = signal<Map<DateKey, Counters>>(new Map());
export const active = signal<ActiveSession | null>(null);
export const hints = signal<HintState>({ dismissed: [], snoozed: null });
export const meta = signal<Meta>(defaultMeta());
/** The device's local date. Refreshed on focus, visibility and once a minute. */
export const today = signal<DateKey>(todayKey());

export const ctx = computed<ScheduleContext>(() => ({
  program: program.value,
  settings: settings.value,
  overrides: overrides.value,
  logs: logs.value,
}));
export const histories = computed(() => buildHistories(logs.value.values()));
export const todayPlan = computed(() => planFor(today.value, ctx.value));
export const missedBanner = computed(() => unacknowledgedMissed(ctx.value, today.value));
export const sessionActive = computed(() => {
  const a = active.value;
  if (!a) return false;
  return logs.value.get(a.date)?.status === 'active';
});
export const hint = computed(() =>
  pickHint(ctx.value, today.value, hints.value, { enabled: settings.value.hints, sessionActive: sessionActive.value }),
);

// ─── Persistence (write-through with a local fallback) ──────────────────────

/**
 * Every change updates memory first, then IndexedDB. If a write fails, the
 * record is kept in a localStorage journal and retried, so a failed write never
 * loses data. The journal is replayed on the next start.
 */
const JOURNAL_KEY = 'gym-log.journal';
type JournalEntry = { store: store.StoreName; value: unknown } | { meta: string; value: unknown };

function readJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}
function writeJournal(entries: JournalEntry[]) {
  try {
    if (entries.length) localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
    else localStorage.removeItem(JOURNAL_KEY);
  } catch {
    /* storage full or blocked: memory still holds the data */
  }
}

async function apply(e: JournalEntry) {
  if ('meta' in e) await store.setMeta(e.meta, e.value);
  else await store.put(e.store, e.value as never);
}

let flushing: Promise<void> | null = null;
async function write(e: JournalEntry): Promise<void> {
  try {
    await apply(e);
    if (saveError.value) await retryJournal();
  } catch (err) {
    console.error('[gym-log] write failed', err);
    const j = readJournal().filter((x) => !sameTarget(x, e));
    j.push(e);
    writeJournal(j);
    saveError.value = true;
  }
}

function sameTarget(a: JournalEntry, b: JournalEntry): boolean {
  if ('meta' in a || 'meta' in b) return 'meta' in a && 'meta' in b && a.meta === b.meta;
  return a.store === b.store && keyOf(a) === keyOf(b);
}
function keyOf(e: { store: store.StoreName; value: unknown }): string {
  const v = e.value as Record<string, string>;
  return e.store === 'body' ? v.ts : v.date;
}

export async function retryJournal(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const j = readJournal();
    const left: JournalEntry[] = [];
    for (const e of j) {
      try {
        await apply(e);
      } catch {
        left.push(e);
      }
    }
    writeJournal(left);
    saveError.value = left.length > 0;
  })().finally(() => (flushing = null));
  return flushing;
}

const putLog = (l: DayLog) => write({ store: 'days', value: l });
const putMeta = (k: string, v: unknown) => write({ meta: k, value: v });

function setLog(l: DayLog) {
  const next = new Map(logs.value);
  l.updatedAt = Date.now();
  next.set(l.date, l);
  logs.value = next;
  void putLog(l);
}

function setOverride(o: DayOverride | null, date: DateKey) {
  const next = new Map(overrides.value);
  if (o) next.set(date, o);
  else next.delete(date);
  overrides.value = next;
  if (o) void write({ store: 'overrides', value: o });
  else void store.del('overrides', date).catch(() => (saveError.value = true));
}

function setActive(a: ActiveSession | null) {
  active.value = a;
  void putMeta('active', a);
}

export function updateMeta(patch: Partial<Meta>) {
  meta.value = { ...meta.value, ...patch };
  void putMeta('app', meta.value);
}

// ─── Boot ───────────────────────────────────────────────────────────────────

export async function boot(): Promise<void> {
  loadState.value = 'loading';
  try {
    await retryJournal().catch(() => undefined);
    const [days, ovs, bodies, ctrs, m] = await Promise.all([
      store.getAll('days'),
      store.getAll('overrides'),
      store.getAll('body'),
      store.getAll('counters'),
      store.allMeta(),
    ]);
    const map = <T, K>(list: unknown[], fn: (x: unknown) => T | null, key: (x: T) => K) => {
      const out = new Map<K, T>();
      for (const x of list) {
        const v = fn(x);
        if (v) out.set(key(v), v);
      }
      return out;
    };
    batch(() => {
      program.value = sanitizeProgram(m.program);
      settings.value = sanitizeSettings(m.settings);
      logs.value = map(days, sanitizeLog, (x) => x.date);
      overrides.value = map(ovs, sanitizeOverride, (x) => x.date);
      body.value = map(bodies, sanitizeBody, (x) => x.ts);
      counters.value = map(ctrs, sanitizeCounters, (x) => x.date);
      hints.value = sanitizeHints(m.hints);
      meta.value = { ...defaultMeta(), ...(typeof m.app === 'object' && m.app ? (m.app as Partial<Meta>) : {}) };
      active.value = restoreActive(m.active);
      today.value = todayKey();
    });
    if (!m.program) void putMeta('program', program.value);
    if (!m.app) void putMeta('app', meta.value);
    dailyCheck();
    loadState.value = 'ready';
  } catch (err) {
    console.error('[gym-log] failed to open storage', err);
    loadError.value = err instanceof Error ? err.message : String(err);
    loadState.value = 'error';
  }
}

function restoreActive(raw: unknown): ActiveSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as ActiveSession;
  if (typeof a.date !== 'string') return null;
  return { date: a.date, timer: a.timer && typeof a.timer.endsAt === 'number' ? a.timer : null, drafts: a.drafts ?? {} };
}

/**
 * Runs on open, on return to the foreground, and once a minute while open.
 * Compares today's date with the logs and marks past days; never deletes.
 */
export function dailyCheck() {
  const now = todayKey();
  if (now !== today.value) today.value = now;
  const changes = detectMissed(ctx.value, now);
  if (!changes.length) return;
  const next = new Map(logs.value);
  const writes: DayLog[] = [];
  for (const c of changes) {
    const prev = next.get(c.date);
    const l: DayLog =
      c.kind === 'partial' && prev
        ? { ...prev, status: 'partial', updatedAt: Date.now() }
        : { ...(prev ?? emptyLog(c.date)), status: 'missed', autoMissed: true, ack: false, updatedAt: Date.now() };
    next.set(c.date, l);
    writes.push(l);
  }
  logs.value = next;
  for (const l of writes) void putLog(l);
  // A session left open on a past day is no longer "active".
  const a = active.value;
  if (a && a.date < now) setActive(null);
}

function emptyLog(date: DateKey): DayLog {
  return { date, status: 'pending', warmup: false, cardio: false, moves: [], updatedAt: Date.now() };
}

// ─── Persistence permission ─────────────────────────────────────────────────

export async function requestPersistence(): Promise<void> {
  if (!navigator.storage?.persist) {
    persistState.value = 'unsupported';
    return;
  }
  try {
    const already = await navigator.storage.persisted();
    const ok = already || (await navigator.storage.persist());
    persistState.value = ok ? 'granted' : 'denied';
  } catch {
    persistState.value = 'denied';
  }
}

// ─── Session actions ────────────────────────────────────────────────────────

function snapshotMoves(moves: MoveTemplate[]) {
  return moves.map((m) => ({ name: m.name, bodyweight: m.bodyweight, sets: [] }));
}

/** Returns the log for a date, creating an in-progress one from the plan if needed. */
export function ensureLog(date: DateKey): DayLog {
  const existing = logs.value.get(date);
  if (existing && existing.moves.length) return existing;
  const p = planFor(date, ctx.value);
  const l: DayLog = {
    ...(existing ?? emptyLog(date)),
    status:
      existing && existing.status !== 'missed' && existing.status !== 'pending'
        ? existing.status
        : date < today.value
          ? 'partial'
          : 'active',
    moves: snapshotMoves(p.moves),
    startedAt: existing?.startedAt ?? Date.now(),
    ack: true,
  };
  setLog(l);
  return l;
}

export function startSession(date: DateKey) {
  const l = ensureLog(date);
  if (l.status !== 'active') setLog({ ...l, status: 'active', startedAt: l.startedAt ?? Date.now() });
  if (!active.value || active.value.date !== date) setActive({ date, timer: null, drafts: {} });
  if (!l.warmup && settings.value.autoStart) startTimer('warmup', 0);
}

function mutateLog(date: DateKey, fn: (l: DayLog) => DayLog) {
  const l = ensureLog(date);
  setLog(fn(structuredClone(l)));
}

export function setStepDone(date: DateKey, step: TimedStepKind, done: boolean) {
  mutateLog(date, (l) => ({ ...l, [step]: done }));
  const a = active.value;
  if (a?.timer && a.timer.kind === step) setTimer(null);
  if (done && step === 'warmup' && !logs.value.get(date)?.cardio && isToday(date) && settings.value.autoStart) startTimer('cardio', 1);
}

/** Step index of the cool-down, or -1 when the program has none. */
function cooldownStep(l: DayLog): number {
  return program.value.session.cooldownMin > 0 ? l.moves.length + 2 : -1;
}

const isToday = (d: DateKey) => d === today.value;

export function logSet(date: DateKey, moveIdx: number, kg: number | null, reps: number) {
  const spec = program.value.session;
  let finishedMove = false;
  let lastMove = false;
  mutateLog(date, (l) => {
    const m = l.moves[moveIdx];
    if (!m) return l;
    m.sets.push({ kg: m.bodyweight ? null : kg, reps, at: Date.now() });
    m.skipped = false;
    finishedMove = m.sets.length >= spec.sets;
    lastMove = l.moves.slice(moveIdx + 1).every((x) => x.skipped || x.sets.length >= spec.sets);
    if (l.status !== 'active' && l.status !== 'done' && l.status !== 'partial') l.status = isToday(date) ? 'active' : 'partial';
    return l;
  });
  if (!isToday(date)) return; // backfill: no timers
  if (!active.value || active.value.date !== date) setActive({ date, timer: null, drafts: active.value?.drafts ?? {} });
  if (!settings.value.autoStart) return setTimer(null);
  const l = logs.value.get(date)!;
  const cool = cooldownStep(l);
  if (!finishedMove) startTimer('rest-set', moveIdx + 2);
  else if (!lastMove) startTimer('rest-move', moveIdx + 3);
  else if (cool !== -1 && !l.cooldown) startTimer('cooldown', cool);
  else setTimer(null);
}

/** Manual rest timer, for when auto-start is off. */
export function startRest(moveIdx: number, moveFinished: boolean) {
  if (moveFinished) startTimer('rest-move', moveIdx + 3);
  else startTimer('rest-set', moveIdx + 2);
}

export function undoSet(date: DateKey, moveIdx: number) {
  mutateLog(date, (l) => {
    l.moves[moveIdx]?.sets.pop();
    return l;
  });
  const t = active.value?.timer;
  if (t && (t.kind === 'rest-set' || t.kind === 'rest-move')) setTimer(null);
}

export function editSet(date: DateKey, moveIdx: number, setIdx: number, kg: number | null, reps: number) {
  mutateLog(date, (l) => {
    const s = l.moves[moveIdx]?.sets[setIdx];
    if (s) {
      s.kg = l.moves[moveIdx].bodyweight ? null : kg;
      s.reps = reps;
    }
    return l;
  });
}

export function setMoveSkipped(date: DateKey, moveIdx: number, skipped: boolean) {
  mutateLog(date, (l) => {
    if (l.moves[moveIdx]) l.moves[moveIdx].skipped = skipped;
    return l;
  });
}

/** Rename or swap a move for this date only. History follows the new name. */
export function renameMove(date: DateKey, moveIdx: number, name: string, bodyweight: boolean) {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!clean) return;
  mutateLog(date, (l) => {
    const m = l.moves[moveIdx];
    if (m) {
      m.name = clean;
      m.bodyweight = bodyweight;
      if (bodyweight) m.sets.forEach((s) => (s.kg = null));
    }
    return l;
  });
  const p = planFor(date, ctx.value);
  const moves = p.moves.map((m, i) => (i === moveIdx ? { name: clean, bodyweight } : m));
  setOverride({ ...(overrides.value.get(date) ?? { date }), moves }, date);
}

export function setDraft(moveIdx: number, kg: string, reps: string) {
  const a = active.value;
  if (!a) return;
  setActive({ ...a, drafts: { ...a.drafts, [moveIdx]: { kg, reps } } });
}

export function finishSession(date: DateKey) {
  mutateLog(date, (l) => ({ ...l, status: 'done', finishedAt: Date.now(), ack: true }));
  if (active.value?.date === date) setActive(null);
}

export function reopenSession(date: DateKey) {
  mutateLog(date, (l) => ({ ...l, status: isToday(date) ? 'active' : 'partial', finishedAt: undefined }));
}

export function skipDay(date: DateKey) {
  const prev = logs.value.get(date);
  setLog({ ...(prev ?? emptyLog(date)), status: 'skipped', ack: true });
  if (active.value?.date === date) setActive(null);
}

/** Back to "not logged": keeps any sets, never deletes data. */
export function unsetDay(date: DateKey) {
  const prev = logs.value.get(date);
  if (!prev) return;
  const hasSets = prev.warmup || prev.cardio || prev.moves.some((m) => m.sets.length);
  setLog({ ...prev, status: hasSets ? (isToday(date) ? 'active' : 'partial') : 'pending', ack: true, autoMissed: false });
}

export function markPartial(date: DateKey) {
  mutateLog(date, (l) => ({ ...l, status: 'partial', ack: true }));
}

// ─── Timers (timestamp based) ───────────────────────────────────────────────

function setTimer(t: TimerState | null) {
  const a = active.value;
  if (!a) return;
  setActive({ ...a, timer: t });
}

export function timerDuration(kind: TimerKind): number {
  const s = program.value.session;
  switch (kind) {
    case 'warmup':
      return s.warmupMin * 60_000;
    case 'cardio':
      return s.cardioMin * 60_000;
    case 'cooldown':
      return s.cooldownMin * 60_000;
    case 'rest-set':
      return s.restSetSec * 1000;
    case 'rest-move':
      return s.restMoveSec * 1000;
  }
}

export function startTimer(kind: TimerKind, step: number) {
  const a = active.value;
  if (!a) return;
  const durationMs = timerDuration(kind);
  if (durationMs <= 0) return setTimer(null);
  setTimer({ kind, step, durationMs, endsAt: Date.now() + durationMs });
}

export function adjustTimer(deltaMs: number) {
  const t = active.value?.timer;
  if (!t) return;
  if (t.pausedRemaining !== undefined) {
    setTimer({ ...t, pausedRemaining: Math.max(0, t.pausedRemaining + deltaMs), notified: false });
  } else {
    const endsAt = Math.max(Date.now(), t.endsAt + deltaMs);
    setTimer({ ...t, endsAt, durationMs: Math.max(t.durationMs + deltaMs, 1000), notified: endsAt <= Date.now() ? t.notified : false });
  }
}

export function pauseTimer() {
  const t = active.value?.timer;
  if (!t || t.pausedRemaining !== undefined) return;
  setTimer({ ...t, pausedRemaining: Math.max(0, t.endsAt - Date.now()) });
}

export function resumeTimer() {
  const t = active.value?.timer;
  if (!t || t.pausedRemaining === undefined) return;
  setTimer({ ...t, endsAt: Date.now() + t.pausedRemaining, pausedRemaining: undefined });
}

export function skipTimer() {
  const a = active.value;
  const t = a?.timer;
  if (!a || !t) return;
  setTimer(null);
  if (isTimedStep(t.kind)) setStepDone(a.date, t.kind, true);
}

const isTimedStep = (k: TimerKind): k is TimedStepKind => k === 'warmup' || k === 'cardio' || k === 'cooldown';

/** Called by the ticker when a timer reaches zero; returns true the first time. */
export function markTimerEnded(): boolean {
  const a = active.value;
  const t = a?.timer;
  if (!a || !t || t.notified) return false;
  if (isTimedStep(t.kind)) {
    setTimer({ ...t, notified: true });
    setStepDone(a.date, t.kind, true);
  } else {
    setTimer({ ...t, notified: true });
  }
  return true;
}

export function clearTimer() {
  setTimer(null);
}

// ─── Missed days, swaps, shifts ─────────────────────────────────────────────

export function acknowledgeMissed(dates: DateKey[]) {
  const next = new Map(logs.value);
  for (const d of dates) {
    const l = next.get(d);
    if (!l) continue;
    const u = { ...l, ack: true, updatedAt: Date.now() };
    next.set(d, u);
    void putLog(u);
  }
  logs.value = next;
}

/** "Undo": the day goes back to planned (not logged), and is not flagged again. */
export function undoMissed(date: DateKey) {
  const l = logs.value.get(date);
  if (!l) return;
  setLog({ ...l, status: 'pending', ack: true, autoMissed: false });
}

/** Train another weekday's session today; the replaced session shows as "Swapped". */
export function swapToday(session: Weekday) {
  const date = today.value;
  const prev = overrides.value.get(date);
  setOverride({ ...(prev ?? { date }), date, sessionOf: session, reason: 'swap', moves: undefined }, date);
  const l = logs.value.get(date);
  if (l && !l.moves.some((m) => m.sets.length)) {
    setLog({ ...l, moves: snapshotMoves(planFor(date, ctx.value).moves) });
  }
}

export function undoSwap(date: DateKey) {
  const prev = overrides.value.get(date);
  if (!prev) return;
  const { sessionOf: _s, reason: _r, ...rest } = prev;
  void _s;
  void _r;
  setOverride(Object.keys(rest).length > 1 ? rest : null, date);
  const l = logs.value.get(date);
  if (l && !l.moves.some((m) => m.sets.length)) setLog({ ...l, moves: snapshotMoves(planFor(date, ctx.value).moves) });
}

export function setDaySession(date: DateKey, session: Weekday | null) {
  const prev = overrides.value.get(date) ?? { date };
  if (session === null) {
    const { sessionOf: _s, reason: _r, ...rest } = prev;
    void _s;
    void _r;
    setOverride(Object.keys(rest).length > 1 ? rest : null, date);
  } else setOverride({ ...prev, sessionOf: session, reason: 'manual', moves: undefined }, date);
}

export function setDayPhase(date: DateKey, phaseId: string | null) {
  const prev = overrides.value.get(date) ?? { date };
  const next = { ...prev, phaseId: phaseId ?? undefined, moves: undefined };
  setOverride(next.phaseId || next.sessionOf !== undefined ? next : null, date);
}

export function getShiftPreview(missedDate: DateKey): ShiftPreview {
  return previewShift(ctx.value, missedDate, today.value);
}

export function applyShift(preview: ShiftPreview) {
  const shiftId = `s${Date.now()}`;
  const next = new Map(overrides.value);
  for (const s of preview.steps) {
    const o: DayOverride = { ...(next.get(s.date) ?? { date: s.date }), sessionOf: s.to, reason: 'shift', shiftId, moves: undefined };
    next.set(s.date, o);
    void write({ store: 'overrides', value: o });
  }
  overrides.value = next;
  const l = logs.value.get(preview.missedDate);
  if (l) setLog({ ...l, ack: true, shiftedTo: preview.steps[0]?.date });
}

export function lastShiftId(): string | null {
  let best: string | null = null;
  for (const o of overrides.value.values()) if (o.shiftId && (!best || o.shiftId > best)) best = o.shiftId;
  return best;
}

export async function undoShift(shiftId: string) {
  const next = new Map(overrides.value);
  const del: string[] = [];
  const put: DayOverride[] = [];
  for (const [k, o] of next) {
    if (o.shiftId !== shiftId) continue;
    const { sessionOf: _s, reason: _r, shiftId: _i, ...rest } = o;
    void _s;
    void _r;
    void _i;
    if (Object.keys(rest).length > 1) {
      next.set(k, rest);
      put.push(rest);
    } else {
      next.delete(k);
      del.push(k);
    }
  }
  overrides.value = next;
  await store.putMany({ overrides: put, deleteOverrides: del }).catch(() => (saveError.value = true));
  const ln = new Map(logs.value);
  for (const l of ln.values()) if (l.shiftedTo) setLog({ ...l, shiftedTo: undefined });
}

// ─── Hints ──────────────────────────────────────────────────────────────────

export function dismissHint(id: string) {
  hints.value = { ...hints.value, dismissed: [...hints.value.dismissed.filter((x) => x !== id), id].slice(-50) };
  void putMeta('hints', hints.value);
}

export function snoozeHint(id: string, group: MuscleGroup, days = 3) {
  hints.value = { ...hints.value, snoozed: { id, group, until: addDays(today.value, days) } };
  void putMeta('hints', hints.value);
}

// ─── Counters ───────────────────────────────────────────────────────────────

export function addCount(date: DateKey, which: 'squats' | 'tiptoe', n: number) {
  const prev = counters.value.get(date) ?? { date, squats: [], tiptoe: [] };
  const c: Counters = { ...prev, [which]: [...prev[which], n] };
  const next = new Map(counters.value);
  next.set(date, c);
  counters.value = next;
  void write({ store: 'counters', value: c });
}

export function undoCount(date: DateKey, which: 'squats' | 'tiptoe') {
  const prev = counters.value.get(date);
  if (!prev?.[which].length) return;
  const c: Counters = { ...prev, [which]: prev[which].slice(0, -1) };
  const next = new Map(counters.value);
  next.set(date, c);
  counters.value = next;
  void write({ store: 'counters', value: c });
}

// ─── Body ───────────────────────────────────────────────────────────────────

export async function saveBodyEntries(entries: BodyEntry[]): Promise<void> {
  const next = new Map(body.value);
  for (const e of entries) next.set(e.ts, e);
  await store.putMany({ body: entries });
  body.value = next;
}

export async function deleteBodyEntry(ts: string): Promise<void> {
  await store.del('body', ts);
  const next = new Map(body.value);
  next.delete(ts);
  body.value = next;
}

// ─── Settings / program ─────────────────────────────────────────────────────

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
  void putMeta('settings', settings.value);
}

export function updateProgram(p: Program) {
  program.value = p;
  void putMeta('program', p);
}

// ─── Backup ─────────────────────────────────────────────────────────────────

export function currentData(): BackupData {
  return {
    program: program.value,
    settings: settings.value,
    days: [...logs.value.values()],
    overrides: [...overrides.value.values()],
    body: [...body.value.values()],
    counters: [...counters.value.values()],
    hints: hints.value,
  };
}

export function exportBackupJson(): string {
  const json = JSON.stringify(makeBackup(currentData()), null, 1);
  updateMeta({ lastExport: Date.now(), backupSnoozeUntil: null });
  return json;
}

export { parseBackup };

export async function restoreBackup(data: BackupData, mode: 'merge' | 'replace'): Promise<void> {
  const final = mode === 'merge' ? mergeBackup(currentData(), data) : data;
  const m: Meta = { ...meta.value, firstRunDone: true };
  await store.replaceAll({
    days: final.days,
    overrides: final.overrides,
    body: final.body,
    counters: final.counters,
    meta: { program: final.program, settings: final.settings, hints: final.hints, app: m, active: null },
  });
  await boot();
}

export async function resetAll(): Promise<void> {
  await store.replaceAll({
    days: [],
    overrides: [],
    body: [],
    counters: [],
    meta: { program: seedProgram(), settings: defaultSettings(), app: { ...defaultMeta(), firstRunDone: true } },
  });
  writeJournal([]);
  await boot();
}
