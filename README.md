# Gym Log

An offline training log for one person and one plan: a 6-day split from
**12/10/2026 to 31/01/2027** (16 weeks, 112 days, 96 sessions, Friday always rest).
It opens on **today's session** and walks you through warm-up, cardio and three
moves of 4 × 12, with rest timers. It also logs weekly InBody measurements from CSV.

There is no backend, no account and no analytics. Everything lives in your
browser's IndexedDB, and the app works with no network after the first load.

- Design direction, tokens and components: [DESIGN.md](DESIGN.md)
- Sample InBody file: [samples/inbody-sample.csv](samples/inbody-sample.csv)
  (four rows, one of them all "-")

## Run

Requires Node 20+.

```sh
npm install
npm run dev          # http://localhost:5173 (service worker disabled in dev)
```

## Test

```sh
npm test             # unit tests (Vitest): CSV, dates, phases, missed days, gaps, progress, backup
npm run test:e2e     # end-to-end (Playwright): builds, serves, and drives Chrome
npm run typecheck
npm run check:contrast   # WCAG AA check of every text/background token pair, both themes
```

The e2e suite covers four flows:

- **A full session completed offline.** The service worker takes control, the
  network goes off, the page reloads, and every set gets logged. The log survives
  another reload and shows as Done in the calendar.
- **An in-progress session restored** after closing the app: the set count and
  the rest timer come back.
- **InBody import.** A preview, then save; re-importing the same file creates no
  duplicates.
- **No horizontal scroll** at 360, 390, 768, 1024 and 1440 px, in portrait and
  landscape, on every screen, with real data.

The e2e tests use the installed Google Chrome (`channel: 'chrome'`). To use
Playwright's own Chromium instead, run `npx playwright install chromium` and set
`PW_CHANNEL=chromium`.

## Build and deploy

```sh
npm run build        # → dist/
npm run preview      # serve dist/ on http://localhost:4173
```

`dist/` is a plain static site with relative paths (`base: './'`) and hash
routing, so it runs from any static host or subfolder: GitHub Pages, Netlify,
Cloudflare Pages, S3, or `nginx` with no rewrite rules.

- It must be served over **HTTPS** (or `localhost`) for the service worker,
  install prompt, wake lock and persistent storage to work.
- `sw.js` should be served with `Cache-Control: no-cache`, so updates are found
  promptly. Hashed assets in `assets/` can be cached forever.

When a new version is deployed, the app shows "A new version is ready". It
never reloads on its own. During a session it waits until you finish.

## Install on your phone

**Android (Chrome, Edge, Samsung Internet).** Open the site, then use the
**Install app** button on Today or in Settings → Install. You can also use the
browser menu → *Install app* / *Add to Home screen*.

**iPhone / iPad (Safari).** Open the site in Safari, tap **Share**, then
**Add to Home Screen**, then **Add**. Open it from the new icon. Installing
matters more on iOS: see the known limitations below.

## How it works

| Area | Where |
|---|---|
| Plan seed, phases, deload, per-date overrides | `src/lib/program.ts` |
| Day status, missed-day detection, shift preview, stats | `src/lib/schedule.ts` |
| Muscle-group gap hints | `src/lib/gaps.ts` |
| Per-move history and summaries | `src/lib/progress.ts` |
| InBody CSV parse / export (45 columns, exact format) | `src/lib/inbody.ts` |
| IndexedDB schema and migrations | `src/lib/db.ts` (`DB_VERSION`) |
| Backup format and migrations | `src/lib/backup.ts` (`BACKUP_FORMAT`) |
| Defensive readers for stored data | `src/lib/validate.ts` |
| App state and actions | `src/state.ts` |
| Timers, notifications, wake lock, foreground checks | `src/effects.ts` |
| Strings (i18n-ready) and Intl formatting | `src/i18n/` |

A few design choices worth knowing:

- **Dates are local calendar keys** (`YYYY-MM-DD`). All arithmetic on them uses
  UTC, so DST and timezone changes can't shift a day. "Today" is always the
  device's local date at that moment.
