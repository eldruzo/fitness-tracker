import { describe, expect, it } from 'vitest';
import { niceTicks } from './LineChart';

describe('chart ticks', () => {
  it('produces 1-2-5 steps covering the range', () => {
    expect(niceTicks(81.3, 82.4, 4)).toEqual([81, 81.5, 82, 82.5]);
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
  });
  it('never steps below the display precision', () => {
    expect(niceTicks(7, 8, 4, 1)).toEqual([7, 8]);
  });
});
