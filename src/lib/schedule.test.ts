import { afterEach, describe, expect, it } from 'vitest';
import { todayKey, type DateKey } from './dates';
import { defaultSettings, planFor, seedProgram } from './program';
import { computeStats, dayStatus, detectMissed, previewShift, unacknowledgedMissed, type ScheduleContext } from './schedule';
import type { DayLog, DayOverride, Settings } from './types';

function log(date: DateKey, status: DayLog['status'], extra: Partial<DayLog> = {}): DayLog {
  return { date, status, warmup: false, cardio: false, moves: [], updatedAt: 0, ...extra };
}
function withSets(date: DateKey, status: DayLog['status']): DayLog {
  return log(date, status, {
    warmup: true,
    moves: [{ name: 'Lateral raise', bodyweight: false, sets: [{ kg: 8, reps: 12, at: 1 }] }],
  });
}
function ctx(logs: DayLog[] = [], settings: Partial<Settings> = {}, overrides: DayOverride[] = []): ScheduleContext {
  return {
    program: seedProgram(),
    settings: { ...defaultSettings(), ...settings },
    overrides: new Map(overrides.map((o) => [o.date, o])),
    logs: new Map(logs.map((l) => [l.date, l])),
  };
}

describe('missed-day detection', () => {
  it('finds nothing before or on the first day', () => {
    expect(detectMissed(ctx(), '2026-10-01')).toEqual([]);
    expect(detectMissed(ctx(), '2026-10-12')).toEqual([]);
  });

  it('marks a single unlogged training day as missed', () => {
    expect(detectMissed(ctx(), '2026-10-13')).toEqual([{ date: '2026-10-12', kind: 'missed' }]);
  });

  it('lists several missed days and skips the Friday rest', () => {
    const c = ctx([log('2026-10-12', 'done')]);
    // Tue 13 → Sat 17 not logged, today Sun 18
    expect(detectMissed(c, '2026-10-18').map((m) => m.date)).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-17',
    ]);
  });

  it('turns a started session into partial after midnight, keeping its sets', () => {
    const c = ctx([withSets('2026-10-12', 'active')]);
    expect(detectMissed(c, '2026-10-12')).toEqual([]); // still the same day
    expect(detectMissed(c, '2026-10-13')).toEqual([{ date: '2026-10-12', kind: 'partial' }]);
    expect(dayStatus('2026-10-12', c, '2026-10-13')).toBe('partial');
  });

  it('treats an opened session with no progress as missed', () => {
    const c = ctx([log('2026-10-12', 'active')]);
    expect(detectMissed(c, '2026-10-13')).toEqual([{ date: '2026-10-12', kind: 'missed' }]);
  });

  it('does not re-detect days already resolved', () => {
    const c = ctx([log('2026-10-12', 'missed', { ack: true }), log('2026-10-13', 'pending'), log('2026-10-14', 'skipped')]);
    expect(detectMissed(c, '2026-10-15')).toEqual([]);
    expect(dayStatus('2026-10-13', c, '2026-10-15')).toBe('pending');
  });

  it('ignores paused days', () => {
    const c = ctx([], { pauses: [{ id: 'p', start: '2026-10-12', end: '2026-10-14' }] });
    expect(detectMissed(c, '2026-10-16').map((m) => m.date)).toEqual(['2026-10-15']);
  });

  it('stops at the program end', () => {
    const missed = detectMissed(ctx(), '2027-03-01');
    expect(missed).toHaveLength(96);
    expect(missed[missed.length - 1].date).toBe('2027-01-31');
  });

  it('lists unacknowledged missed days for the banner', () => {
    const c = ctx([log('2026-10-12', 'missed'), log('2026-10-13', 'missed', { ack: true }), log('2026-10-14', 'missed')]);
    expect(unacknowledgedMissed(c, '2026-10-15')).toEqual(['2026-10-12', '2026-10-14']);
  });

  it('separates missed, planned rest and manual skip', () => {
    const c = ctx([log('2026-10-13', 'skipped')]);
    expect(dayStatus('2026-10-12', c, '2026-10-20')).toBe('missed');
    expect(dayStatus('2026-10-13', c, '2026-10-20')).toBe('skipped');
    expect(dayStatus('2026-10-16', c, '2026-10-20')).toBe('rest');
    expect(dayStatus('2026-10-20', c, '2026-10-20')).toBe('today');
    expect(dayStatus('2026-10-21', c, '2026-10-20')).toBe('upcoming');
    expect(dayStatus('2026-10-01', c, '2026-10-20')).toBe('before');
    expect(dayStatus('2027-02-02', c, '2026-10-20')).toBe('after');
  });
});

