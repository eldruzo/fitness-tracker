// Dev helper: screenshots of key screens at a given width/date. Not part of the test suite.
import { chromium } from '@playwright/test';
const [, , out, width = '390', date = '2026-10-13T09:00:00', theme = 'light'] = process.argv;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const ctx = await browser.newContext({ viewport: { width: +width, height: 860 }, deviceScaleFactor: 1, colorScheme: theme, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.clock.install({ time: new Date(date) });
await page.goto('http://localhost:4173/');
await page.getByRole('button', { name: 'Start', exact: true }).click().catch(() => {});
await page.waitForTimeout(300);
const shots = (process.env.SHOTS ?? 'today').split(',');
for (const s of shots) {
  const [hash, action] = s.split(':');
  await page.goto('http://localhost:4173/#/' + (hash === 'today' ? '' : hash));
  await page.waitForTimeout(400);
  if (action === 'start') { await page.getByRole('button', { name: 'Start session' }).click(); await page.waitForTimeout(200); }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (sw > 0) errors.push(`horizontal overflow ${sw}px on ${s}`);
  await page.screenshot({ path: `${out}/${hash.replace(/\//g, '_') || 'today'}${action ? '-' + action : ''}-${width}-${theme}.png`, fullPage: true });
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
