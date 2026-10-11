import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBackup } from '../../src/lib/backup';
import { parseInbodyCsv, rowToEntry } from '../../src/lib/inbody';
import { defaultSettings, seedProgram } from '../../src/lib/program';
import type { DayLog } from '../../src/lib/types';

/** Writes a backup with a week of logged sessions and the sample InBody rows; returns its path. */
export function writeFixtureBackup(): string {
  const program = seedProgram();
  const csv = readFileSync(fileURLToPath(new URL('../../samples/inbody-sample.csv', import.meta.url)), 'utf8');
  const days: DayLog[] = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18'].map((date, i) => {
    const wd = new Date(date + 'T12:00:00Z').getUTCDay();
    return {
      date,
      status: i === 4 ? 'partial' : 'done',
      warmup: true,
      cardio: true,
      updatedAt: 0,
      moves: program.moves.A[wd].map((m, j) => ({
        name: m.name,
        bodyweight: m.bodyweight,
        sets: Array.from({ length: i === 4 && j > 0 ? 1 : 4 }, (_, k) => ({ kg: m.bodyweight ? null : 10 + j * 5 + k, reps: 12, at: 0 })),
      })),
    };
  });
  const backup = makeBackup({
    program,
    settings: defaultSettings(),
    days,
    overrides: [],
    body: parseInbodyCsv(csv).rows.map(rowToEntry),
    counters: [],
    hints: { dismissed: [], snoozed: null },
  });
  const file = join(mkdtempSync(join(tmpdir(), 'gymlog-')), 'backup.json');
  writeFileSync(file, JSON.stringify(backup));
  return file;
}
