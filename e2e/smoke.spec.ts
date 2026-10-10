// Smoke test of the deployed site against the real GitHub API. Run with SMOKE_URL set.
// In CI the workflow's own temporary token is typed into the token field (as a user
// would) because CI machines share IP addresses and anonymous limits there are unreliable.
import { expect, test } from '@playwright/test';
import { EXPECTED } from '../tests/expected';

test.use({ trace: 'off', screenshot: 'off', video: 'off' }); // never record the token

test('the deployed site loads and reproduces the sandbox numbers', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'DORA Dashboard' })).toBeVisible();
  if (process.env.SMOKE_TOKEN) await page.getByTestId('token-input').fill(process.env.SMOKE_TOKEN);
  await page.getByTestId('demo').click();
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 60_000 });
  for (const [key, value] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`value-${key}`)).toHaveText(value.shown);
  }
});
