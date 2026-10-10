// One-off: explain unmatched reverts for a repository (v1.1 item 3 investigation).
import { runAnalysis } from '../src/run';
import { BUDGET_WITHOUT_TOKEN, DEFAULT_SETTINGS, DEFAULT_WINDOW_DAYS } from '../src/config';
import { parseRevert, sameCommit } from '../src/metrics/revert';

const repo = process.argv[2] ?? 'angular/angular';
const end = new Date(Date.parse(new Date().toISOString().slice(0, 10)) + 86_400_000);
const window = { start: new Date(end.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000), end };
const r = await runAnalysis({ repo, token: process.env.GITHUB_TOKEN, settings: DEFAULT_SETTINGS, window, budget: BUDGET_WITHOUT_TOKEN });
const re = /^Revert/i;
const titleOf = (m: string) => /^Revert "(.+)"/.exec(m.split('\n')[0] ?? '')?.[1] ?? null;
for (const e of r.analysed) {
  for (const c of e.changes ?? []) {
    const t = parseRevert(c.message, re);
    if (!t) continue;
    const sha = t.kind === 'commit' ? t.sha : t.kind === 'pull' ? c.revertTarget ?? null : null;
    const inOwn = sha ? (e.changes ?? []).some((x) => x !== c && sameCommit(x.sha, sha)) : false;
    const inOther = sha ? r.analysed.filter((d) => d !== e && d.changes?.some((x) => sameCommit(x.sha, sha))).map((d) => d.name) : [];
    const title = titleOf(c.message);
    const titleIn = title ? r.analysed.filter((d) => d.changes?.some((x) => (x.message.split('\n')[0] ?? '') === title)).map((d) => `${d.name}${d === e ? '(same)' : ''}`) : [];
    console.log(`\n[${e.name} ${e.time.toISOString().slice(0, 10)}] ${c.message.split('\n')[0]}`);
    console.log(`  target: ${JSON.stringify(t)}${t.kind === 'pull' ? ` -> merge sha ${c.revertTarget}` : ''}`);
    console.log(`  target id in same release: ${inOwn} | in other releases: ${inOther.join(', ') || 'none'}`);
    console.log(`  quoted title found in: ${titleIn.join(', ') || 'none'} | predecessor: ${e.predecessor}`);
    console.log(`  message body: ${JSON.stringify(c.message.split('\n').slice(1).join(' ').slice(0, 300))}`);
  }
}
console.log(`\nunmatched total: ${r.metrics.changeFailureRate.unmatchedReverts}; failed: ${r.analysed.filter((d) => d.failed).map((d) => d.name).join(', ')}`);
