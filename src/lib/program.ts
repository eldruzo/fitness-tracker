import { addDays, diffDays, inRange, weekday, type DateKey, type Weekday } from './dates';
import type {
  DayOverride,
  MoveTemplate,
  MuscleGroup,
  Phase,
  PhaseId,
  Program,
  Settings,
  WeekdayPlan,
} from './types';

const BODYWEIGHT = new Set(['abs (plank or leg raise)', 'reverse crunch', 'dead bug']);

export function isBodyweightName(name: string): boolean {
  return BODYWEIGHT.has(moveKey(name));
}

/** Progress is tracked per move name; this is the identity used for matching. */
export function moveKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const m = (name: string): MoveTemplate => ({ name, bodyweight: isBodyweightName(name) });
const day = (...names: string[]) => names.map(m);
const REST: MoveTemplate[] = [];

/** Weekday order in these tables: Sun, Mon, Tue, Wed, Thu, Fri, Sat (JS getDay order). */
function phaseMoves(rows: {
  mon: string[];
  tue: string[];
  wed: string[];
  thu: string[];
  sat: string[];
  sun: string[];
}): MoveTemplate[][] {
  return [day(...rows.sun), day(...rows.mon), day(...rows.tue), day(...rows.wed), day(...rows.thu), REST, day(...rows.sat)];
}

export function seedProgram(): Program {
  const weekdays: WeekdayPlan[] = [
    { focus: 'Pull + hinge', intensity: 'hard', rest: false, groups: ['pull', 'hinge'] },
    { focus: 'Shoulders + arms', intensity: 'light', rest: false, groups: ['arms'] },
    { focus: 'Push', intensity: '', rest: false, groups: ['push'] },
    { focus: 'Biceps / rear delts / core', intensity: 'lightest', rest: false, groups: ['core'] },
    { focus: 'Pull + hinge', intensity: 'hard', rest: false, groups: ['pull', 'hinge'] },
    { focus: 'Rest', intensity: '', rest: true, groups: [] },
    { focus: 'Push', intensity: 'hard', rest: false, groups: ['push'] },
  ];

  return {
    startDate: '2026-10-12',
    endDate: '2027-01-31',
    phases: [
      { id: 'A', name: 'Phase A', start: '2026-10-12', end: '2026-11-08' },
      { id: 'B', name: 'Phase B', start: '2026-11-09', end: '2026-12-06' },
      { id: 'C', name: 'Phase C', start: '2026-12-07', end: '2027-01-03' },
      { id: 'D', name: 'Phase D', start: '2027-01-04', end: '2027-01-31' },
    ],
    weekdays,
    moves: {
      A: phaseMoves({
        mon: ['Lateral raise', 'Biceps curl', 'Triceps extension'],
        tue: ['Incline chest press', 'Dumbbell shoulder press', 'Dips or pushdown'],
        wed: ['Hammer curl', 'Face pull', 'Abs (plank or leg raise)'],
        thu: ['Close-grip pulldown', 'Dumbbell row', 'Hip thrust'],
        sat: ['Chest press', 'Shoulder press', 'Triceps pushdown'],
        sun: ['Lat pulldown', 'Seated row', 'Romanian deadlift'],
      }),
      B: phaseMoves({
        mon: ['Cable lateral raise', 'Incline dumbbell curl', 'Overhead triceps extension'],
        tue: ['Incline dumbbell press', 'Machine shoulder press', 'Dips'],
        wed: ['Cable hammer curl', 'Rear delt fly', 'Cable crunch'],
        thu: ['Neutral-grip pulldown', 'Chest-supported row', 'Cable pull-through'],
        sat: ['Dumbbell chest press', 'Machine shoulder press', 'V-bar pushdown'],
        sun: ['Wide-grip lat pulldown', 'Cable row', 'Dumbbell Romanian deadlift'],
      }),
      C: phaseMoves({
        mon: ['Lateral raise', 'Preacher curl', 'Rope pushdown'],
        tue: ['Flat dumbbell press', 'Arnold press', 'Rope pushdown'],
        wed: ['Cross-body hammer curl', 'Face pull', 'Reverse crunch'],
        thu: ['Close-grip pulldown', 'Single-arm cable row', 'Hip thrust'],
        sat: ['Chest press', 'Dumbbell shoulder press', 'Rope pushdown'],
        sun: ['Underhand pulldown', 'Seated row', 'Romanian deadlift'],
      }),
      D: phaseMoves({
        mon: ['Cable lateral raise', 'EZ-bar curl', 'Overhead triceps extension'],
        tue: ['Incline chest press', 'Seated dumbbell shoulder press', 'Skull crusher'],
        wed: ['Hammer curl', 'Reverse pec deck', 'Dead bug'],
        thu: ['Assisted pull-up', 'Machine row', 'Back extension'],
        sat: ['Machine chest press', 'Shoulder press', 'Dips (assisted if needed)'],
        sun: ['Lat pulldown', 'Single-arm dumbbell row', 'Lying leg curl'],
      }),
    },
    session: { warmupMin: 5, cardioMin: 10, cooldownMin: 10, sets: 4, reps: 12, restSetSec: 180, restMoveSec: 300 },
  };
}

