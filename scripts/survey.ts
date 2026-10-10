// One-off survey for choosing the showcase repository (v1.1 item 3).
// Runs the app's own analysis, capped at the anonymous 50-request budget, over the last 90 days.
import { runAnalysis } from '../src/run';
import { BUDGET_WITHOUT_TOKEN, DEFAULT_SETTINGS, DEFAULT_WINDOW_DAYS } from '../src/config';
import { formatDuration, formatPercent, formatPerWeek } from '../src/format';
import { messageFor } from '../src/messages';

const repos = process.argv.slice(2);
const end = new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 86_400_000);
const window = { start: new Date(end.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000), end };
const rows = [];
for (const repo of repos) {
  try {
    const r = await runAnalysis({ repo, token: process.env.GITHUB_TOKEN, settings: DEFAULT_SETTINGS, window, budget: BUDGET_WITHOUT_TOKEN });
    const m = r.metrics;
    const d = (h: number | null) => (h === null ? '—' : formatDuration(h));
    const p = (x: number | null) => (x === null ? '—' : formatPercent(x));
    rows.push({
      repo,
      source: r.collected.source,
      deploys: m.deploymentFrequency.count,
      frequency: formatPerWeek(m.deploymentFrequency.perWeek),
      leadTime: `${d(m.leadTime.medianHours)} (${m.leadTime.commitCount} commits)`,
      failureRate: `${p(m.changeFailureRate.rate)} (${m.changeFailureRate.failed})`,
      recovery: `${d(m.recoveryTime.medianHours)} (${m.recoveryTime.count})`,
      rework: `${p(m.reworkRate.rate)} (${m.reworkRate.rework})`,
      unmatchedReverts: m.changeFailureRate.unmatchedReverts,
      sampled: `${r.collected.changesFetched}/${r.collected.changesNeeded}`,
      requests: r.requestsUsed,
    });
    console.log(`\n${repo}: failed = ${r.analysed.filter((x) => x.failed).map((x) => `${x.name} (${x.failureReason})`).join('; ') || 'none'}`);
    console.log(`${repo}: rework = ${r.analysed.filter((x) => x.rework).map((x) => x.name).join(', ') || 'none'}`);
    for (const n of r.collected.notices) console.log(`${repo}: notice: ${n}`);
  } catch (e) {
    rows.push({ repo, error: messageFor(e).title });
  }
}
console.log(`\nWindow ${window.start.toISOString().slice(0, 10)} to ${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`);
console.table(rows);
