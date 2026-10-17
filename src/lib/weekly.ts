import { addDays, startOfWeek, type DateKey } from './dates';
import { isTrainingDay, planFor } from './program';
import { computeStats, dayStatus, type ScheduleContext } from './schedule';
import type { DayStatus } from './types';

export interface WeekDay {
  date: DateKey;
  status: DayStatus;
}

export interface TopLift {
  name: string;
  kg: number;
  reps: number;
}

export interface WeekSummary {
  start: DateKey;
  end: DateKey;
  /** Program week number (1-based) */
  week: number;
  totalWeeks: number;
  days: WeekDay[];
  sessionsDone: number;
  sessionsPlanned: number;
  sets: number;
  reps: number;
  volumeKg: number;
  streak: number;
  topLifts: TopLift[];
}

/** Everything the "share this week" card shows, for the Mon–Sun week containing `today`. */
export function weekSummary(ctx: ScheduleContext, today: DateKey): WeekSummary {
  const start = startOfWeek(today);
  const days: WeekDay[] = [];
  let sessionsDone = 0;
  let sessionsPlanned = 0;
  let sets = 0;
  let reps = 0;
  let volumeKg = 0;
  const best = new Map<string, TopLift>();
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const status = dayStatus(date, ctx, today);
    days.push({ date, status });
    const p = planFor(date, ctx);
    if (isTrainingDay(p)) sessionsPlanned++;
    if (status === 'done') sessionsDone++;
    const log = ctx.logs.get(date);
    if (!log || log.status === 'skipped' || log.status === 'missed') continue;
    for (const m of log.moves) {
      for (const s of m.sets) {
        sets++;
        reps += s.reps;
        volumeKg += (s.kg ?? 0) * s.reps;
        if (m.bodyweight || s.kg === null) continue;
        const key = m.name.trim().toLowerCase();
        const b = best.get(key);
        if (!b || s.kg > b.kg || (s.kg === b.kg && s.reps > b.reps)) best.set(key, { name: m.name.trim(), kg: s.kg, reps: s.reps });
      }
    }
  }
  const plan = planFor(today, ctx);
  return {
    start,
    end: addDays(start, 6),
    week: plan.week,
    totalWeeks: plan.totalWeeks,
    days,
    sessionsDone,
    sessionsPlanned,
    sets,
    reps,
    volumeKg: Math.round(volumeKg),
    streak: computeStats(ctx, today).streak,
    topLifts: [...best.values()].sort((a, b) => b.kg - a.kg).slice(0, 3),
  };
}
