import { describe, expect, it } from 'vitest';
import type { DateKey } from './dates';
import { detectGaps, pickHint, trainedYesterday } from './gaps';
import { defaultSettings, seedProgram } from './program';
import type { ScheduleContext } from './schedule';
import type { DayLog, HintState, Settings } from './types';

const log = (date: DateKey, status: DayLog['status']): DayLog => ({
  date,
  status,
  warmup: status === 'partial',
  cardio: false,
  moves: [],
  updatedAt: 0,
});
const ctx = (logs: DayLog[], settings: Partial<Settings> = {}): ScheduleContext => ({
  program: seedProgram(),
  settings: { ...defaultSettings(), ...settings },
  overrides: new Map(),
  logs: new Map(logs.map((l) => [l.date, l])),
});
const noHints: HintState = { dismissed: [], snoozed: null };

// Week 1: Mon 12 arms, Tue 13 push, Wed 14 core, Thu 15 pull+hinge, Fri 16 rest, Sat 17 push, Sun 18 pull+hinge
const doneAllBut = (skip: DateKey[], until: DateKey) => {
  const out: DayLog[] = [];
  for (let d = new Date('2026-10-12T12:00:00Z'); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    if (k >= until) break;
    if (d.getUTCDay() === 5) continue;
    out.push(log(k, skip.includes(k) ? 'missed' : 'done'));
  }
  return out;
};

describe('muscle-group gaps', () => {
  it('a single missed session never triggers', () => {
    const c = ctx(doneAllBut(['2026-10-15'], '2026-10-17'));
    expect(detectGaps(c, '2026-10-17')).toEqual([]);
  });

  it('two missed Pull sessions in a row trigger a gap for pull and hinge', () => {
    const c = ctx(doneAllBut(['2026-10-15', '2026-10-18'], '2026-10-20'));
    const gaps = detectGaps(c, '2026-10-20');
    expect(gaps.map((g) => g.group)).toEqual(['pull', 'hinge']);
    expect(gaps[0].lastTrained).toBeNull();
    expect(gaps[0].days).toBe(8);
    expect(gaps[0].suggestSession).toBe(0);
  });

  it('partial sessions count as not trained', () => {
    const logs = doneAllBut([], '2026-10-20').map((l) =>
      l.date === '2026-10-13' || l.date === '2026-10-17' ? log(l.date, 'partial') : l,
    );
    expect(detectGaps(ctx(logs), '2026-10-20').map((g) => g.group)).toEqual(['push']);
  });

  it('measures the gap from the last trained session', () => {
    // Pull done Sun 18; missed Thu 22 and Sun 25 → gap, last trained 18/10
    const c = ctx(doneAllBut(['2026-10-22', '2026-10-25'], '2026-10-27'));
    const g = detectGaps(c, '2026-10-27')[0];
    expect(g.group).toBe('pull');
    expect(g.lastTrained).toBe('2026-10-18');
    expect(g.days).toBe(9);
    expect(g.id).toBe('pull:2026-10-18');
  });

  it('shows at most one hint, never on Friday, paused days, or during a session', () => {
    const logs = doneAllBut(['2026-10-15', '2026-10-18'], '2026-10-20');
    const c = ctx(logs);
    const h = pickHint(c, '2026-10-20', noHints, { enabled: true, sessionActive: false });
    expect(h?.gap.group).toBe('pull');
    expect(pickHint(c, '2026-10-20', noHints, { enabled: true, sessionActive: true })).toBeNull();
    expect(pickHint(c, '2026-10-20', noHints, { enabled: false, sessionActive: false })).toBeNull();
    expect(pickHint(c, '2026-10-23', noHints, { enabled: true, sessionActive: false })).toBeNull(); // Friday
    const paused = ctx(logs, { pauses: [{ id: 'p', start: '2026-10-20', end: '2026-10-21' }] });
    expect(pickHint(paused, '2026-10-20', noHints, { enabled: true, sessionActive: false })).toBeNull();
  });

  it('respects dismiss until the next new gap, and snooze until it ends', () => {
    const c = ctx(doneAllBut(['2026-10-15', '2026-10-18'], '2026-10-20'));
    const dismissed: HintState = { dismissed: ['pull:none', 'hinge:none'], snoozed: null };
    expect(pickHint(c, '2026-10-20', dismissed, { enabled: true, sessionActive: false })).toBeNull();
    const snoozed: HintState = { dismissed: ['hinge:none'], snoozed: { id: 'pull:none', group: 'pull', until: '2026-10-23' } };
    expect(pickHint(c, '2026-10-20', snoozed, { enabled: true, sessionActive: false })).toBeNull();
    const c2 = ctx(doneAllBut(['2026-10-15', '2026-10-18', '2026-10-22'], '2026-10-24'));
    expect(pickHint(c2, '2026-10-24', snoozed, { enabled: true, sessionActive: false })?.gap.group).toBe('pull');
  });

  it('skips the hint when today already trains that group', () => {
    const c = ctx(doneAllBut(['2026-10-15', '2026-10-18'], '2026-10-22'));
    // Thu 22 is a pull day
    expect(pickHint(c, '2026-10-22', noHints, { enabled: true, sessionActive: false })).toBeNull();
  });

  it('notes when the swap would hit a big group trained yesterday', () => {
    // Push missed Tue 13 and Sat 17; Sun 18 pull done; today Mon 19 → swap to push: pull/hinge yesterday ≠ push
    const c = ctx(doneAllBut(['2026-10-13', '2026-10-17'], '2026-10-19'));
    const h = pickHint(c, '2026-10-19', noHints, { enabled: true, sessionActive: false });
    expect(h?.gap.group).toBe('push');
    expect(h?.trainedYesterday).toBe(false);
    // Direct check: Sun 18 pull+hinge done; swapping Mon 19 to Thu's pull session overlaps.
    expect(trainedYesterday(c, '2026-10-19', 4)).toBe(true);
    expect(trainedYesterday(c, '2026-10-19', 3)).toBe(false); // core is not a big group
  });
});
