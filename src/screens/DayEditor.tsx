import { useId, useState } from 'preact/hooks';
import { fmtDate, fmtNum, t, type MessageKey } from '../i18n';
import { isDateKey, type DateKey, type Weekday } from '../lib/dates';
import { planFor } from '../lib/program';
import { dayStatus } from '../lib/schedule';
import { sessionMoves } from '../lib/session';
import type { MoveLog } from '../lib/types';
import { validKg, validReps } from '../lib/validate';
import {
  ctx,
  editSet,
  ensureLog,
  finishSession,
  logs,
  logSet,
  markPartial,
  program,
  renameMove,
  setDayPhase,
  setDaySession,
  setMoveSkipped,
  setStepDone,
  skipDay,
  today,
  undoMissed,
  undoSet,
  unsetDay,
} from '../state';
import { Banner, Button, StatusLabel } from '../ui/components';
import { Icon } from '../ui/icons';
import { RenameDialog } from './today/Session';
import { SheetHeader } from './Today';

export function DayEditor({ date }: { date: string }) {
  if (!isDateKey(date)) {
    return (
      <div class="page">
        <h1 tabIndex={-1}>{t('day.invalid')}</h1>
        <a href="#/plan">{t('day.back')}</a>
      </div>
    );
  }
  const c = ctx.value;
  const p = planFor(date, c);
  const log = logs.value.get(date);
  const s = dayStatus(date, c, today.value);
  const isFuture = date > today.value;
  const isToday = date === today.value;
  const moves = sessionMoves(p, log);
  const prog = program.value;

  return (
    <div class="day-editor">
      <a class="back-link" href={`#/plan/${date}`}>
        <Icon name="left" size={20} />
        {t('day.back')}
      </a>
      <SheetHeader plan={p} compact />
      <p class="day-status">
        <StatusLabel status={s} />
        {log?.shiftedTo && <span class="hint">{t('day.shiftedTo', { date: fmtDate(log.shiftedTo) })}</span>}
      </p>

      {!p.inProgram ? (
        <p>{t('day.outside')}</p>
      ) : (
        <>
          {isToday && (
            <Banner icon="info">
              <p>
                {t('day.todayHint')} <a href="#/">{t('nav.today')}</a>
              </p>
            </Banner>
          )}

          <section class="day-actions" aria-label={t('day.statusActions')}>
            {!isFuture && s !== 'done' && !p.rest && (
              <Button variant="primary" icon="check" onClick={() => finishSession(date)}>
                {t('day.markDone')}
              </Button>
            )}
            {!isFuture && log && moves.some((m) => m.sets.length) && s !== 'partial' && (
              <Button variant="secondary" onClick={() => markPartial(date)}>
                {t('day.markPartial')}
              </Button>
            )}
            {s !== 'skipped' && !p.rest && (
              <Button variant="secondary" icon="skip" onClick={() => skipDay(date)}>
                {t('day.skip')}
              </Button>
            )}
            {s === 'missed' && (
              <Button variant="text" icon="undo" onClick={() => undoMissed(date)}>
                {t('day.undoMissed')}
              </Button>
            )}
            {(s === 'skipped' || s === 'done' || s === 'partial') && (
              <Button variant="text" icon="undo" onClick={() => unsetDay(date)}>
                {t('day.clearStatus')}
              </Button>
            )}
          </section>

          <PlanControls date={date} sessionOf={p.sessionOf} weekday={p.weekday} phaseId={p.phase?.id ?? ''} />

          {!p.rest && !isFuture && (
            <section class="day-log" aria-labelledby="daylog-h">
              <h2 id="daylog-h" class="section-label">
                {t('day.log')}
              </h2>
              <label class="check-row">
                <input type="checkbox" checked={!!log?.warmup} onChange={(e) => setStepDone(date, 'warmup', e.currentTarget.checked)} />
                <span>
                  {t('session.warmup')} · {t('session.minutes', { n: prog.session.warmupMin })}
                </span>
              </label>
              <label class="check-row">
                <input type="checkbox" checked={!!log?.cardio} onChange={(e) => setStepDone(date, 'cardio', e.currentTarget.checked)} />
                <span>
                  {t('session.cardio')} · {t('session.minutes', { n: prog.session.cardioMin })}
                </span>
              </label>
              {moves.map((m, i) => (
                <MoveEditor key={`${i}-${m.name}`} date={date} move={m} idx={i} />
              ))}
            </section>
          )}
          {!p.rest && isFuture && (
            <section class="day-log">
              <h2 class="section-label">{t('day.planned')}</h2>
              <ol class="preview-moves">
                {p.moves.map((m) => (
                  <li key={m.name}>{m.name}</li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PlanControls({ date, sessionOf, weekday, phaseId }: { date: DateKey; sessionOf: Weekday; weekday: Weekday; phaseId: string }) {
  const prog = program.value;
  const sid = useId();
  const pid = useId();
  const log = logs.value.get(date);
  const locked = !!log && log.moves.some((m) => m.sets.length);
  return (
    <details class="plan-controls">
      <summary>{t('day.changePlan')}</summary>
      {locked && <p class="hint">{t('day.lockedHint')}</p>}
      <div class="field">
        <label for={sid}>{t('day.sessionOf')}</label>
        <select
          id={sid}
          class="input"
          value={String(sessionOf)}
          disabled={locked}
          onChange={(e) => {
            const v = Number(e.currentTarget.value) as Weekday;
            setDaySession(date, v === weekday ? null : v);
          }}
        >
          {prog.weekdays.map((w, i) => (
            <option value={String(i)} key={i}>
              {t(`weekday.${i}` as MessageKey)} — {w.rest ? t('today.restDay') : w.focus}
              {i === weekday ? ` (${t('day.planned')})` : ''}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for={pid}>{t('day.phase')}</label>
        <select
          id={pid}
          class="input"
          value={phaseId}
          disabled={locked}
          onChange={(e) => {
            const v = e.currentTarget.value;
            const natural = prog.phases.find((ph) => date >= ph.start && date <= ph.end)?.id;
            setDayPhase(date, v === natural ? null : v);
          }}
        >
          {prog.phases.map((ph) => (
            <option value={ph.id} key={ph.id}>
              {ph.name}
            </option>
          ))}
        </select>
      </div>
    </details>
  );
}

function MoveEditor({ date, move, idx }: { date: DateKey; move: MoveLog; idx: number }) {
  const spec = program.value.session;
  const [kg, setKg] = useState(move.sets.length ? String(move.sets[move.sets.length - 1].kg ?? '') : '');
  const [reps, setReps] = useState(String(spec.reps));
  const [err, setErr] = useState<MessageKey | null>(null);
  const [rename, setRename] = useState(false);
  const kid = useId();
  const rid = useId();

  const add = (e: Event) => {
    e.preventDefault();
    const r = validReps(reps);
    if (r === null || r === 0) return setErr('form.repsInvalid');
    const k = move.bodyweight ? null : validKg(kg);
    if (!move.bodyweight && k === null) return setErr('form.kgInvalid');
    setErr(null);
    ensureLog(date);
    logSet(date, idx, k, r);
  };

  return (
    <article class={`move-editor${move.skipped ? ' is-skipped' : ''}`}>
      <header class="move-editor-head">
        <h3>{move.name}</h3>
        <div class="row-actions">
          <Button variant="text" icon="edit" onClick={() => setRename(true)}>
            {t('move.rename')}
          </Button>
          <Button
            variant="text"
            icon="skip"
            onClick={() => {
              ensureLog(date);
              setMoveSkipped(date, idx, !move.skipped);
            }}
          >
            {move.skipped ? t('move.unskip') : t('move.skip')}
          </Button>
        </div>
      </header>
      {move.sets.length > 0 && (
        <table class="table sets-table">
          <caption class="visually-hidden">{t('day.setsOf', { name: move.name })}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              {!move.bodyweight && <th scope="col">{t('form.kg')}</th>}
              <th scope="col">{t('form.reps')}</th>
            </tr>
          </thead>
          <tbody>
            {move.sets.map((s, si) => (
              <tr key={si}>
                <th scope="row" class="mono">
                  {si + 1}
                </th>
                {!move.bodyweight && (
                  <td>
                    <input
                      class="input input-num input-sm mono"
                      inputMode="decimal"
                      aria-label={t('day.kgOfSet', { n: si + 1 })}
                      value={s.kg === null ? '' : fmtNum(s.kg, 2).replace(/,/g, '')}
                      onChange={(e) => {
                        const k = validKg(e.currentTarget.value);
                        if (k !== null) editSet(date, idx, si, k, s.reps);
                        else e.currentTarget.value = s.kg === null ? '' : String(s.kg);
                      }}
                    />
                  </td>
                )}
                <td>
                  <input
                    class="input input-num input-sm mono"
                    inputMode="numeric"
                    aria-label={t('day.repsOfSet', { n: si + 1 })}
                    value={String(s.reps)}
                    onChange={(e) => {
                      const r = validReps(e.currentTarget.value);
                      if (r !== null) editSet(date, idx, si, s.kg, r);
                      else e.currentTarget.value = String(s.reps);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form class="add-set" onSubmit={add} noValidate>
        {!move.bodyweight && (
          <div class="field">
            <label for={kid}>{t('form.kg')}</label>
            <input id={kid} class="input input-num mono" inputMode="decimal" value={kg} onInput={(e) => setKg(e.currentTarget.value)} />
          </div>
        )}
        <div class="field">
          <label for={rid}>{t('form.reps')}</label>
          <input id={rid} class="input input-num mono" inputMode="numeric" value={reps} onInput={(e) => setReps(e.currentTarget.value)} />
        </div>
        <Button type="submit" variant="secondary" icon="plus">
          {t('day.addSet')}
        </Button>
        {move.sets.length > 0 && (
          <Button variant="text" icon="undo" onClick={() => undoSet(date, idx)}>
            {t('day.removeLast')}
          </Button>
        )}
      </form>
      {err && (
        <p class="form-error" role="alert">
          {t(err, { max: 500 })}
        </p>
      )}
      <RenameDialog
        open={rename}
        onClose={() => setRename(false)}
        name={move.name}
        bodyweight={move.bodyweight}
        onSave={(n, bw) => {
          ensureLog(date);
          renameMove(date, idx, n, bw);
        }}
      />
    </article>
  );
}
