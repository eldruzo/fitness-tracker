import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CsvFormatError,
  INBODY_COLUMNS,
  exportInbodyCsv,
  parseCsv,
  parseInbodyCsv,
  parseTimestamp,
  planImport,
  rowToEntry,
} from './inbody';

const sample = readFileSync(new URL('../../samples/inbody-sample.csv', import.meta.url), 'utf8');

describe('CSV parser', () => {
  it('handles quotes, escaped quotes, commas and newlines inside quotes', () => {
    expect(parseCsv('a,"b,c","d ""e""","f\ng"\r\n1,2,3,4\r\n')).toEqual([
      ['a', 'b,c', 'd "e"', 'f\ng'],
      ['1', '2', '3', '4'],
    ]);
  });
  it('tolerates BOM, CR-only line endings and trailing blank lines', () => {
    expect(parseCsv('﻿x,y\r1,2\r\r\n\n')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });
  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
  });
});

describe('timestamps', () => {
  it('parses YYYYMMDDHHmmss as local time', () => {
    const d = parseTimestamp('20261004085416')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([
      2026, 9, 4, 8, 54, 16,
    ]);
  });
  it('rejects invalid timestamps', () => {
    expect(parseTimestamp('20261304085416')).toBeNull();
    expect(parseTimestamp('20260230085416')).toBeNull();
    expect(parseTimestamp('2026100408541')).toBeNull();
    expect(parseTimestamp('20261004250000')).toBeNull();
  });
});

describe('InBody import', () => {
  it('reads the sample file with all 45 columns', () => {
    const r = parseInbodyCsv(sample);
    expect(INBODY_COLUMNS).toHaveLength(45);
    expect(r.missingColumns).toEqual([]);
    expect(r.unknownColumns).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0].ts).toBe('20261004085416');
    expect(r.rows[0].date).toBe('2026-10-04');
    expect(r.rows[0].values['Weight(kg)']).toBe(82.4);
    expect(r.rows[0].values['Measurement device.']).toBe('InBody570');
    expect(r.rows[0].values['Left leg Lean Mass(kg)']).toBe(9);
  });

  it('stores "-" as null, never 0', () => {
    const r = parseInbodyCsv(sample);
    const empty = r.rows[2];
    expect(empty.values['Weight(kg)']).toBeNull();
    expect(empty.values['Upper-Lower']).toBeNull();
    expect(Object.values(empty.values).filter((v) => v !== null)).toEqual(['InBody570']);
    // a real 0 stays 0
    expect(r.rows[0].values['Upper-Lower']).toBe(0);
  });

  it('matches headers case-insensitively with trimmed whitespace', () => {
    const csv = ' date , WEIGHT(KG) ,left LEG lean mass(kg),Mystery\n20261011091203,80.1,9.2,x\n';
    const r = parseInbodyCsv(csv);
    expect(r.rows[0].values['Weight(kg)']).toBe(80.1);
    expect(r.rows[0].values['Left leg Lean Mass(kg)']).toBe(9.2);
    expect(r.unknownColumns).toEqual(['Mystery']);
    expect(r.missingColumns).toHaveLength(42);
    expect(r.rows[0].extra).toEqual({ Mystery: 'x' });
  });

  it('flags bad rows and duplicates within the file', () => {
    const csv = 'Date,Weight(kg)\n20261011091203,80\nnot-a-date,81\n20261011091203,80\n20261018091203,abc\n';
    const r = parseInbodyCsv(csv);
    expect(r.errors).toEqual([{ line: 3, message: 'badDate' }]);
    expect(r.duplicateInFile).toEqual(['20261011091203']);
    expect(r.rows[2].warnings).toEqual(['Weight(kg)']);
    expect(r.rows[2].values['Weight(kg)']).toBeNull();
  });

  it('rejects files without a Date column', () => {
    expect(() => parseInbodyCsv('Weight(kg)\n80\n')).toThrow(CsvFormatError);
    expect(() => parseInbodyCsv('')).toThrow(CsvFormatError);
  });

  it('importing the same file twice creates no duplicates and never overwrites silently', () => {
    const r = parseInbodyCsv(sample);
    const first = planImport(r, new Map());
    expect(first.every((x) => x.status === 'new')).toBe(true);
    const stored = new Map(first.map((x) => [x.ts, rowToEntry(x)]));
    const second = planImport(parseInbodyCsv(sample), stored);
    expect(second.every((x) => x.status === 'same')).toBe(true);
    const edited = sample.replace('20261011091203,InBody570,82.0', '20261011091203,InBody570,90.0');
    const third = planImport(parseInbodyCsv(edited), stored);
    expect(third.find((x) => x.ts === '20261011091203')?.status).toBe('conflict');
  });
});

describe('InBody export', () => {
  it('round-trips: export(parse(file)) parses back to the same data', () => {
    const r = parseInbodyCsv(sample);
    const entries = r.rows.map(rowToEntry);
    const out = exportInbodyCsv(entries);
    const back = parseInbodyCsv(out);
    expect(back.rows.map((x) => [x.ts, x.values])).toEqual(r.rows.map((x) => [x.ts, x.values]));
    expect(back.missingColumns).toEqual([]);
  });

  it('writes the exact header, raw timestamps and "-" for empty values', () => {
    const r = parseInbodyCsv(sample);
    const out = exportInbodyCsv(r.rows.map(rowToEntry));
    const lines = out.split('\r\n');
    expect(lines[0]).toBe(INBODY_COLUMNS.join(','));
    expect(lines[3]).toBe(['20261018090010', 'InBody570', ...Array(43).fill('-')].join(','));
    // identical to the source data rows
    const src = sample.replace(/^﻿/, '').split('\r\n').filter(Boolean);
    expect(lines.filter(Boolean)).toEqual(src);
  });
});
