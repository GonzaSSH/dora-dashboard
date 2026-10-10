// The five DORA formulas (PLAN.md §2). Pure functions over analysed deployments.
import type { TimeWindow } from '../types';
import type { Analysed } from './model';

export interface Metrics {
  deploymentFrequency: { perWeek: number; count: number; days: number };
  leadTime: { medianHours: number | null; commitCount: number; deploymentsMeasured: number; deploymentsTotal: number };
  changeFailureRate: { rate: number | null; failed: number; total: number; unmatchedReverts: number };
  /** count: failures with a recovery; unrecovered: failures not fixed within the period. */
  recoveryTime: { medianHours: number | null; count: number; unrecovered: number };
  reworkRate: { rate: number | null; rework: number; total: number };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function computeMetrics(deps: Analysed[], window: TimeWindow): Metrics {
  const n = deps.length;
  const days = (window.end.getTime() - window.start.getTime()) / 86_400_000;
  const leadTimes = deps.flatMap((d) => d.leadTimesHours ?? []);
  const failed = deps.filter((d) => d.failed);
  const rework = deps.filter((d) => d.rework).length;
  return {
    deploymentFrequency: { perWeek: days > 0 ? (n * 7) / days : 0, count: n, days },
    leadTime: {
      medianHours: median(leadTimes),
      commitCount: leadTimes.length,
      deploymentsMeasured: deps.filter((d) => d.leadTimesHours !== null).length,
      deploymentsTotal: n,
    },
    changeFailureRate: {
      rate: n ? failed.length / n : null,
      failed: failed.length,
      total: n,
      unmatchedReverts: deps.reduce((sum, d) => sum + d.unmatchedReverts.length, 0),
    },
    recoveryTime: {
      medianHours: median(failed.flatMap((d) => (d.recoveryHours === null ? [] : [d.recoveryHours]))),
      count: failed.filter((d) => d.recoveryHours !== null).length,
      unrecovered: failed.filter((d) => d.recoveryHours === null).length,
    },
    reworkRate: { rate: n ? rework / n : null, rework, total: n },
  };
}
