// Weekly charts on the cards (v1.5). Values: sandbox/EXPECTED.md, "Weekly charts on the cards".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seriesFor } from '../../src/ui/charts';
import { fromJson } from '../../src/snapshot';
import { applyCorrections } from '../../src/metrics/corrections';
import { DEFAULT_SETTINGS } from '../../src/config';
import { EXPECTED_WEEKS, SANDBOX_WINDOW } from '../expected';

const sandbox = fromJson(JSON.parse(readFileSync('public/snapshots/sandbox.json', 'utf8')));

describe('weekly chart data', () => {
  const s = seriesFor(sandbox.result.analysed, SANDBOX_WINDOW);

  it('splits the 90 days into 13 weeks from the window start', () => {
    expect(s.unit).toBe('week');
    expect(s.buckets).toHaveLength(13);
    expect(s.buckets[0]!.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(s.buckets[12]!.start.toISOString()).toBe('2026-03-26T00:00:00.000Z');
    expect(s.buckets[12]!.end).toEqual(SANDBOX_WINDOW.end);
  });

  it('matches the hand-worked weekly values', () => {
    expect(s.buckets.map((b) => b.releases)).toEqual(EXPECTED_WEEKS.releases);
    expect(s.buckets.map((b) => b.failed)).toEqual(EXPECTED_WEEKS.failed);
    expect(s.buckets.map((b) => b.rework)).toEqual(EXPECTED_WEEKS.rework);
    expect(s.buckets.map((b) => b.leadHours)).toEqual(EXPECTED_WEEKS.leadHours);
    expect(s.buckets.map((b) => b.recoveryHours)).toEqual(EXPECTED_WEEKS.recoveryHours);
  });

  it('follows manual corrections', () => {
    const view = applyCorrections(sandbox.result.analysed, { failed: [{ name: 'v1.4.1', fixedBy: 'next' }], notFailed: ['v1.2.0'] }, DEFAULT_SETTINGS);
    const c = seriesFor(view.analysed, SANDBOX_WINDOW);
    expect(c.buckets[4]!.failed).toBe(0); // v1.2.0 marked not failed
    expect(c.buckets[9]!.failed).toBe(1); // v1.4.1 marked failed
    expect(c.buckets.map((b) => b.releases)).toEqual(EXPECTED_WEEKS.releases);
  });

  it('uses calendar months for periods longer than 182 days', () => {
    const year = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2027-01-01T00:00:00Z') };
    const m = seriesFor(sandbox.result.analysed, year);
    expect(m.unit).toBe('month');
    expect(m.buckets).toHaveLength(12);
    expect(m.buckets.map((b) => b.releases).slice(0, 3)).toEqual([2, 4, 4]);
  });
});
