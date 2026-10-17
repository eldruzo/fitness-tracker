import { describe, expect, it } from 'vitest';
import { EXERCISE_IDS } from './exercise-index';
import { buildIndex, exerciseFor, normalizeName } from './exercises';
import { seedProgram } from './program';

const index = buildIndex(EXERCISE_IDS);

describe('exercise pictures', () => {
  it('has a picture for every move in the built-in program', () => {
    const p = seedProgram();
    const names = new Set(Object.values(p.moves).flat(2).map((m) => m.name));
    const missing = [...names].filter((n) => !exerciseFor(n, null));
    expect(missing).toEqual([]);
  });

  it('every curated picture exists in the dataset', () => {
    const p = seedProgram();
    const ids = new Set(EXERCISE_IDS);
    for (const m of Object.values(p.moves).flat(2)) expect(ids.has(exerciseFor(m.name, null)!)).toBe(true);
  });

  it('matches renamed moves by exact name, ignoring case, punctuation and plurals', () => {
    expect(normalizeName('Hammer Curls')).toBe(normalizeName('hammer curl'));
    expect(exerciseFor('Concentration curls', index)).toBe('Concentration_Curls');
    expect(exerciseFor('  ARNOLD press ', index)).toBe('Arnold_Dumbbell_Press');
  });

  it('shows nothing rather than guessing', () => {
    expect(exerciseFor('My special machine', index)).toBeNull();
    expect(exerciseFor('Curl', index)).toBeNull();
  });
});
