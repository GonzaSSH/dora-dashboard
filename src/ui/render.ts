import type { RunResult } from '../run';
import type { Settings, TimeWindow } from '../types';
import type { Corrections } from '../metrics/corrections';
import { DEFAULT_SETTINGS } from '../config';
import { formatDuration, formatPercent, formatPerWeek } from '../format';
import { median } from '../metrics/compute';
import { metricChart, seriesFor } from './charts';
import { isRated, rate, type MetricKey, type Rating } from '../ratings';
import { EXPLANATIONS } from './explanations';
import { comparisonLine, sentenceFor } from '../context/sentences';
import { doraContext, DORA_2025, NO_BENCHMARK, SERVICES_NOTE } from '../context/dora2025';
import { h } from './dom';

const RATING_LABEL: Record<Rating, { icon: string; text: string }> = {
  strong: { icon: '✓', text: 'Strong' },
  middle: { icon: '•', text: 'Medium' },
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

// Fold-outs look like buttons (v1.5): an icon, the label and an arrow that flips when open.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON = {
  chevron: 'M6 9l6 6 6-6',
  info: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16v-5M12 8h.01',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  alert: 'M12 3l9 16H3zM12 10v4M12 17h.01',
};
function icon(cls: string, d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
function disclosure(text: string, glyph: string, variant?: 'quiet' | 'large'): HTMLElement {
  const s = h('summary', { class: variant ? `disclosure ${variant}` : 'disclosure' });
  s.append(icon('ico', glyph), h('span', {}, text), icon('chev', ICON.chevron));
  return s;
}

/** "3.0 days" → big "3.0" and a smaller " days"; text without a leading number stays as is. */
function valueEl(key: MetricKey, text: string): HTMLElement {
  const m = /^([\d.,]+%?)(\s.*)?$/.exec(text);
  const p = h('p', { class: 'value', 'data-testid': `value-${key}` });
  if (m) p.append(m[1]!, ...(m[2] ? [h('span', { class: 'unit' }, m[2])] : []));
  else {
    p.classList.add('value-text'); // words like "No failures found" are not set at number size
    p.append(text);
  }
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

/** Plain sentence, comparison with the previous period, and DORA context or why there is none (v1.3). */
function contextEls(key: MetricKey, r: RunResult): HTMLElement[] {
  const m = r.metrics;
  const trend = r.previous
    ? comparisonLine(key, m, r.previous)
    : 'Not compared: this saved result was made before comparisons were added.';
  const raw = key === 'deploymentFrequency' ? (m.deploymentFrequency.count ? m.deploymentFrequency.perWeek : null) : key === 'leadTime' ? m.leadTime.medianHours : null;
  const dora = doraContext(key, raw);
  const src = DORA_2025.source;
  return [
    h('p', { class: 'sentence', 'data-testid': `sentence-${key}` }, sentenceFor(key, m)),
    h('p', { class: 'trend', 'data-testid': `trend-${key}` }, trend),
    isRated(key)
      ? dora
        ? h('p', { class: 'dora', 'data-testid': `dora-${key}` },
          `${dora} `,
          h('span', { class: 'muted' },
            'Source: ', h('a', { href: src.url, target: '_blank', rel: 'noopener' }, `DORA, ${src.title}`), `, page ${src.page} (`,
            h('a', { href: src.licenceUrl, target: '_blank', rel: 'noopener' }, src.licence), `). ${SERVICES_NOTE}`))
        : null
      : h('p', { class: 'dora muted', 'data-testid': `no-benchmark-${key}` }, NO_BENCHMARK),
  ].map((x) => x ?? h('div', { class: 'slot', 'aria-hidden': 'true' }));
}

export interface ViewOptions {
  savedAt?: Date;
  /** The saved result was made with a GitHub token, so it may use more requests than a visitor without one (v1.3). */
  savedWithToken?: boolean;
  /** The settings the result was computed with (shown under "Definitions used"). */
  settings: Settings;
  corrections: Corrections;
  /** Releases actually corrected, and corrections that couldn't be applied. */
  corrected: string[];
  ignored: string[];
  tableOpen: boolean;
  onCorrect: (name: string, choice: 'auto' | 'failed' | 'not-failed', fixedBy?: string | null) => void;
  onReset: () => void;
  /** Copies the page address (v1.4). Resolves to the message shown next to the button. */
  onShare: () => Promise<string>;
  /** For saved results: runs a live analysis of the same repository and dates. */
  onAnalyseLive?: () => void;
}

export function renderResults(el: HTMLElement, r: RunResult, window: TimeWindow, o: ViewOptions): void {
  const savedAt = o.savedAt;
  const lastDay = new Date(window.end.getTime() - 86_400_000);
  const t = tiles(r);
  const rl = r.rateLimit;

  const definitions = h('p', { class: 'definitions', 'data-testid': 'definitions' },
    h('strong', {}, 'Definitions used: '),
    ...describeSettings(o.settings).flatMap((d, i) => [
      i > 0 ? ' · ' : '',
      d.changed ? h('span', { class: 'changed' }, `${d.text} (changed)`) : d.text,
    ]));

  // Header like a playlist page: what it is, the repository large, then period, definitions, actions.
  const shareStatus = h('span', { class: 'share-status', role: 'status', 'aria-live': 'polite', 'data-testid': 'share-status' });
  const shareBtn = h('button', { type: 'button', class: 'pill secondary', 'data-testid': 'share' }, 'Share');
  shareBtn.addEventListener('click', () => {
    void o.onShare().then((m) => { shareStatus.textContent = m; });
  });
  const liveBtn = savedAt && o.onAnalyseLive
    ? h('button', { type: 'button', class: 'pill primary', 'data-testid': 'analyse-live' }, 'Analyse live')
    : null;
  if (liveBtn && o.onAnalyseLive) liveBtn.addEventListener('click', o.onAnalyseLive);
  const summary = h('header', { class: 'summary' },
    savedAt
      ? h('p', { class: 'snapshot-note', 'data-testid': 'snapshot-note' },
        `Saved result from ${savedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}` +
        `${o.savedWithToken ? ', saved with a GitHub token' : ''}. Click Analyse for live data.`)
      : h('p', { class: 'kicker' }, 'Results for'),
    h('h2', {}, h('a', { href: r.collected.repo.htmlUrl, target: '_blank', rel: 'noopener', 'data-testid': 'repo-link' }, r.collected.repo.fullName)),
    h('p', { class: 'meta' },
      `${utcDay(window.start)} to ${utcDay(lastDay)} · deployments = ${r.collected.source === 'releases' ? 'GitHub Releases' : 'version tags'} · `,
      savedAt
        ? h('span', { 'data-testid': 'requests-used' }, 'saved result: no GitHub requests used now')
        : h('span', { 'data-testid': 'requests-used' }, `${r.requestsUsed} GitHub requests used`),
      rl && !savedAt ? ` · ${rl.remaining} of ${rl.limit} left this hour` : ''),
    definitions,
    h('div', { class: 'header-actions' }, liveBtn, shareBtn, shareStatus),
  );

  // Unmatched reverts: one collapsed line, expandable to see which (v1.1).
  const unmatched = r.analysed.flatMap((d) => d.unmatchedReverts.map((m) => `${d.name}: ${m}`));
  const unmatchedItem = unmatched.length
    ? h('li', {},
      h('details', { 'data-testid': 'unmatched-reverts' },
        disclosure(`${unmatched.length} ${unmatched.length === 1 ? 'revert' : 'reverts'} could not be matched to a release`, ICON.alert, 'quiet'),
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

  // Manual corrections (v1.2): one summary line above the tiles, with a reset button.
  const resetBtn = h('button', { type: 'button', class: 'link', 'data-testid': 'reset-corrections' }, 'Reset corrections');
  resetBtn.addEventListener('click', o.onReset);
  const correctionsLine = o.corrected.length
    ? h('p', { class: 'corrections', 'data-testid': 'corrections-summary' },
      `${o.corrected.length} ${o.corrected.length === 1 ? 'release' : 'releases'} corrected by hand (${o.corrected.join(', ')}). `,
      resetBtn)
    : null;
  const ignoredLine = o.ignored.length
    ? h('p', { class: 'muted', 'data-testid': 'corrections-ignored' },
      `Ignored correction for ${o.ignored.join(', ')}: not a release in this period, or the chosen fix is not a later release.`)
    : null;

  const { changesFetched, changesNeeded } = r.collected;
  const sampled = changesFetched < changesNeeded;
  // Every card has the same rows in the same order (empty slots included), so numbers, charts
  // and sentences line up across the row of cards (CSS subgrid, styles.css).
  const series = seriesFor(r.analysed, window);
  const slot = (el: HTMLElement | null) => el ?? h('div', { class: 'slot', 'aria-hidden': 'true' });
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
      slot(ratingChip(key, t[key].raw)),
      metricChart(key, series, r.previous),
      ...contextEls(key, r),
      h('p', { class: 'sub' }, t[key].sub),
      slot(e.drivers ? h('p', { class: 'drivers', 'data-testid': `drivers-${key}` }, e.drivers) : null),
      slot(sampleNote),
      slot(key === 'recoveryTime' && r.metrics.recoveryTime.unrecovered
        ? h('p', { class: 'sample' }, `${r.metrics.recoveryTime.unrecovered} failed ${r.metrics.recoveryTime.unrecovered === 1 ? 'release was' : 'releases were'} not fixed in this period, so ${r.metrics.recoveryTime.unrecovered === 1 ? 'it is' : 'they are'} not in the median.`)
        : null),
      h('details', {},
        disclosure('How this was worked out', ICON.info, 'quiet'),
        h('p', {}, e.how),
        e.proxy ? h('p', {}, h('strong', {}, 'Proxy: '), e.proxy) : null),
    );
  }));

  // Releases as a track list (v1.4): newest first, numbered, status as text tags.
  const total = r.analysed.length;
  const rows = [...r.analysed].reverse().map((d, i) => {
    const n = d.changes?.length ?? 0;
    const changes = d.changes ? `${n}${d.changesTruncated ? '+' : ''} ${n === 1 && !d.changesTruncated ? 'change' : 'changes'}` : 'changes not fetched';
    const lead = d.leadTimesHours ? median(d.leadTimesHours) : null;
    const tags = [
      d.manuallyCorrected ? h('span', { class: 'tag corrected' }, 'manually corrected') : null,
      d.failed ? h('span', { class: 'tag failed' }, `Failed: ${d.failureReason}`) : null,
      d.rework ? h('span', { class: 'tag rework' }, `Rework: ${d.reworkReason}`) : null,
    ].filter((x) => x !== null) as HTMLElement[];
    return h('tr', { 'data-testid': `deployment-${d.name}`, class: d.manuallyCorrected ? 'corrected' : undefined },
      h('td', { class: 'idx' }, String(total - i)),
      h('td', { class: 'version' }, h('b', {}, d.name), h('small', {}, d.predecessor ? `${changes} since ${d.predecessor}` : 'no earlier version to compare with')),
      h('td', { class: 'num', 'data-label': 'Released' }, utcDateTime(d.time)),
      h('td', { class: 'num', 'data-label': 'Lead time' }, lead === null ? '—' : formatDuration(lead)),
      h('td', {}, h('div', { class: 'status' }, ...(tags.length ? tags : [h('span', { class: 'none' }, 'No problems detected')]))),
      h('td', {}, correctionControls(d.name, r, o)),
    );
  });
  const table = h('details', { class: 'deployments', open: o.tableOpen },
    disclosure(`All ${r.analysed.length} deployments in this period, with how each was classified (you can correct them)`, ICON.list, 'large'),
    h('p', {},
      'Disagree with a classification? Mark a release as failed or not failed, and for a failure pick the release that fixed it. ' +
      'All five numbers update straight away, and the page address keeps your corrections so a shared link shows the same view.'),
    h('table', { class: 'tracks' },
      h('thead', {}, h('tr', {}, h('th', { class: 'idx' }, '#'), h('th', {}, 'Version'), h('th', {}, 'Released'), h('th', {}, 'Lead time'), h('th', {}, 'Status'), h('th', {}, 'Correction'))),
      h('tbody', {}, ...rows)),
  );

  el.replaceChildren(summary, ...([correctionsLine, ignoredLine, notices].filter((x) => x !== null) as HTMLElement[]), grid, table);
}

