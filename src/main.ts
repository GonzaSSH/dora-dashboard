import './ui/styles.css';
import { DEFAULT_SETTINGS, DEFAULT_WINDOW_DAYS } from './config';
import { runWithComparison } from './run';
import { messageFor } from './messages';
import { renderAbout, renderResults } from './ui/render';
import { h } from './ui/dom';
import type { Settings, TimeWindow } from './types';
import { fromJson, isDemoId, type DemoId } from './snapshot';
import { readState, writeState } from './url-state';
import { applyCorrections, hasCorrections, NO_CORRECTIONS, type Corrections } from './metrics/corrections';
import { computeMetrics } from './metrics/compute';
import type { RunResult } from './run';

const DAY = 86_400_000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLElement>('form');
const repoIn = $<HTMLInputElement>('repo');
const fromIn = $<HTMLInputElement>('from');
const toIn = $<HTMLInputElement>('to');
const tokenIn = $<HTMLInputElement>('token');
const goBtn = $<HTMLButtonElement>('go');
const statusEl = $<HTMLElement>('status');
const errorEl = $<HTMLElement>('error');
const resultsEl = $<HTMLElement>('results');
const mainEl = $<HTMLElement>('main');
const loadingEl = $<HTMLElement>('loading');
const sideEl = document.querySelector<HTMLElement>('.side')!;
const menuBtn = $<HTMLButtonElement>('menu');
const demoButtons: Record<DemoId, HTMLButtonElement> = {
  sandbox: $<HTMLButtonElement>('demo'),
  angular: $<HTMLButtonElement>('demo-angular'),
  dashboard: $<HTMLButtonElement>('demo-dashboard'),
};

const field = {
  source: $<HTMLSelectElement>('source'),
  versionPattern: $<HTMLInputElement>('versionPattern'),
  skipPrereleases: $<HTMLInputElement>('skipPrereleases'),
  useQuickPatch: $<HTMLInputElement>('useQuickPatch'),
  quickPatchHours: $<HTMLInputElement>('quickPatchHours'),
  useRevert: $<HTMLInputElement>('useRevert'),
  revertPattern: $<HTMLInputElement>('revertPattern'),
  reworkRule: $<HTMLSelectElement>('reworkRule'),
};

function writeSettings(s: Settings): void {
  field.source.value = s.source;
  field.versionPattern.value = s.versionPattern;
  field.skipPrereleases.checked = s.skipPrereleases;
  field.useQuickPatch.checked = s.useQuickPatch;
  field.quickPatchHours.value = String(s.quickPatchHours);
  field.useRevert.checked = s.useRevert;
  field.revertPattern.value = s.revertPattern;
  field.reworkRule.value = s.reworkRule;
}

function readSettings(): Settings {
  return {
    source: field.source.value as Settings['source'],
    versionPattern: field.versionPattern.value,
    skipPrereleases: field.skipPrereleases.checked,
    useQuickPatch: field.useQuickPatch.checked,
    quickPatchHours: Number(field.quickPatchHours.value),
    useRevert: field.useRevert.checked,
    revertPattern: field.revertPattern.value,
    reworkRule: field.reworkRule.value as Settings['reworkRule'],
  };
}

/** Dates are whole UTC days; "to" is included, so the window ends at the next midnight. */
function readWindow(): TimeWindow {
  return { start: new Date(`${fromIn.value}T00:00:00Z`), end: new Date(Date.parse(`${toIn.value}T00:00:00Z`) + DAY) };
}

function setDefaultDates(): void {
  const today = new Date().toISOString().slice(0, 10);
  toIn.value = today;
  fromIn.value = new Date(Date.parse(`${today}T00:00:00Z`) - (DEFAULT_WINDOW_DAYS - 1) * DAY).toISOString().slice(0, 10);
}

/** Phones: the sidebar is a top bar whose menu opens the navigation (v1.4). */
function setMenu(open: boolean): void {
  sideEl.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
}

function markDemo(id: DemoId | undefined): void {
  for (const [key, btn] of Object.entries(demoButtons)) {
    if (key === id) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  }
}

/** Five placeholder cards while GitHub is read, instead of a spinner. */
function showLoading(on: boolean): void {
  loadingEl.hidden = !on;
  if (on) {
    loadingEl.replaceChildren(
      h('div', { class: 'skeleton skeleton-head' }),
      h('div', { class: 'skeleton-tiles' }, ...Array.from({ length: 5 }, () => h('div', { class: 'skeleton skeleton-tile' }))),
    );
  } else {
    loadingEl.replaceChildren();
  }
}

async function share(): Promise<string> {
  try {
    await navigator.clipboard.writeText(location.href);
    return 'Link copied';
  } catch {
    return 'Copy the page address to share this view';
  }
}

function showError(err: unknown): void {
  mainEl.classList.remove('has-results');
  const m = messageFor(err);
  errorEl.replaceChildren(h('h2', {}, m.title), h('p', {}, m.detail));
  errorEl.hidden = false;
}

let running = false;

// The automatic result being shown, and the person's corrections on top of it (v1.2).
interface Base {
  result: RunResult;
  window: TimeWindow;
  settings: Settings;
  savedAt?: Date;
  savedWithToken?: boolean;
  demo?: DemoId;
}
let base: Base | null = null;
let corrections: Corrections = NO_CORRECTIONS;
let tableOpen = false;

