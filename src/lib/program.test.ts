import { describe, expect, it } from 'vitest';
import { addDays, diffDays, eachDay, isDateKey, startOfWeek, weekday } from './dates';
import { defaultSettings, deloadKg, isTrainingDay, planFor, seedProgram, validatePhases, type PlanContext } from './program';

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  program: seedProgram(),
  settings: defaultSettings(),
  overrides: new Map(),
  ...over,
});

describe('dates', () => {
  it('adds days across DST changes without drift', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(diffDays('2026-10-12', '2027-01-31')).toBe(111);
  });
  it('validates keys', () => {
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-13-01')).toBe(false);
  });
  it('computes weekday and week start', () => {
    expect(weekday('2026-10-12')).toBe(1);
    expect(weekday('2027-01-31')).toBe(0);
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
  });
});

describe('program-day mapping', () => {
  const c = ctx();
  const days = eachDay(c.program.startDate, c.program.endDate).map((d) => planFor(d, c));

  it('spans 112 days and 16 weeks with 96 training sessions', () => {
    expect(days).toHaveLength(112);
    expect(days[0].dayNumber).toBe(1);
    expect(days[111].dayNumber).toBe(112);
    expect(days[111].week).toBe(16);
    expect(days.filter(isTrainingDay)).toHaveLength(96);
  });

  it('always rests on Friday and has 3 moves on training days', () => {
    for (const d of days) {
      if (d.weekday === 5) {
        expect(d.rest).toBe(true);
        expect(d.moves).toHaveLength(0);
      } else {
        expect(d.rest).toBe(false);
        expect(d.moves).toHaveLength(3);
      }
    }
  });

  it('maps phase boundaries', () => {
    const at = (k: string) => planFor(k, c);
    expect(at('2026-10-12').phase?.id).toBe('A');
    expect(at('2026-11-08').phase?.id).toBe('A');
    expect(at('2026-11-09').phase?.id).toBe('B');
    expect(at('2026-12-06').phase?.id).toBe('B');
    expect(at('2026-12-07').phase?.id).toBe('C');
    expect(at('2027-01-03').phase?.id).toBe('C');
    expect(at('2027-01-04').phase?.id).toBe('D');
    expect(at('2027-01-31').phase?.id).toBe('D');
    expect(at('2026-10-11').inProgram).toBe(false);
    expect(at('2027-02-01').inProgram).toBe(false);
  });

  it('marks deload in weeks 4, 8, 12 and 16 only', () => {
    const deloadWeeks = new Set(days.filter((d) => d.deload).map((d) => d.week));
    expect([...deloadWeeks].sort((a, b) => a - b)).toEqual([4, 8, 12, 16]);
    expect(planFor('2026-11-02', c).deload).toBe(true);
    expect(planFor('2026-11-01', c).deload).toBe(false);
    expect(planFor('2026-11-06', c).deload).toBe(false); // Friday rest is never tagged
    expect(planFor('2026-11-02', c).phaseWeek).toBe(4);
  });

  it('turns deload off with the setting', () => {
    const off = ctx({ settings: { ...defaultSettings(), deload: false } });
    expect(planFor('2026-11-02', off).deload).toBe(false);
  });

  it('suggests about 70% rounded to 0.5 kg', () => {
    expect(deloadKg(20, 70)).toBe(14);
    expect(deloadKg(22.5, 70)).toBe(16);
    expect(deloadKg(7, 70)).toBe(5);
  });

  it('flags bodyweight moves', () => {
    expect(planFor('2026-10-14', c).moves[2]).toEqual({ name: 'Abs (plank or leg raise)', bodyweight: true });
    expect(planFor('2026-11-11', c).moves[2]).toEqual({ name: 'Cable crunch', bodyweight: false });
    expect(planFor('2026-12-09', c).moves[2].bodyweight).toBe(true);
    expect(planFor('2027-01-06', c).moves[2].bodyweight).toBe(true);
  });

  it('applies phase and session overrides per date', () => {
    const o = ctx({
      overrides: new Map([
        ['2026-11-09', { date: '2026-11-09', phaseId: 'A' }],
        ['2026-10-13', { date: '2026-10-13', sessionOf: 4, reason: 'swap' as const }],
      ]),
    });
    expect(planFor('2026-11-09', o).phase?.id).toBe('A');
    expect(planFor('2026-11-09', o).moves[0].name).toBe('Lateral raise');
    const swapped = planFor('2026-10-13', o);
    expect(swapped.plan.focus).toBe('Pull + hinge');
    expect(swapped.moves[0].name).toBe('Close-grip pulldown');
    expect(swapped.swapped).toBe(true);
  });

  it('treats paused days as non-training', () => {
    const p = ctx({ settings: { ...defaultSettings(), pauses: [{ id: 'x', start: '2026-12-21', end: '2026-12-27' }] } });
    const d = planFor('2026-12-22', p);
    expect(d.paused).toBe(true);
    expect(isTrainingDay(d)).toBe(false);
  });

  it('validates edited phases', () => {
    const p = seedProgram();
    expect(validatePhases(p)).toBeNull();
    p.phases[1] = { ...p.phases[1], start: '2026-11-08' };
    expect(validatePhases(p)).toBe('phases.overlap');
  });
});
