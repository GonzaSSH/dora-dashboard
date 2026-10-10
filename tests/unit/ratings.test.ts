// Rough guide bands from PLAN.md §2.
import { describe, expect, it } from 'vitest';
import { rate } from '../../src/ratings';

describe('rate', () => {
  it('deployment frequency: daily or more is strong, under monthly is weak', () => {
    // PLAN.md §2 says "daily or more" = 7 per week (review finding 6).
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
  it('change failure rate: under 15% strong, over 30% weak', () => {
    expect(rate('changeFailureRate', 0.1)).toBe('strong');
    expect(rate('changeFailureRate', 0.25)).toBe('middle');
    expect(rate('changeFailureRate', 0.31)).toBe('weak');
  });
  it('recovery: under a day strong, over a week weak', () => {
    expect(rate('recoveryTime', 20)).toBe('strong');
    expect(rate('recoveryTime', 34)).toBe('middle');
    expect(rate('recoveryTime', 200)).toBe('weak');
  });
  it('rework: under 10% strong, over 25% weak', () => {
    expect(rate('reworkRate', 0.05)).toBe('strong');
    expect(rate('reworkRate', 0.2)).toBe('middle');
    expect(rate('reworkRate', 0.375)).toBe('weak');
  });
  it('no value means no rating', () => {
    expect(rate('leadTime', null)).toBeNull();
  });
});