describe('midnight rollover and timezone changes', () => {
  const origTZ = process.env.TZ;
  afterEach(() => {
    process.env.TZ = origTZ;
  });

  it('uses the device local date at the moment of the check', () => {
    // 23:30 UTC on 12 Oct is still the 12th in London-winter (UTC+0)… but the 13th in Tokyo.
    const instant = new Date('2026-10-12T23:30:00Z');
    process.env.TZ = 'UTC';
    expect(todayKey(instant)).toBe('2026-10-12');
    process.env.TZ = 'Asia/Tokyo';
    expect(todayKey(instant)).toBe('2026-10-13');
    process.env.TZ = 'America/Los_Angeles';
    expect(todayKey(instant)).toBe('2026-10-12');
  });

  it('never marks "today" missed after flying west (date goes backwards)', () => {
    const c = ctx([withSets('2026-10-13', 'active')]);
    // Logged on the 13th in Tokyo, then the device switches to LA where it is the 12th again.
    expect(detectMissed(c, '2026-10-12')).toEqual([]);
    expect(dayStatus('2026-10-13', c, '2026-10-12')).toBe('active');
  });

  it('marks days missed only once the local date has passed them', () => {
    const c = ctx([log('2026-10-12', 'done')]);
    expect(detectMissed(c, '2026-10-13')).toEqual([]);
    expect(detectMissed(c, '2026-10-14')).toEqual([{ date: '2026-10-13', kind: 'missed' }]);
  });
});

describe('stats', () => {
  it('counts only planned training days; Friday does not break the streak', () => {
    const c = ctx([
      log('2026-10-12', 'done'),
      log('2026-10-13', 'done'),
      log('2026-10-14', 'done'),
      log('2026-10-15', 'done'),
      // Fri 16 rest
      log('2026-10-17', 'done'),
    ]);
    const s = computeStats(c, '2026-10-18');
    expect(s.planned).toBe(5);
    expect(s.done).toBe(5);
    expect(s.streak).toBe(5);
    expect(s.completionPct).toBe(100);
  });

  it('breaks the streak on a missed day and excludes paused days', () => {
    const c = ctx(
      [log('2026-10-12', 'done'), log('2026-10-14', 'done'), log('2026-10-15', 'done')],
      { pauses: [{ id: 'p', start: '2026-10-17', end: '2026-10-18' }] },
    );
    const s = computeStats(c, '2026-10-19');
    expect(s.planned).toBe(4); // 12, 13, 14, 15
    expect(s.missed).toBe(1);
    expect(s.streak).toBe(2);
    expect(s.completionPct).toBe(75);
  });

  it('does not penalise an unfinished today', () => {
    const c = ctx([log('2026-10-12', 'done')]);
    const s = computeStats(c, '2026-10-13');
    expect(s.planned).toBe(1);
    expect(s.streak).toBe(1);
  });
});

describe('shift plan', () => {
  it('moves the missed session to the next slot and never into Friday', () => {
    const c = ctx([log('2026-10-12', 'missed')]);
    // Missed Mon (shoulders+arms) → Tue 13 trains Mon's session, Wed trains Tue's, Thu Wed's, Sat Thu's...
    const prev = previewShift(c, '2026-10-12', '2026-10-13');
    expect(prev.steps[0]).toEqual({ date: '2026-10-13', from: 2, to: 1 });
    expect(prev.steps[1]).toEqual({ date: '2026-10-14', from: 3, to: 2 });
    expect(prev.steps[2]).toEqual({ date: '2026-10-15', from: 4, to: 3 });
    expect(prev.steps.some((s) => s.date === '2026-10-16')).toBe(false);
    expect(prev.steps[3]).toEqual({ date: '2026-10-17', from: 6, to: 4 });
    expect(prev.dropped).toBe(0); // last Sunday's session falls off the end
  });

  it('keeps phases calendar-based after a shift', () => {
    const c = ctx([], {}, [{ date: '2026-11-09', sessionOf: 0, reason: 'shift' }]);
    const p = planFor('2026-11-09', c);
    expect(p.phase?.id).toBe('B');
    expect(p.moves[0].name).toBe('Wide-grip lat pulldown');
  });
});
