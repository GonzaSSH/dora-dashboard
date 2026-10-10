import './ui/styles.css';
import { DEFAULT_SETTINGS, DEFAULT_WINDOW_DAYS } from './config';
import { runAnalysis } from './run';
import { messageFor } from './messages';
import { renderAbout, renderResults } from './ui/render';
import { h } from './ui/dom';
import type { Settings, TimeWindow } from './types';

const SANDBOX = { repo: 'GonzaSSH/dora-sandbox', from: '2026-01-01', to: '2026-03-31' };
const DAY = 86_400_000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('form');
const repoIn = $<HTMLInputElement>('repo');
const fromIn = $<HTMLInputElement>('from');
const toIn = $<HTMLInputElement>('to');
const tokenIn = $<HTMLInputElement>('token');
const goBtn = $<HTMLButtonElement>('go');
const statusEl = $<HTMLElement>('status');
const errorEl = $<HTMLElement>('error');
const resultsEl = $<HTMLElement>('results');

const field = {
  source: $<HTMLSelectElement>('source'),
  versionPattern: $<HTMLInputElement>('versionPattern'),
  skipPrereleases: $<HTMLInputElement>('skipPrereleases'),
  useQuickPatch: $<HTMLInputElement>('useQuickPatch'),
  quickPatchHours: $<HTMLInputElement>('quickPatchHours'),
  useRevert: $<HTMLInputElement>('useRevert'),
  revertPattern: $<HTMLInputElement>('revertPattern'),
  fixPattern: $<HTMLInputElement>('fixPattern'),
};

function writeSettings(s: Settings): void {
  field.source.value = s.source;
  field.versionPattern.value = s.versionPattern;
  field.skipPrereleases.checked = s.skipPrereleases;
  field.useQuickPatch.checked = s.useQuickPatch;
  field.quickPatchHours.value = String(s.quickPatchHours);
  field.useRevert.checked = s.useRevert;
  field.revertPattern.value = s.revertPattern;
  field.fixPattern.value = s.fixPattern;
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
    fixPattern: field.fixPattern.value,
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

function showError(err: unknown): void {
  const m = messageFor(err);
  errorEl.replaceChildren(h('h2', {}, m.title), h('p', {}, m.detail));
  errorEl.hidden = false;
}

let running = false;
async function analyse(): Promise<void> {
  if (running) return;
  running = true;
  goBtn.disabled = true;
  errorEl.hidden = true;
  resultsEl.hidden = true;
  statusEl.textContent = 'Reading the repository from GitHub…';
  const window = readWindow();
  try {
    const result = await runAnalysis({
      repo: repoIn.value,
      token: tokenIn.value,
      settings: readSettings(),
      window,
      onRequest: (n) => {
        statusEl.textContent = `Reading the repository from GitHub… (${n} requests)`;
      },
    });
    renderResults(resultsEl, result, window);
    resultsEl.hidden = false;
    statusEl.textContent = '';
    // Shareable link: repository and dates only, never the token.
    const params = new URLSearchParams({ repo: repoIn.value.trim(), from: fromIn.value, to: toIn.value });
    history.replaceState(null, '', `?${params}`);
  } catch (err) {
    statusEl.textContent = '';
    showError(err);
  } finally {
    running = false;
    goBtn.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void analyse();
});
$<HTMLButtonElement>('demo').addEventListener('click', () => {
  repoIn.value = SANDBOX.repo;
  fromIn.value = SANDBOX.from;
  toIn.value = SANDBOX.to;
  void analyse();
});
$<HTMLButtonElement>('reset').addEventListener('click', () => writeSettings(DEFAULT_SETTINGS));

writeSettings(DEFAULT_SETTINGS);
setDefaultDates();
renderAbout($<HTMLElement>('about'));

const params = new URLSearchParams(location.search);
const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
if (isDay(params.get('from'))) fromIn.value = params.get('from')!;
if (isDay(params.get('to'))) toIn.value = params.get('to')!;
if (params.get('repo')) {
  repoIn.value = params.get('repo')!;
  void analyse();
}
