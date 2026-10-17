import type { DateKey, Weekday } from './dates';

export type PhaseId = string;

export interface Phase {
  id: PhaseId;
  name: string;
  start: DateKey;
  end: DateKey;
}

export type WorkTag = 'WFO' | 'WFH' | 'Off';
export type MuscleGroup = 'push' | 'pull' | 'hinge' | 'arms' | 'core';

export interface WeekdayPlan {
  focus: string;
  /** e.g. "light", "hard" */
  intensity: string;
  work: WorkTag;
  rest: boolean;
  groups: MuscleGroup[];
}

export interface MoveTemplate {
  name: string;
  bodyweight: boolean;
}

export interface SessionSpec {
  warmupMin: number;
  cardioMin: number;
  /** 0 hides the cool-down step. */
  cooldownMin: number;
  sets: number;
  reps: number;
  restSetSec: number;
  restMoveSec: number;
}

export interface Program {
  startDate: DateKey;
  endDate: DateKey;
  phases: Phase[];
  /** Indexed by weekday, 0 = Sunday. */
  weekdays: WeekdayPlan[];
  /** moves[phaseId][weekday] = ordered moves */
  moves: Record<PhaseId, MoveTemplate[][]>;
  session: SessionSpec;
}

export interface Pause {
  id: string;
  start: DateKey;
  end: DateKey;
  label?: string;
}

export type Theme = 'system' | 'light' | 'dark';
export type Accent = 'orange' | 'blue' | 'teal' | 'purple' | 'pink';

export interface Settings {
  deload: boolean;
  deloadPct: number;
  theme: Theme;
  accent: Accent;
  unit: 'kg';
  hints: boolean;
  progression: boolean;
  progressionStepKg: number;
  shiftPlan: boolean;
  counters: boolean;
  counterTarget: number;
  sound: boolean;
  vibrate: boolean;
  /** Start the next timer (cardio, rest, cool-down) without a tap. */
  autoStart: boolean;
  pauses: Pause[];
}

/** Per-date plan changes. Never deletes logs. */
export interface DayOverride {
  date: DateKey;
  /** Move this date into a different phase. */
  phaseId?: PhaseId;
  /** Train the session normally planned for this weekday. */
  sessionOf?: Weekday;
  /** Why sessionOf was set. */
  reason?: 'swap' | 'shift' | 'manual';
  /** Groups a shift batch so it can be undone together. */
  shiftId?: string;
  /** Replaces the planned moves for this date only (rename/swap a move). */
  moves?: MoveTemplate[];
}

export interface SetLog {
  kg: number | null;
  reps: number;
  at: number;
}

export interface MoveLog {
  name: string;
  bodyweight: boolean;
  sets: SetLog[];
  skipped?: boolean;
}

/**
 * Persisted status. "active" means started and not finished; once its date is
 * in the past it is shown (and later persisted) as "partial".
 * "pending" is a past day the user un-marked from missed ("Undo").
 */
export type LogStatus = 'active' | 'done' | 'partial' | 'skipped' | 'missed' | 'pending';

export interface DayLog {
  date: DateKey;
  status: LogStatus;
  warmup: boolean;
  cardio: boolean;
  cooldown?: boolean;
  moves: MoveLog[];
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
  /** Missed-day banner acknowledged. */
  ack?: boolean;
  /** Set when the app (not the user) marked the day as missed. */
  autoMissed?: boolean;
  /** For a missed day whose session was shifted forward. */
  shiftedTo?: DateKey;
  note?: string;
}

/** Derived status shown in the UI. */
export type DayStatus =
  | 'before'
  | 'after'
  | 'paused'
  | 'rest'
  | 'done'
  | 'partial'
  | 'skipped'
  | 'missed'
  | 'pending'
  | 'active'
  | 'today'
  | 'upcoming';

export interface Counters {
  date: DateKey;
  squats: number[];
  tiptoe: number[];
}

export type TimerKind = 'warmup' | 'cardio' | 'cooldown' | 'rest-set' | 'rest-move';

export interface TimerState {
  kind: TimerKind;
  /** epoch ms when the timer reaches zero (while running) */
  endsAt: number;
  durationMs: number;
  /** remaining ms while paused; undefined when running */
  pausedRemaining?: number;
  /** step index this timer belongs to */
  step: number;
  /** set to true once the end was announced, so it fires once */
  notified?: boolean;
}

export interface ActiveSession {
  date: DateKey;
  timer: TimerState | null;
  /** kg / reps drafts per move index, so typed-but-not-logged values survive reloads */
  drafts: Record<number, { kg: string; reps: string }>;
}

export interface HintState {
  dismissed: string[];
  snoozed: { id: string; group: MuscleGroup; until: DateKey } | null;
}

export type BodyValue = number | string | null;

export interface BodyEntry {
  /** 14-digit local timestamp YYYYMMDDHHmmss, also the primary key */
  ts: string;
  date: DateKey;
  values: Record<string, BodyValue>;
  source: 'csv' | 'manual';
  /** Original number text from the CSV (e.g. "9.0"), used to export byte-for-byte. */
  raw?: Record<string, string>;
  /** Unknown columns kept from an import; not re-exported. */
  extra?: Record<string, string>;
}
