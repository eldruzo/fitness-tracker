import { useId, useRef, useState } from 'preact/hooks';
import { requestNotifications } from '../effects';
import { fmtDate, t, tn, type MessageKey } from '../i18n';
import { backupFilename, BackupError, type ParsedBackup } from '../lib/backup';
import { diffDays, isDateKey, type DateKey } from '../lib/dates';
import { allProgramImageUrls, AVG_IMAGE_KB, ensureExerciseIndex, saveImagesOffline } from '../lib/exercises';
import { isBodyweightName, validatePhases } from '../lib/program';
import { allMoveNames } from '../lib/progress';
import type { Program, Theme } from '../lib/types';
import { ACCENTS } from '../lib/validate';
import { installEvent, isIos, isStandalone, offlineReady, promptInstall } from '../pwa';
import {
  exportBackupJson,
  histories,
  lastShiftId,
  meta,
  parseBackup,
  persistState,
  program,
  requestPersistence,
  resetAll,
  restoreBackup,
  settings,
  undoShift,
  updateProgram,
  updateSettings,
} from '../state';
import { Button, Confirm, Dialog, Segmented, Toggle, downloadText } from '../ui/components';
import { Icon } from '../ui/icons';

export default function Settings() {
  return (
    <div class="settings">
      <header class="page-head">
        <h1 tabIndex={-1}>{t('settings.title')}</h1>
      </header>
      <nav class="settings-toc" aria-label={t('settings.sections')}>
        <a href="#set-training">{t('settings.training')}</a>
        <a href="#set-program">{t('settings.program')}</a>
        <a href="#set-moves">{t('settings.moves')}</a>
        <a href="#set-pause">{t('settings.pause')}</a>
        <a href="#set-look">{t('settings.look')}</a>
        <a href="#set-data">{t('settings.data')}</a>
        <a href="#set-install">{t('settings.install')}</a>
      </nav>
      <TrainingOptions />
      <ProgramDates />
      <MovesEditor />
      <Pauses />
      <Appearance />
      <DataSection />
      <InstallSection />
      <p class="hint about">
        {t('settings.version', { v: __APP_VERSION__ })} · {offlineReady.value ? t('settings.offlineReady') : t('settings.offlineAfterLoad')}
      </p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: preact.ComponentChildren }) {
  return (
    <section class="settings-section" id={id} aria-labelledby={`${id}-h`} tabIndex={-1}>
      <h2 id={`${id}-h`} class="section-label">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  const [v, setV] = useState(String(value));
  const [bad, setBad] = useState(false);
  return (
    <div class="field field-inline">
      <label for={id}>{label}</label>
      <span class="input-suffix">
        <input
          id={id}
          class="input input-num mono"
          inputMode="decimal"
          value={v}
          aria-invalid={bad}
          onInput={(e) => setV(e.currentTarget.value)}
          onChange={(e) => {
            const n = Number(e.currentTarget.value.replace(',', '.'));
            if (Number.isFinite(n) && n >= min && n <= max && Math.abs(Math.round(n / step) * step - n) < 1e-9) {
              setBad(false);
              onChange(n);
            } else {
              setBad(true);
            }
          }}
        />
        {suffix && <span>{suffix}</span>}
      </span>
      {bad && <span class="form-error">{t('settings.range', { min, max })}</span>}
    </div>
  );
}

function TrainingOptions() {
  const s = settings.value;
  const shift = lastShiftId();
  const [notif, setNotif] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  return (
    <Section id="set-training" title={t('settings.training')}>
      <Toggle label={t('settings.deload')} hint={t('settings.deloadHint')} checked={s.deload} onChange={(v) => updateSettings({ deload: v })} />
      {s.deload && (
        <NumberSetting label={t('settings.deloadPct')} value={s.deloadPct} min={30} max={100} suffix="%" onChange={(n) => updateSettings({ deloadPct: n })} />
      )}
      <Toggle
        label={t('settings.progression')}
        hint={t('settings.progressionHint')}
        checked={s.progression}
        onChange={(v) => updateSettings({ progression: v })}
      />
      {s.progression && (
        <NumberSetting
          label={t('settings.progressionStep')}
          value={s.progressionStepKg}
          min={0.5}
          max={20}
          step={0.5}
          suffix="kg"
          onChange={(n) => updateSettings({ progressionStepKg: n })}
        />
      )}
      <Toggle label={t('settings.shift')} hint={t('settings.shiftHint')} checked={s.shiftPlan} onChange={(v) => updateSettings({ shiftPlan: v })} />
      {shift && (
        <Button variant="text" icon="undo" onClick={() => void undoShift(shift)}>
          {t('settings.undoShift')}
        </Button>
      )}
      <Toggle label={t('settings.hints')} hint={t('settings.hintsHint')} checked={s.hints} onChange={(v) => updateSettings({ hints: v })} />
      <Toggle label={t('settings.counters')} hint={t('settings.countersHint')} checked={s.counters} onChange={(v) => updateSettings({ counters: v })} />
      {s.counters && (
        <NumberSetting label={t('settings.counterTarget')} value={s.counterTarget} min={5} max={1000} onChange={(n) => updateSettings({ counterTarget: n })} />
      )}
      <Toggle label={t('settings.sound')} checked={s.sound} onChange={(v) => updateSettings({ sound: v })} />
      <Toggle label={t('settings.vibrate')} checked={s.vibrate} onChange={(v) => updateSettings({ vibrate: v })} />
      <Toggle
        label={t('settings.autoStart')}
        hint={t('settings.autoStartHint')}
        checked={s.autoStart}
        onChange={(v) => updateSettings({ autoStart: v })}
      />
      <div class="field-inline">
        <span>{t('settings.notifications')}</span>
        {notif === 'default' ? (
          <Button variant="secondary" icon="bell" onClick={async () => setNotif(await requestNotifications())}>
            {t('settings.allowNotifications')}
          </Button>
        ) : (
          <span class="hint">{t(`settings.notif.${notif}` as MessageKey)}</span>
        )}
      </div>
    </Section>
  );
}

function ProgramDates() {
  const p = program.value;
  const [draft, setDraft] = useState<Program>(() => structuredClone(p));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const id = useId();
  const dirty = JSON.stringify(draft) !== JSON.stringify(p);

  const setPhase = (i: number, patch: Partial<Program['phases'][number]>) => {
    const phases = draft.phases.map((ph, j) => (j === i ? { ...ph, ...patch } : ph));
    setDraft({ ...draft, phases });
    setSaved(false);
  };

  const save = () => {
    if (!isDateKey(draft.startDate) || !isDateKey(draft.endDate) || draft.endDate < draft.startDate) return setError(t('settings.badDates'));
    if (diffDays(draft.startDate, draft.endDate) > 3 * 366) return setError(t('settings.tooLong'));
    const err = validatePhases(draft);
    if (err) return setError(t(err as MessageKey));
    setError(null);
    updateProgram(draft);
    setSaved(true);
  };

  const sp = draft.session;
  const setSpec = (patch: Partial<Program['session']>) => {
    setDraft({ ...draft, session: { ...sp, ...patch } });
    setSaved(false);
  };

  return (
    <Section id="set-program" title={t('settings.program')}>
      <p class="hint">{t('settings.programHint')}</p>
      <div class="form-grid">
        <div class="field">
          <label for={`${id}-s`}>{t('settings.start')}</label>
          <input id={`${id}-s`} type="date" class="input mono" value={draft.startDate} onInput={(e) => setDraft({ ...draft, startDate: e.currentTarget.value })} />
        </div>
        <div class="field">
          <label for={`${id}-e`}>{t('settings.end')}</label>
          <input id={`${id}-e`} type="date" class="input mono" value={draft.endDate} onInput={(e) => setDraft({ ...draft, endDate: e.currentTarget.value })} />
        </div>
      </div>
      <div class="table-wrap" tabIndex={0} role="region" aria-label={t('plan.phases')}>
        <table class="table phase-edit">
          <thead>
            <tr>
              <th scope="col">{t('plan.phase')}</th>
              <th scope="col">{t('plan.from')}</th>
              <th scope="col">{t('plan.to')}</th>
            </tr>
          </thead>
          <tbody>
            {draft.phases.map((ph, i) => (
              <tr key={ph.id}>
                <td>
                  <input class="input input-sm" aria-label={t('settings.phaseName', { id: ph.id })} value={ph.name} onInput={(e) => setPhase(i, { name: e.currentTarget.value })} />
                </td>
                <td>
                  <input type="date" class="input input-sm mono" aria-label={t('settings.phaseStart', { name: ph.name })} value={ph.start} onInput={(e) => setPhase(i, { start: e.currentTarget.value })} />
                </td>
                <td>
                  <input type="date" class="input input-sm mono" aria-label={t('settings.phaseEnd', { name: ph.name })} value={ph.end} onInput={(e) => setPhase(i, { end: e.currentTarget.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 class="sub-label">{t('settings.sessionShape')}</h3>
      <div class="form-grid">
        {(
          [
            ['warmupMin', 'settings.warmupMin', 0, 60],
            ['cardioMin', 'settings.cardioMin', 0, 120],
            ['cooldownMin', 'settings.cooldownMin', 0, 60],
            ['sets', 'settings.sets', 1, 10],
            ['reps', 'settings.reps', 1, 100],
            ['restSetSec', 'settings.restSet', 0, 900],
            ['restMoveSec', 'settings.restMove', 0, 1200],
          ] as const
        ).map(([k, label, min, max]) => (
          <div class="field" key={k}>
            <label for={`${id}-${k}`}>{t(label)}</label>
            <input
              id={`${id}-${k}`}
              class="input input-num mono"
              inputMode="numeric"
              value={String(sp[k])}
              onInput={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isInteger(n) && n >= min && n <= max) setSpec({ [k]: n });
              }}
            />
          </div>
        ))}
      </div>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <div class="row-actions">
        <Button variant="primary" disabled={!dirty} onClick={save}>
          {t('common.save')}
        </Button>
        {dirty && (
          <Button variant="text" onClick={() => setDraft(structuredClone(p))}>
            {t('settings.discard')}
          </Button>
        )}
        {saved && !dirty && (
          <span class="hint" role="status">
            {t('settings.saved')}
          </span>
        )}
      </div>
    </Section>
  );
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function MovesEditor() {
  const p = program.value;
  const [phase, setPhase] = useState(p.phases[0]?.id ?? '');
  const [edit, setEdit] = useState<{ wd: number; slot: number } | null>(null);
  const [focusEdit, setFocusEdit] = useState<number | null>(null);
  const moves = p.moves[phase] ?? [];
  return (
    <Section id="set-moves" title={t('settings.moves')}>
      <p class="hint">{t('settings.movesHint')}</p>
      <Segmented label={t('plan.phase')} value={phase} onChange={setPhase} options={p.phases.map((ph) => ({ value: ph.id, label: ph.name }))} />
      <ol class="moves-edit">
        {WEEK_ORDER.map((wd) => {
          const w = p.weekdays[wd];
          return (
            <li key={wd}>
              <div class="moves-day">
                <span class="moves-wd">{t(`weekday.${wd}` as MessageKey)}</span>
                <span class="moves-focus">{w.rest ? t('today.restDay') : w.focus}</span>
                <span class="stamp">{t(`work.${w.work}`)}</span>
                <button type="button" class="btn btn-text btn-sm" onClick={() => setFocusEdit(wd)}>
                  {t('common.edit')}
                  <span class="visually-hidden"> {t(`weekday.${wd}` as MessageKey)}</span>
                </button>
              </div>
              {!w.rest && (
                <ol class="moves-list">
                  {(moves[wd] ?? []).map((m, slot) => (
                    <li key={slot}>
                      <button type="button" class="moves-item" onClick={() => setEdit({ wd, slot })}>
                        <span class="mono">{slot + 1}</span>
                        <span>{m.name}</span>
                        {m.bodyweight && <span class="stamp">{t('session.bodyweight')}</span>}
                        <Icon name="edit" size={18} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      {edit && (
        <MoveEditDialog
          phase={phase}
          wd={edit.wd}
          slot={edit.slot}
          onClose={() => setEdit(null)}
        />
      )}
      {focusEdit !== null && <DayEditDialog wd={focusEdit} onClose={() => setFocusEdit(null)} />}
    </Section>
  );
}

function MoveEditDialog({ phase, wd, slot, onClose }: { phase: string; wd: number; slot: number; onClose: () => void }) {
  const p = program.value;
  const m = p.moves[phase][wd][slot];
  const [name, setName] = useState(m.name);
  const [bw, setBw] = useState(m.bodyweight);
  const [all, setAll] = useState(false);
  const id = useId();
  const save = () => {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!clean) return;
    const next = structuredClone(p);
    const targets = all ? p.phases.map((ph) => ph.id) : [phase];
    for (const ph of targets) {
      const list = next.moves[ph]?.[wd];
      if (!list) continue;
      list.forEach((x, i) => {
        if (i === slot && (ph === phase || x.name === m.name)) list[i] = { name: clean, bodyweight: bw };
      });
    }
    updateProgram(next);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('settings.editMove')}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div class="field">
        <label for={id}>{t('move.name')}</label>
        <input
          id={id}
          class="input"
          value={name}
          maxLength={80}
          onInput={(e) => {
            setName(e.currentTarget.value);
            if (isBodyweightName(e.currentTarget.value)) setBw(true);
          }}
        />
      </div>
      <label class="check-row">
        <input type="checkbox" checked={bw} onChange={(e) => setBw(e.currentTarget.checked)} />
        <span>{t('move.isBodyweight')}</span>
      </label>
      <label class="check-row">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} />
        <span>{t('settings.applyAllPhases', { name: m.name })}</span>
      </label>
      <p class="hint">{t('settings.renameHistory')}</p>
    </Dialog>
  );
}

function DayEditDialog({ wd, onClose }: { wd: number; onClose: () => void }) {
  const p = program.value;
  const w = p.weekdays[wd];
  const [focus, setFocus] = useState(w.focus);
  const [intensity, setIntensity] = useState(w.intensity);
  const [work, setWork] = useState(w.work);
  const id = useId();
  const save = () => {
    const next = structuredClone(p);
    next.weekdays[wd] = { ...w, focus: focus.trim() || w.focus, intensity: intensity.trim(), work };
    updateProgram(next);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`weekday.${wd}` as MessageKey)}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div class="field">
        <label for={`${id}-f`}>{t('settings.focus')}</label>
        <input id={`${id}-f`} class="input" value={focus} maxLength={60} onInput={(e) => setFocus(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label for={`${id}-i`}>{t('settings.intensity')}</label>
        <input id={`${id}-i`} class="input" value={intensity} maxLength={30} onInput={(e) => setIntensity(e.currentTarget.value)} />
      </div>
      <div class="field">
        <span class="label">{t('settings.workTag')}</span>
        <Segmented
          label={t('settings.workTag')}
          value={work}
          onChange={setWork}
          options={(['WFO', 'WFH', 'Off'] as const).map((v) => ({ value: v, label: t(`work.${v}`) }))}
        />
      </div>
      {w.rest && <p class="hint">{t('settings.restFixed')}</p>}
    </Dialog>
  );
}

function Pauses() {
  const s = settings.value;
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState(false);
  const id = useId();
  const add = (e: Event) => {
    e.preventDefault();
    if (!isDateKey(start) || !isDateKey(end) || end < start) return setErr(true);
    setErr(false);
    updateSettings({ pauses: [...s.pauses, { id: `p${Date.now()}`, start: start as DateKey, end: end as DateKey, label: label.trim() || undefined }] });
    setStart('');
    setEnd('');
    setLabel('');
  };
  return (
    <Section id="set-pause" title={t('settings.pause')}>
      <p class="hint">{t('settings.pauseHint')}</p>
      {s.pauses.length > 0 && (
        <ul class="plain-list pause-list">
          {s.pauses.map((p) => (
            <li key={p.id}>
              <span class="mono">
                {fmtDate(p.start)} – {fmtDate(p.end)}
              </span>
              {p.label && <span>{p.label}</span>}
              <Button variant="text" icon="trash" onClick={() => updateSettings({ pauses: s.pauses.filter((x) => x.id !== p.id) })}>
                {t('common.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form class="form-grid" onSubmit={add} noValidate>
        <div class="field">
          <label for={`${id}-s`}>{t('plan.from')}</label>
          <input id={`${id}-s`} type="date" class="input mono" value={start} onInput={(e) => setStart(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for={`${id}-e`}>{t('plan.to')}</label>
          <input id={`${id}-e`} type="date" class="input mono" value={end} onInput={(e) => setEnd(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for={`${id}-l`}>{t('settings.pauseLabel')}</label>
          <input id={`${id}-l`} class="input" value={label} maxLength={40} onInput={(e) => setLabel(e.currentTarget.value)} />
        </div>
        <div class="field field-end">
          <Button type="submit" variant="secondary" icon="plus">
            {t('settings.addPause')}
          </Button>
        </div>
      </form>
      {err && (
        <p class="form-error" role="alert">
          {t('settings.badDates')}
        </p>
      )}
    </Section>
  );
}

function Appearance() {
  const s = settings.value;
  return (
    <Section id="set-look" title={t('settings.look')}>
      <div class="field">
        <span class="label">{t('settings.theme')}</span>
        <Segmented<Theme>
          label={t('settings.theme')}
          value={s.theme}
          onChange={(v) => updateSettings({ theme: v })}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
        />
      </div>
      <div class="field">
        <span class="label" id="accent-label">
          {t('settings.accent')}
        </span>
        <div class="swatches" role="radiogroup" aria-labelledby="accent-label">
          {ACCENTS.map((a) => (
            <button
              type="button"
              role="radio"
              aria-checked={s.accent === a}
              class={`swatch${s.accent === a ? ' on' : ''}`}
              data-accent={a}
              onClick={() => updateSettings({ accent: a })}
              key={a}
            >
              <span class="swatch-dot" aria-hidden="true" />
              {t(`settings.accent.${a}`)}
            </button>
          ))}
        </div>
      </div>
      <div class="field-inline">
        <span>{t('settings.units')}</span>
        <span class="mono">kg</span>
      </div>
      <OfflineImages />
    </Section>
  );
}

function OfflineImages() {
  const [state, setState] = useState<{ done: number; total: number; ok: number | null } | null>(null);
  const names = allMoveNames(program.value, histories.value).map((n) => n.name);
  const estimateMb = Math.max(1, Math.round((allProgramImageUrls(names).length * AVG_IMAGE_KB) / 1024));
  const run = async () => {
    await ensureExerciseIndex().catch(() => undefined);
    const urls = allProgramImageUrls(names);
    setState({ done: 0, total: urls.length, ok: null });
    const ok = await saveImagesOffline(urls, (done) => setState({ done, total: urls.length, ok: null }));
    setState({ done: urls.length, total: urls.length, ok });
  };
  const busy = state !== null && state.ok === null;
  return (
    <div class="field">
      <span class="label">{t('settings.images')}</span>
      <p class="hint">{t('settings.imagesHint', { mb: estimateMb })}</p>
      <div class="row-actions">
        <Button variant="secondary" icon="download" disabled={busy} onClick={() => void run()}>
          {t('settings.imagesSave')}
        </Button>
        {state && (
          <span class="hint" role="status">
            {busy
              ? t('settings.imagesSaving', { done: state.done, total: state.total })
              : state.ok === state.total
                ? t('settings.imagesDone', { done: state.ok })
                : t('settings.imagesFailed', { done: state.ok ?? 0, total: state.total })}
          </span>
        )}
      </div>
      <p class="hint">{t('settings.imagesCredit')}</p>
    </div>
  );
}

function DataSection() {
  const m = meta.value;
  const ps = persistState.value;
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    setError(null);
    setDone(null);
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
    } catch (e) {
      setError(e instanceof BackupError ? t(`backupErr.${e.code}`) : t('backupErr.notJson'));
    }
    if (file.current) file.current.value = '';
  };

  const restore = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    try {
      await restoreBackup(pending.data, mode);
      setDone(t(mode === 'merge' ? 'data.merged' : 'data.replaced'));
    } catch {
      setError(t('data.restoreFailed'));
    }
    setPending(null);
  };

  return (
    <Section id="set-data" title={t('settings.data')}>
      <p>{t('data.localOnly')}</p>
      <div class="field-inline">
        <span>{t('data.persistence')}</span>
        <span class="hint">{t(`data.persist.${ps}` as MessageKey)}</span>
        {ps !== 'granted' && ps !== 'unsupported' && (
          <Button variant="text" onClick={() => void requestPersistence()}>
            {t('data.askPersist')}
          </Button>
        )}
      </div>
      <div class="field-inline">
        <span>{t('data.lastExport')}</span>
        <span class="mono">{m.lastExport ? fmtDate(new Date(m.lastExport)) : t('data.never')}</span>
      </div>
      <p class="hint">{t('data.reminder')}</p>
      <div class="row-actions">
        <Button variant="primary" icon="download" onClick={() => downloadText(backupFilename(), exportBackupJson(), 'application/json')}>
          {t('data.export')}
        </Button>
        <Button variant="secondary" icon="upload" onClick={() => file.current?.click()}>
          {t('data.import')}
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onFile(e.currentTarget.files?.[0])}
        />
      </div>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      {done && <p role="status">{done}</p>}
      <div class="danger-zone">
        <Button variant="danger" icon="trash" onClick={() => setReset(true)}>
          {t('data.reset')}
        </Button>
      </div>
      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={t('data.importTitle')}
        actions={
          <>
            <Button variant="text" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="secondary" onClick={() => void restore('merge')}>
              {t('data.merge')}
            </Button>
            <Button variant="danger" onClick={() => void restore('replace')}>
              {t('data.replace')}
            </Button>
          </>
        }
      >
        {pending && (
          <>
            <p>
              {pending.exportedAt ? t('data.backupFrom', { date: fmtDate(new Date(pending.exportedAt)) }) : t('data.backupUnknownDate')}
            </p>
            <ul class="plain-list">
              <li>{tn('data.countDays', pending.data.days.length)}</li>
              <li>{tn('data.countBody', pending.data.body.length)}</li>
            </ul>
            {pending.dropped > 0 && <p class="note">{tn('data.dropped', pending.dropped)}</p>}
            <p class="hint">{t('data.mergeVsReplace')}</p>
          </>
        )}
      </Dialog>
      <Confirm
        open={reset}
        title={t('data.resetTitle')}
        body={<p>{t('data.resetBody')}</p>}
        confirmLabel={t('data.resetConfirm')}
        typed="RESET"
        danger
        onClose={() => setReset(false)}
        onConfirm={() => void resetAll()}
      />
    </Section>
  );
}

function InstallSection() {
  return (
    <Section id="set-install" title={t('settings.install')}>
      {isStandalone.value ? (
        <p>{t('install.installed')}</p>
      ) : installEvent.value ? (
        <>
          <p>{t('install.why')}</p>
          <Button variant="primary" icon="install" onClick={() => void promptInstall()}>
            {t('install.button')}
          </Button>
        </>
      ) : isIos ? (
        <>
          <p>{t('install.why')}</p>
          <ol class="install-steps">
            <li>
              {t('install.ios1')} <Icon name="share" size={18} label={t('install.shareIcon')} />
            </li>
            <li>{t('install.ios2')}</li>
            <li>{t('install.ios3')}</li>
          </ol>
        </>
      ) : (
        <>
          <p>{t('install.why')}</p>
          <p class="hint">{t('install.manual')}</p>
        </>
      )}
    </Section>
  );
}
