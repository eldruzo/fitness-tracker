import { describe, expect, it } from 'vitest';
import { EXERCISE_IDS } from './exercise-index';
import { exerciseFor } from './exercises';
import { defaultAnswers, defaultMovesPerDay, generateProgram, sanitizeAnswers, splitFor, type SetupAnswers } from './generator';
import { LIBRARY } from './library';
import { defaultSettings, planFor, validatePhases } from './program';
import { sanitizeProgram } from './validate';

const base = (patch: Partial<SetupAnswers> = {}): SetupAnswers => ({ ...defaultAnswers('2026-11-02'), ...patch });

describe('moves per day', () => {
  it('goes down as training days go up', () => {
    expect([6, 5, 4, 3, 2].map((d) => defaultMovesPerDay(d, 'intermediate'))).toEqual([3, 4, 5, 6, 6]);
  });
  it('is one lower for beginners on 2–4 day plans, never below 3', () => {
    expect(defaultMovesPerDay(4, 'beginner')).toBe(4);
    expect(defaultMovesPerDay(6, 'beginner')).toBe(3);
  });
});

describe('splitFor', () => {
  it('maps days per week to a split', () => {
    expect(splitFor(3).map((s) => s.type)).toEqual(['full', 'full', 'full']);
    expect(splitFor(4).map((s) => s.type)).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(splitFor(6).map((s) => `${s.type}${s.variant}`)).toEqual(['push0', 'pull0', 'legs0', 'push1', 'pull1', 'legs1']);
  });
});

describe('generateProgram', () => {
  const p = generateProgram(base({ days: [1, 2, 3, 4, 5, 6], movesPerDay: 3, weeks: 12, cardioDays: [0] }));

  it('makes a valid program the app accepts unchanged', () => {
    expect(validatePhases(p)).toBeNull();
    expect(sanitizeProgram(p)).toEqual(p);
    expect(p.startDate).toBe('2026-11-02');
    expect(p.endDate).toBe('2027-01-24'); // 12 weeks
    expect(p.phases.map((x) => x.id)).toEqual(['A', 'B', 'C']);
  });

  it('puts the split on the chosen days, cardio on the chosen rest day', () => {
    expect(p.weekdays.map((w) => w.focus)).toEqual(['Cardio', 'Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
    expect(p.weekdays[0].rest).toBe(false);
    expect(p.moves.A[0]).toEqual([]);
  });

  it('uses the number of moves asked for, with no repeats in a day', () => {
    for (const ph of p.phases)
      for (let wd = 1; wd <= 6; wd++) {
        const names = p.moves[ph.id][wd].map((m) => m.name);
        expect(names).toHaveLength(3);
        expect(new Set(names).size).toBe(3);
      }
  });

  it('changes moves between phases and between the two sessions of a type', () => {
    const push = (ph: string, wd: number) => p.moves[ph][wd].map((m) => m.name).join();
    expect(push('A', 1)).not.toBe(push('B', 1));
    expect(push('A', 1)).not.toBe(push('A', 4));
  });

  it('fills groups so muscle-gap hints keep working', () => {
    expect(p.weekdays[1].groups).toContain('push');
    expect(p.weekdays[2].groups).toContain('pull');
    expect(p.weekdays[3].groups).toContain('hinge');
  });

  it('respects equipment and experience', () => {
    const home = generateProgram(base({ equip: 'bodyweight', experience: 'beginner', days: [1, 3, 5], movesPerDay: 6 }));
    const all = Object.values(home.moves).flat(2);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((m) => m.bodyweight)).toBe(true);
    const names = new Set(all.map((m) => m.name));
    expect(names.has('Pull-up')).toBe(false); // advanced only
  });

  it('is deterministic, and shuffle changes it', () => {
    expect(generateProgram(base())).toEqual(generateProgram(base()));
    expect(generateProgram(base({ seed: 1 })).moves).not.toEqual(generateProgram(base()).moves);
  });

  it('works with the rest of the app (planFor)', () => {
    const ctx = { program: p, settings: defaultSettings(), overrides: new Map() };
    const mon = planFor('2026-11-02', ctx);
    expect(mon.plan.focus).toBe('Push A');
    expect(mon.moves).toHaveLength(3);
    expect(planFor('2026-11-08', ctx).moves).toEqual([]); // Sunday cardio
  });
});

describe('library', () => {
  it('every move has a picture that exists in the dataset', () => {
    const ids = new Set(EXERCISE_IDS);
    const missing = LIBRARY.filter((m) => !ids.has(exerciseFor(m.name, null) ?? '')).map((m) => m.name);
    expect(missing).toEqual([]);
  });
});

describe('sanitizeAnswers', () => {
  it('falls back field by field and never starts in the past', () => {
    const a = sanitizeAnswers({ goal: 'x', days: [1, 1, 9, 3], weeks: 13, movesPerDay: 99, cardioDays: [1, 0], startDate: '2020-01-01' }, '2026-11-02');
    expect(a.goal).toBe('muscle');
    expect(a.days).toEqual([1, 3]);
    expect(a.weeks).toBe(12);
    expect(a.movesPerDay).toBe(defaultAnswers('2026-11-02').movesPerDay);
    expect(a.cardioDays).toEqual([0]);
    expect(a.startDate).toBe('2026-11-02');
    expect(sanitizeAnswers(null, '2026-11-02')).toEqual(defaultAnswers('2026-11-02'));
  });
});
