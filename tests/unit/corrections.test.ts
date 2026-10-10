// Manual corrections of failure detection (v1.2, PLAN.md §2b). Values from sandbox/EXPECTED.md.
import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../../src/run';
import { DEFAULT_SETTINGS } from '../../src/config';
import { applyCorrections, NO_CORRECTIONS, type Corrections } from '../../src/metrics/corrections';
import { computeMetrics } from '../../src/metrics/compute';
import { formatDuration, formatPercent } from '../../src/format';
import { fixtureFetch, sandboxResponses } from '../helpers/fixtures';
import { EXPECTED, EXPECTED_CORRECTED as C, EXPECTED_UNFIXED as U, SANDBOX_REPO, SANDBOX_WINDOW as W } from '../expected';

const auto = () => runAnalysis({ repo: SANDBOX_REPO, settings: DEFAULT_SETTINGS, window: W, fetchFn: fixtureFetch(sandboxResponses) });
const correct = async (c: Corrections) => {
  const r = await auto();
  const out = applyCorrections(r.analysed, c, DEFAULT_SETTINGS);
  return { ...out, metrics: computeMetrics(out.analysed, W) };
};

describe('applyCorrections', () => {
  it('with no corrections, returns exactly the automatic result', async () => {
    const r = await auto();
    const out = applyCorrections(r.analysed, NO_CORRECTIONS, DEFAULT_SETTINGS);
    expect(out.corrected).toEqual([]);
    expect(out.analysed.map(({ manuallyCorrected: _, ...d }) => d)).toEqual(r.analysed);
    expect(computeMetrics(out.analysed, W)).toEqual(r.metrics);
  });

  it('v1.4.1 marked failed and v1.2.0 marked not failed match EXPECTED.md', async () => {
    const { analysed, metrics: m, corrected } = await correct({ failed: [{ name: 'v1.4.1', fixedBy: 'next' }], notFailed: ['v1.2.0'] });
    expect(corrected).toEqual(['v1.2.0', 'v1.4.1']);
    expect(analysed.filter((d) => d.failed).map((d) => d.name)).toEqual([...C.failed]);
    expect(analysed.filter((d) => d.rework).map((d) => d.name)).toEqual([...C.rework]);
    expect(analysed.find((d) => d.name === 'v1.4.1')!.remediation).toBe('v1.5.0');
    expect(analysed.find((d) => d.name === 'v1.4.1')!.recoveryHours).toBe(380);
    expect(m.changeFailureRate.rate).toBe(C.changeFailureRate.rate);
    expect(m.recoveryTime.medianHours).toBe(C.recoveryTime.medianHours);
    expect(m.recoveryTime.count).toBe(C.recoveryTime.count);
    expect(m.reworkRate.rate).toBe(C.reworkRate.rate);
    expect(formatDuration(m.recoveryTime.medianHours!)).toBe(C.recoveryTime.shown);
    expect(formatPercent(m.changeFailureRate.rate!)).toBe(C.changeFailureRate.shown);
    // Dates and commits are untouched.
    expect(m.deploymentFrequency.perWeek).toBe(EXPECTED.deploymentFrequency.perWeek);
    expect(m.leadTime.medianHours).toBe(EXPECTED.leadTime.medianHours);
  });

  it('labels corrected releases and explains them', async () => {
    const { analysed } = await correct({ failed: [{ name: 'v1.4.1', fixedBy: 'next' }], notFailed: ['v1.2.0'] });
    expect(analysed.filter((d) => d.manuallyCorrected).map((d) => d.name)).toEqual(['v1.2.0', 'v1.4.1']);
    expect(analysed.find((d) => d.name === 'v1.4.1')!.failureReason).toMatch(/by hand/i);
    expect(analysed.find((d) => d.name === 'v1.2.0')!.failureReason).toBeNull();
  });

  it('a failure on the last release defaults to "not fixed in this period" (EXPECTED.md)', async () => {
    const { analysed, metrics: m } = await correct({ failed: [{ name: 'v1.5.2', fixedBy: 'next' }], notFailed: [] });
    expect(analysed.find((d) => d.name === 'v1.5.2')!.remediation).toBeNull();
    expect(m.changeFailureRate.rate).toBe(U.changeFailureRate.rate);
    expect(m.changeFailureRate.failed).toBe(U.changeFailureRate.failed);
    expect(m.recoveryTime.medianHours).toBe(U.recoveryTime.medianHours);
    expect(m.recoveryTime.count).toBe(U.recoveryTime.count);
    expect(m.recoveryTime.unrecovered).toBe(U.recoveryTime.unrecovered);
    expect(m.reworkRate.rate).toBe(U.reworkRate.rate);
  });

  it('an explicit fix is used; "none" means not fixed in this period', async () => {
    const a = await correct({ failed: [{ name: 'v1.4.1', fixedBy: 'v1.5.2' }], notFailed: [] });
    expect(a.analysed.find((d) => d.name === 'v1.4.1')!.remediation).toBe('v1.5.2');
    expect(a.analysed.find((d) => d.name === 'v1.5.2')!.rework).toBe(true);
    const b = await correct({ failed: [{ name: 'v1.4.1', fixedBy: null }], notFailed: [] });
    expect(b.analysed.find((d) => d.name === 'v1.4.1')!.recoveryHours).toBeNull();
  });

  it('ignores corrections for releases that are not in the period, or impossible fixes', async () => {
    const { corrected, ignored } = await correct({
      failed: [{ name: 'v9.9.9', fixedBy: 'next' }, { name: 'v1.4.1', fixedBy: 'v1.0.0' }],
      notFailed: ['v0.9.0'],
    });
    expect(corrected).toEqual([]);
    expect(ignored).toEqual(['v9.9.9', 'v1.4.1', 'v0.9.0']);
  });

  it('marking a fix release as not failed shortens the chain', async () => {
    // v1.5.1 not failed: v1.5.0 now recovers at v1.5.1 (22 h after 03-20 12:00 = 03-21 10:00).
    const { analysed } = await correct({ failed: [], notFailed: ['v1.5.1'] });
    expect(analysed.find((d) => d.name === 'v1.5.0')!.recoveryHours).toBe(22);
    expect(analysed.find((d) => d.name === 'v1.5.2')!.rework).toBe(false);
  });
});
