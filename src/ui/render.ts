import type { RunResult } from '../run';
import type { TimeWindow } from '../types';
import { formatDuration, formatPercent, formatPerWeek } from '../format';
import { isRated, rate, type MetricKey, type Rating } from '../ratings';
import { EXPLANATIONS } from './explanations';
import { h } from './dom';

const RATING_LABEL: Record<Rating, { icon: string; text: string }> = {
  strong: { icon: '✓', text: 'Strong' },
  middle: { icon: '•', text: 'In between' },
  weak: { icon: '!', text: 'Weak' },
};

const ORDER: MetricKey[] = ['deploymentFrequency', 'leadTime', 'changeFailureRate', 'recoveryTime', 'reworkRate'];

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function utcDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

interface Tile {
  value: string;
  raw: number | null;
  sub: string;
}

function tiles(r: RunResult): Record<MetricKey, Tile> {
  const m = r.metrics;
  const none = 'Not enough data';
  return {
    deploymentFrequency: {
      value: formatPerWeek(m.deploymentFrequency.perWeek),
      raw: m.deploymentFrequency.perWeek,
      sub: `${m.deploymentFrequency.count} deployments in ${m.deploymentFrequency.days} days`,
    },
    leadTime: {
      value: m.leadTime.medianHours === null ? none : formatDuration(m.leadTime.medianHours),
      raw: m.leadTime.medianHours,
      sub: `Median of ${m.leadTime.commitCount} changes across ${m.leadTime.deploymentsMeasured} of ${m.leadTime.deploymentsTotal} deployments`,
    },
    changeFailureRate: {
      value: m.changeFailureRate.rate === null ? none : formatPercent(m.changeFailureRate.rate),
      raw: m.changeFailureRate.rate,
      sub: `${m.changeFailureRate.failed} of ${m.changeFailureRate.total} deployments failed`,
    },
    recoveryTime: {
      value: m.recoveryTime.medianHours === null ? 'No failures found' : formatDuration(m.recoveryTime.medianHours),
      raw: m.recoveryTime.medianHours,
      sub: m.recoveryTime.count ? `Median of ${m.recoveryTime.count} recoveries` : 'Nothing to recover from in this period',
    },
    reworkRate: {
      value: m.reworkRate.rate === null ? none : formatPercent(m.reworkRate.rate),
      raw: m.reworkRate.rate,
      sub: `${m.reworkRate.rework} of ${m.reworkRate.total} deployments were rework`,
    },
  };
}

/** "3.0 days" → big "3.0" and a smaller " days"; text without a leading number stays as is. */
function valueEl(key: MetricKey, text: string): HTMLElement {
  const m = /^([\d.,]+%?)(\s.*)?$/.exec(text);
  const p = h('p', { class: 'value', 'data-testid': `value-${key}` });
  if (m) p.append(m[1]!, ...(m[2] ? [h('span', { class: 'unit' }, m[2])] : []));
  else p.append(text);
  return p;
}

function ratingChip(key: MetricKey, raw: number | null): HTMLElement | null {
  if (!isRated(key)) return null; // proxies carry no rating (v1.1)
  const rating = rate(key, raw);
  if (!rating) return null;
  const l = RATING_LABEL[rating];
  return h('span', { class: `chip ${rating}`, 'data-testid': `rating-${key}` },
    h('span', { 'aria-hidden': 'true', class: 'chip-icon' }, l.icon), l.text);
}

/** Fewer deployments than this and the numbers say little (shown as a note, never hidden). */
export const LOW_DATA_DEPLOYMENTS = 5;

