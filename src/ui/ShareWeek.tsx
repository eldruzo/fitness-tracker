import { useState } from 'preact/hooks';
import { t, type MessageKey } from '../i18n';
import { weekSummary } from '../lib/weekly';
import { ctx, today } from '../state';
import { Button } from './components';

/** "Share this week": draws a story-sized image and opens the share sheet (Instagram, TikTok, …). */
export function ShareWeek({ variant = 'secondary' }: { variant?: 'primary' | 'secondary' | 'text' }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<MessageKey | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { shareWeekCard } = await import('./shareCard');
      const r = await shareWeekCard(weekSummary(ctx.value, today.value));
      if (r === 'saved') setMsg('share.saved');
    } catch (e) {
      console.warn('[gym-log] share failed', e);
      setMsg('share.failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant={variant} icon="share" disabled={busy} onClick={() => void run()}>
        {busy ? t('share.making') : t('share.button')}
      </Button>
      {msg && (
        <span class="hint" role="status">
          {t(msg)}
        </span>
      )}
    </>
  );
}
