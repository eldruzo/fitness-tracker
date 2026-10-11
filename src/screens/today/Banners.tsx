import { useState } from 'preact/hooks';
import { fmtDate, fmtDayShort, fmtWeekday, t, tn } from '../../i18n';
import { todayKey, type DateKey, type Weekday } from '../../lib/dates';
import { planFor } from '../../lib/program';
import type { ShiftPreview } from '../../lib/schedule';
import type { MuscleGroup } from '../../lib/types';
import { go } from '../../router';
import {
  acknowledgeMissed,
  applyShift,
  ctx,
  dismissHint,
  exportBackupJson,
  getShiftPreview,
  hint,
  logs,
  meta,
  missedBanner,
  persistState,
  program,
  settings,
  snoozeHint,
  swapToday,
  undoMissed,
  updateMeta,
} from '../../state';
import { Banner, Button, Dialog, downloadText } from '../../ui/components';
import { backupFilename } from '../../lib/backup';
import { installEvent, isIos, isStandalone, promptInstall } from '../../pwa';
import { Icon } from '../../ui/icons';

const MAX_LISTED = 8;

function sessionName(date: DateKey) {
  const p = planFor(date, ctx.value);
  return p.plan.focus;
}

export function MissedBanner() {
  const dates = missedBanner.value;
  const [shift, setShift] = useState<ShiftPreview | null>(null);
  if (!dates.length) return null;
  const canShift = settings.value.shiftPlan;

  if (dates.length === 1) {
    const d = dates[0];
    return (
      <>
        <Banner
          label={t('missed.label')}
          icon="info"
          actions={
            <>
              <Button variant="text" onClick={() => go({ name: 'day', date: d })}>
                {t('missed.logNow')}
              </Button>
              <Button variant="text" icon="undo" onClick={() => undoMissed(d)}>
                {t('common.undo')}
              </Button>
              {canShift && (
                <Button variant="text" onClick={() => setShift(getShiftPreview(d))}>
                  {t('missed.shift')}
                </Button>
              )}
              <Button variant="text" onClick={() => acknowledgeMissed([d])}>
                {t('common.ok')}
              </Button>
            </>
          }
        >
          <p>{t('missed.one', { day: fmtWeekday(d, 'short'), date: fmtDate(d), session: sessionName(d) })}</p>
        </Banner>
        <ShiftDialog preview={shift} onClose={() => setShift(null)} />
      </>
    );
  }

  const shown = dates.slice(-MAX_LISTED);
  return (
    <>
      <Banner
        label={t('missed.label')}
        icon="info"
        actions={
          <Button variant="secondary" onClick={() => acknowledgeMissed(dates)}>
            {t('missed.markAll')}
          </Button>
        }
      >
        <p>{tn('missed.many', dates.length)}</p>
        <ul class="missed-list">
          {shown.map((d) => (
            <li key={d}>
              <span class="mono">{fmtDayShort(d)}</span>
              <span class="missed-session">{sessionName(d)}</span>
              <span class="missed-actions">
                <Button variant="text" onClick={() => go({ name: 'day', date: d })} aria-label={t('missed.logDay', { date: fmtDate(d) })}>
                  {t('missed.log')}
                </Button>
                <Button variant="text" onClick={() => undoMissed(d)} aria-label={t('missed.undoDay', { date: fmtDate(d) })}>
                  {t('common.undo')}
                </Button>
                {canShift && (
                  <Button variant="text" onClick={() => setShift(getShiftPreview(d))}>
                    {t('missed.shift')}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {dates.length > shown.length && <p class="hint">{tn('missed.more', dates.length - shown.length)}</p>}
      </Banner>
      <ShiftDialog preview={shift} onClose={() => setShift(null)} />
    </>
  );
}

const wdName = (wd: Weekday) => program.value.weekdays[wd].focus;

export function ShiftDialog({ preview, onClose }: { preview: ShiftPreview | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!preview}
      onClose={onClose}
      title={t('shift.title')}
      wide
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!preview?.steps.length}
            onClick={() => {
              if (preview) applyShift(preview);
              onClose();
            }}
          >
            {t('shift.apply')}
          </Button>
        </>
      }
    >
      {preview && (
        <>
          <p>{t('shift.intro', { date: fmtDate(preview.missedDate), session: sessionName(preview.missedDate) })}</p>
          {preview.steps.length ? (
            <div class="table-wrap" tabIndex={0} role="region" aria-label={t('shift.title')}>
              <table class="table">
                <thead>
                  <tr>
                    <th scope="col">{t('common.date')}</th>
                    <th scope="col">{t('shift.was')}</th>
                    <th scope="col">{t('shift.becomes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.steps.slice(0, 14).map((s) => (
                    <tr key={s.date}>
                      <td class="mono">{fmtDayShort(s.date)}</td>
                      <td>{wdName(s.from)}</td>
                      <td>
                        <strong>{wdName(s.to)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{t('shift.nothing')}</p>
          )}
          {preview.steps.length > 14 && <p class="hint">{tn('shift.moreRows', preview.steps.length - 14)}</p>}
          {preview.dropped !== null && <p class="hint">{t('shift.dropped', { session: wdName(preview.dropped) })}</p>}
          <p class="hint">{t('shift.note')}</p>
        </>
      )}
    </Dialog>
  );
}

const groupName = (g: MuscleGroup) => t(`group.${g}`);

export function GapHint() {
  const h = hint.value;
  const [confirm, setConfirm] = useState(false);
  if (!h) return null;
  const { gap } = h;
  const name = groupName(gap.group);
  const message = gap.lastTrained
    ? t('hint.text', { group: name, days: gap.days, last: fmtDayShort(gap.lastTrained) })
    : t('hint.textNever', { group: name, start: fmtDate(program.value.startDate) });
  return (
    <>
      <Banner
        label={t('hint.label')}
        icon="info"
        live
        actions={
          <>
            <Button variant="secondary" icon="swap" onClick={() => setConfirm(true)}>
              {t('hint.swap', { group: name })}
            </Button>
            <Button variant="text" onClick={() => snoozeHint(gap.id, gap.group)}>
              {t('hint.snooze')}
            </Button>
            <Button variant="text" onClick={() => dismissHint(gap.id)}>
              {t('common.dismiss')}
            </Button>
          </>
        }
      >
        <p>{message}</p>
      </Banner>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('hint.confirmTitle', { group: name })}
        actions={
          <>
            <Button variant="text" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                swapToday(gap.suggestSession);
                setConfirm(false);
              }}
            >
              {t('hint.confirm')}
            </Button>
          </>
        }
      >
        <p>
          {t('hint.confirmBody', {
            planned: planFor(todayKey(), ctx.value).plan.focus,
            session: program.value.weekdays[gap.suggestSession].focus,
          })}
        </p>
        {h.trainedYesterday && <p class="note">{t('hint.trainedYesterday')}</p>}
      </Dialog>
    </>
  );
}

const BACKUP_EVERY_DAYS = 14;

export function BackupReminder() {
  const m = meta.value;
  const now = Date.now();
  if (m.backupSnoozeUntil && now < m.backupSnoozeUntil) return null;
  const since = m.lastExport ?? m.createdAt;
  const days = Math.floor((now - since) / 86_400_000);
  if (days < BACKUP_EVERY_DAYS) return null;
  if (!logs.value.size) return null;
  return (
    <Banner
      label={t('backup.label')}
      icon="download"
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => downloadText(backupFilename(), exportBackupJson(), 'application/json')}
          >
            {t('backup.exportNow')}
          </Button>
          <Button variant="text" onClick={() => updateMeta({ backupSnoozeUntil: now + 3 * 86_400_000 })}>
            {t('backup.later')}
          </Button>
        </>
      }
    >
      <p>
        {m.lastExport ? t('backup.last', { date: fmtDate(new Date(m.lastExport)) }) : t('backup.never')} {t('backup.why')}
      </p>
    </Banner>
  );
}

export function PersistBanner() {
  if (persistState.value !== 'denied' || meta.value.persistBannerDismissed) return null;
  return (
    <Banner
      label={t('persist.label')}
      icon="warn"
      onClose={() => updateMeta({ persistBannerDismissed: true })}
      actions={
        <Button variant="text" onClick={() => go({ name: 'settings', section: 'data' })}>
          {t('persist.howTo')}
        </Button>
      }
    >
      <p>{t('persist.denied')}</p>
    </Banner>
  );
}

export function InstallBanner() {
  if (isStandalone.value || meta.value.installDismissed) return null;
  if (!installEvent.value && !isIos) return null;
  return (
    <Banner
      label={t('settings.install')}
      icon="install"
      onClose={() => updateMeta({ installDismissed: true })}
      actions={
        installEvent.value ? (
          <Button variant="secondary" onClick={() => void promptInstall()}>
            {t('install.button')}
          </Button>
        ) : undefined
      }
    >
      {installEvent.value ? (
        <p>{t('install.why')}</p>
      ) : (
        <p>
          {t('install.ios1')} <Icon name="share" size={16} label={t('install.shareIcon')} class="inline-icon" />, {t('install.ios2')}
        </p>
      )}
    </Banner>
  );
}
