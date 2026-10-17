import { expect, test, type Page } from '@playwright/test';
import { defaultSettings, seedProgram } from '../../src/lib/program';

const WEDNESDAY = new Date('2026-10-14T09:00:00');

async function next(page: Page, times = 1) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name: 'Next' }).click();
}

test('first run: the wizard builds a plan from the answers', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up my plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Set up your plan' })).toBeVisible();

  // 1. Goal
  await page.getByRole('radio', { name: /Build muscle/ }).click();
  await page.getByRole('radio', { name: 'Intermediate' }).click();
  await next(page);

  // 2. Days: Mon–Sat gives push/pull/legs twice. Max 6, so Sunday can't be added.
  for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
    const chip = page.getByRole('button', { name: d });
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  }
  await expect(page.getByRole('button', { name: 'Sunday' })).toBeDisabled();
  await expect(page.getByText('Split: push / pull / legs, twice')).toBeVisible();
  await page.getByRole('radio', { name: /Dumbbells only/ }).click();
  await next(page);

  // 3. Six days means three moves per day.
  await expect(page.locator('.stepper-value').first()).toHaveText('3');
  await next(page);

  // 4. Sunday cardio, 8 weeks.
  await page.getByRole('button', { name: 'Sunday' }).click();
  await page.getByRole('radio', { name: '8 weeks' }).click();
  await next(page);

  // 5. Review and start.
  await expect(page.getByText('Push A')).toBeVisible();
  await expect(page.getByText('Cardio day')).toBeVisible();
  await page.getByRole('button', { name: 'Start training' }).click();

  // Starts today (Wednesday is Legs A), with three moves.
  await expect(page.getByRole('heading', { level: 1, name: 'Legs A' })).toBeVisible();
  await expect(page.getByText('Day 1 of 56')).toBeVisible();
  await expect(page.locator('.step')).toHaveCount(2 + 3 + 1); // warm-up, cardio, 3 moves, cool-down

  // A reload keeps the plan and the wizard stays away.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Legs A' })).toBeVisible();
});

test('data saved by the first app version still loads, and re-running setup keeps it', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Set up my plan' })).toBeVisible();

  // Exactly what the first version stored: work tags on weekdays, no cool-down,
  // no accent/auto-start settings, and a session in progress with a running timer.
  const program = structuredClone(seedProgram()) as unknown as Record<string, unknown>;
  const work = ['Off', 'WFO', 'WFO', 'WFO', 'WFH', 'WFH', 'Off'];
  program.weekdays = (program.weekdays as object[]).map((w, i) => ({ ...w, work: work[i] }));
  const { cooldownMin: _c, ...oldSession } = program.session as Record<string, number>;
  void _c;
  program.session = oldSession;
  const { accent: _a, autoStart: _s, ...oldSettings } = defaultSettings();
  void _a;
  void _s;
  const sets = (kg: number, n: number) => Array.from({ length: n }, () => ({ kg, reps: 12, at: 0 }));
  const days = [
    { date: '2026-10-12', status: 'done', warmup: true, cardio: true, updatedAt: 1, moves: [{ name: 'Lateral raise', bodyweight: false, sets: sets(7, 4) }] },
    { date: '2026-10-13', status: 'done', warmup: true, cardio: true, updatedAt: 1, moves: [{ name: 'Incline chest press', bodyweight: false, sets: sets(30, 4) }] },
    {
      date: '2026-10-14',
      status: 'active',
      warmup: true,
      cardio: true,
      updatedAt: 1,
      startedAt: WEDNESDAY.getTime(),
      moves: [
        { name: 'Hammer curl', bodyweight: false, sets: sets(12, 1) },
        { name: 'Face pull', bodyweight: false, sets: [] },
        { name: 'Abs (plank or leg raise)', bodyweight: true, sets: [] },
      ],
    },
  ];
  const meta = {
    program,
    settings: oldSettings,
    app: { firstRunDone: true, createdAt: 1, lastExport: null, backupSnoozeUntil: null, persistBannerDismissed: true, installDismissed: true },
    active: { date: '2026-10-14', timer: { kind: 'rest-set', step: 2, durationMs: 180000, endsAt: WEDNESDAY.getTime() + 120000 }, drafts: {} },
  };
  await page.evaluate(
    ({ days, meta }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('gym-log', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(['days', 'meta'], 'readwrite');
          for (const d of days) tx.objectStore('days').put(d);
          for (const [k, v] of Object.entries(meta)) tx.objectStore('meta').put(v, k);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { days, meta },
  );
  await page.reload();

  // No wizard; the old plan and the session in progress come back as they were.
  await expect(page.getByRole('heading', { level: 1, name: 'Biceps / rear delts / core' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up my plan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Log set 2 \/ 4/ })).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByText('WFO')).toHaveCount(0);
  await expect(page.locator('.step-name', { hasText: 'Cool-down' })).toBeVisible(); // new step, default 10 min

  await page.goto('/#/plan');
  await expect(page.getByRole('link', { name: /Tue 13\/10\/2026, Push, Done/ })).toBeVisible();
  await page.goto('/#/progress');
  await expect(page.getByRole('link', { name: 'Lateral raise' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Incline chest press' })).toBeVisible();

  // Re-run setup from Settings: a new plan from today, history kept.
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Re-run setup' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New plan' })).toBeVisible();
  await next(page, 4);
  await expect(page.getByText('Your logged sessions and progress are kept.')).toBeVisible();
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.getByText('Day 1 of 84')).toBeVisible();
  // Today's started session keeps its logged set instead of being replaced.
  await expect(page.locator('.step-name', { hasText: 'Hammer curl' })).toBeVisible();
  await page.goto('/#/progress');
  await expect(page.getByRole('link', { name: 'Lateral raise' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hammer curl' })).toBeVisible();
});
