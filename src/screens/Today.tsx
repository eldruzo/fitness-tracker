import { fmtDate, fmtNum, fmtPct, fmtWeekday, t, tn } from '../i18n';
import { addDays, diffDays, type DateKey } from '../lib/dates';
import { moveKey, planFor, type PlannedDay } from '../lib/program';
import { summarize } from '../lib/progress';
import { computeStats } from '../lib/schedule';
import { summarizeSession } from '../lib/session';
import { go } from '../router';
import {
  addCount,
  counters,
  ctx,
  histories,
  logs,
  meta,
  program,
  reopenSession,
  sessionActive,
  settings,
  today,
  todayPlan,
  undoCount,
  undoSwap,
  unsetDay,
  updateMeta,
} from '../state';
import { Button, Stamp } from '../ui/components';
import { Icon } from '../ui/icons';
import { BackupReminder, GapHint, InstallBanner, MissedBanner, PersistBanner } from './today/Banners';
import { Session } from './today/Session';
import { FirstRun } from './FirstRun';

export function Today() {
  if (!meta.value.firstRunDone) return <FirstRun onDone={() => updateMeta({ firstRunDone: true })} />;
  const d = today.value;
  const p = program.value;
  if (d < p.startDate) return <BeforeStart date={d} />;
  if (d > p.endDate) return <ProgramComplete />;

  const plan = todayPlan.value;
  const log = logs.value.get(d);
  const active = sessionActive.value;

  return (
    <div class={`today${active ? ' has-session' : ''}`}>
      <SheetHeader plan={plan} />
      <div class="banners">
        <MissedBanner />
        {!active && <GapHint />}
        {!active && <BackupReminder />}
        <PersistBanner />
        {!active && <InstallBanner />}
      </div>
      <TodayBody plan={plan} />
      {log?.status !== 'active' && settings.value.counters && <DailyCounters date={d} />}
    </div>
  );
}

function TodayBody({ plan }: { plan: PlannedDay }) {
  const log = logs.value.get(plan.date);
  if (plan.paused) {
    return (
      <section class="state-block">
        <p class="state-title">{t('today.paused')}</p>
        <p>{t('today.pausedBody')}</p>
      </section>
    );
  }
  if (plan.rest && !(log && log.moves.some((m) => m.sets.length))) return <RestDay date={plan.date} />;
  if (log?.status === 'skipped') {
    return (
      <section class="state-block">
        <p class="state-title">{t('today.skipped')}</p>
        <Button variant="secondary" icon="undo" onClick={() => unsetDay(plan.date)}>
          {t('today.unskip')}
        </Button>
      </section>
    );
  }
  if (log?.status === 'done') return <DoneSummary date={plan.date} />;
  return (
    <>
      {plan.swapped && (
        <p class="swap-note">
          <Icon name="swap" size={18} />
          <span>{t('today.swapped', { planned: program.value.weekdays[plan.weekday].focus })}</span>
          <Button variant="text" onClick={() => undoSwap(plan.date)}>
            {t('common.undo')}
          </Button>
        </p>
      )}
      <Session plan={plan} log={log} />
    </>
  );
}

export function SheetHeader({ plan, compact }: { plan: PlannedDay; compact?: boolean }) {
  const p = plan.plan;
  return (
    <header class={`sheet-head${compact ? ' compact' : ''}`}>
      <p class="sheet-date">
        <span class="mono">{fmtDate(plan.date)}</span>
        <span>{fmtWeekday(plan.date)}</span>
      </p>
      <h1 class="sheet-title" tabIndex={-1}>
        {plan.rest ? t('today.restDay') : p.focus}
      </h1>
      <p class="sheet-meta">
        {t('today.dayOf', { n: plan.dayNumber, total: plan.totalDays })}
        {plan.phase && (
          <>
            {' · '}
            {plan.phase.name}
            {' · '}
            {t('today.week', { n: plan.week, total: plan.totalWeeks })}
          </>
        )}
      </p>
      <p class="sheet-tags">
        <Stamp title={t(`work.${p.work}Long`)}>{t(`work.${p.work}`)}</Stamp>
        {p.intensity && !plan.rest && <Stamp>{p.intensity}</Stamp>}
        {plan.deload && <Stamp accent>{t('today.deload')}</Stamp>}
        {plan.swapped && <Stamp>{t('status.swapped')}</Stamp>}
        {plan.shifted && <Stamp>{t('status.shifted')}</Stamp>}
      </p>
    </header>
  );
}

