import { fmtDate, fmtKg, fmtNum, fmtPct, fmtSigned, t, tn } from '../i18n';
import { moveKey } from '../lib/program';
import { allMoveNames, summarize, type MoveHistory } from '../lib/progress';
import { computeStats } from '../lib/schedule';
import { route } from '../router';
import { ctx, histories, program, today } from '../state';
import { EmptyState } from '../ui/components';
import { Icon } from '../ui/icons';
import { LineChart } from '../ui/LineChart';
import { ShareWeek } from '../ui/ShareWeek';

export default function Progress() {
  const r = route.value;
  const sel = r.name === 'progress' && r.move ? moveKey(r.move) : null;
  if (sel) return <MoveDetail moveKeyStr={sel} />;
  return <Overview />;
}

function Overview() {
  const s = computeStats(ctx.value, today.value);
  const hs = histories.value;
  const names = allMoveNames(program.value, hs);
  const logged = names.filter((n) => hs.get(n.key)?.points.length);
  const unlogged = names.filter((n) => !hs.get(n.key)?.points.length);
  return (
    <div class="progress">
      <header class="page-head">
        <h1 tabIndex={-1}>{t('progress.title')}</h1>
      </header>
      <dl class="figures figures-4">
        <div>
          <dt>{t('stats.done')}</dt>
          <dd class="mono">{s.done}</dd>
        </div>
        <div>
          <dt>{t('stats.skipped')}</dt>
          <dd class="mono">{s.skipped}</dd>
        </div>
        <div>
          <dt>{t('stats.completion')}</dt>
          <dd class="mono">{s.planned ? fmtPct(s.completionPct) : '–'}</dd>
        </div>
        <div>
          <dt>{t('stats.streak')}</dt>
          <dd class="mono">{s.streak}</dd>
        </div>
      </dl>
      <p class="hint">{t('stats.note', { missed: s.missed, partial: s.partial, remaining: s.remaining })}</p>
      <div class="row-actions">
        <ShareWeek />
      </div>

      <h2 class="section-label">{t('progress.moves')}</h2>
      {!logged.length ? (
        <EmptyState title={t('progress.emptyTitle')}>
          <p>{t('progress.emptyBody')}</p>
        </EmptyState>
      ) : (
        <div class="table-wrap" role="region" aria-label={t('progress.moves')} tabIndex={0}>
          <table class="table move-table">
            <thead>
              <tr>
                <th scope="col">{t('progress.move')}</th>
                <th scope="col" class="num">
                  {t('progress.latest')}
                </th>
                <th scope="col" class="num">
                  {t('progress.change')}
                </th>
                <th scope="col" class="num">
                  {t('progress.sessions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {logged.map((n) => {
                const sm = summarize(hs.get(n.key));
                return (
                  <tr key={n.key}>
                    <th scope="row">
                      <a href={`#/progress/${encodeURIComponent(n.key)}`}>{n.name}</a>
                    </th>
                    <td class="num mono">
                      {n.bodyweight ? t('progress.bw') : fmtKg(sm.latest?.kg)}
                    </td>
                    <td class="num mono">{sm.change === null ? '–' : fmtSigned(sm.change, 2)}</td>
                    <td class="num mono">{sm.sessions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {unlogged.length > 0 && (
        <details class="unlogged">
          <summary>{tn('progress.notYet', unlogged.length)}</summary>
          <ul class="plain-list">
            {unlogged.map((n) => (
              <li key={n.key}>{n.name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function MoveDetail({ moveKeyStr }: { moveKeyStr: string }) {
  const h: MoveHistory | undefined = histories.value.get(moveKeyStr);
  const names = allMoveNames(program.value, histories.value);
  const name = h?.name ?? names.find((n) => n.key === moveKeyStr)?.name ?? moveKeyStr;
  const bw = h?.bodyweight ?? names.find((n) => n.key === moveKeyStr)?.bodyweight ?? false;
  const sm = summarize(h);
  const pts = (h?.points ?? []).map((p) => ({ date: p.date, value: bw ? p.totalReps : (p.kg ?? 0) }));
  const unit = bw ? t('progress.repsUnit') : 'kg';
  const val = (p: { kg: number | null; totalReps: number } | null) =>
    !p ? '–' : bw ? `${fmtNum(p.totalReps, 0)} ${t('progress.repsUnit')}` : fmtKg(p.kg);

  return (
    <div class="progress">
      <a class="back-link" href="#/progress">
        <Icon name="left" size={20} />
        {t('progress.all')}
      </a>
      <header class="page-head">
        <h1 tabIndex={-1}>{name}</h1>
      </header>
      {bw && <p class="hint">{t('progress.bwNote')}</p>}
      <dl class="figures figures-4">
        <div>
          <dt>{t('progress.first')}</dt>
          <dd class="mono">{val(sm.first)}</dd>
          {sm.first && <dd class="fig-sub mono">{fmtDate(sm.first.date)}</dd>}
        </div>
        <div>
          <dt>{t('progress.latest')}</dt>
          <dd class="mono">{val(sm.latest)}</dd>
          {sm.latest && <dd class="fig-sub mono">{fmtDate(sm.latest.date)}</dd>}
        </div>
        <div>
          <dt>{t('progress.best')}</dt>
          <dd class="mono">{val(sm.best)}</dd>
          {sm.best && <dd class="fig-sub mono">{fmtDate(sm.best.date)}</dd>}
        </div>
        <div>
          <dt>{t('progress.change')}</dt>
          <dd class="mono">{sm.change === null ? '–' : `${fmtSigned(sm.change, 2)} kg`}</dd>
          <dd class="fig-sub">{t('progress.changeHint')}</dd>
        </div>
      </dl>
      {!pts.length ? (
        <EmptyState title={t('progress.noData')}>
          <p>{t('progress.noDataBody')}</p>
        </EmptyState>
      ) : (
        <figure class="chart-fig">
          <figcaption class="section-label">{bw ? t('progress.chartRepsTitle') : t('progress.chartTitle')}</figcaption>
          <LineChart points={pts} label={name} unit={unit} digits={bw ? 0 : 2} />
          {pts.length === 1 && <p class="hint">{t('progress.onePoint')}</p>}
          <details class="data-table">
            <summary>{t('chart.showTable')}</summary>
            <div class="table-wrap" tabIndex={0} role="region" aria-label={t('chart.table', { label: name })}>
              <table class="table">
                <thead>
                  <tr>
                    <th scope="col">{t('common.date')}</th>
                    {!bw && (
                      <th scope="col" class="num">
                        {t('progress.topSet')}
                      </th>
                    )}
                    <th scope="col" class="num">
                      {t('progress.setsCol')}
                    </th>
                    <th scope="col" class="num">
                      {t('progress.repsCol')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {h!.points.map((p, i) => (
                    <tr key={p.date + i}>
                      <th scope="row" class="mono">
                        <a href={`#/day/${p.date}`}>{fmtDate(p.date)}</a>
                      </th>
                      {!bw && (
                        <td class="num mono">
                          {fmtKg(p.kg)} × {p.reps}
                        </td>
                      )}
                      <td class="num mono">{p.sets}</td>
                      <td class="num mono">{p.totalReps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </figure>
      )}
    </div>
  );
}
