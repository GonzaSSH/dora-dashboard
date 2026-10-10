// Context on the tiles (v1.3, PLAN.md §2c). Sandbox values from sandbox/EXPECTED.md.
import { describe, expect, it } from 'vitest';
import { runWithComparison } from '../../src/run';
import { DEFAULT_SETTINGS } from '../../src/config';
import { sentenceFor, comparisonLine } from '../../src/context/sentences';
import { doraContext, DORA_2025 } from '../../src/context/dora2025';
import type { Metrics } from '../../src/metrics/compute';
import { fixtureFetch, prRevertResponses, sandboxResponses } from '../helpers/fixtures';
import {
  EXPECTED, EXPECTED_COMPARISONS, EXPECTED_DORA, EXPECTED_PREVIOUS as P, EXPECTED_SENTENCES,
  SANDBOX_REPO, SANDBOX_REQUESTS, SANDBOX_REQUESTS_WITH_COMPARISON, SANDBOX_WINDOW as W, PREVIOUS_WINDOW,
} from '../expected';

const KEYS = ['deploymentFrequency', 'leadTime', 'changeFailureRate', 'recoveryTime', 'reworkRate'] as const;
const run = (budget?: number) =>
  runWithComparison({ repo: SANDBOX_REPO, settings: DEFAULT_SETTINGS, window: W, fetchFn: fixtureFetch(sandboxResponses), budget });

describe('previous period (EXPECTED.md, "The previous 90 days")', () => {
  it('uses the 90 days just before the window', async () => {
    const r = await run();
    expect(r.previous.window).toEqual(PREVIOUS_WINDOW);
  });

  it('matches the hand-worked previous-period values', async () => {
    const r = await run();
    expect(r.previous.status).toBe('ok');
    const m = r.previous.metrics!;
    expect(m.deploymentFrequency.perWeek).toBe(P.deploymentFrequency.perWeek);
    expect(m.deploymentFrequency.count).toBe(P.deploymentFrequency.count);
    expect(m.leadTime.medianHours).toBe(P.leadTime.medianHours);
    expect(m.leadTime.commitCount).toBe(P.leadTime.commitCount);
    expect(m.changeFailureRate.rate).toBe(P.changeFailureRate.rate);
    expect(m.recoveryTime.medianHours).toBe(P.recoveryTime.medianHours);
    expect(m.reworkRate.rate).toBe(P.reworkRate.rate);
  });

  it('leaves the current period exactly as before and costs 10 extra requests (37 total)', async () => {
    const r = await run();
    expect(r.current.metrics.leadTime.medianHours).toBe(EXPECTED.leadTime.medianHours);
    expect(r.current.metrics.changeFailureRate.rate).toBe(EXPECTED.changeFailureRate.rate);
    expect(r.current.requestsUsed).toBe(SANDBOX_REQUESTS);
    expect(r.requestsUsed).toBe(SANDBOX_REQUESTS_WITH_COMPARISON);
  });

  it('produces the hand-worked comparison lines', async () => {
    const r = await run();
    for (const key of KEYS) expect(comparisonLine(key, r.current.metrics, r.previous)).toBe(EXPECTED_COMPARISONS[key]);
  });

  it('says a token is needed when the budget runs out during the previous listing', async () => {
    // 27 for the current period; the previous period needs 4 more tag dates: only 3 fit in 30.
    const r = await run(30);
    expect(r.previous.status).toBe('needs-token');
    for (const key of KEYS) expect(comparisonLine(key, r.current.metrics, r.previous)).toMatch(/needs a GitHub token/);
  });

  it('with dates read but commit details cut short, compares deployment frequency only', async () => {
    // 27 + 4 tag dates = 31; 2 of the 6 previous comparisons fit in 33.
    const r = await run(33);
    expect(r.previous.status).toBe('partial');
    expect(comparisonLine('deploymentFrequency', r.current.metrics, r.previous)).toBe(EXPECTED_COMPARISONS.deploymentFrequency);
    for (const key of ['leadTime', 'changeFailureRate', 'recoveryTime', 'reworkRate'] as const) {
      expect(comparisonLine(key, r.current.metrics, r.previous)).toMatch(/needs a GitHub token/);
    }
  });

  it('says so when the previous period has too few releases', async () => {
    // pr-reverts fixture: only v1.9.0 (2025-12-01) falls in the previous 90 days.
    const r = await runWithComparison({ repo: 'example/pr-reverts', settings: DEFAULT_SETTINGS, window: W, fetchFn: fixtureFetch(prRevertResponses) });
    expect(r.previous.status).toBe('too-few');
    expect(r.previous.count).toBe(1);
    expect(comparisonLine('leadTime', r.current.metrics, r.previous)).toBe(
      'Not compared: the previous 90 days had only 1 release (at least 5 are needed).');
  });
});