function RestDay({ date }: { date: DateKey }) {
  const next = planFor(addDays(date, 1), ctx.value);
  return (
    <section class="state-block rest-block">
      <p class="state-title">
        <Icon name="rest" />
        {t('today.restTitle')}
      </p>
      <p>{t('today.restBody')}</p>
      {next.inProgram && !next.rest && (
        <div class="preview">
          <h2 class="section-label">{t('today.tomorrow', { day: fmtWeekday(next.date) })}</h2>
          <p class="preview-focus">{next.plan.focus}</p>
          <ol class="preview-moves">
            {next.moves.map((m) => (
              <li key={m.name}>{m.name}</li>
            ))}
          </ol>
          {next.deload && <Stamp accent>{t('today.deload')}</Stamp>}
        </div>
      )}
    </section>
  );
}

function DoneSummary({ date }: { date: DateKey }) {
  const log = logs.value.get(date)!;
  const s = summarizeSession(log, program.value.session);
  return (
    <section class="state-block done-block">
      <p class="state-title">
        <Icon name="check" />
        {t('today.doneTitle')}
      </p>
      <dl class="figures">
        <div>
          <dt>{t('summary.sets')}</dt>
          <dd class="mono">
            {s.sets}/{s.targetSets}
          </dd>
        </div>
        <div>
          <dt>{t('summary.reps')}</dt>
          <dd class="mono">{fmtNum(s.reps, 0)}</dd>
        </div>
        <div>
          <dt>{t('summary.volume')}</dt>
          <dd class="mono">{fmtNum(s.volumeKg, 0)} kg</dd>
        </div>
        {s.durationMin !== null && (
          <div>
            <dt>{t('summary.duration')}</dt>
            <dd class="mono">{t('summary.minutes', { n: s.durationMin })}</dd>
          </div>
        )}
      </dl>
      <table class="table compact-table">
        <caption class="visually-hidden">{t('summary.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('summary.move')}</th>
            <th scope="col" class="num">
              {t('summary.setsCol')}
            </th>
          </tr>
        </thead>
        <tbody>
          {log.moves.map((m) => (
            <tr key={m.name}>
              <th scope="row">{m.name}</th>
              <td class="num mono">
                {m.skipped
                  ? t('session.skipped')
                  : m.sets.map((x) => (m.bodyweight || x.kg === null ? `${x.reps}` : `${fmtNum(x.kg, 2)}×${x.reps}`)).join('  ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="row-actions">
        <Button variant="secondary" icon="edit" onClick={() => go({ name: 'day', date })}>
          {t('today.editLog')}
        </Button>
        <Button variant="text" icon="undo" onClick={() => reopenSession(date)}>
          {t('today.reopen')}
        </Button>
      </div>
    </section>
  );
}

function DailyCounters({ date }: { date: DateKey }) {
  const c = counters.value.get(date);
  const target = settings.value.counterTarget;
  return (
    <section class="counters" aria-labelledby="counters-h">
      <h2 id="counters-h" class="section-label">
        {t('counters.title')}
      </h2>
      {(['squats', 'tiptoe'] as const).map((k) => {
        const list = c?.[k] ?? [];
        const total = list.reduce((a, b) => a + b, 0);
        const pct = Math.min(1, total / target);
        return (
          <div class="counter" key={k}>
            <div class="counter-head">
              <span class="counter-name">{t(`counters.${k}`)}</span>
              <span class="mono counter-val" aria-live="polite">
                {t('counters.value', { n: total, target })}
              </span>
            </div>
            <div
              class="meter"
              role="meter"
              aria-label={t(`counters.${k}`)}
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={Math.min(total, target)}
              aria-valuetext={t('counters.value', { n: total, target })}
            >
              <span style={{ transform: `scaleX(${pct})` }} />
            </div>
            <div class="counter-btns">
              <Button variant="secondary" onClick={() => addCount(date, k, 5)} aria-label={t('counters.add', { n: 5, name: t(`counters.${k}`) })}>
                +5
              </Button>
              <Button variant="secondary" onClick={() => addCount(date, k, 10)} aria-label={t('counters.add', { n: 10, name: t(`counters.${k}`) })}>
                +10
              </Button>
              <Button
                variant="text"
                icon="undo"
                disabled={!list.length}
                onClick={() => undoCount(date, k)}
                aria-label={t('counters.undo', { name: t(`counters.${k}`) })}
              >
                {t('common.undo')}
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BeforeStart({ date }: { date: DateKey }) {
  const p = program.value;
  const n = diffDays(date, p.startDate);
  const first = planFor(p.startDate, ctx.value);
  return (
    <div class="today">
      <header class="sheet-head">
        <p class="sheet-date">
          <span class="mono">{fmtDate(date)}</span>
          <span>{fmtWeekday(date)}</span>
        </p>
        <h1 class="sheet-title" tabIndex={-1}>
          {tn('today.startsIn', n)}
        </h1>
        <p class="sheet-meta">{t('today.programDates', { start: fmtDate(p.startDate), end: fmtDate(p.endDate) })}</p>
      </header>
      <div class="banners">
        <PersistBanner />
      </div>
      <section class="state-block">
        <h2 class="section-label">{t('today.firstSession', { date: fmtDate(first.date), day: fmtWeekday(first.date) })}</h2>
        <p class="preview-focus">{first.plan.focus}</p>
        <ol class="preview-moves">
          <li>{t('session.warmup')}</li>
          <li>{t('session.cardio')}</li>
          {first.moves.map((m) => (
            <li key={m.name}>{m.name}</li>
          ))}
        </ol>
        <Button variant="secondary" onClick={() => go({ name: 'plan' })}>
          {t('today.seePlan')}
        </Button>
      </section>
      {settings.value.counters && <DailyCounters date={date} />}
    </div>
  );
}

function ProgramComplete() {
  const s = computeStats(ctx.value, today.value);
  const p = program.value;
  const best = [...histories.value.values()]
    .map((h) => ({ name: h.name, s: summarize(h) }))
    .filter((x) => x.s.change !== null && x.s.first)
    .sort((a, b) => (b.s.change ?? 0) - (a.s.change ?? 0))
    .slice(0, 5);
  return (
    <div class="today">
      <header class="sheet-head">
        <p class="sheet-date">
          <span class="mono">{fmtDate(today.value)}</span>
        </p>
        <h1 class="sheet-title" tabIndex={-1}>
          {t('complete.title')}
        </h1>
        <p class="sheet-meta">{t('today.programDates', { start: fmtDate(p.startDate), end: fmtDate(p.endDate) })}</p>
      </header>
      <section class="state-block">
        <dl class="figures">
          <div>
            <dt>{t('stats.done')}</dt>
            <dd class="mono">
              {s.done}/{s.planned}
            </dd>
          </div>
          <div>
            <dt>{t('stats.completion')}</dt>
            <dd class="mono">{fmtPct(s.completionPct)}</dd>
          </div>
          <div>
            <dt>{t('stats.skipped')}</dt>
            <dd class="mono">{s.skipped}</dd>
          </div>
        </dl>
        {best.length > 0 && (
          <>
            <h2 class="section-label">{t('complete.biggest')}</h2>
            <ol class="preview-moves">
              {best.map((b) => (
                <li key={b.name}>
                  <a href={`#/progress/${encodeURIComponent(moveKey(b.name))}`}>{b.name}</a>{' '}
                  <span class="mono">
                    {fmtNum(b.s.first!.kg ?? 0, 2)} → {fmtNum(b.s.latest!.kg ?? 0, 2)} kg
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
        <div class="row-actions">
          <Button variant="secondary" onClick={() => go({ name: 'progress' })}>
            {t('nav.progress')}
          </Button>
          <Button variant="text" onClick={() => go({ name: 'settings', section: 'program' })}>
            {t('complete.newDates')}
          </Button>
        </div>
      </section>
    </div>
  );
}
