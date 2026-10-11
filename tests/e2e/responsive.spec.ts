import { expect, test } from '@playwright/test';
import { writeFixtureBackup } from './fixture';

const WIDTHS = [360, 390, 768, 1024, 1440];
const SIZES = WIDTHS.flatMap((w) => [
  { w, h: Math.min(Math.round(w * 2), 1000), label: `${w} portrait` },
  { w: Math.round(w * 1.8), h: w, label: `${w} landscape` },
]);
const SCREENS = ['', 'plan', 'progress', 'progress/lateral%20raise', 'body', 'settings', 'day/2026-10-17'];

test('no horizontal scroll at any required size, with data', async ({ browser }) => {
  const backup = writeFixtureBackup();
  for (const s of SIZES) {
    const mobile = Math.min(s.w, s.h) < 600;
    const ctx = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      isMobile: mobile,
      hasTouch: mobile,
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date('2026-10-20T09:00:00'));
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(backup);
    await expect(page.locator('main h1').first()).toBeVisible();
    for (const screen of SCREENS) {
      await page.goto('/#/' + screen);
      await page.locator('main h1').first().waitFor();
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
      // On mobile, overflow grows the layout viewport itself, so compare against the device width too.
      expect(m.inner, `${s.label} #/${screen} layout width`).toBe(s.w);
      expect(m.scroll - m.inner, `${s.label} #/${screen} overflow`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  }
});
