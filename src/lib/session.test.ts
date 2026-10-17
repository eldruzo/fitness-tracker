import { describe, expect, it } from 'vitest';
import { defaultSettings, planFor, seedProgram } from './program';
import { buildSteps, currentStep } from './session';
import type { DayLog } from './types';
import { sanitizeLog, sanitizeProgram, sanitizeSettings } from './validate';

const program = seedProgram();
const ctx = { program, settings: defaultSettings(), overrides: new Map() };
const plan = planFor('2026-10-13', ctx); // Tuesday: 3 moves

describe('cool-down step', () => {
  it('comes after the last move', () => {
    const steps = buildSteps(plan, undefined, program.session);
    expect(steps.map((s) => s.kind)).toEqual(['warmup', 'cardio', 'move', 'move', 'move', 'cooldown']);
    expect(steps[5].index).toBe(5);
  });

  it('is hidden when the length is 0', () => {
    const steps = buildSteps(plan, undefined, { ...program.session, cooldownMin: 0 });
    expect(steps.some((s) => s.kind === 'cooldown')).toBe(false);
  });

  it('keeps the session open until the cool-down is done', () => {
    const full = (cooldown: boolean): DayLog => ({
      date: plan.date,
      status: 'active',
      warmup: true,
      cardio: true,
      cooldown,
      moves: plan.moves.map((m) => ({ ...m, sets: Array.from({ length: 4 }, () => ({ kg: 10, reps: 12, at: 0 })) })),
      updatedAt: 0,
    });
    expect(currentStep(buildSteps(plan, full(false), program.session))).toBe(5);
    expect(currentStep(buildSteps(plan, full(true), program.session))).toBe(-1);
  });
});

describe('stored data from before this update', () => {
  it('gets a 10 minute cool-down and auto-start on', () => {
    const { cooldownMin: _c, ...oldSession } = program.session;
    void _c;
    expect(sanitizeProgram({ ...program, session: oldSession }).session.cooldownMin).toBe(10);
    const s = sanitizeSettings({ theme: 'dark' });
    expect(s.autoStart).toBe(true);
    expect(s.accent).toBe('orange');
  });

  it('keeps the cool-down flag on logs and rejects unknown accents', () => {
    expect(sanitizeLog({ date: '2026-10-13', status: 'done', cooldown: true, moves: [] })?.cooldown).toBe(true);
    expect(sanitizeSettings({ accent: 'neon' }).accent).toBe('orange');
    expect(sanitizeSettings({ accent: 'teal' }).accent).toBe('teal');
  });
});
