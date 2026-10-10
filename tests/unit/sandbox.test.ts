// Acceptance test: the whole pipeline against the recorded sandbox must
// reproduce sandbox/EXPECTED.md exactly. Do not edit expected values here
// without first correcting the hand arithmetic in EXPECTED.md.
import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../../src/run';
import { DEFAULT_SETTINGS } from '../../src/config';
import { formatDuration, formatPercent, formatPerWeek } from '../../src/format';
import { fixtureFetch, sandboxResponses } from '../helpers/fixtures';
import { EXPECTED as E, SANDBOX_REPO, SANDBOX_WINDOW as WINDOW } from '../expected';

async function run() {
  return runAnalysis({
    repo: SANDBOX_REPO,
    settings: DEFAULT_SETTINGS,
    window: WINDOW,
    fetchFn: fixtureFetch(sandboxResponses),
  });
}

describe('sandbox matches EXPECTED.md', () => {
  it('step 1: uses tags and finds the 8 deployments in the window', async () => {
    const r = await run();
    expect(r.collected.source).toBe('tags');
    expect(r.analysed.map((d) => d.name)).toEqual([
      'v1.0.0', 'v1.1.0', 'v1.2.0', 'v1.2.1', 'v1.3.0', 'v1.4.0', 'v1.4.1', 'v1.5.0',
    ]);
  });

  it('step 2: predecessors and per-commit lead times', async () => {
    const r = await run();
    const table = Object.fromEntries(r.analysed.map((d) => [d.name, [d.predecessor, d.leadTimesHours]]));
    expect(table).toEqual({
      'v1.0.0': ['v0.9.0', [75, 21]],
      'v1.1.0': ['v1.0.0', [170, 74, 18]],
      'v1.2.0': ['v1.1.0', [168, 76]],
      'v1.2.1': ['v1.2.0', [2]],
      'v1.3.0': ['v1.2.1', [168, 72]],
      'v1.4.0': ['v1.3.0', [26, 4]],
      'v1.4.1': ['v1.4.0', [96, 24]],
      'v1.5.0': ['v1.4.1', [192, 24]],
    });
  });

  it('step 3: failure, remediation and rework flags', async () => {
    const r = await run();
    const flags = Object.fromEntries(
      r.analysed.map((d) => [d.name, { failed: d.failed, remediation: d.remediation, rework: d.rework }]),
    );
    expect(flags).toEqual({
      'v1.0.0': { failed: false, remediation: null, rework: false },
      'v1.1.0': { failed: false, remediation: null, rework: false },
      'v1.2.0': { failed: true, remediation: 'v1.2.1', rework: false },
      'v1.2.1': { failed: false, remediation: null, rework: true },
      'v1.3.0': { failed: true, remediation: 'v1.4.0', rework: false },
      'v1.4.0': { failed: false, remediation: null, rework: true },
      'v1.4.1': { failed: false, remediation: null, rework: true },
      'v1.5.0': { failed: false, remediation: null, rework: false },
    });
    expect(r.analysed.find((d) => d.name === 'v1.2.0')?.failureReason).toMatch(/quick patch/i);
    expect(r.analysed.find((d) => d.name === 'v1.3.0')?.failureReason).toMatch(/revert/i);
  });

  it('step 4: the five metrics, exact values', async () => {
    const { metrics: m } = await run();
    expect(m.deploymentFrequency.count).toBe(E.deploymentFrequency.count);
    expect(m.deploymentFrequency.days).toBe(E.deploymentFrequency.days);
    expect(m.deploymentFrequency.perWeek).toBe(E.deploymentFrequency.perWeek);
    expect(m.leadTime.medianHours).toBe(E.leadTime.medianHours);
    expect(m.leadTime.commitCount).toBe(E.leadTime.commitCount);
    expect(m.changeFailureRate.rate).toBe(E.changeFailureRate.rate);
    expect(m.changeFailureRate.failed).toBe(E.changeFailureRate.failed);
    expect(m.recoveryTime.medianHours).toBe(E.recoveryTime.medianHours);
    expect(m.recoveryTime.count).toBe(E.recoveryTime.count);
    expect(m.reworkRate.rate).toBe(E.reworkRate.rate);
    expect(m.reworkRate.rework).toBe(E.reworkRate.rework);
  });

  it('summary: values as shown to the user', async () => {
    const { metrics: m } = await run();
    expect(formatPerWeek(m.deploymentFrequency.perWeek)).toBe(E.deploymentFrequency.shown);
    expect(formatDuration(m.leadTime.medianHours!)).toBe(E.leadTime.shown);
    expect(formatPercent(m.changeFailureRate.rate!)).toBe(E.changeFailureRate.shown);
    expect(formatDuration(m.recoveryTime.medianHours!)).toBe(E.recoveryTime.shown);
    expect(formatPercent(m.reworkRate.rate!)).toBe(E.reworkRate.shown);
  });

  it('fits comfortably inside the 60/hour unauthenticated limit', async () => {
    const r = await run();
    expect(r.requestsUsed).toBeLessThanOrEqual(25);
    expect(r.collected.changesFetched).toBe(8);
    expect(r.collected.changesNeeded).toBe(8);
  });
});
