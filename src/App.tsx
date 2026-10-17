import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { announcement } from './effects';
import { t, type MessageKey } from './i18n';
import { applyUpdate, updateReady } from './pwa';
import { route, type Route } from './router';
import { boot, loadError, loadState, retryJournal, saveError, sessionActive, settings } from './state';
import { Banner, Button, downloadText } from './ui/components';
import { allMeta, getAll } from './lib/db';
import { Icon, type IconName } from './ui/icons';
import { Today } from './screens/Today';
import { Plan } from './screens/Plan';
import { DayEditor } from './screens/DayEditor';

/** Code-split screens: charts and settings load on first visit. */
function lazy(loader: () => Promise<{ default: ComponentType }>) {
  let Cached: ComponentType | null = null;
  return function Lazy() {
    const [C, setC] = useState<ComponentType | null>(() => Cached);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (C) return;
      loader()
        .then((m) => {
          Cached = m.default;
          setC(() => m.default);
        })
        .catch(() => setFailed(true));
    }, []);
    if (failed) return <p class="state-block">{t('app.chunkFailed')}</p>;
    return C ? <C /> : <ScreenSkeleton />;
  };
}

const Progress = lazy(() => import('./screens/Progress'));
const Body = lazy(() => import('./screens/Body'));
const Settings = lazy(() => import('./screens/Settings'));

const TABS: { name: Route['name']; icon: IconName; label: MessageKey; href: string }[] = [
  { name: 'today', icon: 'today', label: 'nav.today', href: '#/' },
  { name: 'plan', icon: 'plan', label: 'nav.plan', href: '#/plan' },
  { name: 'progress', icon: 'progress', label: 'nav.progress', href: '#/progress' },
  { name: 'body', icon: 'body', label: 'nav.body', href: '#/body' },
  { name: 'settings', icon: 'settings', label: 'nav.settings', href: '#/settings' },
];

function useTheme() {
  const theme = settings.value.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', dark ? '#121211' : '#F4F1EA');
  }, [theme]);
  const accent = settings.value.accent;
  useEffect(() => {
    const root = document.documentElement;
    if (accent === 'orange') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', accent);
  }, [accent]);
}

export function App() {
  useTheme();
  const r = route.value;
  const tabActive = (n: Route['name']) => n === r.name || (n === 'plan' && r.name === 'day');

  return (
    <div class="app">
      <a class="skip-link" href="#main">
        {t('app.skip')}
      </a>
      <nav class="nav" aria-label={t('nav.label')}>
        <span class="nav-brand" aria-hidden="true">
          GL
        </span>
        <ul>
          {TABS.map((tab) => (
            <li key={tab.name}>
              <a href={tab.href} class="nav-item" aria-current={tabActive(tab.name) ? 'page' : undefined}>
                <Icon name={tab.icon} />
                <span>{t(tab.label)}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" class={`main main-${r.name}`}>
        <GlobalBanners />
        {loadState.value === 'loading' ? (
          <ScreenSkeleton />
        ) : loadState.value === 'error' ? (
          <StorageError />
        ) : (
          <Screen r={r} />
        )}
      </main>
      <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement.value}
      </div>
    </div>
  );
}

function Screen({ r }: { r: Route }) {
  switch (r.name) {
    case 'today':
      return <Today />;
    case 'plan':
      return <Plan />;
    case 'day':
      return <DayEditor date={r.date} />;
    case 'progress':
      return <Progress />;
    case 'body':
      return <Body />;
    case 'settings':
      return <Settings />;
  }
}

function GlobalBanners() {
  return (
    <div class="banners banners-global">
      {saveError.value && (
        <Banner
          tone="error"
          icon="warn"
          label={t('save.label')}
          actions={
            <Button variant="secondary" onClick={() => void retryJournal()}>
              {t('common.retry')}
            </Button>
          }
        >
          <p>{t('save.body')}</p>
        </Banner>
      )}
      {updateReady.value && (
        <Banner
          label={t('update.label')}
          icon="download"
          live
          actions={
            !sessionActive.value && (
              <Button variant="secondary" onClick={applyUpdate}>
                {t('update.reload')}
              </Button>
            )
          }
        >
          <p>{sessionActive.value ? t('update.afterSession') : t('update.body')}</p>
        </Banner>
      )}
    </div>
  );
}

function StorageError() {
  const exportRaw = async () => {
    // Best effort: dump whatever IndexedDB will still give us.
    try {
      const dump = {
        days: await getAll('days').catch(() => []),
        overrides: await getAll('overrides').catch(() => []),
        body: await getAll('body').catch(() => []),
        counters: await getAll('counters').catch(() => []),
        meta: await allMeta().catch(() => ({})),
      };
      downloadText('gym-log-raw-dump.json', JSON.stringify(dump), 'application/json');
    } catch {
      /* nothing readable */
    }
  };
  return (
    <section class="state-block">
      <h1 tabIndex={-1}>{t('error.storageTitle')}</h1>
      <p>{t('error.storageBody')}</p>
      {loadError.value && <p class="mono hint">{loadError.value}</p>}
      <div class="row-actions">
        <Button variant="primary" onClick={() => void boot()}>
          {t('common.retry')}
        </Button>
        <Button variant="secondary" icon="download" onClick={() => void exportRaw()}>
          {t('error.download')}
        </Button>
      </div>
    </section>
  );
}

function ScreenSkeleton() {
  return (
    <div class="skeleton" aria-busy="true" aria-label={t('app.loading')}>
      <span class="sk sk-date" />
      <span class="sk sk-title" />
      <span class="sk sk-meta" />
      <span class="sk sk-row" />
      <span class="sk sk-row" />
      <span class="sk sk-row" />
    </div>
  );
}
