// Full user flow against the recorded sandbox: values must match sandbox/EXPECTED.md.
import { expect, test } from '@playwright/test';
import { SANDBOX_URL, serveGitHub } from './fixtures';
import { prRevertResponses, sandboxResponses } from '../tests/helpers/fixtures';
import { EXPECTED } from '../tests/expected';

test('typing a repo and dates shows the five metrics from EXPECTED.md', async ({ page }) => {
  const gh = await serveGitHub(page);
  await page.goto('./');
  await page.getByTestId('repo-input').fill('GonzaSSH/dora-sandbox');
  await page.getByTestId('from-input').fill('2026-01-01');
  await page.getByTestId('to-input').fill('2026-03-31');
  await page.getByTestId('analyse').click();

  await expect(page.getByTestId('results')).toBeVisible();
  for (const [key, value] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(`value-${key}`)).toHaveText(value.shown);
  }
  // Proxy metrics are labelled as proxies; the measured ones are not.
  for (const key of ['changeFailureRate', 'recoveryTime', 'reworkRate']) {
    await expect(page.getByTestId(`proxy-${key}`)).toHaveText('Proxy');
  }
  for (const key of ['deploymentFrequency', 'leadTime']) {
    await expect(page.getByTestId(`proxy-${key}`)).toHaveCount(0);
  }
  // v1.1: only the two measured metrics carry a rough-guide rating; proxies explain what moves them.
  await expect(page.getByTestId('rating-deploymentFrequency')).toContainText('In between');
  await expect(page.getByTestId('rating-leadTime')).toContainText('In between');
  for (const key of ['changeFailureRate', 'recoveryTime', 'reworkRate']) {
    await expect(page.getByTestId(`rating-${key}`)).toHaveCount(0);
    await expect(page.getByTestId(`drivers-${key}`)).toContainText(/goes up|gets shorter/);
  }
  await expect(page.getByTestId('notices')).toContainText('no GitHub Releases');
  await expect(page.getByTestId('requests-used')).toHaveText('21 GitHub requests used');
  await expect(page.getByTestId('deployment-v1.2.0')).toContainText('Quick patch');
  await expect(page.getByTestId('deployment-v1.3.0')).toContainText('Revert');
  expect(gh.unrecorded).toEqual([]);
  // The shareable URL holds the repo and dates.
  expect(page.url()).toContain('repo=GonzaSSH%2Fdora-sandbox');
});

test('the demo button runs the sandbox', async ({ page }) => {
  await serveGitHub(page);
  await page.goto('./');
  await page.getByTestId('demo').click();
  await expect(page.getByTestId('value-changeFailureRate')).toHaveText('25%');
});

test('a shared link runs straight away', async ({ page }) => {
  await serveGitHub(page);
  await page.goto(`./${SANDBOX_URL}`);
  await expect(page.getByTestId('value-leadTime')).toHaveText('3.0 days');
});

test('changing the failure settings changes the result', async ({ page }) => {
  await serveGitHub(page);
  await page.goto('./');
  await page.getByTestId('settings').locator('summary').click();
  await page.getByTestId('use-revert').uncheck();
  await page.getByTestId('demo').click();
  // Only the quick-patch failure (v1.2.0) remains: 1 of 8.
  await expect(page.getByTestId('value-changeFailureRate')).toHaveText('12.5%');
  await expect(page.getByTestId('value-recoveryTime')).toHaveText('20 hours');
});

test('the token is sent only to GitHub and never stored', async ({ page }) => {
  const TOKEN = 'ghp_E2ETESTTOKEN000000000000000000000000';
  const gh = await serveGitHub(page);
  await page.goto('./');
  await page.getByTestId('token-input').fill(TOKEN);
  await page.getByTestId('demo').click();
  await expect(page.getByTestId('results')).toBeVisible();

  expect(gh.seen.length).toBeGreaterThan(0);
  for (const r of gh.seen) {
    expect(r.auth).toBe(`Bearer ${TOKEN}`);
    expect(r.url).not.toContain(TOKEN);
  }
  expect(page.url()).not.toContain(TOKEN);
  const stored = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
  expect(stored).not.toContain(TOKEN);
  // Not a password field and not inside a <form>, so browsers' password managers and
  // form autofill never offer to save it (review finding 7); still masked on screen.
  const token = page.getByTestId('token-input');
  await expect(token).toHaveAttribute('type', 'text');
  await expect(token).toHaveAttribute('autocomplete', 'off');
  expect(await page.locator('form').count()).toBe(0);
  expect(await token.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-text-security'))).toBe('disc');

  await page.reload();
  await expect(page.getByTestId('token-input')).toHaveValue('');
});

test('the in-app explanations cover all five metrics', async ({ page }) => {
  await page.goto('./');
  const about = page.locator('#about');
  for (const title of ['Deployment frequency', 'Change lead time', 'Change failure rate', 'Failed deployment recovery time', 'Rework rate']) {
    await expect(about).toContainText(title);
  }
});

test('pressing Enter in the repository box runs the analysis', async ({ page }) => {
  await serveGitHub(page);
  await page.goto('./');
  await page.getByTestId('from-input').fill('2026-01-01');
  await page.getByTestId('to-input').fill('2026-03-31');
  await page.getByTestId('repo-input').fill('GonzaSSH/dora-sandbox');
  await page.getByTestId('repo-input').press('Enter');
  await expect(page.getByTestId('value-reworkRate')).toHaveText('37.5%');
});

test('when GitHub\'s limit runs low, the sampled metrics say so', async ({ page }) => {
  // GitHub reports 15 requests left after the first call: 12 more list the deployments,
  // leaving 3 change comparisons out of 8.
  const repoKey = '/repos/gonzassh/dora-sandbox';
  const low = { ...sandboxResponses, [repoKey]: { ...sandboxResponses[repoKey]!, headers: { ...sandboxResponses[repoKey]!.headers, 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '15', 'x-ratelimit-reset': '1791748800' } } };
  await serveGitHub(page, low);
  await page.goto(`./${SANDBOX_URL}`);
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('notices')).toContainText('3 of 8');
  for (const key of ['leadTime', 'changeFailureRate', 'recoveryTime', 'reworkRate']) {
    await expect(page.getByTestId(`sample-${key}`)).toContainText('sample of 3 of 8');
  }
  await expect(page.getByTestId('sample-deploymentFrequency')).toHaveCount(0);
  await expect(page.getByTestId('value-deploymentFrequency')).toHaveText('0.62 per week');
});

test('reverts that name a pull request are matched, and unmatched ones are reported', async ({ page }) => {
  await serveGitHub(page, prRevertResponses);
  await page.goto('./?repo=example/pr-reverts&from=2026-01-01&to=2026-03-31');
  await expect(page.getByTestId('value-changeFailureRate')).toHaveText('25%');
  await expect(page.getByTestId('value-recoveryTime')).toHaveText('12.0 days');
  await expect(page.getByTestId('deployment-v2.1.0')).toContainText('Revert');
  await expect(page.getByTestId('notices')).toContainText('2 reverts could not be matched to a release');
});
