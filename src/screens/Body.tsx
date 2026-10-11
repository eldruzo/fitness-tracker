import { useId, useRef, useState } from 'preact/hooks';
import { fmtDate, fmtNum, fmtSigned, t, tn, type MessageKey } from '../i18n';
import { addDays, eachDay, todayKey, weekday, type DateKey } from '../lib/dates';
import {
  CsvFormatError,
  DEVICE_COLUMN,
  INBODY_COLUMNS,
  KEY_METRICS,
  exportInbodyCsv,
  makeTimestamp,
  parseInbodyCsv,
  planImport,
  rowToEntry,
  timestampTime,
  type ImportPlanRow,
  type ParseResult,
} from '../lib/inbody';
import type { BodyEntry, BodyValue } from '../lib/types';
import { body, deleteBodyEntry, program, saveBodyEntries } from '../state';
import { Button, Confirm, Dialog, EmptyState, downloadText } from '../ui/components';
import { LineChart } from '../ui/LineChart';

const METRIC_LABEL: Record<(typeof KEY_METRICS)[number], MessageKey> = {
  'Weight(kg)': 'body.weight',
  'Skeletal Muscle Mass(kg)': 'body.smm',
  'Body Fat Mass(kg)': 'body.bfm',
  'Percent Body Fat(%)': 'body.pbf',
  'Visceral Fat Level(Level)': 'body.vfl',
  'InBody Score': 'body.score',
};
const METRIC_UNIT: Record<(typeof KEY_METRICS)[number], string> = {
  'Weight(kg)': 'kg',
  'Skeletal Muscle Mass(kg)': 'kg',
  'Body Fat Mass(kg)': 'kg',
  'Percent Body Fat(%)': '%',
  'Visceral Fat Level(Level)': '',
  'InBody Score': '',
};
const METRIC_DIGITS: Record<(typeof KEY_METRICS)[number], number> = {
  'Weight(kg)': 1,
  'Skeletal Muscle Mass(kg)': 1,
  'Body Fat Mass(kg)': 1,
  'Percent Body Fat(%)': 1,
  'Visceral Fat Level(Level)': 0,
  'InBody Score': 0,
};

const num = (v: BodyValue | undefined): number | null => (typeof v === 'number' ? v : null);
const cell = (v: BodyValue | undefined, digits = 2) =>
  v === null || v === undefined ? '' : typeof v === 'number' ? fmtNum(v, digits) : v;

/** Weekly measurement Sundays covering the program (Sunday before the start → last Sunday). */
function measurementSundays(): DateKey[] {
  const p = program.value;
  let first = addDays(p.startDate, -1);
  while (weekday(first) !== 0) first = addDays(first, -1);
  return eachDay(first, p.endDate).filter((d) => weekday(d) === 0);
}

