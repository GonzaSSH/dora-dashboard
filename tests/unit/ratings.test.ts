// Rough guide bands (PLAN.md §2). v1.1 (delivery lead's decision): only the two directly
// measured metrics get a rating; the three proxies are shown without one.
import { describe, expect, it } from 'vitest';
import { rate, RATED_METRICS } from '../../src/ratings';

describe('rate', () => {
  it('deployment frequency: daily or more is strong, under monthly is weak', () => {
    expect(rate('deploymentFrequency', 7)).toBe('strong');
    expect(rate('deploymentFrequency', 5)).toBe('middle');
    expect(rate('deploymentFrequency', 56 / 90)).toBe('middle');
    expect(rate('deploymentFrequency', 0.2)).toBe('weak');
  });
  it('lead time: under a day is strong, over a month is weak', () => {
    expect(rate('leadTime', 23)).toBe('strong');
    expect(rate('leadTime', 73)).toBe('middle');
    expect(rate('leadTime', 31 * 24)).toBe('weak');
  });
  it('no value means no rating', () => {
    expect(rate('leadTime', null)).toBeNull();
  });
  it('only the directly measured metrics are rated', () => {
    expect([...RATED_METRICS]).toEqual(['deploymentFrequency', 'leadTime']);
  });
});
