import { fmtDayShort, fmtInt, fmtKg, fmtWeekday, t } from '../i18n';
import type { WeekSummary } from '../lib/weekly';

/** Story-sized card (9:16), drawn on a canvas so it works offline. Loaded only when sharing. */
const W = 1080;
const H = 1920;
const PAD = 96;

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { bg: v('--bg'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), rule: v('--rule'), accent: v('--accent'), onAccent: v('--on-accent') };
}

const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

async function loadFonts() {
  try {
    await Promise.all([document.fonts.load(`800 120px ${SANS}`), document.fonts.load(`600 48px ${MONO}`)]);
  } catch {
    /* fall back to system fonts */
  }
}

export async function drawWeekCard(s: WeekSummary): Promise<HTMLCanvasElement> {
  await loadFonts();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const k = tokens();
  const condensed = (on: boolean) => {
    if ('fontStretch' in g) (g as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = on ? 'condensed' : 'normal';
  };

  g.fillStyle = k.bg;
  g.fillRect(0, 0, W, H);
  // Accent band on the left edge, like the app's current-step marker.
  g.fillStyle = k.accent;
  g.fillRect(0, 0, 24, H);

  let y = PAD + 40;
  g.textBaseline = 'alphabetic';
  g.fillStyle = k.accent;
  g.font = `700 40px ${MONO}`;
  g.fillText(t('app.name').toUpperCase(), PAD, y);
  g.fillStyle = k.ink2;
  g.font = `500 40px ${MONO}`;
  const range = `${fmtDayShort(s.start)} – ${fmtDayShort(s.end)}`;
  g.fillText(range, W - PAD - g.measureText(range).width, y);

  y += 70;
  g.fillStyle = k.ink;
  g.fillRect(PAD, y, W - PAD * 2, 6);

  // Title
  y += 230;
  condensed(true);
  const title = t('share.week', { n: s.week }).toUpperCase();
  const suffix = `/ ${s.totalWeeks}`;
  g.font = `600 64px ${SANS}`;
  const sw = g.measureText(suffix).width;
  // Shrink the title until title + "/ 16" fits ("WEEK 12" is wider than "WEEK 1").
  let size = 220;
  g.font = `800 ${size}px ${SANS}`;
  while (size > 120 && g.measureText(title).width + 20 + sw > W - PAD * 2) {
    size -= 10;
    g.font = `800 ${size}px ${SANS}`;
  }
  g.fillStyle = k.ink;
  g.fillText(title, PAD - 6, y);
  const tw = g.measureText(title).width;
  g.font = `600 64px ${SANS}`;
  g.fillStyle = k.ink3;
  g.fillText(suffix, PAD + tw + 20, y);
  condensed(false);

  // Day strip
  y += 90;
  const gap = 16;
  const box = (W - PAD * 2 - gap * 6) / 7;
  s.days.forEach((d, i) => {
    const x = PAD + i * (box + gap);
    const done = d.status === 'done';
    const partial = d.status === 'partial' || d.status === 'active';
    const off = d.status === 'rest' || d.status === 'paused' || d.status === 'before' || d.status === 'after';
    g.lineWidth = 4;
    if (done) {
      g.fillStyle = k.accent;
      g.fillRect(x, y, box, box);
    } else if (partial) {
      g.fillStyle = k.accent;
      g.fillRect(x, y + box / 2, box, box / 2);
      g.strokeStyle = k.accent;
      g.strokeRect(x + 2, y + 2, box - 4, box - 4);
    } else {
      g.strokeStyle = off ? k.rule : k.ink3;
      g.strokeRect(x + 2, y + 2, box - 4, box - 4);
      if (d.status === 'missed' || d.status === 'skipped') {
        g.beginPath();
        g.moveTo(x + 18, y + box - 18);
        g.lineTo(x + box - 18, y + 18);
        g.stroke();
      }
    }
    if (done) {
      g.strokeStyle = k.onAccent;
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(x + box * 0.24, y + box * 0.52);
      g.lineTo(x + box * 0.43, y + box * 0.7);
      g.lineTo(x + box * 0.78, y + box * 0.3);
      g.stroke();
    }
    g.fillStyle = off ? k.ink3 : k.ink2;
    g.font = `600 34px ${MONO}`;
    const label = fmtWeekday(d.date, 'short').slice(0, 2).toUpperCase();
    g.fillText(label, x + (box - g.measureText(label).width) / 2, y + box + 50);
  });

  // Figures, 2 × 2
  y += box + 150;
  const figs: [string, string][] = [
    [t('share.sessions'), `${s.sessionsDone}/${s.sessionsPlanned}`],
    [t('share.sets'), fmtInt(s.sets)],
    [t('share.volume'), `${fmtInt(s.volumeKg)} kg`],
    [t('share.streak'), fmtInt(s.streak)],
  ];
  const colW = (W - PAD * 2) / 2;
  figs.forEach(([label, value], i) => {
    const x = PAD + (i % 2) * colW;
    const fy = y + Math.floor(i / 2) * 250;
    g.fillStyle = k.rule;
    g.fillRect(x, fy - 60, colW - 32, 3);
    condensed(true);
    g.fillStyle = k.ink2;
    g.font = `700 40px ${SANS}`;
    g.fillText(label.toUpperCase(), x, fy);
    condensed(false);
    g.fillStyle = k.ink;
    g.font = `700 96px ${MONO}`;
    g.fillText(value, x, fy + 110, colW - 40);
  });

  // Top lifts
  y += 500;
  if (s.topLifts.length) {
    g.fillStyle = k.ink;
    g.fillRect(PAD, y - 60, W - PAD * 2, 6);
    condensed(true);
    g.fillStyle = k.ink2;
    g.font = `700 40px ${SANS}`;
    g.fillText(t('share.topLifts').toUpperCase(), PAD, y);
    condensed(false);
    s.topLifts.forEach((l, i) => {
      const ly = y + 100 + i * 90;
      g.fillStyle = k.ink;
      g.font = `500 46px ${SANS}`;
      const value = `${fmtKg(l.kg)} × ${l.reps}`;
      g.font = `700 46px ${MONO}`;
      const vw = g.measureText(value).width;
      g.fillText(value, W - PAD - vw, ly);
      g.font = `500 46px ${SANS}`;
      g.fillText(l.name, PAD, ly, W - PAD * 2 - vw - 40);
    });
  }

  return c;
}

/** Opens the system share sheet with the card; falls back to downloading the PNG. */
export async function shareWeekCard(s: WeekSummary): Promise<'shared' | 'saved' | 'cancelled'> {
  const canvas = await drawWeekCard(s);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('canvas export failed');
  const file = new File([blob], `gym-log-week-${s.week}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('share.title') });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Fall through to download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