function correctionControls(name: string, r: RunResult, o: ViewOptions): HTMLElement {
  const marked = o.corrections.failed.find((f) => f.name === name);
  const choice = marked ? 'failed' : o.corrections.notFailed.includes(name) ? 'not-failed' : 'auto';
  const select = h('select', { 'data-testid': `correct-${name}`, 'aria-label': `Correction for ${name}` },
    h('option', { value: 'auto', selected: choice === 'auto' }, 'Automatic'),
    h('option', { value: 'failed', selected: choice === 'failed' }, 'Mark as failed'),
    h('option', { value: 'not-failed', selected: choice === 'not-failed' }, 'Mark as not failed'));
  select.addEventListener('change', () => o.onCorrect(name, select.value as 'auto' | 'failed' | 'not-failed'));
  if (choice !== 'failed') return h('div', {}, select);

  const d = r.analysed.find((x) => x.name === name)!;
  const later = r.analysed.filter((x) => x.time > d.time);
  const current = d.remediation; // after corrections: the chosen fix, or null
  const fix = h('select', { 'data-testid': `fixed-by-${name}`, 'aria-label': `Release that fixed ${name}` },
    ...later.map((x) => h('option', { value: x.name, selected: x.name === current }, `fixed by ${x.name}`)),
    h('option', { value: 'none', selected: current === null }, 'not fixed in this period'));
  fix.addEventListener('change', () => o.onCorrect(name, 'failed', fix.value === 'none' ? null : fix.value));
  return h('div', { class: 'correction' }, select, fix);
}