export default function Body() {
  const entries = [...body.value.values()].sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const [form, setForm] = useState<{ open: boolean; entry: BodyEntry | null }>({ open: false, entry: null });
  const [importing, setImporting] = useState(false);
  const [del, setDel] = useState<BodyEntry | null>(null);
  const [allCols, setAllCols] = useState(false);

  return (
    <div class="body-screen">
      <header class="page-head">
        <h1 tabIndex={-1}>{t('body.title')}</h1>
      </header>
      <div class="row-actions">
        <Button variant="primary" icon="plus" onClick={() => setForm({ open: true, entry: null })}>
          {t('body.add')}
        </Button>
        <Button variant="secondary" icon="upload" onClick={() => setImporting(true)}>
          {t('body.importCsv')}
        </Button>
        <Button
          variant="text"
          icon="download"
          disabled={!entries.length}
          onClick={() => downloadText(`inbody-export-${todayKey().replace(/-/g, '')}.csv`, exportInbodyCsv(entries), 'text/csv;charset=utf-8')}
        >
          {t('body.exportCsv')}
        </Button>
      </div>

      <SundayStrip entries={entries} />

      {!entries.length ? (
        <EmptyState title={t('body.emptyTitle')}>
          <p>{t('body.emptyBody')}</p>
        </EmptyState>
      ) : (
        <>
          <SummaryCard entries={entries} />
          <section aria-labelledby="trends-h">
            <h2 id="trends-h" class="section-label">
              {t('body.trends')}
            </h2>
            <div class="chart-grid">
              {KEY_METRICS.map((m) => {
                const pts = entries.filter((e) => num(e.values[m]) !== null).map((e) => ({ date: e.date, value: num(e.values[m])! }));
                return (
                  <figure class="chart-fig" key={m}>
                    <figcaption class="section-label">{t(METRIC_LABEL[m])}</figcaption>
                    {pts.length ? (
                      <LineChart points={pts} label={t(METRIC_LABEL[m])} unit={METRIC_UNIT[m]} digits={METRIC_DIGITS[m]} height={150} />
                    ) : (
                      <p class="hint">{t('body.noValues')}</p>
                    )}
                  </figure>
                );
              })}
            </div>
            <p class="hint">{t('body.tableIsFallback')}</p>
          </section>

          <section aria-labelledby="table-h">
            <div class="section-head">
              <h2 id="table-h" class="section-label">
                {t('body.entries')}
              </h2>
              <label class="check-row">
                <input type="checkbox" checked={allCols} onChange={(e) => setAllCols(e.currentTarget.checked)} />
                <span>{t('body.allColumns')}</span>
              </label>
            </div>
            <div class="table-wrap" tabIndex={0} role="region" aria-label={t('body.entries')}>
              <table class="table body-table">
                <thead>
                  <tr>
                    <th scope="col" class="sticky-col">
                      {t('common.date')}
                    </th>
                    {(allCols ? INBODY_COLUMNS.slice(1) : KEY_METRICS).map((c) => (
                      <th scope="col" class="num" key={c}>
                        {c in METRIC_LABEL ? t(METRIC_LABEL[c as (typeof KEY_METRICS)[number]]) : c}
                      </th>
                    ))}
                    <th scope="col">
                      <span class="visually-hidden">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map((e) => (
                    <tr key={e.ts}>
                      <th scope="row" class="sticky-col mono" title={timestampTime(e.ts)}>
                        {fmtDate(e.date)}
                      </th>
                      {(allCols ? INBODY_COLUMNS.slice(1) : KEY_METRICS).map((c) => (
                        <td class={c === DEVICE_COLUMN ? '' : 'num mono'} key={c}>
                          {cell(e.values[c])}
                        </td>
                      ))}
                      <td class="row-btns">
                        <button type="button" class="btn btn-text btn-sm" onClick={() => setForm({ open: true, entry: e })}>
                          {t('common.edit')}
                          <span class="visually-hidden"> {fmtDate(e.date)}</span>
                        </button>
                        <button type="button" class="btn btn-text btn-sm" onClick={() => setDel(e)}>
                          {t('common.delete')}
                          <span class="visually-hidden"> {fmtDate(e.date)}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <EntryForm open={form.open} entry={form.entry} onClose={() => setForm({ open: false, entry: null })} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <Confirm
        open={!!del}
        title={t('body.deleteTitle')}
        body={<p>{del && t('body.deleteBody', { date: fmtDate(del.date), time: timestampTime(del.ts) })}</p>}
        confirmLabel={t('common.delete')}
        danger
        onClose={() => setDel(null)}
        onConfirm={() => del && void deleteBodyEntry(del.ts)}
      />
    </div>
  );
}

function SundayStrip({ entries }: { entries: BodyEntry[] }) {
  const sundays = measurementSundays();
  const has = (s: DateKey) => entries.some((e) => e.date > addDays(s, -7) && e.date <= s);
  const done = sundays.filter(has).length;
  const td = todayKey();
  return (
    <section class="sundays" aria-labelledby="sun-h">
      <h2 id="sun-h" class="section-label">
        {t('body.sundays', { done, total: sundays.length })}
      </h2>
      <ol class="sunday-strip">
        {sundays.map((s) => {
          const ok = has(s);
          return (
            <li key={s} class={`sunday${ok ? ' is-done' : ''}${s > td ? ' is-future' : ''}`} title={fmtDate(s)}>
              <span class="mono">{fmtDate(s).slice(0, 5)}</span>
              <span class="visually-hidden">{ok ? t('body.measured') : s > td ? t('status.upcoming') : t('body.notMeasured')}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SummaryCard({ entries }: { entries: BodyEntry[] }) {
  return (
    <section class="body-summary" aria-labelledby="sum-h">
      <h2 id="sum-h" class="section-label">
        {t('body.summary')}
      </h2>
      <div class="table-wrap" tabIndex={0} role="region" aria-label={t('body.summary')}>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">{t('body.metric')}</th>
              <th scope="col" class="num">
                {t('progress.first')}
              </th>
              <th scope="col" class="num">
                {t('progress.latest')}
              </th>
              <th scope="col" class="num">
                {t('progress.change')}
              </th>
            </tr>
          </thead>
          <tbody>
            {KEY_METRICS.map((m) => {
              const withVal = entries.filter((e) => num(e.values[m]) !== null);
              const f = withVal[0];
              const l = withVal[withVal.length - 1];
              const d = METRIC_DIGITS[m];
              return (
                <tr key={m}>
                  <th scope="row">{t(METRIC_LABEL[m])}</th>
                  <td class="num mono">
                    {f ? fmtNum(num(f.values[m])!, d) : '–'}
                    {f && <span class="cell-sub">{fmtDate(f.date)}</span>}
                  </td>
                  <td class="num mono">
                    {l ? fmtNum(num(l.values[m])!, d) : '–'}
                    {l && <span class="cell-sub">{fmtDate(l.date)}</span>}
                  </td>
                  <td class="num mono">{f && l ? fmtSigned(num(l.values[m])! - num(f.values[m])!, d) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EntryForm({ open, entry, onClose }: { open: boolean; entry: BodyEntry | null; onClose: () => void }) {
  return open ? <EntryFormInner entry={entry} onClose={onClose} /> : null;
}

function EntryFormInner({ entry, onClose }: { entry: BodyEntry | null; onClose: () => void }) {
  const now = new Date();
  const lastSunday = (() => {
    let d = todayKey();
    while (weekday(d) !== 0) d = addDays(d, -1);
    return d;
  })();
  const [date, setDate] = useState<string>(entry?.date ?? (weekday(todayKey()) === 0 ? todayKey() : lastSunday));
  const [time, setTime] = useState<string>(
    entry ? timestampTime(entry.ts).slice(0, 5) : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  );
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const c of INBODY_COLUMNS.slice(1)) {
      const v = entry?.values[c];
      o[c] = v === null || v === undefined ? '' : String(v);
    }
    return o;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [conflict, setConflict] = useState<BodyEntry | null>(null);
  const id = useId();

  const build = (): BodyEntry | null => {
    const bad: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad.push('date');
    if (!/^\d{2}:\d{2}$/.test(time)) bad.push('time');
    const values: Record<string, BodyValue> = {};
    for (const c of INBODY_COLUMNS.slice(1)) {
      const raw = (vals[c] ?? '').trim();
      if (!raw || raw === '-') values[c] = null;
      else if (c === DEVICE_COLUMN) values[c] = raw.slice(0, 60);
      else {
        const n = Number(raw.replace(',', '.'));
        if (!Number.isFinite(n) || n < -100 || n > 10000) bad.push(c);
        else values[c] = n;
      }
    }
    setErrors(bad);
    if (bad.length) return null;
    // Keep original seconds when editing, so the key doesn't change needlessly.
    const secs = entry && timestampTime(entry.ts).slice(0, 5) === time ? entry.ts.slice(12, 14) : '00';
    const ts = makeTimestamp(date, `${time}:${secs}`);
    return { ts, date, values, source: entry?.source ?? 'manual' };
  };

  const save = async (e: BodyEntry) => {
    // Editing an entry to a new time: remove the old row so it isn't duplicated.
    if (entry && entry.ts !== e.ts) await deleteBodyEntry(entry.ts);
    await saveBodyEntries([e]);
    onClose();
  };

  const submit = (ev: Event) => {
    ev.preventDefault();
    const e = build();
    if (!e) return;
    const existing = body.value.get(e.ts);
    if (existing && existing.ts !== entry?.ts) return setConflict(e);
    void save(e);
  };

  const field = (c: string, labelText: string) => (
    <div class="field" key={c}>
      <label for={`${id}-${c}`}>{labelText}</label>
      <input
        id={`${id}-${c}`}
        class="input mono"
        inputMode={c === DEVICE_COLUMN ? 'text' : 'decimal'}
        value={vals[c]}
        aria-invalid={errors.includes(c)}
        onInput={(e) => setVals({ ...vals, [c]: e.currentTarget.value })}
      />
    </div>
  );

  const others = INBODY_COLUMNS.slice(1).filter((c) => !(KEY_METRICS as readonly string[]).includes(c));

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={entry ? t('body.editTitle') : t('body.addTitle')}
        wide
        actions={
          <>
            <Button variant="text" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" type="submit" form={`${id}-form`}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id={`${id}-form`} class="entry-form" onSubmit={submit} noValidate>
          <p class="hint">{t('body.formHint')}</p>
          <div class="form-grid">
            <div class="field">
              <label for={`${id}-d`}>{t('common.date')}</label>
              <input id={`${id}-d`} type="date" class="input mono" value={date} required aria-invalid={errors.includes('date')} onInput={(e) => setDate(e.currentTarget.value)} />
            </div>
            <div class="field">
              <label for={`${id}-t`}>{t('body.time')}</label>
              <input id={`${id}-t`} type="time" class="input mono" value={time} required aria-invalid={errors.includes('time')} onInput={(e) => setTime(e.currentTarget.value)} />
            </div>
            {KEY_METRICS.map((m) => field(m, t(METRIC_LABEL[m]) + (METRIC_UNIT[m] ? ` (${METRIC_UNIT[m]})` : '')))}
          </div>
          <details class="more-fields">
            <summary>{tn('body.moreFields', others.length)}</summary>
            <div class="form-grid">{others.map((c) => field(c, c))}</div>
          </details>
          {errors.length > 0 && (
            <p class="form-error" role="alert">
              {t('body.formErrors', { fields: errors.join(', ') })}
            </p>
          )}
        </form>
      </Dialog>
      <Confirm
        open={!!conflict}
        title={t('body.conflictTitle')}
        body={<p>{conflict && t('body.conflictBody', { date: fmtDate(conflict.date), time: timestampTime(conflict.ts) })}</p>}
        confirmLabel={t('body.replace')}
        onClose={() => setConflict(null)}
        onConfirm={() => conflict && void save(conflict)}
      />
    </>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<ImportPlanRow[]>([]);
  const [replace, setReplace] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const reset = () => {
    setParsed(null);
    setRows([]);
    setReplace(false);
    setFileName('');
    setError(null);
    setSaved(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const read = async (f: File | undefined | null) => {
    if (!f) return;
    reset();
    setFileName(f.name);
    if (f.size > 5_000_000) return setError(t('import.tooBig'));
    try {
      const text = await f.text();
      const r = parseInbodyCsv(text);
      setParsed(r);
      setRows(planImport(r, body.value));
    } catch (e) {
      setError(e instanceof CsvFormatError ? t(`import.err.${e.message}` as MessageKey) : t('import.err.unreadable'));
    }
  };

  const counts = {
    new: rows.filter((r) => r.status === 'new').length,
    same: rows.filter((r) => r.status === 'same').length,
    conflict: rows.filter((r) => r.status === 'conflict').length,
    dup: rows.filter((r) => r.status === 'fileDuplicate').length,
  };
  const toSave = rows.filter((r) => r.status === 'new' || (replace && r.status === 'conflict'));

  const confirm = async () => {
    try {
      await saveBodyEntries(toSave.map(rowToEntry));
      setSaved(toSave.length);
      setParsed(null);
      setRows([]);
    } catch {
      setError(t('import.saveFailed'));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('import.title')}
      wide
      actions={
        saved !== null ? (
          <Button variant="primary" onClick={close}>
            {t('common.done')}
          </Button>
        ) : (
          <>
            <Button variant="text" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={!toSave.length} onClick={() => void confirm()}>
              {tn('import.confirm', toSave.length)}
            </Button>
          </>
        )
      }
    >
      {saved !== null ? (
        <p role="status">{tn('import.saved', saved)}</p>
      ) : (
        <>
          <div
            class={`dropzone${drag ? ' is-drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void read(e.dataTransfer?.files?.[0]);
            }}
          >
            <p>{t('import.drop')}</p>
            <label for={inputId} class="btn btn-secondary">
              {t('import.choose')}
            </label>
            <input
              id={inputId}
              ref={input}
              type="file"
              accept=".csv,text/csv"
              class="visually-hidden"
              onChange={(e) => void read(e.currentTarget.files?.[0])}
            />
            {fileName && <p class="mono hint">{fileName}</p>}
          </div>
          {error && (
            <p class="form-error" role="alert">
              {error}
            </p>
          )}
          {parsed && (
            <div class="import-preview" role="status">
              <p>
                <strong>{tn('import.found', rows.length)}</strong> {t('import.counts', counts)}
              </p>
              {parsed.errors.length > 0 && (
                <p class="note">{t('import.badRows', { lines: parsed.errors.map((e) => e.line).join(', ') })}</p>
              )}
              {parsed.missingColumns.length > 0 && (
                <p class="note">{t('import.missing', { cols: parsed.missingColumns.join(', ') })}</p>
              )}
              {parsed.unknownColumns.length > 0 && (
                <p class="note">{t('import.unknown', { cols: parsed.unknownColumns.join(', ') })}</p>
              )}
              {counts.conflict > 0 && (
                <label class="check-row">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.currentTarget.checked)} />
                  <span>{tn('import.replaceConflicts', counts.conflict)}</span>
                </label>
              )}
              <div class="table-wrap" tabIndex={0} role="region" aria-label={t('import.previewLabel')}>
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('common.date')}</th>
                      <th scope="col">{t('body.time')}</th>
                      {KEY_METRICS.slice(0, 4).map((m) => (
                        <th scope="col" class="num" key={m}>
                          {t(METRIC_LABEL[m])}
                        </th>
                      ))}
                      <th scope="col">{t('import.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.ts + i} class={`imp-${r.status}`}>
                        <td class="mono">{fmtDate(r.date)}</td>
                        <td class="mono">{timestampTime(r.ts)}</td>
                        {KEY_METRICS.slice(0, 4).map((m) => (
                          <td class="num mono" key={m}>
                            {cell(r.values[m], 1)}
                          </td>
                        ))}
                        <td>
                          {t(`import.st.${r.status}` as MessageKey)}
                          {r.warnings.length > 0 && <span class="cell-sub">{t('import.unreadableCells', { n: r.warnings.length })}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
