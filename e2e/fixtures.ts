import type { Page, Route } from '@playwright/test';
import { lookup, sandboxResponses, type FixtureMap, type Recorded } from '../tests/helpers/fixtures';

export const SANDBOX_URL = '?repo=GonzaSSH/dora-sandbox&from=2026-01-01&to=2026-03-31';

const fulfil = (route: Route, r: Recorded) =>
  route.fulfill({
    status: r.status,
    headers: { ...r.headers, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after' },
    body: JSON.stringify(r.body),
  });

/**
 * Answers every api.github.com request from a fixture map. Requests that were not
 * recorded fail the test, and every request seen is returned for inspection.
 */
export async function serveGitHub(page: Page, map: FixtureMap = sandboxResponses) {
  const seen: { url: string; auth: string | undefined }[] = [];
  const unrecorded: string[] = [];
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    }
    seen.push({ url: req.url(), auth: (await req.allHeaders()).authorization });
    const r = lookup(map, req.url());
    if (!r) {
      unrecorded.push(req.url());
      return route.fulfill({ status: 599, body: 'unrecorded' });
    }
    return fulfil(route, r);
  });
  return { seen, unrecorded };
}

/**
 * Clicks a saved example in the sidebar (v1.4). On phones the sidebar is a top bar, so the
 * menu is opened first, as a visitor would.
 */
export async function openSavedExample(page: Page, testId: 'demo' | 'demo-angular' | 'demo-dashboard') {
  const menu = page.getByTestId('menu');
  if (await menu.isVisible()) await menu.click();
  await page.getByTestId(testId).click();
}
