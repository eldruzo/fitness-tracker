import { signal } from '@preact/signals';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installEvent = signal<BeforeInstallPromptEvent | null>(null);
export const isStandalone = signal(
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
);
/** iOS Safari has no install prompt; we show manual "Add to Home Screen" steps instead. */
export const isIos =
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent.value = e as BeforeInstallPromptEvent;
});
window.addEventListener('appinstalled', () => {
  installEvent.value = null;
  isStandalone.value = true;
});

export async function promptInstall(): Promise<boolean> {
  const e = installEvent.value;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  installEvent.value = null;
  return outcome === 'accepted';
}

/** A new service worker is waiting. We never reload on our own. */
export const updateReady = signal(false);
export const offlineReady = signal(false);
let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    updateSW = registerSW({
      onNeedRefresh() {
        updateReady.value = true;
      },
      onOfflineReady() {
        offlineReady.value = true;
      },
      onRegisteredSW(_url, reg) {
        // Check for updates hourly while open.
        if (reg) setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      },
    });
  } catch (err) {
    console.warn('[gym-log] service worker registration failed', err);
  }
}

export function applyUpdate() {
  void updateSW?.(true);
}