describe('plain-language sentences', () => {
  it('match the hand-worked sandbox sentences', async () => {
    const r = await run();
    for (const key of KEYS) expect(sentenceFor(key, r.current.metrics)).toBe(EXPECTED_SENTENCES[key]);
  });

  const base = (over: Partial<Record<string, unknown>>): Metrics => ({
    deploymentFrequency: { perWeek: 0, count: 0, days: 90 },
    leadTime: { medianHours: null, commitCount: 0, deploymentsMeasured: 0, deploymentsTotal: 0 },
    changeFailureRate: { rate: null, failed: 0, total: 0, unmatchedReverts: 0 },
    recoveryTime: { medianHours: null, count: 0, unrecovered: 0 },
    reworkRate: { rate: null, rework: 0, total: 0 },
    ...over,
  }) as Metrics;

  it('has its own wording for zero, one and not enough data', () => {
    expect(sentenceFor('deploymentFrequency', base({}))).toBe('No releases in this period.');
    expect(sentenceFor('deploymentFrequency', base({ deploymentFrequency: { perWeek: 7 / 90, count: 1, days: 90 } }))).toBe('Only one release in this period.');
    expect(sentenceFor('leadTime', base({}))).toBe('Not enough data: no changes could be measured in this period.');
    expect(sentenceFor('changeFailureRate', base({}))).toBe('Not enough data: no releases in this period.');
    expect(sentenceFor('changeFailureRate', base({ changeFailureRate: { rate: 0, failed: 0, total: 12, unmatchedReverts: 0 } }))).toBe('None of the 12 releases needed an urgent fix.');
    expect(sentenceFor('changeFailureRate', base({ changeFailureRate: { rate: 1 / 28, failed: 1, total: 28, unmatchedReverts: 0 } }))).toBe('1 of 28 releases needed an urgent fix.');
    expect(sentenceFor('changeFailureRate', base({ changeFailureRate: { rate: 2 / 28, failed: 2, total: 28, unmatchedReverts: 0 } }))).toBe('About 1 in 14 releases needed an urgent fix.');
    expect(sentenceFor('changeFailureRate', base({ changeFailureRate: { rate: 1, failed: 3, total: 3, unmatchedReverts: 0 } }))).toBe('Every release needed an urgent fix.');
    expect(sentenceFor('recoveryTime', base({ changeFailureRate: { rate: 0, failed: 0, total: 9, unmatchedReverts: 0 } }))).toBe('No release needed an urgent fix, so there was nothing to recover from.');
    expect(sentenceFor('recoveryTime', base({ changeFailureRate: { rate: 0.1, failed: 1, total: 10, unmatchedReverts: 0 }, recoveryTime: { medianHours: null, count: 0, unrecovered: 1 } }))).toBe('None of the failed releases was fixed within this period.');
    expect(sentenceFor('recoveryTime', base({ changeFailureRate: { rate: 0.1, failed: 1, total: 10, unmatchedReverts: 0 }, recoveryTime: { medianHours: 20, count: 1, unrecovered: 0 } }))).toBe('The one failed release was fixed after about 20 hours.');
    expect(sentenceFor('reworkRate', base({ reworkRate: { rate: 0, rework: 0, total: 5 } }))).toBe('None of the 5 releases was an urgent fix for an earlier release.');
    expect(sentenceFor('reworkRate', base({ reworkRate: { rate: 0.2, rework: 1, total: 5 } }))).toBe('1 of 5 releases was an urgent fix for an earlier release.');
    expect(sentenceFor('reworkRate', base({ reworkRate: { rate: 2 / 28, rework: 2, total: 28 } }))).toBe('About 1 in 14 releases was an urgent fix for an earlier release.');
  });

  it('words durations by size', () => {
    const lead = (h: number) => sentenceFor('leadTime', base({ leadTime: { medianHours: h, commitCount: 3, deploymentsMeasured: 3, deploymentsTotal: 3 } }));
    expect(lead(0.4)).toBe('A finished change waits less than an hour before users get it.');
    expect(lead(1)).toBe('A finished change waits about 1 hour before users get it.');
    expect(lead(47)).toBe('A finished change waits about 47 hours before users get it.');
    expect(lead(174.6)).toBe('A finished change waits about 7 days before users get it.');
    expect(lead(24 * 30)).toBe('A finished change waits about 4 weeks before users get it.');
    expect(lead(24 * 100)).toBe('A finished change waits about 3 months before users get it.');
    const freq = (n: number, days = 90) => sentenceFor('deploymentFrequency', base({ deploymentFrequency: { perWeek: (n * 7) / days, count: n, days } }));
    expect(freq(28)).toBe('A new release about every 3 days.');
    expect(freq(180)).toBe('About 2 releases a day.');
    expect(freq(3)).toBe('A new release about every 4 weeks.');
    expect(freq(2, 180)).toBe('A new release about every 3 months.');
  });
});