- **Missed days are detected, not scheduled.** On open, on return to the
  foreground, and once a minute while open, past training days with no session
  are stored as *Rest (missed)*. A session started but unfinished by midnight
  becomes *Partial* with its sets kept. Every change is reversible, and no logged
  data is ever deleted.
- **Timers use timestamps** (`endsAt`), not tick counting, so they stay correct
  in the background and survive a reload. A one-shot timeout at the end time
  fires the vibration, tone and notification.
- **Writes are memory-first.** If an IndexedDB write fails, the record goes to a
  localStorage journal, a "Not saved" banner appears, and the write is retried
  (on the next write, via *Try again*, or at the next start).
- **Schema versioning.** IndexedDB upgrades run as a fall-through `switch` on
  `oldVersion`. Backups carry a `format` number with a migration table. Unknown
  or damaged records are dropped on read instead of crashing the app.

### Dependencies

Runtime (about 43 KB gzipped of initial JS, including the app):

| Package | Why |
|---|---|
| `preact` | Components and rendering at about 4 KB. React-compatible patterns without React's size. |
| `@preact/signals` | Shared reactive state with fine-grained updates, without a store library. |
| `idb` | A tiny promise wrapper over IndexedDB (about 1 KB). Dexie's query layer isn't needed. |
| `@fontsource-variable/archivo`, `@fontsource-variable/jetbrains-mono` | Self-hosted font files only. Just the latin `woff2` is bundled, with no third-party requests. |

Build and test only: `vite`, `typescript`, `@preact/preset-vite`,
`vite-plugin-pwa` (Workbox precache and update flow), `@vite-pwa/assets-generator`
(icons from `public/icon.svg`), `vitest`, `@playwright/test`, `@types/node`.

The charts are hand-written SVG (`src/ui/LineChart.tsx`). They're code-split with
the Progress and Body screens, which load on first visit and are precached for
offline use.

### Lighthouse

These are mobile scores from a local production build with Lighthouse 12.6:
Performance 97, Accessibility 100, Best Practices 100, SEO 100, CLS 0, TBT 0 ms.
Lighthouse 12 removed the PWA category. Installability comes from the manifest
(standalone, maskable icon, theme color) and the service worker, and the offline
e2e test checks that the app works with no network.

## Known limitations

- **The browser can clear your data.** It is stored only on this device. If you
  clear site data, use private browsing, or the browser evicts storage under disk
  pressure, everything is gone. The app asks for persistent storage and shows a
  banner if that's denied. Export a backup (Settings → Data) at least every two
  weeks; Today reminds you.
- **iOS may evict storage for sites not added to the Home Screen.** Safari can
  delete script-written storage for websites you haven't visited in about 7
  days. Installed home-screen apps are exempt. On iPhone, install the app, and
  still keep backups.
- **There is no sync between devices.** A phone and a laptop each have separate
  data. Move it with export and import (merge or replace).
- **Background timers are best effort.** When the app is in the background, the
  OS may delay the end-of-rest notification, or suppress it if notifications
  aren't allowed. On return, the timer is always correct because it is computed
  from timestamps. iOS supports web notifications only for installed apps (iOS
  16.4+).
- **Wake lock needs support.** Keeping the screen on requires the Screen Wake
  Lock API (Chrome, Edge, Safari 16.4+). Elsewhere, or in battery-saver mode, the
  screen may dim. The session itself is unaffected.
- **Midnight during a session.** A session still open at midnight is saved as
  *Partial* for its own date. You can mark it done afterwards from the calendar.
- **"Shift plan" has no free days to use.** Only Friday is free and it's never
  used, so a shift slides every later session back by one. The last session
  falls past the program end and is shown as dropped in the preview.
- **Units are kg only.**
- **English only for now.** Strings are centralized in `src/i18n/en.ts`, and
  dates and numbers use `Intl` (`en-GB`, so dates read dd/mm/yyyy).
