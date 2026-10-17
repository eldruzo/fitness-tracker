import { useRef, useState } from 'preact/hooks';
import { fmtDate, t } from '../i18n';
import { BackupError } from '../lib/backup';
import { parseBackup, program, requestPersistence, restoreBackup } from '../state';
import { Button } from '../ui/components';

export function FirstRun({ onDone }: { onDone: () => void }) {
  const p = program.value;
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = parseBackup(await f.text());
      await restoreBackup(parsed.data, 'replace');
    } catch (e) {
      setError(e instanceof BackupError ? t(`backupErr.${e.code}`) : t('backupErr.notJson'));
    }
  };

  return (
    <div class="first-run">
      <header class="sheet-head">
        <p class="sheet-date mono">{t('app.name')}</p>
        <h1 class="sheet-title" tabIndex={-1}>
          {t('first.title')}
        </h1>
        <p class="sheet-meta">{t('today.programDates', { start: fmtDate(p.startDate), end: fmtDate(p.endDate) })}</p>
      </header>
      <ol class="first-points">
        <li>
          <strong>{t('first.p1Title')}</strong>
          <span>{t('first.p1')}</span>
        </li>
        <li>
          <strong>{t('first.p2Title')}</strong>
          <span>{t('first.p2')}</span>
        </li>
        <li>
          <strong>{t('first.p3Title')}</strong>
          <span>{t('first.p3')}</span>
        </li>
      </ol>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <div class="first-actions">
        <Button
          variant="primary"
          class="btn-xl"
          onClick={() => {
            void requestPersistence();
            onDone();
          }}
        >
          {t('first.start')}
        </Button>
        <Button variant="text" icon="upload" onClick={() => file.current?.click()}>
          {t('first.import')}
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
    </div>
  );
}