describe('DORA 2025 context (page 20, Figures 11 and 12)', () => {
  it('carries the source and licence', () => {
    expect(DORA_2025.source.licence).toBe('CC BY-NC-SA 4.0');
    expect(DORA_2025.source.url).toBe('https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf');
  });

  it('matches the hand-worked sandbox lines', () => {
    expect(doraContext('deploymentFrequency', EXPECTED.deploymentFrequency.perWeek)).toBe(EXPECTED_DORA.deploymentFrequency);
    expect(doraContext('leadTime', EXPECTED.leadTime.medianHours)).toBe(EXPECTED_DORA.leadTime);
  });

  it('maps every band to the report\'s Top % figures', () => {
    const f = (perWeek: number) => doraContext('deploymentFrequency', perWeek);
    expect(f(14)).toBe('About 23% of surveyed teams ship this often or more.'); // daily or more: 22.7
    expect(f(7)).toBe('About 23% of surveyed teams ship this often or more.');
    expect(f(2.18)).toBe('About 45% of surveyed teams ship this often or more.'); // 44.6
    expect(f(1)).toBe('About 45% of surveyed teams ship this often or more.');
    expect(f(0.5)).toBe('About 76% of surveyed teams ship this often or more.'); // 76.1
    expect(f(0.1)).toBe('About 96% of surveyed teams ship this often or more.'); // 96.4
    expect(f(0.01)).toBe('About 100% of surveyed teams ship this often or more.');
    const l = (h: number) => doraContext('leadTime', h);
    expect(l(0.5)).toBe('About 9% of surveyed teams have this lead time or shorter.'); // 9.4
    expect(l(23)).toBe('About 24% of surveyed teams have this lead time or shorter.'); // 24.4
    expect(l(174.6)).toBe('About 85% of surveyed teams have this lead time or shorter.'); // 84.7
    expect(l(24 * 60)).toBe('About 98% of surveyed teams have this lead time or shorter.');
    expect(l(24 * 400)).toBe('About 100% of surveyed teams have this lead time or shorter.');
  });

  it('never applies to the proxy metrics', () => {
    for (const key of ['changeFailureRate', 'recoveryTime', 'reworkRate'] as const) expect(doraContext(key, 1)).toBeNull();
  });
});
