// Demo links load saved results with zero GitHub requests (v1.1 item 2).
import { expect, test, type Page } from '@playwright/test';
import { EXPECTED } from '../tests/expected';
import { prRevertResponses } from '../tests/helpers/fixtures';
import { serveGitHub } from './fixtures';

async function countGitHub(page: Page) {
  const calls: string[] = [];
  await page.route('https://api.github.com/**', (route) => {
    calls.push(route.request().url());
    return route.abort();
  });
  return calls;
}

test('the sandbox demo link makes no GitHub requests and says it is a saved result', async ({ page }) => {
  const calls = await countGitHub(page);
  await page.goto('./?demo=sandbox');
  for (const [key, value] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`value-${key}`)).toHaveText(value.shown);
  }
  await expect(page.getByTestId('snapshot-note')).toHaveText('Saved result from 10 October 2026. Click Analyse for live data.');
  await expect(page.getByTestId('requests-used')).toContainText('no GitHub requests');
  expect(calls).toEqual([]);
});

test('the angular demo link makes no GitHub requests', async ({ page }) => {
  const calls = await countGitHub(page);
  await page.goto('./?demo=angular');
  await expect(page.getByTestId('repo-link')).toHaveText('angular/angular');
  await expect(page.getByTestId('snapshot-note')).toContainText('Click Analyse for live data.');
  await expect(page.getByTestId('value-leadTime')).not.toBeEmpty();
  expect(calls).toEqual([]);
});

test('the demo buttons load the saved results without GitHub requests', async ({ page }) => {
  const calls = await countGitHub(page);
  await page.goto('./');
  await page.getByTestId('demo').click();
  await expect(page.getByTestId('value-changeFailureRate')).toHaveText(EXPECTED.changeFailureRate.shown);
  await page.getByTestId('demo-angular').click();
  await expect(page.getByTestId('repo-link')).toHaveText('angular/angular');
  expect(calls).toEqual([]);
});

test('after a demo, Analyse runs live and the saved-result note goes away', async ({ page }) => {
  const gh = await serveGitHub(page);
  await page.goto('./?demo=sandbox');
  await expect(page.getByTestId('snapshot-note')).toBeVisible();
  expect(gh.seen).toEqual([]);
  await page.getByTestId('analyse').click();
  await expect(page.getByTestId('snapshot-note')).toHaveCount(0);
  await expect(page.getByTestId('value-reworkRate')).toHaveText(EXPECTED.reworkRate.shown);
  expect(gh.seen.length).toBeGreaterThan(0);
  expect(gh.unrecorded).toEqual([]);
});

test('too few releases are flagged, not hidden', async ({ page }) => {
  await serveGitHub(page, prRevertResponses);
  await page.goto('./?repo=example/pr-reverts&from=2026-01-01&to=2026-03-31');
  await expect(page.getByTestId('low-data')).toContainText('Only 4 releases in this period');
  await expect(page.getByTestId('value-changeFailureRate')).toHaveText('25%');
});

test('a normal result has no low-data note', async ({ page }) => {
  await page.goto('./?demo=sandbox');
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('low-data')).toHaveCount(0);
});
