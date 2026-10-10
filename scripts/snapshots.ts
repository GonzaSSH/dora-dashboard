// Refreshes the saved demo results in public/snapshots/ (see CLAUDE.md).
//
//   GITHUB_TOKEN=... npm run snapshots         all demos
//   npm run snapshots -- --offline             sandbox only (no network)
//
// Each demo is analysed exactly like an anonymous visitor's live run: default settings and
// the 50-request budget. The token is used only to avoid shared rate limits; never saved.
// The sandbox's history is fixed, so its snapshot is always built from the recorded fixtures
// (the live check proves they equal the real sandbox) with a fixed date: rebuilding it gives
// an identical file, which a unit test checks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { runAnalysis } from '../src/run';
import { BUDGET_WITHOUT_TOKEN, DEFAULT_SETTINGS, DEFAULT_WINDOW_DAYS } from '../src/config';
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
  const result = await runAnalysis({
    repo: demo.repo,
    token: fromFixtures ? undefined : process.env.GITHUB_TOKEN,
    settings: DEFAULT_SETTINGS,
    window,
    budget: BUDGET_WITHOUT_TOKEN,
    fetchFn: fromFixtures ? fixtureFetch(sandboxResponses) : undefined,
  });
  const savedAt = fromFixtures ? SANDBOX_SAVED_AT : new Date();
  const file = `public/snapshots/${demo.id}.json`;
  writeFileSync(file, JSON.stringify(toJson({ id: demo.id, repo: demo.repo, window, savedAt, settings: DEFAULT_SETTINGS, result })) + '\n');
  console.log(`${file}: ${result.metrics.deploymentFrequency.count} deployments, ${result.requestsUsed} requests`);
}
