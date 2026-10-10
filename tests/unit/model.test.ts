// Edge cases of the proxy rules (PLAN.md §2) on small synthetic histories.
import { describe, expect, it } from 'vitest';
import { analyse, findPredecessor } from '../../src/metrics/model';
import { computeMetrics } from '../../src/metrics/compute';
import { DEFAULT_SETTINGS } from '../../src/config';
import type { Change, Deployment } from '../../src/types';

const WINDOW = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-02-01T00:00:00Z') };
const T = (s: string) => new Date(`2026-01-${s}:00Z`);
const c = (message: string, at: string, parents = 1): Change => ({ sha: message, message, authoredAt: T(at), parents });
const dep = (name: string, at: string, changes: Change[] | null = []): Deployment => ({
  name, time: T(at), changes, changesTruncated: false,
});

describe('findPredecessor', () => {
  it('picks the highest lower version released earlier, not the previous by time', () => {
    const all = [dep('v1.0.0', '01T00:00'), dep('v2.0.0', '02T00:00'), dep('v1.0.1', '03T00:00')];
    expect(findPredecessor(all[2]!, all)?.name).toBe('v1.0.0');
    expect(findPredecessor(all[1]!, all)?.name).toBe('v1.0.0');
  });
  it('falls back to the previous deployment by time for non-version names', () => {
    const all = [dep('alpha', '01T00:00'), dep('beta', '02T00:00')];
    expect(findPredecessor(all[1]!, all)?.name).toBe('alpha');
  });
  it('returns null for the first deployment', () => {
    const all = [dep('v1.0.0', '01T00:00')];
    expect(findPredecessor(all[0]!, all)).toBeNull();
  });
});

describe('quick-patch failure rule', () => {
  it('counts a patch exactly 48 hours later, but not one second more', () => {
    const exact = analyse([dep('v1.0.0', '05T00:00'), dep('v1.0.1', '07T00:00')], WINDOW, DEFAULT_SETTINGS);
    expect(exact[0]!.failed).toBe(true);
    const late = analyse(
      [dep('v1.0.0', '05T00:00'), { ...dep('v1.0.1', '07T00:00'), time: new Date('2026-01-07T00:00:01Z') }],
      WINDOW, DEFAULT_SETTINGS,
    );
    expect(late[0]!.failed).toBe(false);
  });
  it('ignores a patch that skips a number', () => {
    const r = analyse([dep('v1.0.0', '05T00:00'), dep('v1.0.2', '05T10:00')], WINDOW, DEFAULT_SETTINGS);
    expect(r[0]!.failed).toBe(false);
  });
  it('can be switched off', () => {
    const r = analyse([dep('v1.0.0', '05T00:00'), dep('v1.0.1', '05T10:00')], WINDOW,
      { ...DEFAULT_SETTINGS, useQuickPatch: false });
    expect(r[0]!.failed).toBe(false);
  });
});

// v1.1 (delivery lead's decision): a revert must name its target, and fails the release that
// shipped it. Here commit 'feat: x' (id abc1234def) ships in v1.0.0.
const REVERT_X = 'Revert "feat: x"\n\nThis reverts commit abc1234def.';
const featX = (at: string): Change => ({ ...c('feat: x', at), sha: 'abc1234def' });
describe('revert failure rule', () => {
  it('blames the release that shipped the reverted commit', () => {
    const r = analyse(
      [dep('v1.0.0', '05T00:00', [featX('04T00:00')]), dep('v1.1.0', '09T00:00', [c(REVERT_X, '08T00:00')])],
      WINDOW, DEFAULT_SETTINGS,
    );
    expect(r[0]!.failed).toBe(true);
    expect(r[0]!.remediation).toBe('v1.1.0');
    expect(r[1]!.rework).toBe(true);
  });
  it('does not blame anything when the revert names no target (v1.1 rule)', () => {
    const r = analyse(
      [dep('v1.0.0', '05T00:00', [featX('04T00:00')]), dep('v1.1.0', '09T00:00', [c('Revert "feat: x"', '08T00:00')])],
      WINDOW, DEFAULT_SETTINGS,
    );
    expect(r[0]!.failed).toBe(false);
    expect(r[1]!.unmatchedReverts).toEqual(['Revert "feat: x"']);
  });
  it('can be switched off', () => {
    const r = analyse(
      [dep('v1.0.0', '05T00:00', [featX('04T00:00')]), dep('v1.1.0', '09T00:00', [c(REVERT_X, '08T00:00')])],
      WINDOW, { ...DEFAULT_SETTINGS, useRevert: false },
    );
    expect(r[0]!.failed).toBe(false);
  });
  it('uses the earliest remediation when both rules fire', () => {
    const r = analyse(
      [dep('v1.0.0', '05T00:00', [featX('04T00:00')]), dep('v1.0.1', '05T05:00'), dep('v1.1.0', '05T03:00', [c(REVERT_X, '05T02:00')])],
      WINDOW, DEFAULT_SETTINGS,
    );
    expect(r.find((d) => d.name === 'v1.0.0')!.remediation).toBe('v1.1.0');
  });
});

