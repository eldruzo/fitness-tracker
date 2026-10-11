import { useState } from 'preact/hooks';
import { fmtDate, fmtMonth, fmtWeekday, t, type MessageKey } from '../i18n';
import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  maxKey,
  minKey,
  startOfMonth,
  startOfWeek,
  type DateKey,
} from '../lib/dates';
import { planFor, type PlannedDay } from '../lib/program';
import { dayStatus } from '../lib/schedule';
import type { DayStatus } from '../lib/types';
import { route } from '../router';
import { ctx, logs, program, today } from '../state';
import { Segmented, StatusLabel } from '../ui/components';
import { Icon, StatusGlyph } from '../ui/icons';

type View = 'month' | 'week';
const VIEW_KEY = 'gym-log.planView';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month';
  } catch {
    return 'month';
  }
};

const LEGEND: DayStatus[] = ['done', 'partial', 'skipped', 'missed', 'pending', 'today', 'upcoming', 'rest', 'paused'];

export function Plan() {
  const p = program.value;
  const r = route.value;
  const clampDay = (d: DateKey) => minKey(maxKey(d, p.startDate), p.endDate);
  const anchorFromRoute = r.name === 'plan' && r.month && /^\d{4}-\d{2}-\d{2}$/.test(r.month) ? r.month : null;
  const [view, setViewState] = useState<View>(readView);
  const [anchor, setAnchor] = useState<DateKey>(anchorFromRoute ?? clampDay(today.value));

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const monthStart = startOfMonth(anchor);
  const weekStart = startOfWeek(anchor);
  const canPrev = view === 'month' ? monthStart > startOfMonth(p.startDate) : weekStart > startOfWeek(p.startDate);
  const canNext = view === 'month' ? monthStart < startOfMonth(p.endDate) : weekStart < startOfWeek(p.endDate);
  const move = (dir: 1 | -1) => setAnchor(view === 'month' ? addMonths(monthStart, dir) : addDays(weekStart, 7 * dir));
  const title =
    view === 'month' ? fmtMonth(monthStart) : `${fmtDate(weekStart)} – ${fmtDate(addDays(weekStart, 6))}`;

  return (
    <div class="plan">
      <header class="page-head">
        <h1 tabIndex={-1}>{t('plan.title')}</h1>
        <Segmented
          label={t('plan.view')}
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: t('plan.month') },
            { value: 'week', label: t('plan.week') },
          ]}
        />
      </header>
      <div class="cal-nav">
        <button type="button" class="icon-btn" disabled={!canPrev} onClick={() => move(-1)} aria-label={t('plan.prev')}>
          <Icon name="left" />
        </button>
        <h2 class="cal-title" aria-live="polite">
          {title}
        </h2>
        <button type="button" class="icon-btn" disabled={!canNext} onClick={() => move(1)} aria-label={t('plan.next')}>
          <Icon name="right" />
        </button>
        <button type="button" class="btn btn-text cal-today" onClick={() => setAnchor(clampDay(today.value))}>
          {t('plan.jumpToday')}
        </button>
      </div>
      {view === 'month' ? <MonthGrid monthStart={monthStart} /> : <WeekList weekStart={weekStart} />}
      <details class="legend">
        <summary>{t('plan.legend')}</summary>
        <ul>
          {LEGEND.map((s) => (
            <li key={s}>
              <StatusLabel status={s} />
              <span class="hint">{t(`statusHelp.${s}` as MessageKey)}</span>
            </li>
          ))}
          <li>
            <span class="status">
              <span class="cal-deload-mark" aria-hidden="true">
                D
              </span>
              <span>{t('today.deload')}</span>
            </span>
            <span class="hint">{t('statusHelp.deload')}</span>
          </li>
        </ul>
      </details>
      <PhaseList />
    </div>
  );
}

function dayLabel(p: PlannedDay, s: DayStatus): string {
  const bits = [fmtWeekday(p.date, 'short') + ' ' + fmtDate(p.date)];
  if (p.inProgram) bits.push(p.rest ? t('today.restDay') : p.plan.focus);
  bits.push(t(`status.${s}` as MessageKey));
  if (p.deload) bits.push(t('today.deload'));
  if (p.swapped) bits.push(t('status.swapped'));
  if (p.shifted) bits.push(t('status.shifted'));
  return bits.join(', ');
}

