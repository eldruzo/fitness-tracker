import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const sample = fileURLToPath(new URL('../../samples/inbody-sample.csv', import.meta.url));

test('imports the InBody CSV once, and flags duplicates on re-import', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-26T09:00:00'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.goto('/#/body');

  await page.getByRole('button', { name: 'Import InBody CSV' }).click();
  await page.getByLabel('Choose file').setInputFiles(sample);
  await expect(page.getByText('4 rows found.')).toBeVisible();
  await expect(page.getByText(/4 new · 0 already imported/)).toBeVisible();
  await page.getByRole('button', { name: 'Import 4 rows' }).click();
  await expect(page.getByText('4 rows saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // The all-"-" row is stored as empty, not 0.
  const table = page.getByRole('region', { name: 'Measurements' });
  await expect(table.getByRole('rowheader', { name: '18/10/2026' })).toBeVisible();
  await expect(page.getByText('Sunday check-ins · 3 of 17')).toBeVisible();

  await page.getByRole('button', { name: 'Import InBody CSV' }).click();
  await page.getByLabel('Choose file').setInputFiles(sample);
  await expect(page.getByText(/0 new · 4 already imported/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 0 rows' })).toBeDisabled();
});
