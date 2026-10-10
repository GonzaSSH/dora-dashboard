// The v1.1 definitions decided by the delivery lead (PLAN.md §2, sandbox/EXPECTED.md).
import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../../src/run';
import { DEFAULT_SETTINGS } from '../../src/config';
import { analyse } from '../../src/metrics/model';
import { parseRevert } from '../../src/metrics/revert';
import { formatDuration, formatPercent, formatPerWeek } from '../../src/format';
import type { Change, Deployment } from '../../src/types';
import { fixtureFetch, prRevertResponses, sandboxResponses } from '../helpers/fixtures';
import { EXPECTED_PR_REVERTS as E, PR_REVERTS_REPO, SANDBOX_REPO, SANDBOX_WINDOW as W } from '../expected';

describe('parseRevert', () => {
  it('reads the commit id git writes into a revert', () => {
    expect(parseRevert('Revert "feat: x"\n\nThis reverts commit 59c40ad7467d0dd2012a4aa7d976ff1cd3986b20.', /^Revert/i))
      .toEqual({ kind: 'commit', sha: '59c40ad7467d0dd2012a4aa7d976ff1cd3986b20' });
  });
  it('reads the pull request GitHub\'s Revert button names', () => {
    expect(parseRevert('Revert "feat: search (#10)" (#12)\n\nReverts example/pr-reverts#10', /^Revert/i))
      .toEqual({ kind: 'pull', repo: 'example/pr-reverts', number: 10 });
    expect(parseRevert('Revert "x"\n\nReverts #7', /^Revert/i)).toEqual({ kind: 'pull', repo: null, number: 7 });
  });
  it('does not mistake the revert\'s own PR number in the title for its target', () => {
    expect(parseRevert('Revert "feat: x (#10)" (#12)', /^Revert/i)).toEqual({ kind: 'unknown' });
  });
  it('returns null for commits that are not reverts', () => {
    expect(parseRevert('feat: revert button', /^Revert/i)).toBeNull();
  });
});

describe('PR-number reverts fixture (EXPECTED.md, "Fixture case")', () => {
  const run = (budget?: number) =>
    runAnalysis({ repo: PR_REVERTS_REPO, settings: DEFAULT_SETTINGS, window: W, fetchFn: fixtureFetch(prRevertResponses), budget });

  it('matches the hand-worked values exactly', async () => {
    const r = await run();
    const m = r.metrics;
    expect(m.deploymentFrequency.perWeek).toBe(E.deploymentFrequency.perWeek);
    expect(m.deploymentFrequency.count).toBe(E.deploymentFrequency.count);
    expect(m.leadTime.medianHours).toBe(E.leadTime.medianHours);
    expect(m.leadTime.commitCount).toBe(E.leadTime.commitCount);
    expect(m.changeFailureRate.rate).toBe(E.changeFailureRate.rate);
    expect(m.changeFailureRate.failed).toBe(E.changeFailureRate.failed);
    expect(m.recoveryTime.medianHours).toBe(E.recoveryTime.medianHours);
    expect(m.reworkRate.rate).toBe(E.reworkRate.rate);
    expect(m.changeFailureRate.unmatchedReverts).toBe(E.unmatchedReverts);
    expect(r.requestsUsed).toBe(E.requests);
    expect(formatPerWeek(m.deploymentFrequency.perWeek)).toBe(E.deploymentFrequency.shown);
    expect(formatDuration(m.leadTime.medianHours!)).toBe(E.leadTime.shown);
    expect(formatPercent(m.changeFailureRate.rate!)).toBe(E.changeFailureRate.shown);
    expect(formatDuration(m.recoveryTime.medianHours!)).toBe(E.recoveryTime.shown);
    expect(formatPercent(m.reworkRate.rate!)).toBe(E.reworkRate.shown);
  });

  it('fails the release that shipped the reverted pull request', async () => {
    const r = await run();
    const v210 = r.analysed.find((d) => d.name === 'v2.1.0')!;
    expect(v210.failed).toBe(true);
    expect(v210.remediation).toBe('v2.2.0');
    expect(v210.failureReason).toMatch(/revert/i);
    expect(r.analysed.find((d) => d.name === 'v2.2.0')!.failed).toBe(false);
  });

  it('when the request budget runs out, unlooked-up reverts fail nothing and are reported', async () => {
    const r = await run(7);
    expect(r.metrics.changeFailureRate.failed).toBe(0);
    expect(r.metrics.changeFailureRate.unmatchedReverts).toBe(3);
    expect(r.collected.notices.join(' ')).toMatch(/request limit/i);
    expect(r.requestsUsed).toBe(7);
  });
});

describe('sandbox under the v1.1 rules', () => {
  it('has no unmatched reverts', async () => {
    const r = await runAnalysis({ repo: SANDBOX_REPO, settings: DEFAULT_SETTINGS, window: W, fetchFn: fixtureFetch(sandboxResponses) });
    expect(r.metrics.changeFailureRate.unmatchedReverts).toBe(0);
  });
});

describe('strict revert matching', () => {
  const T = (d: string) => new Date(`2026-01-${d}:00Z`);
  const c = (sha: string, message: string, at: string): Change => ({ sha, message, authoredAt: T(at), parents: 1 });
  const dep = (name: string, at: string, changes: Change[] | null): Deployment => ({ name, time: T(at), changes, changesTruncated: false });
  const win = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-02-01T00:00:00Z') };

  it('fails the release that shipped the reverted commit, even if it is not the previous one', () => {
    const r = analyse([
      dep('v1.0.0', '02T00:00', []),
      dep('v1.1.0', '05T00:00', [c('aaa1111', 'feat: a', '04T00:00')]),
      dep('v1.2.0', '10T00:00', [c('bbb2222', 'feat: b', '09T00:00')]),
      dep('v1.3.0', '15T00:00', [c('ccc3333', 'Revert "feat: a"\n\nThis reverts commit aaa1111.', '14T00:00')]),
    ], win, DEFAULT_SETTINGS);
    expect(r.find((d) => d.name === 'v1.1.0')!.remediation).toBe('v1.3.0');
    expect(r.find((d) => d.name === 'v1.2.0')!.failed).toBe(false);
  });

  it('reports a revert of a commit that shipped in no known release as unmatched', () => {
    const r = analyse([
      dep('v1.0.0', '02T00:00', []),
      dep('v1.1.0', '05T00:00', [c('ccc3333', 'Revert "feat: old"\n\nThis reverts commit 0ld0ld0.', '04T00:00')]),
    ], win, DEFAULT_SETTINGS);
    expect(r.some((d) => d.failed)).toBe(false);
    expect(r.flatMap((d) => d.unmatchedReverts)).toEqual(['Revert "feat: old"']);
  });
});
