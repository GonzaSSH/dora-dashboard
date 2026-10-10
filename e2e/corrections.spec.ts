// Manual corrections and shared links that carry definitions (v1.2). Values: sandbox/EXPECTED.md.
import { expect, test } from '@playwright/test';
import { EXPECTED, EXPECTED_CORRECTED as C } from '../tests/expected';
import { serveGitHub } from './fixtures';

const KEYS = ['deploymentFrequency', 'leadTime', 'changeFailureRate', 'recoveryTime', 'reworkRate'] as const;

test('correcting two releases recalculates, labels, summarises and resets', async ({ page }) => {
  await page.goto('./?demo=sandbox');
  await page.locator('details.deployments summary').click();
  await page.getByTestId('correct-v1.4.1').selectOption('failed');
  await expect(page.getByTestId('fixed-by-v1.4.1')).toHaveValue('v1.5.0'); // default: the next release
  await page.getByTestId('correct-v1.2.0').selectOption('not-failed');

  for (const key of KEYS) await expect(page.getByTestId(`value-${key}`)).toHaveText(C[key].shown);
  await expect(page.getByTestId('corrections-summary')).toContainText('2 releases corrected by hand');
  await expect(page.getByTestId('deployment-v1.4.1')).toContainText('manually corrected');
  await expect(page.getByTestId('deployment-v1.2.0')).toContainText('manually corrected');
  await expect(page.getByTestId('deployment-v1.3.0')).not.toContainText('manually corrected');
  expect(page.url()).toContain('failed=v1.4.1');
  expect(page.url()).toContain('notfailed=v1.2.0');

  await page.getByTestId('reset-corrections').click();
  for (const key of KEYS) await expect(page.getByTestId(`value-${key}`)).toHaveText(EXPECTED[key].shown);
  await expect(page.getByTestId('corrections-summary')).toHaveCount(0);
  expect(page.url()).not.toContain('failed=');
});

test('a shared link with corrections shows the same corrected view', async ({ page }) => {
  await page.goto('./?demo=sandbox&failed=v1.4.1&notfailed=v1.2.0');
  for (const key of KEYS) await expect(page.getByTestId(`value-${key}`)).toHaveText(C[key].shown);
  await expect(page.getByTestId('corrections-summary')).toContainText('2 releases corrected by hand');
});

test('a correction for a release not in the period is ignored with a note', async ({ page }) => {
  await page.goto('./?demo=sandbox&failed=v9.9.9');
  await expect(page.getByTestId('corrections-ignored')).toContainText('v9.9.9');
  for (const key of KEYS) await expect(page.getByTestId(`value-${key}`)).toHaveText(EXPECTED[key].shown);
});

test('non-default settings and corrections travel in the link to a fresh browser session', async ({ page, browser }) => {
  await serveGitHub(page);
  await page.goto('./');
  await page.getByTestId('settings').locator('summary').click();
  await page.getByTestId('use-revert').uncheck();
  await page.getByTestId('rework-rule').selectOption('patches');
  await page.getByTestId('repo-input').fill('GonzaSSH/dora-sandbox');
  await page.getByTestId('from-input').fill('2026-01-01');
  await page.getByTestId('to-input').fill('2026-03-31');
  await page.getByTestId('analyse').click();
  await page.locator('details.deployments summary').click();
  await page.getByTestId('correct-v1.4.1').selectOption('failed');
  await expect(page.getByTestId('corrections-summary')).toContainText('1 release corrected by hand');
  const values = await Promise.all(KEYS.map((k) => page.getByTestId(`value-${k}`).textContent()));
  const definitions = await page.getByTestId('definitions').textContent();
  const link = page.url();

  // A fresh browser session: no cookies, storage or history from the first one.
  const fresh = await browser.newContext();
  const page2 = await fresh.newPage();
  await serveGitHub(page2);
  await page2.goto(link);
  for (const [i, key] of KEYS.entries()) await expect(page2.getByTestId(`value-${key}`)).toHaveText(values[i]!);
  await expect(page2.getByTestId('definitions')).toHaveText(definitions!);
  await expect(page2.getByTestId('corrections-summary')).toContainText('1 release corrected by hand');
  await fresh.close();
});

test('"Definitions used" lists the rules and marks the changed ones', async ({ page }) => {
  await serveGitHub(page);
  await page.goto('./?repo=GonzaSSH/dora-sandbox&from=2026-01-01&to=2026-03-31&hours=24');
  const defs = page.getByTestId('definitions');
  await expect(defs).toContainText('Definitions used');
  await expect(defs.locator('.changed')).toHaveCount(1);
  await expect(defs.locator('.changed')).toContainText('24 hours');
  await expect(defs.locator('.changed')).toContainText('changed');
  await expect(page.getByTestId('use-quick-patch')).toBeChecked();
  await expect(page.locator('#quickPatchHours')).toHaveValue('24');
});

test('saved demos show default definitions with nothing marked as changed', async ({ page }) => {
  await page.goto('./?demo=sandbox');
  await expect(page.getByTestId('definitions')).toContainText('Definitions used');
  await expect(page.getByTestId('definitions').locator('.changed')).toHaveCount(0);
});
