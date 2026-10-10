// Saved demo results (v1.1 item 2).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromJson, toJson, DEMOS } from '../../src/snapshot';
import { runAnalysis } from '../../src/run';
import { DEFAULT_SETTINGS, BUDGET_WITHOUT_TOKEN } from '../../src/config';
import { fixtureFetch, sandboxResponses } from '../helpers/fixtures';
import { EXPECTED, SANDBOX_REPO, SANDBOX_WINDOW } from '../expected';

const load = (id: string) => fromJson(JSON.parse(readFileSync(`public/snapshots/${id}.json`, 'utf8')));

describe('sandbox snapshot', () => {
  it('holds the EXPECTED.md values', () => {
    const m = load('sandbox').result.metrics;
    expect(m.deploymentFrequency.perWeek).toBe(EXPECTED.deploymentFrequency.perWeek);
    expect(m.leadTime.medianHours).toBe(EXPECTED.leadTime.medianHours);
    expect(m.changeFailureRate.rate).toBe(EXPECTED.changeFailureRate.rate);
    expect(m.recoveryTime.medianHours).toBe(EXPECTED.recoveryTime.medianHours);
    expect(m.reworkRate.rate).toBe(EXPECTED.reworkRate.rate);
  });

  it('is exactly what the current code produces from the recorded fixtures (no drift)', async () => {
    const result = await runAnalysis({ repo: SANDBOX_REPO, settings: DEFAULT_SETTINGS, window: SANDBOX_WINDOW, budget: BUDGET_WITHOUT_TOKEN, fetchFn: fixtureFetch(sandboxResponses) });
    const fresh = toJson({ id: 'sandbox', repo: SANDBOX_REPO, window: SANDBOX_WINDOW, savedAt: new Date('2026-10-10T00:00:00Z'), settings: DEFAULT_SETTINGS, result });
    expect(JSON.parse(readFileSync('public/snapshots/sandbox.json', 'utf8'))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it('round-trips dates', () => {
    const s = load('sandbox');
    expect(s.savedAt.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(s.result.analysed[0]!.time).toBeInstanceOf(Date);
    expect(s.result.analysed[0]!.changes![0]!.authoredAt).toBeInstanceOf(Date);
  });
});

describe('every demo has a snapshot', () => {
  for (const demo of DEMOS) {
    it(`${demo.id}: present, default settings, within the anonymous budget`, () => {
      const s = load(demo.id);
      expect(s.repo).toBe(demo.repo);
      expect(s.settings).toEqual(DEFAULT_SETTINGS);
      expect(s.result.requestsUsed).toBeLessThanOrEqual(BUDGET_WITHOUT_TOKEN);
      expect(s.result.metrics.deploymentFrequency.count).toBeGreaterThan(0);
    });
  }
});