describe('recovery time', () => {
  it('follows a chain of failed fixes to the first good deployment', () => {
    const r = analyse(
      [dep('v1.0.0', '05T00:00'), dep('v1.0.1', '05T10:00'), dep('v1.0.2', '06T06:00')],
      WINDOW, DEFAULT_SETTINGS,
    );
    // v1.0.0 -> v1.0.1 (10 h, itself failed) -> v1.0.2 (20 h later): v1.0.0 recovers after 30 h.
    expect(r.map((d) => d.recoveryHours)).toEqual([30, 20, null]);
    expect(computeMetrics(r, WINDOW).recoveryTime.medianHours).toBe(25);
  });
});

// v1.1 (delivery lead's decision): every patch release is rework, whatever its commits say.
describe('rework rule', () => {
  it('counts every patch release, whatever its commit messages', () => {
    const mixed = analyse(
      [dep('v1.0.0', '01T00:00'), dep('v1.0.1', '20T00:00', [c('fix: a', '19T00:00'), c('feat: b', '19T00:00')])],
      WINDOW, DEFAULT_SETTINGS,
    );
    expect(mixed[1]!.rework).toBe(true);
    expect(mixed[1]!.reworkReason).toMatch(/patch release/i);
  });
  it('does not count a minor bump of fixes as rework', () => {
    const r = analyse([dep('v1.0.0', '01T00:00'), dep('v1.1.0', '20T00:00', [c('fix: a', '19T00:00')])],
      WINDOW, DEFAULT_SETTINGS);
    expect(r[1]!.rework).toBe(false);
  });
  it('counts a patch release even when its changes are unknown (it depends only on the version)', () => {
    const r = analyse([dep('v1.0.0', '01T00:00'), dep('v1.0.1', '20T00:00', null)], WINDOW, DEFAULT_SETTINGS);
    expect(r[1]!.rework).toBe(true);
  });
});

describe('lead time', () => {
  it('ignores merge commits and deployments with unknown changes', () => {
    const r = analyse(
      [dep('v1.0.0', '01T00:00'), dep('v1.1.0', '10T00:00', [c('feat: a', '09T00:00'), c('Merge pull request #1', '10T00:00', 2)]),
        dep('v1.2.0', '20T00:00', null)],
      WINDOW, DEFAULT_SETTINGS,
    );
    const m = computeMetrics(r, WINDOW);
    expect(m.leadTime.medianHours).toBe(24);
    expect(m.leadTime.commitCount).toBe(1);
    expect(m.leadTime.deploymentsMeasured).toBe(2);
  });
});

describe('window', () => {
  it('includes the start instant and excludes the end instant', () => {
    const r = analyse(
      [{ ...dep('v1.0.0', '01T00:00'), time: WINDOW.start }, { ...dep('v1.1.0', '01T00:00'), time: WINDOW.end }],
      WINDOW, DEFAULT_SETTINGS,
    );
    expect(r.map((d) => d.name)).toEqual(['v1.0.0']);
  });
  it('gives null rates (not 0 or NaN) when there are no deployments', () => {
    const m = computeMetrics([], WINDOW);
    expect(m.deploymentFrequency.perWeek).toBe(0);
    expect(m.changeFailureRate.rate).toBeNull();
    expect(m.leadTime.medianHours).toBeNull();
  });
});
