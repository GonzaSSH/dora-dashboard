// Rough guide (PLAN.md §2). v1.1 (delivery lead's decision): only the two directly measured
// metrics are rated. The three proxy metrics are shown without a rating.
export type MetricKey = 'deploymentFrequency' | 'leadTime' | 'changeFailureRate' | 'recoveryTime' | 'reworkRate';
export type RatedMetric = 'deploymentFrequency' | 'leadTime';
export type Rating = 'strong' | 'middle' | 'weak';

export const RATED_METRICS: readonly RatedMetric[] = ['deploymentFrequency', 'leadTime'];

const DAY = 24;
const BANDS: Record<RatedMetric, { strong: (v: number) => boolean; weak: (v: number) => boolean }> = {
  // per week: daily or more / less than once a month
  deploymentFrequency: { strong: (v) => v >= 7, weak: (v) => v < 7 / 30 },
  // hours
  leadTime: { strong: (v) => v < DAY, weak: (v) => v > 30 * DAY },
};

export function isRated(metric: MetricKey): metric is RatedMetric {
  return (RATED_METRICS as readonly string[]).includes(metric);
}

export function rate(metric: RatedMetric, value: number | null): Rating | null {
  if (value === null) return null;
  const b = BANDS[metric];
  return b.strong(value) ? 'strong' : b.weak(value) ? 'weak' : 'middle';
}
