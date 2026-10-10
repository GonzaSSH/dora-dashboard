// Rough "good / bad" guide (PLAN.md §2), loosely based on DORA research bands.
export type MetricKey = 'deploymentFrequency' | 'leadTime' | 'changeFailureRate' | 'recoveryTime' | 'reworkRate';
export type Rating = 'strong' | 'middle' | 'weak';

const DAY = 24;
const BANDS: Record<MetricKey, { strong: (v: number) => boolean; weak: (v: number) => boolean }> = {
  // per week: every working day or more / less than once a month
  deploymentFrequency: { strong: (v) => v >= 5, weak: (v) => v < 7 / 30 },
  // hours
  leadTime: { strong: (v) => v < DAY, weak: (v) => v > 30 * DAY },
  changeFailureRate: { strong: (v) => v < 0.15, weak: (v) => v > 0.3 },
  recoveryTime: { strong: (v) => v < DAY, weak: (v) => v > 7 * DAY },
  reworkRate: { strong: (v) => v < 0.1, weak: (v) => v > 0.25 },
};

export function rate(metric: MetricKey, value: number | null): Rating | null {
  if (value === null) return null;
  const b = BANDS[metric];
  return b.strong(value) ? 'strong' : b.weak(value) ? 'weak' : 'middle';
}
