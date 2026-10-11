// Small trend charts in the metric cards (v1.5): the number on top, one bar per week below.
// Everything is drawn from data the page already has, so charts cost no GitHub requests and
// follow manual corrections. Text is set with textContent only.
import type { Analysed } from '../metrics/model';
import type { MetricKey } from '../ratings';
import type { TimeWindow } from '../types';
import type { PreviousPeriod } from '../run';
import { median } from '../metrics/compute';
import { formatDuration } from '../format';
import { h } from './dom';

const DAY = 86_400_000;
/** Periods longer than this get monthly bars, so bars never get too thin to see. */
const WEEKLY_UP_TO_DAYS = 182;

export interface Bucket {
  start: Date;
  /** End of the bucket, exclusive (the window end for the last one). */
  end: Date;
  releases: number;
  failed: number;
  rework: number;
  /** Typical (median) wait of the changes released in this bucket; null when none were measured. */
  leadHours: number | null;
  /** Typical time to fix for releases that went wrong in this bucket; null when none. */
  recoveryHours: number | null;
}

export interface Series {
  unit: 'week' | 'month';
  buckets: Bucket[];
}

/** Splits the window into weeks (or calendar months for long windows) and summarises each. */
export function seriesFor(analysed: Analysed[], window: TimeWindow): Series {
  const days = (window.end.getTime() - window.start.getTime()) / DAY;
  const unit = days > WEEKLY_UP_TO_DAYS ? 'month' : 'week';
  const edges: Date[] = [window.start];
  for (;;) {
    const last = edges[edges.length - 1]!;
    const next = unit === 'week'
      ? new Date(last.getTime() + 7 * DAY)
      : new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
    if (next >= window.end) break;
    edges.push(next);
  }
  const buckets = edges.map((start, i): Bucket => {
    const end = edges[i + 1] ?? window.end;
    const inside = analysed.filter((d) => d.time >= start && d.time < end);
    const failed = inside.filter((d) => d.failed);
    return {
      start,
      end,
      releases: inside.length,
      failed: failed.length,
      rework: inside.filter((d) => d.rework).length,
      leadHours: median(inside.flatMap((d) => d.leadTimesHours ?? [])),
      recoveryHours: median(failed.flatMap((d) => (d.recoveryHours === null ? [] : [d.recoveryHours]))),
    };
  });
  return { unit, buckets };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 200;
const VIEW_H = 64;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function day(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

interface Bar {
  /** Height of the whole bar and of its lower red part, in the chart's own units. */
  total: number;
  bad: number;
  tip: string;
}

/** The parts every chart shares: bars, an optional grey reference line, dates, key, tooltip. */
function chart(key: MetricKey, s: Series, bars: (Bar | null)[], o: { max: number; ref?: number | null; label: string; key: [string, string][] }): HTMLElement {
  const svg = svgEl('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': o.label });
  svg.append(svgEl('line', { x1: 0, x2: VIEW_W, y1: VIEW_H - 0.5, y2: VIEW_H - 0.5, class: 'chart-base', 'vector-effect': 'non-scaling-stroke' }));
  const slot = VIEW_W / s.buckets.length;
  const width = Math.min(14, slot - 2);
  const y = (v: number) => VIEW_H - (v / o.max) * (VIEW_H - 4);
  bars.forEach((b, i) => {
    if (!b || b.total <= 0) return;
    const x = i * slot + (slot - width) / 2;
    const good = b.total - b.bad;
    if (good > 0) svg.append(svgEl('rect', { x, y: y(b.total), width, height: VIEW_H - y(good) - (b.bad ? 1 : 0), rx: 2, class: 'bar' }));
    if (b.bad > 0) svg.append(svgEl('rect', { x, y: y(b.bad), width, height: VIEW_H - y(b.bad), rx: 2, class: 'bar bad' }));
  });
  if (o.ref != null && o.ref > 0) {
    svg.append(svgEl('line', { x1: 0, x2: VIEW_W, y1: y(o.ref), y2: y(o.ref), class: 'chart-ref', 'vector-effect': 'non-scaling-stroke' }));
  }

  // Hover or tap: one tooltip for the bar under the pointer (no extra keyboard stops; the
  // summary in aria-label and the release list carry the same information).
  const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
  const plot = h('div', { class: 'chart-plot' }, svg, tip);
  const show = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(s.buckets.length - 1, Math.floor(((clientX - box.left) / box.width) * s.buckets.length)));
    const b = s.buckets[i]!;
    tip.textContent = `${s.unit === 'week' ? 'Week of' : ''} ${day(b.start)}: ${bars[i]?.tip ?? 'no release'}`.trim();
    tip.hidden = false;
  };
  plot.addEventListener('pointermove', (e) => show(e.clientX));
  plot.addEventListener('pointerdown', (e) => show(e.clientX));
  plot.addEventListener('pointerleave', () => { tip.hidden = true; });

  const first = s.buckets[0]!.start;
  const last = new Date(s.buckets[s.buckets.length - 1]!.end.getTime() - DAY);
  return h('div', { class: 'chart', 'data-testid': `chart-${key}` },
    plot,
    h('div', { class: 'chart-axis' }, h('span', {}, day(first)), h('span', {}, `per ${s.unit}`), h('span', {}, day(last))),
    h('div', { class: 'chart-key' }, ...o.key.map(([cls, text]) => h('span', {}, h('i', { class: `swatch ${cls}`, 'aria-hidden': 'true' }), text))),
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The chart for one metric card. */
export function metricChart(key: MetricKey, s: Series, previous?: PreviousPeriod): HTMLElement {
  const b = s.buckets;
  const prev = previous?.status === 'ok' || previous?.status === 'partial' ? previous.metrics : null;
  const busiest = Math.max(1, ...b.map((x) => x.releases));
  const per = s.unit;
  switch (key) {
    case 'deploymentFrequency':
      return chart(key, s, b.map((x) => ({ total: x.releases, bad: 0, tip: plural(x.releases, 'release', 'releases') })), {
        max: busiest,
        label: `Releases per ${per}: ${b.map((x) => x.releases).join(', ')}.`,
        key: [['good', 'Releases']],
      });
    case 'changeFailureRate':
    case 'reworkRate': {
      const bad = (x: Bucket) => (key === 'changeFailureRate' ? x.failed : x.rework);
      const badWord = key === 'changeFailureRate' ? 'needed an urgent fix' : 'were urgent fixes';
      return chart(key, s, b.map((x) => ({ total: x.releases, bad: bad(x), tip: `${plural(x.releases, 'release', 'releases')}, ${bad(x)} ${badWord}` })), {
        max: busiest,
        label: `Releases per ${per}, of which ${badWord}: ${b.map((x) => `${x.releases} (${bad(x)})`).join(', ')}.`,
        key: key === 'changeFailureRate'
          ? [['good', 'Fine'], ['bad', 'Urgent fix']]
          : [['good', 'Planned'], ['bad', 'Urgent fix']],
      });
    }
    case 'leadTime':
    case 'recoveryTime': {
      const value = (x: Bucket) => (key === 'leadTime' ? x.leadHours : x.recoveryHours);
      const ref = key === 'leadTime' ? prev?.leadTime.medianHours ?? null : prev?.recoveryTime.medianHours ?? null;
      const max = Math.max(1, ...b.map((x) => value(x) ?? 0), ref ?? 0) * 1.1;
      const isFix = key === 'recoveryTime';
      const word = isFix ? 'fixed after' : 'typical wait';
      const bars = b.map((x): Bar | null => {
        const v = value(x);
        return v === null ? null : { total: v, bad: isFix ? v : 0, tip: `${word} ${formatDuration(v)}` };
      });
      const days = Math.round((previous?.window.end.getTime() ?? 0) / DAY - (previous?.window.start.getTime() ?? 0) / DAY);
      return chart(key, s, bars, {
        max,
        ref,
        label: `${isFix ? 'Time to fix, by the ' + per + ' the release went wrong' : 'Typical wait per ' + per}: ${b.map((x) => (value(x) === null ? 'none' : formatDuration(value(x)!))).join(', ')}.`,
        key: [
          [isFix ? 'bad' : 'good', isFix ? 'Time to fix' : `Typical wait`],
          ...(ref != null ? [['ref', `Before (${days} days)`] as [string, string]] : []),
        ],
      });
    }
  }
}