/** The active rules, in words, with the ones that differ from the defaults flagged (v1.2). */
export function describeSettings(s: Settings): { text: string; changed: boolean }[] {
  const d = DEFAULT_SETTINGS;
  const source = { auto: 'GitHub Releases, else version tags', releases: 'GitHub Releases', tags: 'version tags' }[s.source];
  return [
    { text: `deployments = ${source}`, changed: s.source !== d.source },
    { text: `version pattern ${s.versionPattern}`, changed: s.versionPattern !== d.versionPattern },
    { text: s.skipPrereleases ? 'pre-releases ignored' : 'pre-releases counted', changed: s.skipPrereleases !== d.skipPrereleases },
    {
      text: s.useQuickPatch ? `failure = quick patch within ${s.quickPatchHours} hours` : 'quick-patch rule off',
      changed: s.useQuickPatch !== d.useQuickPatch || (s.useQuickPatch && s.quickPatchHours !== d.quickPatchHours),
    },
    {
      text: s.useRevert ? `or a revert of a shipped commit (${s.revertPattern})` : 'revert rule off',
      changed: s.useRevert !== d.useRevert || (s.useRevert && s.revertPattern !== d.revertPattern),
    },
    { text: s.reworkRule === 'fixes' ? 'rework = fixes of failed releases' : 'rework = fixes and every patch release', changed: s.reworkRule !== d.reworkRule },
  ];
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
