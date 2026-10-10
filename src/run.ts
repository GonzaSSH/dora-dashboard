// One full analysis: validate input → collect from GitHub → apply proxy rules → compute metrics.
import type { Settings, TimeWindow } from './types';
import { BUDGET_WITH_TOKEN, BUDGET_WITHOUT_TOKEN } from './config';
import { GitHubClient, GitHubError, type RateLimit } from './github/client';
import { collect, type Collected } from './github/collect';
import { analyse, inWindow, type Analysed } from './metrics/model';
import { computeMetrics, type Metrics } from './metrics/compute';
import { parseRepo } from './repo';

export interface RunInput {
  repo: string;
  token?: string;
  settings: Settings;
  window: TimeWindow;
  fetchFn?: typeof fetch;
  budget?: number;
  onRequest?: (used: number) => void;
}

export interface RunResult {
  collected: Collected;
  analysed: Analysed[];
  metrics: Metrics;
  requestsUsed: number;
  rateLimit: RateLimit | null;
  /** The period of equal length just before the window (v1.3); absent in older saved results. */
  previous?: PreviousPeriod;
}

/** Fewer releases than this in the previous period and the comparison says so instead (v1.3). */
export const MIN_PREVIOUS_DEPLOYMENTS = 5;

export interface PreviousPeriod {
  window: TimeWindow;
  /**
   * ok: fully measured · partial: release dates read, change details cut short by the request
   * limit (only deployment frequency is compared) · too-few: under 5 releases · needs-token: the
   * request limit ran out before the releases could be listed.
   */
  status: 'ok' | 'partial' | 'too-few' | 'needs-token';
  /** Releases in the previous period (0 when unknown). */
  count: number;
  metrics: Metrics | null;
}

export interface ComparedRun {
  current: RunResult;
  previous: PreviousPeriod;
  /** Both periods together; responses already read for the current period are reused for free. */
  requestsUsed: number;
}

export async function runAnalysis(input: RunInput): Promise<RunResult> {
  return runWith(clientFor(input), input);
}

/**
 * The analysis plus the previous period of equal length (v1.3), sharing one request budget.
 * The current period is measured exactly as by runAnalysis; the comparison never makes it fail.
 */
export async function runWithComparison(input: RunInput): Promise<ComparedRun> {
  const client = clientFor(input);
  const current = await runWith(client, input);
  const len = input.window.end.getTime() - input.window.start.getTime();
  const window = { start: new Date(input.window.start.getTime() - len), end: input.window.start };
  const previous = await measurePrevious(client, input, window);
  return { current: { ...current, previous }, previous, requestsUsed: client.requestsUsed };
}

async function measurePrevious(client: GitHubClient, input: RunInput, window: TimeWindow): Promise<PreviousPeriod> {
  const ref = parseRepo(input.repo)!;
  let collected: Collected;
  try {
    collected = await collect(client, ref, input.settings, window, { minDeployments: MIN_PREVIOUS_DEPLOYMENTS });
  } catch (e) {
    if (e instanceof GitHubError && e.kind === 'no-deployments') return { window, status: 'too-few', count: 0, metrics: null };
    if (e instanceof GitHubError && (e.kind === 'budget' || e.kind === 'rate-limit')) {
      return { window, status: 'needs-token', count: 0, metrics: null };
    }
    throw e;
  }
  const count = collected.deployments.filter((d) => inWindow(d, window)).length;
  if (count < MIN_PREVIOUS_DEPLOYMENTS) return { window, status: 'too-few', count, metrics: null };
  const metrics = computeMetrics(analyse(collected.deployments, window, input.settings), window);
  const status = collected.changesFetched < collected.changesNeeded ? 'partial' : 'ok';
  return { window, status, count, metrics };
}

function clientFor(input: RunInput): GitHubClient {
  return new GitHubClient({
    token: input.token,
    fetchFn: input.fetchFn,
    onRequest: input.onRequest,
    budget: input.budget ?? (input.token?.trim() ? BUDGET_WITH_TOKEN : BUDGET_WITHOUT_TOKEN),
  });
}

async function runWith(client: GitHubClient, input: RunInput): Promise<RunResult> {
  const ref = parseRepo(input.repo);
  if (!ref) throw new GitHubError('invalid-input', 'Enter a repository as owner/name, for example grafana/grafana.');
  validate(input.settings, input.window);

  const collected = await collect(client, ref, input.settings, input.window);
  const analysed = analyse(collected.deployments, input.window, input.settings);
  return {
    collected,
    analysed,
    metrics: computeMetrics(analysed, input.window),
    requestsUsed: client.requestsUsed,
    rateLimit: client.rateLimit,
  };
}

function validate(s: Settings, w: TimeWindow): void {
  const patterns: [string, string][] = [
    ['Version pattern', s.versionPattern],
    ['Revert pattern', s.revertPattern],
  ];
  for (const [label, p] of patterns) {
    try {
      new RegExp(p);
    } catch {
      throw new GitHubError('invalid-input', `${label} is not a valid pattern: ${p}`);
    }
  }
  if (!(s.quickPatchHours > 0)) throw new GitHubError('invalid-input', 'Quick-patch hours must be more than 0.');
  if (Number.isNaN(w.start.getTime()) || Number.isNaN(w.end.getTime()) || w.start >= w.end) {
    throw new GitHubError('invalid-input', 'The start date must be before the end date.');
  }
}