export function defaultSettings(): Settings {
  return {
    deload: true,
    deloadPct: 70,
    theme: 'system',
    accent: 'orange',
    unit: 'kg',
    hints: true,
    progression: false,
    progressionStepKg: 2.5,
    shiftPlan: false,
    counters: true,
    counterTarget: 50,
    sound: true,
    vibrate: true,
    autoStart: true,
    pauses: [],
  };
}

export const GROUP_SESSIONS: Record<MuscleGroup, Weekday[]> = {
  push: [2, 6],
  pull: [4, 0],
  hinge: [4, 0],
  arms: [1],
  core: [3],
};
export const BIG_GROUPS: MuscleGroup[] = ['push', 'pull', 'hinge'];

/** Everything the plan says about one date, after applying overrides and pauses. */
export interface PlannedDay {
  date: DateKey;
  inProgram: boolean;
  /** 1-based day number in the program */
  dayNumber: number;
  totalDays: number;
  /** 1-based program week (Mon-Sun weeks counted from the start date) */
  week: number;
  totalWeeks: number;
  phase: Phase | null;
  /** 1-based week within the phase */
  phaseWeek: number;
  deload: boolean;
  weekday: Weekday;
  /** Weekday whose session is trained on this date (after swaps/shifts). */
  sessionOf: Weekday;
  plan: WeekdayPlan;
  rest: boolean;
  paused: boolean;
  moves: MoveTemplate[];
  override?: DayOverride;
  swapped: boolean;
  shifted: boolean;
}

export interface PlanContext {
  program: Program;
  settings: Settings;
  overrides: Map<DateKey, DayOverride>;
}

export function phaseFor(date: DateKey, program: Program, override?: DayOverride): Phase | null {
  if (override?.phaseId) {
    const p = program.phases.find((x) => x.id === override.phaseId);
    if (p) return p;
  }
  return program.phases.find((p) => inRange(date, p.start, p.end)) ?? null;
}

export function isPaused(date: DateKey, settings: Settings): boolean {
  return settings.pauses.some((p) => inRange(date, p.start, p.end));
}

export function movesFor(program: Program, phaseId: PhaseId | undefined, wd: Weekday): MoveTemplate[] {
  if (!phaseId) return [];
  return program.moves[phaseId]?.[wd] ?? [];
}

export function planFor(date: DateKey, ctx: PlanContext): PlannedDay {
  const { program, settings, overrides } = ctx;
  const override = overrides.get(date);
  const wd = weekday(date);
  const inProgram = inRange(date, program.startDate, program.endDate);
  const totalDays = diffDays(program.startDate, program.endDate) + 1;
  const dayNumber = diffDays(program.startDate, date) + 1;
  const week = Math.floor((dayNumber - 1) / 7) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);
  const phase = inProgram ? phaseFor(date, program, override) : null;
  // Week within the phase and deload are calendar-based: the last 7 days of the phase.
  let phaseWeek = 0;
  let deload = false;
  if (phase) {
    phaseWeek = Math.floor(Math.max(0, diffDays(phase.start, date)) / 7) + 1;
    deload = settings.deload && diffDays(date, phase.end) < 7 && diffDays(date, phase.end) >= 0;
  }
  const sessionOf = (override?.sessionOf ?? wd) as Weekday;
  const plan = program.weekdays[sessionOf];
  const paused = inProgram && isPaused(date, settings);
  const rest = plan.rest;
  const moves = override?.moves ?? movesFor(program, phase?.id, sessionOf);
  return {
    date,
    inProgram,
    dayNumber,
    totalDays,
    week,
    totalWeeks,
    phase,
    phaseWeek,
    deload: deload && !rest,
    weekday: wd,
    sessionOf,
    plan,
    rest,
    paused,
    moves: rest ? [] : moves,
    override,
    swapped: override?.reason === 'swap' && sessionOf !== wd,
    shifted: override?.reason === 'shift' && sessionOf !== wd,
  };
}

/** True when the date is a planned training day that counts toward stats. */
export function isTrainingDay(p: PlannedDay): boolean {
  return p.inProgram && !p.rest && !p.paused;
}

export function previousPhase(program: Program, phase: Phase | null): Phase | null {
  if (!phase) return null;
  const i = program.phases.findIndex((p) => p.id === phase.id);
  return i > 0 ? program.phases[i - 1] : null;
}

/** Validates edited phases: contiguous, inside the program, non-overlapping. Returns an error key or null. */
export function validatePhases(program: Program): string | null {
  const ps = [...program.phases].sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!ps.length) return 'phases.none';
  for (const p of ps) if (p.end < p.start) return 'phases.endBeforeStart';
  for (let i = 1; i < ps.length; i++) if (ps[i].start <= ps[i - 1].end) return 'phases.overlap';
  if (ps[0].start < program.startDate || ps[ps.length - 1].end > program.endDate) return 'phases.outside';
  for (let i = 1; i < ps.length; i++) if (addDays(ps[i - 1].end, 1) !== ps[i].start) return 'phases.gap';
  return null;
}

export const DELOAD_ROUND = 0.5;
export function deloadKg(kg: number, pct: number): number {
  return Math.round((kg * pct) / 100 / DELOAD_ROUND) * DELOAD_ROUND;
}
