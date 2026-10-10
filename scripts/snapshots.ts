// Refreshes the saved demo results in public/snapshots/ (see CLAUDE.md).
//
//   GITHUB_TOKEN=... npm run snapshots         all demos
//   npm run snapshots -- --offline             sandbox only (no network)
//
// Each demo is analysed with default settings, with the previous period for the comparison
// (v1.3). The sandbox uses the anonymous 50-request budget. Live demos are saved with a token
// and its larger budget (delivery lead's decision, v1.3), and the page says so. The token is
// only sent to GitHub; it is never saved or printed.
// The sandbox's history is fixed, so its snapshot is always built from the recorded fixtures
// (the live check proves they equal the real sandbox) with a fixed date: rebuilding it gives
// an identical file, which a unit test checks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { runWithComparison } from '../src/run';
import { BUDGET_WITH_TOKEN, BUDGET_WITHOUT_TOKEN, DEFAULT_SETTINGS, DEFAULT_WINDOW_DAYS } from '../src/config';
import { DEMOS, toJson } from '../src/snapshot';
import { fixtureFetch, sandboxResponses } from '../tests/helpers/fixtures';

const offline = process.argv.includes('--offline');
const SANDBOX_SAVED_AT = new Date('2026-10-10T00:00:00Z');
const DAY = 86_400_000;
const today = new Date(Date.parse(new Date().toISOString().slice(0, 10)));

mkdirSync('public/snapshots', { recursive: true });
for (const demo of DEMOS) {
  const fromFixtures = demo.id === 'sandbox';
  if (offline && !fromFixtures) continue;
  const window = demo.window
    ? { start: new Date(`${demo.window.start}T00:00:00Z`), end: new Date(Date.parse(`${demo.window.end}T00:00:00Z`) + DAY) }
    : { start: new Date(today.getTime() + DAY - DEFAULT_WINDOW_DAYS * DAY), end: new Date(today.getTime() + DAY) };
  const token = fromFixtures ? undefined : process.env.GITHUB_TOKEN?.trim() || undefined;
  const run = await runWithComparison({
    repo: demo.repo,
    token,
    settings: DEFAULT_SETTINGS,
    window,
    budget: token ? BUDGET_WITH_TOKEN : BUDGET_WITHOUT_TOKEN,
    fetchFn: fromFixtures ? fixtureFetch(sandboxResponses) : undefined,
  });
  const result = { ...run.current, requestsUsed: run.requestsUsed };
  const savedAt = fromFixtures ? SANDBOX_SAVED_AT : new Date();
  const file = `public/snapshots/${demo.id}.json`;
  writeFileSync(file, JSON.stringify(toJson({ id: demo.id, repo: demo.repo, window, savedAt, settings: DEFAULT_SETTINGS, result, savedWithToken: token !== undefined })) + '\n');
  console.log(`${file}: ${result.metrics.deploymentFrequency.count} deployments, ${result.requestsUsed} requests, previous period: ${run.previous.status}`);
}
