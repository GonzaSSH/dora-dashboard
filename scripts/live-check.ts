// Live checks against the real GitHub API (PLAN.md §7).
//
//   npm run live-check -- sandbox   real dora-sandbox must equal sandbox/EXPECTED.md
//   npm run live-check -- large [owner/name]   a big repo (default grafana/grafana) must
//                                   finish within the unauthenticated request budget
//
// Uses GITHUB_TOKEN if set (CI runners share IP addresses, so anonymous limits there are
// unreliable). The token is never printed. The "large" check caps the run at the same
// 50-request budget the app uses without a token, so passing proves it fits in 60/hour.
import { runAnalysis, type RunResult } from '../src/run';
import { BUDGET_WITHOUT_TOKEN, DEFAULT_SETTINGS, DEFAULT_WINDOW_DAYS } from '../src/config';
import { formatDuration, formatPercent, formatPerWeek } from '../src/format';
import { messageFor } from '../src/messages';
import { EXPECTED, SANDBOX_REPO, SANDBOX_WINDOW } from '../tests/expected';

const token = process.env.GITHUB_TOKEN || undefined;
const mode = process.argv[2] ?? 'sandbox';

function show(r: RunResult) {
  const m = r.metrics;
  const d = (h: number | null) => (h === null ? '—' : formatDuration(h));
  const p = (x: number | null) => (x === null ? '—' : formatPercent(x));
  return {
    'Deployment frequency': `${formatPerWeek(m.deploymentFrequency.perWeek)} (${m.deploymentFrequency.count} in ${m.deploymentFrequency.days} days)`,
    'Change lead time': `${d(m.leadTime.medianHours)} (${m.leadTime.commitCount} commits, ${m.leadTime.deploymentsMeasured}/${m.leadTime.deploymentsTotal} deployments)`,
    'Change failure rate': `${p(m.changeFailureRate.rate)} (${m.changeFailureRate.failed}/${m.changeFailureRate.total})`,
    'Recovery time': `${d(m.recoveryTime.medianHours)} (${m.recoveryTime.count} recoveries)`,
    'Rework rate': `${p(m.reworkRate.rate)} (${m.reworkRate.rework}/${m.reworkRate.total})`,
  };
}

async function sandbox(): Promise<boolean> {
  const r = await runAnalysis({ repo: SANDBOX_REPO, token, settings: DEFAULT_SETTINGS, window: SANDBOX_WINDOW });
  const m = r.metrics;
  const rows = [
    ['Deployment frequency (per week)', EXPECTED.deploymentFrequency.perWeek, m.deploymentFrequency.perWeek],
    ['Deployments', EXPECTED.deploymentFrequency.count, m.deploymentFrequency.count],
    ['Change lead time (median h)', EXPECTED.leadTime.medianHours, m.leadTime.medianHours],
    ['Commits measured', EXPECTED.leadTime.commitCount, m.leadTime.commitCount],
    ['Change failure rate', EXPECTED.changeFailureRate.rate, m.changeFailureRate.rate],
    ['Recovery time (median h)', EXPECTED.recoveryTime.medianHours, m.recoveryTime.medianHours],
    ['Rework rate', EXPECTED.reworkRate.rate, m.reworkRate.rate],
  ] as const;
  console.log(`Live sandbox check: ${SANDBOX_REPO}, ${SANDBOX_WINDOW.start.toISOString()} → ${SANDBOX_WINDOW.end.toISOString()}`);
  console.table(rows.map(([metric, expected, actual]) => ({ metric, expected, actual, match: expected === actual ? 'yes' : 'NO' })));
  console.log(`Requests used: ${r.requestsUsed}`);
  return rows.every(([, e, a]) => e === a);
}

async function large(repo: string): Promise<boolean> {
  const end = new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 86_400_000);
  const window = { start: new Date(end.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000), end };
  const started = Date.now();
  const r = await runAnalysis({ repo, token, settings: DEFAULT_SETTINGS, window, budget: BUDGET_WITHOUT_TOKEN });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Live large-repo check: ${repo}, last ${DEFAULT_WINDOW_DAYS} days, source=${r.collected.source}`);
  console.table(show(r));
  console.log(`Finished in ${secs}s using ${r.requestsUsed} requests (cap ${BUDGET_WITHOUT_TOKEN}, GitHub's anonymous limit is 60/hour).`);
  console.log(`Change details fetched for ${r.collected.changesFetched} of ${r.collected.changesNeeded} deployments.`);
  for (const n of r.collected.notices) console.log(`Notice: ${n}`);
  return r.requestsUsed <= BUDGET_WITHOUT_TOKEN && r.metrics.deploymentFrequency.count > 0;
}

try {
  console.log(`Token: ${token ? 'provided (hidden)' : 'none'}`);
  const ok = mode === 'large' ? await large(process.argv[3] ?? 'grafana/grafana') : await sandbox();
  console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  process.exit(ok ? 0 : 1);
} catch (e) {
  const m = messageFor(e);
  console.log(`RESULT: FAIL: ${m.title}. ${m.detail}`);
  process.exit(1);
}