function MonthGrid({ monthStart }: { monthStart: DateKey }) {
  const c = ctx.value;
  const td = today.value;
  const gridStart = startOfWeek(monthStart);
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  const weeks = Math.ceil((diffDays(gridStart, monthEnd) + 1) / 7);
  const days = eachDay(gridStart, addDays(gridStart, weeks * 7 - 1));
  const heads = eachDay('2026-10-12', '2026-10-18'); // a Mon–Sun week, for weekday names
  return (
    <table class="cal-month">
      <caption class="visually-hidden">{fmtMonth(monthStart)}</caption>
      <thead>
        <tr>
          {heads.map((d) => (
            <th scope="col" class="cal-head" key={d}>
              <abbr title={fmtWeekday(d)}>{fmtWeekday(d, 'short').slice(0, 2)}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: weeks }, (_, w) => (
          <tr key={w}>
            {days.slice(w * 7, w * 7 + 7).map((d) => {
              const inMonth = d.slice(0, 7) === monthStart.slice(0, 7);
              if (!inMonth) return <td class="cal-td is-out" key={d} />;
              const p = planFor(d, c);
              const s = dayStatus(d, c, td);
              const phaseStart = p.phase && p.phase.start === d;
              return (
                <td class="cal-td" key={d}>
                  <a
                    href={`#/day/${d}`}
                    class={`cal-cell st-${s}${d === td ? ' is-today' : ''}${p.deload ? ' is-deload' : ''}${phaseStart ? ' is-phase-start' : ''}${!p.inProgram ? ' is-outside' : ''}`}
                    aria-label={dayLabel(p, s)}
                    aria-current={d === td ? 'date' : undefined}
                  >
                    {phaseStart && <span class="cal-phase">{p.phase!.id}</span>}
                    <span class="cal-num mono">{Number(d.slice(8))}</span>
                    {p.inProgram && <StatusGlyph status={s} size={14} />}
                    {p.deload && (
                      <span class="cal-deload-mark" aria-hidden="true">
                        D
                      </span>
                    )}
                  </a>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WeekList({ weekStart }: { weekStart: DateKey }) {
  const c = ctx.value;
  const td = today.value;
  return (
    <ol class="week-list">
      {eachDay(weekStart, addDays(weekStart, 6)).map((d) => {
        const p = planFor(d, c);
        const s = dayStatus(d, c, td);
        const log = logs.value.get(d);
        return (
          <li key={d} class={`week-day st-${s}${d === td ? ' is-today' : ''}`}>
            <a href={`#/day/${d}`} class="week-link" aria-current={d === td ? 'date' : undefined}>
              <span class="week-date">
                <span class="week-wd">{fmtWeekday(d, 'short')}</span>
                <span class="mono">{fmtDate(d).slice(0, 5)}</span>
              </span>
              <span class="week-body">
                <span class="week-focus">
                  {!p.inProgram ? t('plan.outside') : p.rest ? t('today.restDay') : p.plan.focus}
                  {p.phase && p.phase.start === d && <span class="stamp">{p.phase.name}</span>}
                  {p.deload && <span class="stamp">{t('today.deload')}</span>}
                  {p.swapped && <span class="stamp">{t('status.swapped')}</span>}
                  {p.shifted && <span class="stamp">{t('status.shifted')}</span>}
                </span>
                {p.inProgram && !p.rest && (
                  <span class="week-moves">{(log?.moves.length ? log.moves : p.moves).map((m) => m.name).join(' · ')}</span>
                )}
              </span>
              {p.inProgram && <StatusLabel status={s} />}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

function PhaseList() {
  const p = program.value;
  return (
    <section class="phase-list" aria-labelledby="phases-h">
      <h2 id="phases-h" class="section-label">
        {t('plan.phases')}
      </h2>
      <table class="table">
        <thead>
          <tr>
            <th scope="col">{t('plan.phase')}</th>
            <th scope="col">{t('plan.from')}</th>
            <th scope="col">{t('plan.to')}</th>
          </tr>
        </thead>
        <tbody>
          {p.phases.map((ph) => (
            <tr key={ph.id}>
              <th scope="row">
                <a href={`#/plan/${ph.start}`} onClick={() => (route.value = { name: 'plan', month: ph.start })}>
                  {ph.name}
                </a>
              </th>
              <td class="mono">{fmtDate(ph.start)}</td>
              <td class="mono">{fmtDate(ph.end)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

