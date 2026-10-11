import { effect, signal } from '@preact/signals';
import { t } from './i18n';
import { active, dailyCheck, markTimerEnded, sessionActive, settings } from './state';
import type { TimerState } from './lib/types';

/** Milliseconds left, recomputed from the wall clock (never by counting ticks). */
export function remainingMs(timer: TimerState, now = Date.now()): number {
  return timer.pausedRemaining !== undefined ? timer.pausedRemaining : timer.endsAt - now;
}

/** A 1 Hz clock that only runs while something needs it. */
export const now = signal(Date.now());
/** Polite live-region text for screen readers (timer end, set logged). */
export const announcement = signal('');

export function announce(msg: string) {
  // Clear first so repeating the same message is still announced.
  announcement.value = '';
  setTimeout(() => (announcement.value = msg), 50);
}

let audioCtx: AudioContext | null = null;
/** Must be called from a user gesture once, so iOS allows sound later. */
export function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function beep() {
  if (!audioCtx || !settings.value.sound) return;
  try {
    const t0 = audioCtx.currentTime;
    for (const [i, f] of [880, 660, 880].entries()) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      o.type = 'square';
      g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + i * 0.22);
      o.stop(t0 + i * 0.22 + 0.2);
    }
  } catch {
    /* ignore */
  }
}

function timerEndMessage(timer: TimerState): string {
  switch (timer.kind) {
    case 'warmup':
      return t('timer.endWarmup');
    case 'cardio':
      return t('timer.endCardio');
    case 'rest-set':
      return t('timer.endRestSet');
    case 'rest-move':
      return t('timer.endRestMove');
  }
}

async function systemNotify(body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification('Gym Log', { body, tag: 'timer', icon: 'pwa-192x192.png', silent: false });
    else new Notification('Gym Log', { body, tag: 'timer' });
  } catch {
    /* ignore */
  }
}

function onTimerEnd(timer: TimerState) {
  if (!markTimerEnded()) return;
  const msg = timerEndMessage(timer);
  announce(msg);
  if (settings.value.vibrate) navigator.vibrate?.([200, 100, 200]);
  beep();
  if (document.visibilityState === 'hidden') void systemNotify(msg);
  document.dispatchEvent(new CustomEvent('timer-end'));
}

let tickHandle: number | undefined;
let endHandle: number | undefined;

function checkTimer() {
  now.value = Date.now();
  const timer = active.value?.timer;
  if (timer && !timer.notified && timer.pausedRemaining === undefined && remainingMs(timer) <= 0) onTimerEnd(timer);
}

/** Starts the ticker, foreground checks, the midnight rollover check and wake lock handling. */
export function startEffects() {
  // Ticker: 4 Hz while a timer runs (smooth display), otherwise a slow 30 s clock.
  effect(() => {
    const timer = active.value?.timer;
    const running = !!timer && timer.pausedRemaining === undefined && !timer.notified;
    clearInterval(tickHandle);
    clearTimeout(endHandle);
    tickHandle = window.setInterval(checkTimer, running ? 250 : 30_000);
    if (running && timer) {
      // A one-shot at the end time: fires even if intervals are throttled in the background.
      endHandle = window.setTimeout(checkTimer, Math.max(0, timer.endsAt - Date.now()) + 30);
    }
    checkTimer();
  });

  const onForeground = () => {
    if (document.visibilityState === 'visible') {
      dailyCheck();
      checkTimer();
      void syncWakeLock();
    }
  };
  document.addEventListener('visibilitychange', onForeground);
  window.addEventListener('focus', onForeground);
  window.addEventListener('pageshow', onForeground);
  // Midnight rollover while the app stays open.
  setInterval(() => dailyCheck(), 60_000);

  effect(() => {
    void sessionActive.value;
    void syncWakeLock();
  });
}

// ─── Screen Wake Lock ───────────────────────────────────────────────────────

let lock: WakeLockSentinel | null = null;
export const wakeLockState = signal<'off' | 'on' | 'unsupported'>('off');

async function syncWakeLock() {
  const want = sessionActive.value && document.visibilityState === 'visible';
  if (!('wakeLock' in navigator)) {
    wakeLockState.value = 'unsupported';
    return;
  }
  try {
    if (want && !lock) {
      lock = await navigator.wakeLock.request('screen');
      wakeLockState.value = 'on';
      lock.addEventListener('release', () => {
        lock = null;
        wakeLockState.value = 'off';
      });
    } else if (!want && lock) {
      await lock.release();
      lock = null;
      wakeLockState.value = 'off';
    }
  } catch {
    // Denied (battery saver, not visible…): the session still works, the screen may dim.
    wakeLockState.value = 'off';
  }
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
