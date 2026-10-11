// Saved results ("snapshots") for the demo links, so they load with zero GitHub requests.
// Written by scripts/snapshots.ts, served from public/snapshots/<id>.json.
import type { PreviousPeriod, RunResult } from './run';
import type { Settings, TimeWindow } from './types';

export interface Snapshot {
  id: string;
  repo: string;
  window: TimeWindow;
  savedAt: Date;
  settings: Settings;
  result: RunResult;
  /** Live demos are saved with a GitHub token (v1.3), so they may use more than 50 requests. */
  savedWithToken?: boolean;
}

export const DEMOS = [
  { id: 'sandbox', repo: 'GonzaSSH/dora-sandbox', label: 'the test repository', window: { start: '2026-01-01', end: '2026-03-31' } },
  { id: 'angular', repo: 'angular/angular', label: 'angular/angular', window: null },
  { id: 'dashboard', repo: 'GonzaSSH/dora-dashboard', label: 'this dashboard', window: null },
] as const;
export type DemoId = (typeof DEMOS)[number]['id'];

/** Keeps what the page shows; drops full commit messages and the raw deployment list to stay small. */
export function toJson(s: Snapshot): unknown {
  const r = s.result;
  return {
    id: s.id,
    repo: s.repo,
    window: { start: s.window.start.toISOString(), end: s.window.end.toISOString() },
    savedAt: s.savedAt.toISOString(),
    settings: s.settings,
    ...(s.savedWithToken ? { savedWithToken: true } : {}),
    result: {
      collected: { ...r.collected, deployments: [] },
      analysed: r.analysed.map((d) => ({
        ...d,
        time: d.time.toISOString(),
        changes: d.changes?.map((c) => ({
          sha: c.sha.slice(0, 12),
          message: c.message.split('\n')[0] ?? '',
          authoredAt: c.authoredAt.toISOString(),
          parents: c.parents,
        })) ?? null,
      })),
      metrics: r.metrics,
      requestsUsed: r.requestsUsed,
      rateLimit: null,
      ...(r.previous
        ? { previous: { ...r.previous, window: { start: r.previous.window.start.toISOString(), end: r.previous.window.end.toISOString() } } }
        : {}),
    },
  };
}

interface SnapshotJson {
  id: string;
  repo: string;
  window: { start: string; end: string };
  savedAt: string;
  settings: Settings;
  savedWithToken?: boolean;
  result: {
    collected: RunResult['collected'];
    analysed: (Omit<RunResult['analysed'][number], 'time' | 'changes'> & {
      time: string;
      changes: { sha: string; message: string; authoredAt: string; parents: number }[] | null;
    })[];
    metrics: RunResult['metrics'];
    requestsUsed: number;
    previous?: Omit<PreviousPeriod, 'window'> & { window: { start: string; end: string } };
  };
}

export function fromJson(raw: unknown): Snapshot {
  const j = raw as SnapshotJson;
  if (!j || typeof j.id !== 'string' || !j.result?.metrics) throw new Error('Not a snapshot');
  return {
    id: j.id,
    repo: j.repo,
    window: { start: new Date(j.window.start), end: new Date(j.window.end) },
    savedAt: new Date(j.savedAt),
    settings: j.settings,
    savedWithToken: j.savedWithToken === true,
    result: {
      collected: j.result.collected,
      analysed: j.result.analysed.map((d) => ({
        ...d,
        time: new Date(d.time),
        changes: d.changes?.map((c) => ({ ...c, authoredAt: new Date(c.authoredAt) })) ?? null,
      })),
      metrics: j.result.metrics,
      requestsUsed: j.result.requestsUsed,
      rateLimit: null,
      previous: j.result.previous
        ? { ...j.result.previous, window: { start: new Date(j.result.previous.window.start), end: new Date(j.result.previous.window.end) } }
        : undefined,
    },
  };
}

export function isDemoId(id: string | null): id is DemoId {
  return DEMOS.some((d) => d.id === id);
}
