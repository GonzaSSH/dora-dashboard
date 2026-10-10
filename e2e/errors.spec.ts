// Each error case shows a clear message instead of crashing.
import { expect, test } from '@playwright/test';
import { errorFixtures, sandboxResponses } from '../tests/helpers/fixtures';
import { serveGitHub } from './fixtures';
import { EXPECTED } from '../tests/expected';

async function analyse(page: import('@playwright/test').Page, repo: string, token = '') {
  await page.goto('./');
  await page.getByTestId('repo-input').fill(repo);
  await page.getByTestId('from-input').fill('2026-01-01');
  await page.getByTestId('to-input').fill('2026-03-31');
  if (token) await page.getByTestId('token-input').fill(token);
  await page.getByTestId('analyse').click();
}

test('repo not found', async ({ page }) => {
  await serveGitHub(page, { '/repos/nobody/nothing': errorFixtures.notFound });
  await analyse(page, 'nobody/nothing');
  await expect(page.getByTestId('error')).toContainText("couldn't find that repository");
  await expect(page.getByTestId('error')).toContainText('private');
  await expect(page.getByTestId('results')).toBeHidden();
});

test('private repo (seen with a token)', async ({ page }) => {
  await serveGitHub(page, { '/repos/example/secret': errorFixtures.privateRepoWithToken });
  await analyse(page, 'example/secret', 'ghp_x');
  await expect(page.getByTestId('error')).toContainText('This repository is private');
});

test('repo with no releases or tags', async ({ page }) => {
  await serveGitHub(page, errorFixtures.emptyRepo);
  await analyse(page, 'example/empty-repo');
  await expect(page.getByTestId('error')).toContainText('Nothing to measure');
});

test('rate limit reached', async ({ page }) => {
  await serveGitHub(page, { '/repos/gonzassh/dora-sandbox': errorFixtures.rateLimited });
  await analyse(page, 'GonzaSSH/dora-sandbox');
  await expect(page.getByTestId('error')).toContainText('hourly limit is used up');
  await expect(page.getByTestId('error')).toContainText('token');
});

test('no network', async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.abort('internetdisconnected'));
  await analyse(page, 'GonzaSSH/dora-sandbox');
  await expect(page.getByTestId('error')).toContainText("Couldn't reach GitHub");
});

test('invalid repository text', async ({ page }) => {
  const gh = await serveGitHub(page, {});
  await analyse(page, 'just-a-name');
  await expect(page.getByTestId('error')).toContainText('owner/name');
  expect(gh.seen).toEqual([]);
});

test('the app recovers after an error', async ({ page }) => {
  await serveGitHub(page, { ...sandboxResponses, '/repos/nobody/nothing': errorFixtures.notFound });
  await analyse(page, 'nobody/nothing');
  await expect(page.getByTestId('error')).toBeVisible();
  await page.getByTestId('repo-input').fill('GonzaSSH/dora-sandbox');
  await page.getByTestId('analyse').click();
  await expect(page.getByTestId('value-changeFailureRate')).toHaveText(EXPECTED.changeFailureRate.shown);
  await expect(page.getByTestId('error')).toBeHidden();
});
