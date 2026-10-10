// One full analysis: validate input → collect from GitHub → apply proxy rules → compute metrics.
import type { Settings, TimeWindow } from './types';
import { BUDGET_WITH_TOKEN, BUDGET_WITHOUT_TOKEN } from './config';
import { GitHubClient, GitHubError, type RateLimit } from './github/client';
import { collect, type Collected } from './github/collect';
import { analyse, type Analysed } from './metrics/model';
import { computeMetrics, type Metrics } from './metrics/compute';
import { parseRepo } from './repo';

export interface RunInput {
  repo: string;
  token?: string;
  settings: Settings;
  window: TimeWindow;
  fetchFn?: typeof fetch;
  budget?: number;
}

export interface RunResult {
  collected: Collected;
  analysed: Analysed[];
  metrics: Metrics;
  requestsUsed: number;
  rateLimit: RateLimit | null;
}

export async function runAnalysis(input: RunInput): Promise<RunResult> {
  const ref = parseRepo(input.repo);
  if (!ref) throw new GitHubError('invalid-input', 'Enter a repository as owner/name, for example grafana/grafana.');
  validate(input.settings, input.window);

  const client = new GitHubClient({
    token: input.token,
    fetchFn: input.fetchFn,
    budget: input.budget ?? (input.token?.trim() ? BUDGET_WITH_TOKEN : BUDGET_WITHOUT_TOKEN),
  });
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
    ['Fix pattern', s.fixPattern],
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
