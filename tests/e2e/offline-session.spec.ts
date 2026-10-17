import { expect, test, type Page } from '@playwright/test';

const TUESDAY = new Date('2026-10-13T09:00:00');

async function firstRun(page: Page) {
  await page.clock.setFixedTime(TUESDAY);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible();
}

async function logSet(page: Page, kg: string) {
  const kgInput = page.getByLabel('kg', { exact: true });
  await kgInput.fill(kg);
  await page.getByRole('button', { name: /^Log set/ }).click();
}

test('completes a full session offline and keeps it after reload', async ({ page, context }) => {
  await firstRun(page);

  // Wait for the service worker to take control, so the app shell is precached.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible();
  await expect(page.getByText('Day 2 of 112')).toBeVisible();

  await page.getByRole('button', { name: 'Start session' }).click();
  await page.getByRole('button', { name: 'Warm-up done' }).click();
  await page.getByRole('button', { name: 'Cardio done' }).click();

  const weights = ['20', '10', '15'];
  for (const kg of weights) {
    await logSet(page, kg);
    // Later sets: the field is empty with the last weight as placeholder; logging uses it.
    const kgInput = page.getByLabel('kg', { exact: true });
    await expect(kgInput).toHaveValue('');
    await expect(kgInput).toHaveAttribute('placeholder', kg);
    for (let s = 1; s < 4; s++) await page.getByRole('button', { name: /^Log set/ }).click();
  }
  await expect(page.getByText('12/12 sets')).toBeVisible(); // footer stays during cool-down ("Finish now" skips it)
  await expect(page.getByRole('button', { name: 'Finish session' })).toHaveCount(0); // cool-down first
  await page.getByRole('button', { name: 'Cool-down done' }).click();
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByText('Session done')).toBeVisible();
  await expect(page.getByRole('cell', { name: '20 kg × 12 · 20 kg × 12 · 20 kg × 12 · 20 kg × 12' })).toBeVisible();

  // Still offline: reload and check the log survived, and the calendar shows Done.
  await page.reload();
  await expect(page.getByText('Session done')).toBeVisible();
  await page.goto('/#/plan');
  await expect(page.getByRole('link', { name: /Tue 13\/10\/2026, Push, Done/ })).toBeVisible();

  // Progress shows the logged move.
  await page.goto('/#/progress');
  await expect(page.getByRole('link', { name: 'Incline chest press' })).toBeVisible();
});

test('restores an in-progress session after closing the app', async ({ page }) => {
  await firstRun(page);
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.getByRole('button', { name: 'Warm-up done' }).click();
  await page.getByRole('button', { name: 'Cardio done' }).click();
  await logSet(page, '22.5');
  await expect(page.getByRole('timer')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /^Log set 2 \/ 4/ })).toBeVisible();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByText('Set 1: 22.5 kg × 12')).toBeAttached();
});

test('with auto-start off, timers wait for a tap and extras stay reachable', async ({ page }) => {
  await firstRun(page);
  await page.goto('/#/settings');
  await page.getByRole('switch', { name: /Start the next timer automatically/ }).uncheck();
  await page.goto('/#/');

  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Warm-up done' }).click();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cardio done' }).click();
  await logSet(page, '20');
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rest timer' }).click();
  await expect(page.getByRole('timer')).toBeVisible();

  // Daily extras are folded away during the session, not hidden.
  await page.getByText('Daily extras').click();
  await page.getByRole('button', { name: 'Add 5 Squats' }).click();
  await expect(page.getByText('5 today')).toBeVisible();
});
