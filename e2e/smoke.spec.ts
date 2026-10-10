// Smoke test of the deployed site against the real GitHub API. Run with SMOKE_URL set.
// In CI the workflow's own temporary token is typed into the token field (as a user
// would) because CI machines share IP addresses and anonymous limits there are unreliable.
import { expect, test } from '@playwright/test';
import { EXPECTED } from '../tests/expected';

test.use({ trace: 'off', screenshot: 'off', video: 'off' }); // never record the token

test('the deployed demo links load saved results with no GitHub requests', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (req) => {
    if (req.url().startsWith('https://api.github.com/')) calls.push(req.url());
  });
  await page.goto('./?demo=sandbox');
  await expect(page.getByTestId('snapshot-note')).toBeVisible();
  for (const [key, value] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`value-${key}`)).toHaveText(value.shown);
  }
  await page.goto('./?demo=angular');
  await expect(page.getByTestId('repo-link')).toHaveText('angular/angular');
  expect(calls).toEqual([]);
});

test('the deployed site runs a live analysis that reproduces the sandbox numbers', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'DORA Dashboard' })).toBeVisible();
  if (process.env.SMOKE_TOKEN) await page.getByTestId('token-input').fill(process.env.SMOKE_TOKEN);
  await page.getByTestId('repo-input').fill('GonzaSSH/dora-sandbox');
  await page.getByTestId('from-input').fill('2026-01-01');
  await page.getByTestId('to-input').fill('2026-03-31');
  await page.getByTestId('analyse').click();
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('snapshot-note')).toHaveCount(0);
  for (const [key, value] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`value-${key}`)).toHaveText(value.shown);
  }
});
