// Context on the tiles (v1.3). Values: sandbox/EXPECTED.md, "Context on the tiles".
import { expect, test } from '@playwright/test';
import { EXPECTED_COMPARISONS, EXPECTED_DORA, EXPECTED_SENTENCES } from '../tests/expected';
import { serveGitHub } from './fixtures';

const KEYS = ['deploymentFrequency', 'leadTime', 'changeFailureRate', 'recoveryTime', 'reworkRate'] as const;

test('every tile has its plain-language sentence and comparison; DORA context on exactly two', async ({ page }) => {
  await serveGitHub(page);
  await page.goto('./?repo=GonzaSSH/dora-sandbox&from=2026-01-01&to=2026-03-31');
  for (const key of KEYS) {
    await expect(page.getByTestId(`sentence-${key}`)).toHaveText(EXPECTED_SENTENCES[key]);
    await expect(page.getByTestId(`trend-${key}`)).toHaveText(EXPECTED_COMPARISONS[key]);
  }
  await expect(page.locator('[data-testid^="dora-"]')).toHaveCount(2);
  await expect(page.getByTestId('dora-deploymentFrequency')).toContainText(EXPECTED_DORA.deploymentFrequency);
  await expect(page.getByTestId('dora-leadTime')).toContainText(EXPECTED_DORA.leadTime);
  await expect(page.getByTestId('dora-leadTime')).toContainText('DORA surveys mostly teams running services. Libraries release on a different rhythm.');
  await expect(page.getByTestId('dora-leadTime').getByRole('link')).toHaveAttribute('href', /2025_state_of_ai_assisted_software_development\.pdf/);
  for (const key of ['changeFailureRate', 'recoveryTime', 'reworkRate'] as const) {
    await expect(page.getByTestId(`no-benchmark-${key}`)).toContainText('No DORA benchmark');
  }
});

test('the saved sandbox example shows the same context with no GitHub requests', async ({ page }) => {
  const calls: string[] = [];
  await page.route('https://api.github.com/**', (route) => {
    calls.push(route.request().url());
    return route.abort();
  });
  await page.goto('./?demo=sandbox');
  for (const key of KEYS) {
    await expect(page.getByTestId(`sentence-${key}`)).toHaveText(EXPECTED_SENTENCES[key]);
    await expect(page.getByTestId(`trend-${key}`)).toHaveText(EXPECTED_COMPARISONS[key]);
  }
  await expect(page.locator('[data-testid^="dora-"]')).toHaveCount(2);
  expect(calls).toEqual([]);
});

test('the comparison explains its absence when the previous period has too few releases', async ({ page }) => {
  const { prRevertResponses } = await import('../tests/helpers/fixtures');
  await serveGitHub(page, prRevertResponses);
  await page.goto('./?repo=example/pr-reverts&from=2026-01-01&to=2026-03-31');
  for (const key of KEYS) {
    await expect(page.getByTestId(`trend-${key}`)).toHaveText('Not compared: the previous 90 days had only 1 release (at least 5 are needed).');
  }
});

test('the comparison says a token is needed when GitHub\'s limit runs out', async ({ page }) => {
  const { sandboxResponses } = await import('../tests/helpers/fixtures');
  // GitHub reports 28 left after the first call: the current period (27 requests) fits, the previous period doesn't.
  const key0 = '/repos/gonzassh/dora-sandbox';
  const low = { ...sandboxResponses, [key0]: { ...sandboxResponses[key0]!, headers: { ...sandboxResponses[key0]!.headers, 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '26', 'x-ratelimit-reset': '1791748800' } } };
  await serveGitHub(page, low);
  await page.goto('./?repo=GonzaSSH/dora-sandbox&from=2026-01-01&to=2026-03-31');
  await expect(page.getByTestId('value-leadTime')).toHaveText('2.0 days');
  for (const key of KEYS) await expect(page.getByTestId(`trend-${key}`)).toContainText('needs a GitHub token');
});
