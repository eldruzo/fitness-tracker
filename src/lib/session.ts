import type { PlannedDay } from './program';
import type { DayLog, MoveLog, SessionSpec } from './types';

export type StepKind = 'warmup' | 'cardio' | 'move';

export interface Step {
  index: number;
  kind: StepKind;
  moveIdx: number;
  done: boolean;
  skipped: boolean;
  setsDone: number;
  move?: MoveLog;
}

/** The moves to show: the log's snapshot once started, otherwise the plan. */
export function sessionMoves(plan: PlannedDay, log: DayLog | undefined): MoveLog[] {
  if (log && log.moves.length) return log.moves;
  return plan.moves.map((m) => ({ name: m.name, bodyweight: m.bodyweight, sets: [] }));
}

export function buildSteps(plan: PlannedDay, log: DayLog | undefined, spec: SessionSpec): Step[] {
  const moves = sessionMoves(plan, log);
  const steps: Step[] = [
    { index: 0, kind: 'warmup', moveIdx: -1, done: !!log?.warmup, skipped: false, setsDone: 0 },
    { index: 1, kind: 'cardio', moveIdx: -1, done: !!log?.cardio, skipped: false, setsDone: 0 },
  ];
  moves.forEach((m, i) =>
    steps.push({
      index: i + 2,
      kind: 'move',
      moveIdx: i,
      done: m.sets.length >= spec.sets,
      skipped: !!m.skipped,
      setsDone: m.sets.length,
      move: m,
    }),
  );
  return steps;
}

/** Index of the current step (first not finished or skipped), or -1 when all are done. */
export function currentStep(steps: Step[]): number {
  const s = steps.find((x) => !x.done && !x.skipped);
  return s ? s.index : -1;
}

export interface SessionSummary {
  sets: number;
  targetSets: number;
  reps: number;
  volumeKg: number;
  durationMin: number | null;
  movesDone: number;
}

export function summarizeSession(log: DayLog, spec: SessionSpec): SessionSummary {
  let sets = 0;
  let reps = 0;
  let volumeKg = 0;
  let movesDone = 0;
  for (const m of log.moves) {
    sets += m.sets.length;
    if (m.sets.length >= spec.sets) movesDone++;
    for (const s of m.sets) {
      reps += s.reps;
      volumeKg += (s.kg ?? 0) * s.reps;
    }
  }
  const durationMin =
    log.startedAt && log.finishedAt && log.finishedAt > log.startedAt
      ? Math.round((log.finishedAt - log.startedAt) / 60_000)
      : null;
  return { sets, targetSets: log.moves.length * spec.sets, reps, volumeKg: Math.round(volumeKg), durationMin, movesDone };
}
