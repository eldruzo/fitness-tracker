import { addDays, diffDays, eachDay, maxKey, minKey, type DateKey, type Weekday } from './dates';
import { isTrainingDay, planFor, type PlanContext, type PlannedDay } from './program';
import type { DayLog, DayOverride, DayStatus } from './types';

export interface ScheduleContext extends PlanContext {
  logs: Map<DateKey, DayLog>;
}

/** Has the user done anything in this session? */
export function hasProgress(log: DayLog | undefined): boolean {
  if (!log) return false;
  return log.warmup || log.cardio || !!log.cooldown || log.moves.some((m) => m.sets.length > 0);
}

export function statusFor(p: PlannedDay, log: DayLog | undefined, today: DateKey): DayStatus {
  if (!p.inProgram) return p.dayNumber < 1 ? 'before' : 'after';
  if (log) {
    switch (log.status) {
      case 'done':
        return 'done';
      case 'skipped':
        return 'skipped';
      case 'partial':
        return 'partial';
      case 'active':
        if (p.date < today) return hasProgress(log) ? 'partial' : p.rest || p.paused ? (p.paused ? 'paused' : 'rest') : 'missed';
        return 'active';
      case 'missed':
        if (p.paused) return 'paused';
        if (p.rest) return 'rest';
        return 'missed';
      case 'pending':
        if (p.paused) return 'paused';
        if (p.rest) return 'rest';
        return p.date < today ? 'pending' : p.date === today ? 'today' : 'upcoming';
    }
  }
  if (p.paused) return 'paused';
  if (p.rest) return 'rest';
  if (p.date < today) return 'missed';
  if (p.date === today) return 'today';
  return 'upcoming';
}

export function outsideStatus(date: DateKey, ctx: PlanContext): 'before' | 'after' | null {
  if (date < ctx.program.startDate) return 'before';
  if (date > ctx.program.endDate) return 'after';
  return null;
}

export function dayStatus(date: DateKey, ctx: ScheduleContext, today: DateKey): DayStatus {
  const out = outsideStatus(date, ctx);
  if (out) return out;
  return statusFor(planFor(date, ctx), ctx.logs.get(date), today);
}

export interface MissedChange {
  date: DateKey;
  /** "missed": a planned training day with no session; "partial": started but not finished */
  kind: 'missed' | 'partial';
}

/**
 * Compares today with the logs and returns the past days whose stored status
 * must change. Pure: the caller persists the result. Runs on open and whenever
 * the app returns to the foreground, so no background job is needed.
 */
export function detectMissed(ctx: ScheduleContext, today: DateKey): MissedChange[] {
  const { program } = ctx;
  if (today <= program.startDate) return [];
  const last = minKey(addDays(today, -1), program.endDate);
  const out: MissedChange[] = [];
  for (const date of eachDay(program.startDate, last)) {
    const p = planFor(date, ctx);
    const log = ctx.logs.get(date);
    if (log?.status === 'active') {
      // Started but not finished by midnight: keep the sets, mark partial.
      if (hasProgress(log)) out.push({ date, kind: 'partial' });
      else if (isTrainingDay(p)) out.push({ date, kind: 'missed' });
      continue;
    }
    if (!isTrainingDay(p)) continue;
    if (!log) out.push({ date, kind: 'missed' });
  }
  return out;
}

/** Missed days not yet acknowledged in the banner, oldest first. */
export function unacknowledgedMissed(ctx: ScheduleContext, today: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (const log of ctx.logs.values()) {
    if (log.status !== 'missed' || log.ack || log.date >= today) continue;
    const p = planFor(log.date, ctx);
    if (!isTrainingDay(p)) continue;
    out.push(log.date);
  }
  return out.sort();
}

export interface ShiftStep {
  date: DateKey;
  from: Weekday;
  to: Weekday;
}
export interface ShiftPreview {
  missedDate: DateKey;
  steps: ShiftStep[];
  /** The session that falls off the end of the program, if any. */
  dropped: Weekday | null;
}

/**
 * "Shift plan": the missed session moves to the next open training slot from
 * today on, and every later session slides back one slot. Fridays (planned rest)
 * and paused days are never used as slots. Phases and deload stay tied to the
 * calendar; only which weekday's session is trained changes.
 */
export function previewShift(ctx: ScheduleContext, missedDate: DateKey, today: DateKey): ShiftPreview {
  const missed = planFor(missedDate, ctx);
  const slots: PlannedDay[] = [];
  const end = ctx.program.endDate;
  for (const date of eachDay(maxKey(today, ctx.program.startDate), end)) {
    const own = planFor(date, { ...ctx, overrides: withoutSession(ctx.overrides, date) });
    const p = planFor(date, ctx);
    if (own.rest || p.paused || p.rest) continue;
    const log = ctx.logs.get(date);
    if (log && log.status !== 'pending') continue; // started, done or skipped: fixed
    slots.push(p);
  }
  const seq: Weekday[] = [missed.sessionOf, ...slots.map((s) => s.sessionOf)];
  const steps: ShiftStep[] = [];
  slots.forEach((s, i) => {
    if (seq[i] !== s.sessionOf) steps.push({ date: s.date, from: s.sessionOf, to: seq[i] });
  });
  return { missedDate, steps, dropped: slots.length ? seq[slots.length] : missed.sessionOf };
}

function withoutSession(overrides: Map<DateKey, DayOverride>, date: DateKey): Map<DateKey, DayOverride> {
  const o = overrides.get(date);
  if (!o?.sessionOf && o?.sessionOf !== 0) return overrides;
  const copy = new Map(overrides);
  copy.set(date, { ...o, sessionOf: undefined });
  return copy;
}

export interface Stats {
  planned: number;
  done: number;
  skipped: number;
  missed: number;
  partial: number;
  completionPct: number;
  streak: number;
  remaining: number;
}

/**
 * Completion % and streak count only planned training days (not Friday rest,
 * not paused days). Today counts once it is done; an unfinished today neither
 * counts nor breaks the streak.
 */
export function computeStats(ctx: ScheduleContext, today: DateKey): Stats {
  const { program } = ctx;
  let planned = 0;
  let done = 0;
  let skipped = 0;
  let missed = 0;
  let partial = 0;
  let remaining = 0;
  const seq: DayStatus[] = [];
  for (const date of eachDay(program.startDate, program.endDate)) {
    const p = planFor(date, ctx);
    if (!isTrainingDay(p)) continue;
    const s = statusFor(p, ctx.logs.get(date), today);
    if (date > today || (date === today && s !== 'done')) {
      remaining++;
      continue;
    }
    planned++;
    seq.push(s);
    if (s === 'done') done++;
    else if (s === 'skipped') skipped++;
    else if (s === 'partial') partial++;
    else missed++;
  }
  let streak = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i] === 'done'; i--) streak++;
  return {
    planned,
    done,
    skipped,
    missed,
    partial,
    completionPct: planned ? (done / planned) * 100 : 0,
    streak,
    remaining,
  };
}

export function daysUntilStart(ctx: PlanContext, today: DateKey): number {
  return diffDays(today, ctx.program.startDate);
}
