import { addDays, type DateKey, type Weekday } from './dates';
import { EQUIP_ALLOWED, LIBRARY, PATTERN_GROUP, type Equip, type LibraryMove, type Pattern } from './library';
import type { MoveTemplate, MuscleGroup, Phase, Program, SessionSpec, WeekdayPlan } from './types';

/**
 * Builds a Program from the setup wizard's answers. Plain rules, no AI:
 * days per week → split, split → ordered slots, slots → moves from the library
 * that fit the user's equipment and level. Deterministic: the same answers and
 * seed always give the same plan; "shuffle" bumps the seed.
 */

export type Goal = 'muscle' | 'strength' | 'fitness' | 'fatloss';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface SetupAnswers {
  goal: Goal;
  experience: Experience;
  /** Training weekdays (0 = Sunday). */
  days: Weekday[];
  equip: Equip;
  movesPerDay: number;
  /** Non-training weekdays that get a cardio-only session. */
  cardioDays: Weekday[];
  warmupMin: number;
  cardioMin: number;
  cooldownMin: number;
  weeks: number;
  startDate: DateKey;
  seed: number;
}

export const MIN_MOVES = 2;
export const MAX_MOVES = 8;
/** At least one rest day a week. */
export const MAX_DAYS = 6;

/** More training days → fewer moves per day, so the weekly workload stays similar. */
export function defaultMovesPerDay(days: number, experience: Experience): number {
  const base = days >= 6 ? 3 : days === 5 ? 4 : days === 4 ? 5 : 6;
  return experience === 'beginner' && days <= 4 ? Math.max(3, base - 1) : base;
}

/** Sets, reps, rest and cardio by goal. Beginners get one set fewer. */
export function goalSession(goal: Goal, experience: Experience): Omit<SessionSpec, 'warmupMin' | 'cooldownMin'> {
  const table: Record<Goal, Omit<SessionSpec, 'warmupMin' | 'cooldownMin'>> = {
    muscle: { sets: 4, reps: 10, restSetSec: 90, restMoveSec: 150, cardioMin: 10 },
    strength: { sets: 5, reps: 5, restSetSec: 180, restMoveSec: 240, cardioMin: 5 },
    fitness: { sets: 3, reps: 12, restSetSec: 75, restMoveSec: 120, cardioMin: 15 },
    fatloss: { sets: 3, reps: 15, restSetSec: 60, restMoveSec: 90, cardioMin: 20 },
  };
  const s = { ...table[goal] };
  if (experience === 'beginner') s.sets = Math.max(3, s.sets - 1);
  return s;
}

export type SessionType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full';

/** Ordered slots per session type: compound moves first. "Moves per day" takes from the top. */
export const SLOTS: Record<SessionType, Pattern[]> = {
  push: ['h-push', 'v-push', 'incline-push', 'lateral', 'triceps', 'chest-iso', 'triceps', 'lateral'],
  pull: ['v-pull', 'h-pull', 'rear-delt', 'biceps', 'h-pull', 'biceps', 'v-pull', 'core'],
  legs: ['squat', 'hinge', 'lunge', 'leg-curl', 'calf', 'core', 'leg-ext', 'hinge'],
  upper: ['h-push', 'v-pull', 'v-push', 'h-pull', 'lateral', 'biceps', 'triceps', 'rear-delt'],
  lower: ['squat', 'hinge', 'lunge', 'leg-curl', 'calf', 'core', 'leg-ext', 'hinge'],
  full: ['squat', 'h-push', 'h-pull', 'hinge', 'v-push', 'v-pull', 'core', 'biceps'],
};

const LABEL: Record<SessionType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper body',
  lower: 'Lower body',
  full: 'Full body',
};

export interface SplitDay {
  type: SessionType;
  /** 0 for the first session of this type in the week, 1 for the second… */
  variant: number;
}

/** The weekly split for a number of training days. */
export function splitFor(days: number): SplitDay[] {
  const types: SessionType[] =
    days <= 3
      ? Array(days).fill('full')
      : days === 4
        ? ['upper', 'lower', 'upper', 'lower']
        : days === 5
          ? ['push', 'pull', 'legs', 'upper', 'lower']
          : ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
  const seen = new Map<SessionType, number>();
  return types.map((type) => {
    const variant = seen.get(type) ?? 0;
    seen.set(type, variant + 1);
    return { type, variant };
  });
}

const LEVEL: Record<Experience, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Picks the moves for one session. Variants and phases rotate through the candidates for variety. */
export function pickMoves(
  day: SplitDay,
  phaseIdx: number,
  a: Pick<SetupAnswers, 'equip' | 'experience' | 'movesPerDay' | 'seed'>,
): LibraryMove[] {
  const allowed = EQUIP_ALLOWED[a.equip];
  const maxLevel = LEVEL[a.experience];
  const out: LibraryMove[] = [];
  SLOTS[day.type].forEach((pattern) => {
    if (out.length >= a.movesPerDay) return;
    const candidates = LIBRARY.filter(
      (m) => m.pattern === pattern && allowed.includes(m.equip) && m.level <= maxLevel && !out.includes(m),
    );
    if (!candidates.length) return; // e.g. no leg curl without a gym: the next slot fills in
    // Prefer equipment that matches what the user chose (gym users get machines first, not push-ups).
    const rank = (m: LibraryMove) => allowed.indexOf(m.equip);
    candidates.sort((x, y) => rank(x) - rank(y));
    const i = (a.seed + day.variant * 3 + phaseIdx) % candidates.length;
    out.push(candidates[i]);
  });
  return out;
}

