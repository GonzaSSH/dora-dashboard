// Plain-language text shown in the app (and mirrored in README.md).
import type { MetricKey } from '../ratings';

export interface Explanation {
  title: string;
  question: string;
  meaning: string;
  good: string;
  bad: string;
  how: string;
  proxy: string | null;
}

export const EXPLANATIONS: Record<MetricKey, Explanation> = {
  deploymentFrequency: {
    title: 'Deployment frequency',
    question: 'How often does the team ship?',
    meaning: 'How many times per week a new version was released. Shipping small changes often is less risky than shipping big batches rarely.',
    good: 'Strong: daily or more.',
    bad: 'Weak: less than once a month.',
    how: 'Number of releases in the period ÷ number of weeks in the period.',
    proxy: null,
  },
  leadTime: {
    title: 'Change lead time',
    question: 'How long does a change wait before users get it?',
    meaning: 'The typical time from when a change was written to when it was released. Short lead times mean fast feedback and quick fixes.',
    good: 'Strong: under a day.',
    bad: 'Weak: over a month.',
    how: 'For every change (commit) in each release: release time − time the change was written. The middle value (median) is shown. Merge commits are skipped.',
    proxy: null,
  },
  changeFailureRate: {
    title: 'Change failure rate',
    question: 'How often does a release go wrong?',
    meaning: 'The share of releases that needed an urgent fix. A low number means changes are well tested before they ship.',
    good: 'Strong: under 15%.',
    bad: 'Weak: over 30%.',
    how: 'Failed releases ÷ all releases.',
    proxy: 'Public repos have no incident data, so a release counts as "failed" if it was followed by a quick patch (e.g. 1.2.0 → 1.2.1 within 48 hours) or if the next release reverts one of its changes.',
  },
  recoveryTime: {
    title: 'Failed deployment recovery time',
    question: 'When a release goes wrong, how fast is it fixed?',
    meaning: 'The typical time from a failed release to the release that fixed it. Fast recovery limits the harm a bad release can do.',
    good: 'Strong: under a day.',
    bad: 'Weak: over a week.',
    how: 'For each failed release: time of the first good release after it − time of the failed release. The median is shown.',
    proxy: 'Uses the same guess of "failed" as the change failure rate. The fix is the quick patch or the release containing the revert.',
  },
  reworkRate: {
    title: 'Rework rate',
    question: 'How much of the shipping is unplanned fixing?',
    meaning: 'The share of releases made to fix problems rather than deliver new value. High rework means time spent going back over earlier work.',
    good: 'Strong: under 10%.',
    bad: 'Weak: over 25%.',
    how: 'Rework releases ÷ all releases.',
    proxy: 'A release counts as rework if it fixed a failed release, or if it is a patch release (e.g. 1.4.0 → 1.4.1) whose changes are all fixes (messages starting "fix:", "hotfix:", "bugfix:" or "Revert").',
  },
};