/** Applies corrections, recalculates the five metrics (no GitHub requests) and updates the link. */
function show(): void {
  if (!base) return;
  const view = applyCorrections(base.result.analysed, corrections, base.settings);
  const result: RunResult = { ...base.result, analysed: view.analysed, metrics: computeMetrics(view.analysed, base.window) };
  renderResults(resultsEl, result, base.window, {
    savedAt: base.savedAt,
    savedWithToken: base.savedWithToken,
    settings: base.settings,
    corrections,
    corrected: view.corrected,
    ignored: view.ignored,
    tableOpen: tableOpen || hasCorrections(corrections),
    onCorrect: correct,
    onReset: () => {
      corrections = NO_CORRECTIONS;
      show();
    },
    onShare: share,
    onAnalyseLive: base.savedAt ? () => void analyse(corrections) : undefined,
  });
  markDemo(base.demo);
  resultsEl.hidden = false;
  mainEl.classList.add('has-results');
  // Shareable link: repository, dates, non-default settings and corrections. Never the token.
  const params = writeState({
    demo: base.demo,
    repo: repoIn.value.trim(),
    from: fromIn.value,
    to: toIn.value,
    settings: base.settings,
    corrections,
  });
  history.replaceState(null, '', `?${params}`);
}

function correct(name: string, choice: 'auto' | 'failed' | 'not-failed', fixedBy?: string | null): void {
  tableOpen = true;
  const failed = corrections.failed.filter((f) => f.name !== name);
  const notFailed = corrections.notFailed.filter((n) => n !== name);
  if (choice === 'failed') failed.push({ name, fixedBy: fixedBy === undefined ? 'next' : fixedBy });
  if (choice === 'not-failed') notFailed.push(name);
  corrections = { failed, notFailed };
  show();
}

/** Loads a saved demo result: zero GitHub requests (v1.1 item 2). */
async function loadDemo(id: DemoId, keep: Corrections = NO_CORRECTIONS): Promise<void> {
  if (running) return;
  setMenu(false);
  errorEl.hidden = true;
  try {
    const res = await fetch(`snapshots/${id}.json`);
    if (!res.ok) throw new Error(String(res.status));
    const snap = fromJson(await res.json());
    repoIn.value = snap.repo;
    fromIn.value = snap.window.start.toISOString().slice(0, 10);
    toIn.value = new Date(snap.window.end.getTime() - DAY).toISOString().slice(0, 10);
    writeSettings(snap.settings);
    base = { result: snap.result, window: snap.window, settings: snap.settings, savedAt: snap.savedAt, savedWithToken: snap.savedWithToken, demo: id };
    corrections = keep;
    tableOpen = false;
    statusEl.textContent = '';
    show();
  } catch {
    errorEl.replaceChildren(h('h2', {}, "Couldn't load the saved example"), h('p', {}, 'Type a repository and click Analyse to run a live analysis instead.'));
    errorEl.hidden = false;
  }
}

async function analyse(keep: Corrections = NO_CORRECTIONS): Promise<void> {
  if (running) return;
  running = true;
  goBtn.disabled = true;
  errorEl.hidden = true;
  resultsEl.hidden = true;
  showLoading(true);
  statusEl.textContent = 'Reading the repository from GitHub…';
  const window = readWindow();
  const settings = readSettings();
  try {
    const run = await runWithComparison({
      repo: repoIn.value,
      token: tokenIn.value,
      settings,
      window,
      onRequest: (n) => {
        statusEl.textContent = `Reading the repository from GitHub… (${n} requests)`;
      },
    });
    // The previous period is measured with automatic detection; corrections apply to this period only.
    const result: RunResult = { ...run.current, requestsUsed: run.requestsUsed };
    base = { result, window, settings };
    corrections = keep;
    tableOpen = false;
    statusEl.textContent = '';
    show();
  } catch (err) {
    statusEl.textContent = '';
    showError(err);
  } finally {
    showLoading(false);
    running = false;
    goBtn.disabled = false;
  }
}

goBtn.addEventListener('click', () => void analyse());
// Enter in any text box runs the analysis (the page has no <form>, see index.html).
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') {
    e.preventDefault();
    void analyse();
  }
});
for (const [id, btn] of Object.entries(demoButtons)) btn.addEventListener('click', () => void loadDemo(id as DemoId));
menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
$<HTMLButtonElement>('find').addEventListener('click', () => {
  setMenu(false);
  repoIn.focus();
  repoIn.scrollIntoView({ block: 'center' });
});
$<HTMLButtonElement>('open-settings').addEventListener('click', () => {
  setMenu(false);
  const details = document.querySelector<HTMLDetailsElement>('[data-testid="settings"]')!;
  details.open = true;
  details.querySelector('summary')!.focus();
  details.scrollIntoView({ block: 'start' });
});
$<HTMLButtonElement>('reset').addEventListener('click', () => writeSettings(DEFAULT_SETTINGS));

writeSettings(DEFAULT_SETTINGS);
setDefaultDates();
renderAbout($<HTMLElement>('about'));

// A shared link reproduces the same view: repository and dates (or a demo), settings, corrections.
const state = readState(new URLSearchParams(location.search));
if (state.from) fromIn.value = state.from;
if (state.to) toIn.value = state.to;
if (isDemoId(state.demo ?? null)) {
  void loadDemo(state.demo as DemoId, state.corrections);
} else if (state.repo) {
  repoIn.value = state.repo;
  writeSettings(state.settings);
  void analyse(state.corrections);
}
