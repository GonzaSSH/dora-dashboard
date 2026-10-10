// Plain-language context on the tiles (v1.3, PLAN.md §2c; worked examples in sandbox/EXPECTED.md).
import type { Metrics } from '../metrics/compute';
import type { PreviousPeriod } from '../run';
import type { MetricKey } from '../ratings';
import { formatDuration, formatPercent } from '../format';
import { MIN_PREVIOUS_DEPLOYMENTS } from '../run';

const DAY = 24;

/** "less than an hour", hours under 48 h, days under 14 days, weeks under 60 days, else months. */
export function durationWords(hours: number): string {
  if (hours < 1) return 'less than an hour';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (hours < 48) return unit(Math.round(hours), 'hour');
  const days = hours / DAY;
  if (days < 14) return unit(Math.round(days), 'day');
  if (days < 60) return unit(Math.round(days / 7), 'week');
  return unit(Math.round(days / 30), 'month');
}

/** "About 1 in k" when k = round(n/f) ≥ 2 and 1/k is within 10% of f/n; otherwise "f of n". */
function share(f: number, n: number): { text: string; one: boolean } {
  const k = Math.round(n / f);
  if (k >= 2 && Math.abs(1 / k - f / n) <= 0.1 * (f / n)) return { text: `About 1 in ${k}`, one: true };
  return { text: `${f} of ${n}`, one: f === 1 };
}

export function sentenceFor(key: MetricKey, m: Metrics): string {
  switch (key) {
    case 'deploymentFrequency': {
      const { count, days } = m.deploymentFrequency;
      if (count === 0) return 'No releases in this period.';
      if (count === 1) return 'Only one release in this period.';
      const everyHours = (days * DAY) / count;
      if (everyHours < DAY) {
        const perDay = Math.round(count / days);
        return perDay <= 1 ? 'About one release a day.' : `About ${perDay} releases a day.`;
      }
      return `A new release about every ${durationWords(everyHours)}.`;
    }
    case 'leadTime': {
      const h = m.leadTime.medianHours;
      if (h === null) return 'Not enough data: no changes could be measured in this period.';
      return h < 1
        ? 'A finished change waits less than an hour before users get it.'
        : `A finished change waits about ${durationWords(h)} before users get it.`;
    }
    case 'changeFailureRate': {
      const { failed, total } = m.changeFailureRate;
      if (total === 0) return 'Not enough data: no releases in this period.';
      if (failed === 0) return total === 1 ? 'The only release needed no urgent fix.' : `None of the ${total} releases needed an urgent fix.`;
      if (failed === total) return total === 1 ? 'The only release needed an urgent fix.' : 'Every release needed an urgent fix.';
      return `${share(failed, total).text} releases needed an urgent fix.`;
    }
    case 'recoveryTime': {
      const { medianHours, count } = m.recoveryTime;
      if (m.changeFailureRate.total === 0) return 'Not enough data: no releases in this period.';
      if (m.changeFailureRate.failed === 0) return 'No release needed an urgent fix, so there was nothing to recover from.';
      if (medianHours === null) return 'None of the failed releases was fixed within this period.';
      const d = medianHours < 1 ? 'less than an hour' : `about ${durationWords(medianHours)}`;
      if (count === 1) return `The one failed release was fixed after ${d}.`;
      return medianHours < 1
        ? 'When a release went wrong, the fix usually reached users within an hour.'
        : `When a release went wrong, the fix usually reached users within ${d}.`;
    }
    case 'reworkRate': {
      const { rework, total } = m.reworkRate;
      if (total === 0) return 'Not enough data: no releases in this period.';
      if (rework === 0) return total === 1 ? 'The only release was not an urgent fix.' : `None of the ${total} releases was an urgent fix for an earlier release.`;
      const s = share(rework, total);
      return s.one
        ? `${s.text} releases was an urgent fix for an earlier release.`
        : `${s.text} releases were urgent fixes for earlier releases.`;
    }
  }
}

interface Shown {
  value: number | null;
  text: (v: number) => string;
  /** Words for "current is higher" and "current is lower". */
  up: string;
  down: string;
  same: string;
}

const SHOWN: Record<MetricKey, (m: Metrics) => Shown> = {
  deploymentFrequency: (m) => ({ value: m.deploymentFrequency.count ? m.deploymentFrequency.perWeek : 0, text: (v) => v.toFixed(2), up: 'More often', down: 'Less often', same: 'About as often as' }),
  leadTime: (m) => ({ value: m.leadTime.medianHours, text: formatDuration, up: 'Slower', down: 'Faster', same: 'About the same as' }),
  changeFailureRate: (m) => ({ value: m.changeFailureRate.rate, text: formatPercent, up: 'Higher', down: 'Lower', same: 'About the same as' }),
  recoveryTime: (m) => ({ value: m.recoveryTime.medianHours, text: formatDuration, up: 'Slower', down: 'Faster', same: 'About the same as' }),
  reworkRate: (m) => ({ value: m.reworkRate.rate, text: formatPercent, up: 'Higher', down: 'Lower', same: 'About the same as' }),
};

/** One line comparing this period with the previous one of equal length, or saying why not. */
export function comparisonLine(key: MetricKey, current: Metrics, previous: PreviousPeriod): string {
  const days = Math.round((previous.window.end.getTime() - previous.window.start.getTime()) / 86_400_000);
  const period = `the previous ${days} days`;
  if (previous.status === 'too-few') {
    const n = previous.count;
    return `Not compared: ${period} had only ${n} ${n === 1 ? 'release' : 'releases'} (at least ${MIN_PREVIOUS_DEPLOYMENTS} are needed).`;
  }
  const needsToken = `Not compared: comparing with ${period} needs a GitHub token (the request limit without one was reached).`;
  if (previous.status === 'needs-token' || !previous.metrics) return needsToken;
  if (previous.status === 'partial' && key !== 'deploymentFrequency') return needsToken;

  const now = SHOWN[key](current);
  const before = SHOWN[key](previous.metrics);
  if (now.value === null || before.value === null) {
    const where = now.value === null ? 'this period' : period;
    return key === 'recoveryTime'
      ? `Not compared: no failed release was fixed in ${where}.`
      : `Not compared: not enough data in ${where}.`;
  }
  const a = now.text(now.value);
  const b = before.text(before.value);
  const unit = key === 'deploymentFrequency' ? ' per week' : '';
  const word = a === b ? now.same : now.value > before.value ? now.up : now.down;
  const joiner = a === b ? ` ${period}` : ` than ${period}`;
  return `${word}${joiner} (${a} vs ${b}${unit}).`;
}
