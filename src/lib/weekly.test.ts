import { describe, expect, it } from 'vitest';
import { defaultSettings, seedProgram } from './program';
import type { DayLog } from './types';
import { weekSummary } from './weekly';

const sets = (kg: number | null, n: number, reps = 12) => Array.from({ length: n }, () => ({ kg, reps, at: 0 }));
const day = (date: string, status: DayLog['status'], moves: DayLog['moves']): DayLog => ({
  date,
  status,
  warmup: true,
  cardio: true,
  moves,
  updatedAt: 0,
});

describe('weekSummary', () => {
  const logs = new Map<string, DayLog>([
    ['2026-10-19', day('2026-10-19', 'done', [{ name: 'Lateral raise', bodyweight: false, sets: sets(8, 4) }])],
    [
      '2026-10-20',
      day('2026-10-20', 'done', [
        { name: 'Chest press', bodyweight: false, sets: [...sets(40, 3), { kg: 45, reps: 8, at: 0 }] },
        { name: 'Dips', bodyweight: true, sets: sets(null, 2, 10) },
      ]),
    ],
    ['2026-10-12', day('2026-10-12', 'done', [{ name: 'Lat pulldown', bodyweight: false, sets: sets(99, 1) }])], // last week
  ]);
  const ctx = { program: seedProgram(), settings: defaultSettings(), overrides: new Map(), logs };
  const s = weekSummary(ctx, '2026-10-21'); // Wednesday of week 2

  it('covers Monday to Sunday of the current week', () => {
    expect(s.start).toBe('2026-10-19');
    expect(s.end).toBe('2026-10-25');
    expect(s.week).toBe(2);
    expect(s.days).toHaveLength(7);
    expect(s.days.map((d) => d.status).slice(0, 3)).toEqual(['done', 'done', 'today']);
  });

  it('adds up this week only', () => {
    expect(s.sessionsDone).toBe(2);
    expect(s.sessionsPlanned).toBe(6);
    expect(s.sets).toBe(10);
    expect(s.volumeKg).toBe(8 * 12 * 4 + 40 * 12 * 3 + 45 * 8);
  });

  it('lists the heaviest set per move, bodyweight excluded', () => {
    expect(s.topLifts).toEqual([
      { name: 'Chest press', kg: 45, reps: 8 },
      { name: 'Lateral raise', kg: 8, reps: 12 },
    ]);
  });
});
