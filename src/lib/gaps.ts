import { addDays, diffDays, type DateKey, type Weekday } from './dates';
import { BIG_GROUPS, isTrainingDay, planFor } from './program';
import { statusFor, type ScheduleContext } from './schedule';
import type { HintState, MuscleGroup } from './types';

export const GROUP_ORDER: MuscleGroup[] = ['push', 'pull', 'hinge', 'arms', 'core'];

export interface Gap {
  id: string;
  group: MuscleGroup;
  /** days since the group was last trained (or since the program start) */
  days: number;
  lastTrained: DateKey | null;
  /** the planned sessions that were missed/partial, most recent first */
  missedDates: DateKey[];
  /** weekday session to train if the user swaps today */
  suggestSession: Weekday;
}

const NOT_TRAINED = new Set(['missed', 'partial', 'skipped', 'pending']);

/**
 * A group is gapped when its last two planned sessions before today were both
 * not completed (missed, partial, skipped or left pending). A single miss never
 * triggers. Uses the effective session per date, so swaps and shifts count for
 * the group actually trained.
 */
export function detectGaps(ctx: ScheduleContext, today: DateKey): Gap[] {
  const { program } = ctx;
  const gaps: Gap[] = [];
  const first = program.startDate;
  const lastPast = addDays(today, -1) < program.endDate ? addDays(today, -1) : program.endDate;
  if (lastPast < first) return [];

  for (const group of GROUP_ORDER) {
    const recent: { date: DateKey; trained: boolean; session: Weekday }[] = [];
    let lastTrained: DateKey | null = null;
    for (let d = lastPast; d >= first; d = addDays(d, -1)) {
      const p = planFor(d, ctx);
      if (!p.plan.groups.includes(group)) continue;
      const s = statusFor(p, ctx.logs.get(d), today);
      if (s === 'done') {
        lastTrained = d;
        break;
      }
      if (!isTrainingDay(p) || !NOT_TRAINED.has(s)) continue;
      recent.push({ date: d, trained: false, session: p.sessionOf });
    }
    if (recent.length < 2) continue;
    gaps.push({
      id: `${group}:${lastTrained ?? 'none'}`,
      group,
      days: diffDays(lastTrained ?? first, today),
      lastTrained,
      missedDates: recent.map((r) => r.date),
      suggestSession: recent[0].session,
    });
  }
  return gaps.sort((a, b) => b.days - a.days || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

export interface HintDecision {
  gap: Gap;
  /** Note shown when the swap would hit a big group trained yesterday. */
  trainedYesterday: boolean;
}

/** The single hint to show on Today, or null. */
export function pickHint(
  ctx: ScheduleContext,
  today: DateKey,
  hintState: HintState,
  opts: { enabled: boolean; sessionActive: boolean },
): HintDecision | null {
  if (!opts.enabled || opts.sessionActive) return null;
  const p = planFor(today, ctx);
  if (!p.inProgram || p.rest || p.paused) return null;
  const todayStatus = statusFor(p, ctx.logs.get(today), today);
  if (todayStatus !== 'today') return null;
  const candidates = detectGaps(ctx, today).filter((g) => {
    if (p.plan.groups.includes(g.group)) return false; // today's session already trains it
    if (hintState.dismissed.includes(g.id)) return false;
    if (hintState.snoozed && hintState.snoozed.id === g.id && today < hintState.snoozed.until) return false;
    return true;
  });
  const gap = candidates[0];
  if (!gap) return null;
  return { gap, trainedYesterday: trainedYesterday(ctx, today, gap.suggestSession) };
}

/** Would training `session` today hit a big muscle group that was trained yesterday? */
export function trainedYesterday(ctx: ScheduleContext, today: DateKey, session: Weekday): boolean {
  const target = ctx.program.weekdays[session].groups.filter((g) => BIG_GROUPS.includes(g));
  if (!target.length) return false;
  const y = addDays(today, -1);
  const p = planFor(y, ctx);
  const s = statusFor(p, ctx.logs.get(y), today);
  if (s !== 'done' && s !== 'partial') return false;
  return p.plan.groups.some((g) => target.includes(g));
}
