import { describe, expect, it } from 'vitest';
import { parseBackup, makeBackup, mergeBackup, BackupError } from './backup';
import { defaultSettings, planFor, seedProgram } from './program';
import {
  buildHistories,
  isNewThisPhase,
  lastInEarlierPhase,
  lastKg,
  progressionSuggestion,
  summarize,
} from './progress';
import type { DayLog, MoveLog } from './types';
import { validKg, validReps } from './validate';

const move = (name: string, kgs: (number | null)[], reps = 12, bodyweight = false): MoveLog => ({
  name,
  bodyweight,
  sets: kgs.map((kg, i) => ({ kg, reps, at: i })),
});
const log = (date: string, moves: MoveLog[], status: DayLog['status'] = 'done'): DayLog => ({
  date,
  status,
  warmup: true,
  cardio: true,
  moves,
  updatedAt: 0,
});

describe('progress', () => {
  const logs = [
    log('2026-10-12', [move('Lateral raise', [6, 6, 7, 7])]),
    log('2026-10-19', [move('lateral raise ', [7, 7, 7, 7])]),
    log('2026-10-26', [move('Lateral raise', [8, 8, 8])], 'partial'),
    log('2026-11-02', [move('Lateral raise', [5, 5])], 'skipped'), // ignored
    log('2026-10-14', [move('Abs (plank or leg raise)', [null, null], 15, true)]),
  ];
  const h = buildHistories(logs);

  it('groups history by move name, case and whitespace insensitive', () => {
    expect(h.get('lateral raise')?.points.map((p) => p.kg)).toEqual([7, 7, 8]);
  });

  it('summarises first / latest / best / change', () => {
    const s = summarize(h.get('lateral raise'));
    expect(s.first?.kg).toBe(7);
    expect(s.latest?.kg).toBe(8);
    expect(s.best?.kg).toBe(8);
    expect(s.change).toBe(1);
    expect(s.sessions).toBe(3);
  });

  it('handles empty and sparse data', () => {
    expect(summarize(undefined)).toEqual({ first: null, latest: null, best: null, change: null, sessions: 0 });
    const one = summarize(buildHistories([log('2026-10-12', [move('Dips', [0])])]).get('dips'));
    expect(one.change).toBe(0);
  });

  it('keeps bodyweight moves without kg', () => {
    const s = summarize(h.get('abs (plank or leg raise)'));
    expect(s.latest?.kg).toBeNull();
    expect(s.change).toBeNull();
    expect(s.latest?.totalReps).toBe(30);
  });

  it('prefills the last weight used before a date', () => {
    expect(lastKg(h.get('lateral raise'), '2026-10-26')).toBe(7);
    expect(lastKg(h.get('lateral raise'), '2026-10-12')).toBeNull();
  });

  it('suggests an increase only after all sets hit the target reps', () => {
    const spec = seedProgram().session;
    expect(progressionSuggestion(h.get('lateral raise'), '2026-10-26', spec, 2.5)).toBe(9.5);
    expect(progressionSuggestion(h.get('lateral raise'), '2026-11-02', spec, 2.5)).toBeNull(); // only 3 sets
  });

  it('marks new moves at a phase change and finds earlier-phase history', () => {
    const program = seedProgram();
    const ctx = { program, settings: defaultSettings(), overrides: new Map() };
    const monC = planFor('2026-12-07', ctx); // Lateral raise / Preacher curl / Rope pushdown
    expect(isNewThisPhase(program, monC, 0)).toBe(true); // B had Cable lateral raise
    const monA = planFor('2026-10-12', ctx);
    expect(isNewThisPhase(program, monA, 0)).toBe(false);
    expect(lastInEarlierPhase(h.get('lateral raise'), monC)?.date).toBe('2026-10-26');
  });
});

describe('validation', () => {
  it('accepts kg 0–500 and integer reps', () => {
    expect(validKg('12.5')).toBe(12.5);
    expect(validKg('12,5')).toBe(12.5);
    expect(validKg('501')).toBeNull();
    expect(validKg('-1')).toBeNull();
    expect(validKg('')).toBeNull();
    expect(validReps('12')).toBe(12);
    expect(validReps('12.5')).toBeNull();
    expect(validReps('101')).toBeNull();
  });
});

describe('backup', () => {
  const data = {
    program: seedProgram(),
    settings: defaultSettings(),
    days: [log('2026-10-12', [move('Lateral raise', [6])])],
    overrides: [],
    body: [],
    counters: [{ date: '2026-10-12', squats: [10, 5], tiptoe: [] }],
    hints: { dismissed: [], snoozed: null },
  };

  it('round-trips through JSON', () => {
    const parsed = parseBackup(JSON.stringify(makeBackup(data)));
    expect(parsed.data).toEqual(data);
    expect(parsed.dropped).toBe(0);
  });

  it('drops corrupted records instead of failing', () => {
    const b = JSON.parse(JSON.stringify(makeBackup(data))) as { data: { days: unknown[] } };
    b.data.days.push({ date: 'nope' }, 42, { date: '2026-10-13', status: 'weird' });
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.data.days).toHaveLength(1);
    expect(parsed.dropped).toBe(3);
  });

  it('rejects non-backups and newer formats', () => {
    expect(() => parseBackup('{')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ ...makeBackup(data), format: 99 }))).toThrow(BackupError);
  });

  it('merge keeps existing records', () => {
    const incoming = { ...data, days: [log('2026-10-12', []), log('2026-10-13', [])] };
    const merged = mergeBackup(data, incoming);
    expect(merged.days).toHaveLength(2);
    expect(merged.days[0].moves).toHaveLength(1);
  });
});