function phasesFor(start: DateKey, weeks: number): Phase[] {
  const count = Math.max(1, Math.round(weeks / 4));
  const len = Math.floor(weeks / count);
  return Array.from({ length: count }, (_, i) => {
    const s = addDays(start, i * len * 7);
    const e = i === count - 1 ? addDays(start, weeks * 7 - 1) : addDays(start, (i + 1) * len * 7 - 1);
    const id = String.fromCharCode(65 + i);
    return { id, name: `Phase ${id}`, start: s, end: e };
  });
}

/** Monday-first order, so the split runs through the week the way people read it. */
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function generateProgram(a: SetupAnswers): Program {
  const days = WEEK_ORDER.filter((d) => a.days.includes(d)).slice(0, MAX_DAYS);
  const split = splitFor(days.length);
  const byDay = new Map<Weekday, SplitDay>(days.map((d, i) => [d, split[i]]));
  const repeated = new Set(split.filter((s) => s.variant > 0).map((s) => s.type));
  const phases = phasesFor(a.startDate, a.weeks);

  const weekdays: WeekdayPlan[] = Array.from({ length: 7 }, (_, wd) => {
    const s = byDay.get(wd as Weekday);
    if (s) {
      const moves = pickMoves(s, 0, a);
      const groups = [...new Set(moves.map((m) => PATTERN_GROUP[m.pattern]))] as MuscleGroup[];
      const focus = repeated.has(s.type) ? `${LABEL[s.type]} ${String.fromCharCode(65 + s.variant)}` : LABEL[s.type];
      return { focus, intensity: '', rest: false, groups };
    }
    if (a.cardioDays.includes(wd as Weekday)) return { focus: 'Cardio', intensity: '', rest: false, groups: [] };
    return { focus: 'Rest', intensity: '', rest: true, groups: [] };
  });

  const moves: Program['moves'] = {};
  phases.forEach((ph, phaseIdx) => {
    moves[ph.id] = Array.from({ length: 7 }, (_, wd) => {
      const s = byDay.get(wd as Weekday);
      if (!s) return [];
      return pickMoves(s, phaseIdx, a).map((m): MoveTemplate => ({ name: m.name, bodyweight: m.bodyweight }));
    });
  });

  const g = goalSession(a.goal, a.experience);
  return {
    startDate: a.startDate,
    endDate: addDays(a.startDate, a.weeks * 7 - 1),
    phases,
    weekdays,
    moves,
    session: { ...g, warmupMin: a.warmupMin, cardioMin: a.cardioMin, cooldownMin: a.cooldownMin },
  };
}

export function defaultAnswers(today: DateKey): SetupAnswers {
  return {
    goal: 'muscle',
    experience: 'beginner',
    days: [1, 2, 4, 6],
    equip: 'gym',
    movesPerDay: defaultMovesPerDay(4, 'beginner'),
    cardioDays: [],
    warmupMin: 5,
    cardioMin: goalSession('muscle', 'beginner').cardioMin,
    cooldownMin: 10,
    weeks: 12,
    startDate: today,
    seed: 0,
  };
}

/** Reads saved answers defensively; anything missing or invalid falls back to the default. */
export function sanitizeAnswers(raw: unknown, today: DateKey): SetupAnswers {
  const d = defaultAnswers(today);
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb);
  const int = (v: unknown, lo: number, hi: number, fb: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fb;
  const days = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is Weekday => Number.isInteger(x) && x >= 0 && x <= 6))] : null;
  const trainDays = days(r.days)?.slice(0, MAX_DAYS);
  const a: SetupAnswers = {
    goal: oneOf(r.goal, ['muscle', 'strength', 'fitness', 'fatloss'] as const, d.goal),
    experience: oneOf(r.experience, ['beginner', 'intermediate', 'advanced'] as const, d.experience),
    days: trainDays?.length ? trainDays : d.days,
    equip: oneOf(r.equip, ['gym', 'dumbbell', 'bodyweight'] as const, d.equip),
    movesPerDay: int(r.movesPerDay, MIN_MOVES, MAX_MOVES, d.movesPerDay),
    cardioDays: [],
    warmupMin: int(r.warmupMin, 0, 60, d.warmupMin),
    cardioMin: int(r.cardioMin, 0, 120, d.cardioMin),
    cooldownMin: int(r.cooldownMin, 0, 60, d.cooldownMin),
    weeks: (WEEK_OPTIONS as readonly unknown[]).includes(r.weeks) ? (r.weeks as number) : d.weeks,
    // A plan always starts from today or later.
    startDate: today,
    seed: int(r.seed, 0, 1_000_000, 0),
  };
  a.cardioDays = (days(r.cardioDays) ?? []).filter((x) => !a.days.includes(x));
  return a;
}

export const WEEK_OPTIONS = [8, 12, 16] as const;
