import { describe, expect, it } from 'vitest';
import { formatDuration, formatPercent, formatPerWeek } from '../../src/format';

describe('formatDuration', () => {
  it('uses hours under 48 hours', () => {
    expect(formatDuration(34)).toBe('34 hours');
    expect(formatDuration(1)).toBe('1 hour');
    expect(formatDuration(2.25)).toBe('2.3 hours');
    expect(formatDuration(0.5)).toBe('0.5 hours');
    expect(formatDuration(47.9)).toBe('47.9 hours');
  });
  it('uses days with one decimal from 48 hours', () => {
    expect(formatDuration(48)).toBe('2.0 days');
    expect(formatDuration(73)).toBe('3.0 days');
    expect(formatDuration(36 * 24)).toBe('36.0 days');
  });
});

describe('formatPercent', () => {
  it('shows up to one decimal', () => {
    expect(formatPercent(0.25)).toBe('25%');
    expect(formatPercent(0.375)).toBe('37.5%');
    expect(formatPercent(1 / 3)).toBe('33.3%');
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('formatPerWeek', () => {
  it('shows two decimals', () => {
    expect(formatPerWeek(56 / 90)).toBe('0.62 per week');
    expect(formatPerWeek(3)).toBe('3.00 per week');
  });
});