export function renderResults(el: HTMLElement, r: RunResult, window: TimeWindow, savedAt?: Date): void {
  const lastDay = new Date(window.end.getTime() - 86_400_000);
  const t = tiles(r);
  const rl = r.rateLimit;

  const summary = h('div', { class: 'summary' },
    h('h2', {}, 'Results for ', h('a', { href: r.collected.repo.htmlUrl, target: '_blank', rel: 'noopener', 'data-testid': 'repo-link' }, r.collected.repo.fullName)),
    h('p', { class: 'muted' },
      `${utcDay(window.start)} to ${utcDay(lastDay)} · deployments = ${r.collected.source === 'releases' ? 'GitHub Releases' : 'version tags'} · `,
      savedAt
        ? h('span', { 'data-testid': 'requests-used' }, 'saved result: no GitHub requests used now')
        : h('span', { 'data-testid': 'requests-used' }, `${r.requestsUsed} GitHub requests used`),
      rl && !savedAt ? ` · ${rl.remaining} of ${rl.limit} left this hour` : ''),
    savedAt
      ? h('p', { class: 'snapshot-note', 'data-testid': 'snapshot-note' },
        `Saved result from ${savedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}. Click Analyse for live data.`)
      : null,
  );

  // Unmatched reverts: one collapsed line, expandable to see which (v1.1).
  const unmatched = r.analysed.flatMap((d) => d.unmatchedReverts.map((m) => `${d.name}: ${m}`));
  const unmatchedItem = unmatched.length
    ? h('li', {},
      h('details', { 'data-testid': 'unmatched-reverts' },
        h('summary', {}, `${unmatched.length} ${unmatched.length === 1 ? 'revert' : 'reverts'} could not be matched to a release`),
        h('p', { class: 'muted' }, 'Their target was not found in any release in this period, so they fail no release.'),
        h('ul', {}, ...unmatched.map((u) => h('li', {}, u)))))
    : null;
  const n = r.metrics.deploymentFrequency.count;
  const lowData = n < LOW_DATA_DEPLOYMENTS
    ? h('li', { 'data-testid': 'low-data' },
      `Only ${n} ${n === 1 ? 'release' : 'releases'} in this period: too few for these numbers to mean much. They are shown as they are, not hidden.`)
    : null;
  const notices = r.collected.notices.length || unmatchedItem || lowData
    ? h('ul', { class: 'notices', 'data-testid': 'notices' }, lowData, ...r.collected.notices.map((m) => h('li', {}, m)), unmatchedItem)
    : null;

  const { changesFetched, changesNeeded } = r.collected;
  const sampled = changesFetched < changesNeeded;
  const grid = h('div', { class: 'tiles' }, ...ORDER.map((key) => {
    const e = EXPLANATIONS[key];
    // Deployment frequency never depends on change details; the others partly do.
    const sampleNote = sampled && key !== 'deploymentFrequency'
      ? h('p', { class: 'sample', 'data-testid': `sample-${key}` },
        `Based on a sample of ${changesFetched} of ${changesNeeded} deployments (see note above).`)
      : null;
    return h('article', { class: 'tile', 'data-testid': `metric-${key}` },
      h('div', { class: 'tile-head' },
        h('h3', {}, e.title),
        e.proxy ? h('span', { class: 'badge', title: 'Estimated from indirect signals', 'data-testid': `proxy-${key}` }, 'Proxy') : null),
      h('p', { class: 'question' }, e.question),
      valueEl(key, t[key].value),
      ratingChip(key, t[key].raw),
      h('p', { class: 'sub' }, t[key].sub),
      e.drivers ? h('p', { class: 'drivers', 'data-testid': `drivers-${key}` }, e.drivers) : null,
      sampleNote,
      h('details', {},
        h('summary', {}, 'How this was worked out'),
        h('p', {}, e.how),
        e.proxy ? h('p', {}, h('strong', {}, 'Proxy: '), e.proxy) : null),
    );
  }));

  const rows = [...r.analysed].reverse().map((d) => {
    const flags: string[] = [];
    if (d.failed) flags.push(`Failed: ${d.failureReason}`);
    if (d.rework) flags.push(`Rework: ${d.reworkReason}`);
    return h('tr', { 'data-testid': `deployment-${d.name}` },
      h('td', {}, d.name),
      h('td', { class: 'num' }, utcDateTime(d.time)),
      h('td', {}, d.predecessor ?? '—'),
      h('td', { class: 'num' }, d.changes ? `${d.changes.length}${d.changesTruncated ? '+' : ''}` : 'not fetched'),
      h('td', {}, flags.length ? flags.join(' · ') : '—'),
    );
  });
  const table = h('details', { class: 'card deployments' },
    h('summary', {}, `All ${r.analysed.length} deployments in this period, with how each was classified`),
    h('div', { class: 'table-scroll' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Version'), h('th', {}, 'Released'), h('th', {}, 'Compared with'), h('th', {}, 'Changes'), h('th', {}, 'Classification'))),
        h('tbody', {}, ...rows))),
  );

  el.replaceChildren(summary, ...(notices ? [notices] : []), grid, table);
}

export function renderAbout(el: HTMLElement): void {
  el.replaceChildren(...ORDER.map((key) => {
    const e = EXPLANATIONS[key];
    return h('div', { class: 'about-item' },
      h('h3', {}, e.title, e.proxy ? h('span', { class: 'badge' }, 'Proxy') : null),
      h('p', {}, e.meaning),
      e.good ? h('p', { class: 'muted' }, `Rough guide: ${e.good} ${e.bad}`) : null,
      e.drivers ? h('p', { class: 'muted' }, e.drivers) : null,
      e.proxy ? h('p', { class: 'muted' }, h('strong', {}, 'How we estimate it: '), e.proxy) : null,
    );
  }));
}
