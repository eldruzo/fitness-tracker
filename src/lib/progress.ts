import type { DateKey } from './dates';
import { moveKey, movesFor, previousPhase, type PlannedDay } from './program';
import type { DayLog, MoveLog, Program, SessionSpec } from './types';

export interface MovePoint {
  date: DateKey;
  /** Heaviest completed set that day (null for bodyweight moves). */
  kg: number | null;
  /** Reps of that top set */
  reps: number;
  sets: number;
  totalReps: number;
}

export interface MoveHistory {
  key: string;
  name: string;
  bodyweight: boolean;
  points: MovePoint[];
}

const COUNTED = new Set(['done', 'partial', 'active']);

function pointFor(date: DateKey, m: MoveLog): MovePoint | null {
  if (!m.sets.length) return null;
  let top = m.sets[0];
  for (const s of m.sets) if ((s.kg ?? -1) > (top.kg ?? -1)) top = s;
  return {
    date,
    kg: m.bodyweight ? null : top.kg,
    reps: top.reps,
    sets: m.sets.length,
    totalReps: m.sets.reduce((a, s) => a + s.reps, 0),
  };
}

/** One history per move name; a move used in several phases keeps one history. */
export function buildHistories(logs: Iterable<DayLog>): Map<string, MoveHistory> {
  const map = new Map<string, MoveHistory>();
  const sorted = [...logs].filter((l) => COUNTED.has(l.status)).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const log of sorted) {
    for (const m of log.moves) {
      if (m.skipped) continue;
      const pt = pointFor(log.date, m);
      if (!pt) continue;
      const key = moveKey(m.name);
      let h = map.get(key);
      if (!h) {
        h = { key, name: m.name.trim(), bodyweight: m.bodyweight, points: [] };
        map.set(key, h);
      }
      h.points.push(pt);
    }
  }
  return map;
}

export interface MoveSummary {
  first: MovePoint | null;
  latest: MovePoint | null;
  best: MovePoint | null;
  /** latest kg minus first kg; null when either is missing */
  change: number | null;
  sessions: number;
}

export function summarize(h: MoveHistory | undefined): MoveSummary {
  const pts = (h?.points ?? []).filter((p) => p.kg !== null || h?.bodyweight);
  if (!pts.length) return { first: null, latest: null, best: null, change: null, sessions: 0 };
  const first = pts[0];
  const latest = pts[pts.length - 1];
  let best = first;
  for (const p of pts) {
    const better = h!.bodyweight ? p.totalReps > best.totalReps : (p.kg ?? 0) > (best.kg ?? 0);
    if (better) best = p;
  }
  const change = first.kg !== null && latest.kg !== null ? round1(latest.kg - first.kg) : null;
  return { first, latest, best, change, sessions: pts.length };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The most recent point for a move strictly before a date. */
export function lastBefore(h: MoveHistory | undefined, date: DateKey): MovePoint | null {
  if (!h) return null;
  for (let i = h.points.length - 1; i >= 0; i--) if (h.points[i].date < date) return h.points[i];
  return null;
}

/** Prefill: weight used last time for this move (any earlier day). */
export function lastKg(h: MoveHistory | undefined, date: DateKey): number | null {
  if (!h) return null;
  for (let i = h.points.length - 1; i >= 0; i--) {
    const p = h.points[i];
    if (p.date < date && p.kg !== null) return p.kg;
  }
  return null;
}

/**
 * "new this phase": the move differs from what was in the same slot of the same
 * session in the previous phase.
 */
export function isNewThisPhase(program: Program, day: PlannedDay, slot: number): boolean {
  const prev = previousPhase(program, day.phase);
  if (!prev) return false;
  const before = movesFor(program, prev.id, day.sessionOf)[slot];
  const now = day.moves[slot];
  if (!now) return false;
  return !before || moveKey(before.name) !== moveKey(now.name);
}

/** The last time this move was done in an earlier phase (for "last time you did this move"). */
export function lastInEarlierPhase(h: MoveHistory | undefined, day: PlannedDay): MovePoint | null {
  if (!h || !day.phase) return null;
  return lastBefore(h, day.phase.start);
}

/** Suggest a small increase when every set hit the target reps last time. Never applied automatically. */
export function progressionSuggestion(
  h: MoveHistory | undefined,
  date: DateKey,
  spec: SessionSpec,
  stepKg: number,
): number | null {
  const last = lastBefore(h, date);
  if (!last || last.kg === null || h?.bodyweight) return null;
  if (last.sets < spec.sets) return null;
  // all sets at target reps → totalReps covers it, and top-set reps too
  if (last.totalReps < spec.sets * spec.reps) return null;
  return Math.round((last.kg + stepKg) * 2) / 2;
}

/** Every move name in the program, in first-appearance order, plus anything logged. */
export function allMoveNames(program: Program, histories: Map<string, MoveHistory>): { key: string; name: string; bodyweight: boolean }[] {
  const seen = new Map<string, { key: string; name: string; bodyweight: boolean }>();
  for (const ph of program.phases) {
    for (const day of program.moves[ph.id] ?? []) {
      for (const m of day) {
        const key = moveKey(m.name);
        if (!seen.has(key)) seen.set(key, { key, name: m.name, bodyweight: m.bodyweight });
      }
    }
  }
  for (const h of histories.values()) if (!seen.has(h.key)) seen.set(h.key, { key: h.key, name: h.name, bodyweight: h.bodyweight });
  return [...seen.values()];
}
