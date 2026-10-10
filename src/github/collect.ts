// Turns a repository into a list of deployments with their changes (PLAN.md §1, §3).
import type { Change, Deployment, Settings, TimeWindow } from '../types';
import type { RepoRef } from '../repo';
import { compilePattern, findPredecessor, inWindow } from '../metrics/model';
import { compareVersions, parseVersion } from '../metrics/version';
import { parseRevert } from '../metrics/revert';
import { GitHubClient, GitHubError } from './client';

export interface Collected {
  repo: { fullName: string; htmlUrl: string };
  source: 'releases' | 'tags';
  deployments: Deployment[];
  notices: string[];
  /** In-window deployments whose changes were fetched / needed. */
  changesFetched: number;
  changesNeeded: number;
}

interface RepoJson { full_name: string; html_url: string; private: boolean }
interface ReleaseJson { tag_name: string; published_at: string | null; draft: boolean; prerelease: boolean }
interface RefJson { ref: string; object: { sha: string; type: string } }
interface PullJson { merge_commit_sha: string | null }
interface CompareJson {
  total_commits: number;
  commits: { sha: string; parents: unknown[]; commit: { message: string; author: { date: string } | null; committer: { date: string } | null } }[];
}

const MAX_RELEASE_PAGES = 10;
const STALE_LINES_TO_STOP = 3;

function lineOf(name: string): string | null {
  const v = parseVersion(name);
  return v ? `${v.major}.${v.minor}` : null;
}

async function tagDate(client: GitHubClient, base: string, obj: { sha: string; type: string }): Promise<Date> {
  if (obj.type === 'tag') {
    const tag = await client.get<{ tagger: { date: string } }>(`${base}/git/tags/${obj.sha}`);
    return new Date(tag.tagger.date);
  }
  const commit = await client.get<{ committer: { date: string } }>(`${base}/git/commits/${obj.sha}`);
  return new Date(commit.committer.date);
}

export interface CollectOptions {
  /** With fewer deployments than this in the window, list them but fetch no change details. */
  minDeployments?: number;
}

export async function collect(client: GitHubClient, ref: RepoRef, settings: Settings, window: TimeWindow, opts: CollectOptions = {}): Promise<Collected> {
  const base = `/repos/${ref.owner}/${ref.name}`;
  const notices: string[] = [];

  const repo = await client.get<RepoJson>(base);
  if (repo.private) throw new GitHubError('private', 'Repository is private');

  const versionRe = compilePattern(settings.versionPattern);
  let source: 'releases' | 'tags' | null = null;
  let deployments: Deployment[] = [];

  if (settings.source !== 'tags') {
    const { found, rawCount } = await listReleases(client, base, settings, versionRe, window);
    if (settings.source === 'releases' || rawCount > 0) {
      source = 'releases';
      deployments = found;
    }
  }
  if (source === null) {
    source = 'tags';
    deployments = await listTags(client, base, versionRe, window);
    if (settings.source === 'auto') {
      notices.push('This repository has no GitHub Releases, so version tags are used as deployments.');
    }
  }

  const targets = deployments
    .filter((d) => inWindow(d, window))
    .sort((a, b) => b.time.getTime() - a.time.getTime()); // newest first, so a sample is the most recent
  if (targets.length === 0) {
    throw new GitHubError('no-deployments', `No ${source} matching the pattern in the window`);
  }
  if (opts.minDeployments !== undefined && targets.length < opts.minDeployments) {
    return {
      repo: { fullName: repo.full_name, htmlUrl: repo.html_url },
      source, deployments, notices, changesFetched: 0, changesNeeded: targets.length,
    };
  }

  let fetched = 0;
  let stoppedBy: 'budget' | 'rate-limit' | null = null;
  let noPredecessor = 0;
  for (const d of targets) {
    const pred = findPredecessor(d, deployments);
    if (!pred) {
      noPredecessor++;
      continue;
    }
    try {
      const cmp = await client.get<CompareJson>(`${base}/compare/${encodeURIComponent(pred.name)}...${encodeURIComponent(d.name)}`);
      d.changes = cmp.commits.map(toChange);
      d.changesTruncated = cmp.total_commits > cmp.commits.length;
      fetched++;
    } catch (e) {
      if (e instanceof GitHubError && (e.kind === 'budget' || e.kind === 'rate-limit')) {
        stoppedBy = e.kind;
        break;
      }
      if (e instanceof GitHubError && e.kind === 'not-found') continue;
      throw e;
    }
  }

  // Reverts that name a pull request: look up its merge commit (PLAN.md §2, v1.1), newest
  // release first, within the same request budget. Unresolved ones stay unmatched.
  let lookupsSkipped = 0;
  if (settings.useRevert) {
    const revertRe = compilePattern(settings.revertPattern);
    for (const d of targets) {
      for (const change of d.changes ?? []) {
        const target = parseRevert(change.message, revertRe);
        if (target?.kind !== 'pull') continue;
        change.revertTarget = null;
        if (target.repo && target.repo.toLowerCase() !== `${ref.owner}/${ref.name}`.toLowerCase()) continue;
        if (stoppedBy) {
          lookupsSkipped++;
          continue;
        }
        try {
          const pr = await client.get<PullJson>(`${base}/pulls/${target.number}`);
          change.revertTarget = pr.merge_commit_sha ?? null;
        } catch (e) {
          if (e instanceof GitHubError && (e.kind === 'budget' || e.kind === 'rate-limit')) {
            stoppedBy = e.kind;
            lookupsSkipped++;
          } else if (!(e instanceof GitHubError && e.kind === 'not-found')) {
            throw e;
          }
        }
      }
    }
  }
  if (lookupsSkipped > 0) {
    notices.push(
      `The request limit was reached before ${lookupsSkipped} revert(s) could be looked up, so they count as unmatched.`,
    );
  }

  const needed = targets.length - noPredecessor;
  if (stoppedBy === 'budget') {
    notices.push(
      `Change details were fetched for ${fetched} of ${needed} deployments (the newest ones) to stay within ` +
        `GitHub's hourly limit. Lead time, revert detection and rework use this sample. Add a token for the full picture.`,
    );
  } else if (stoppedBy === 'rate-limit') {
    notices.push(
      `GitHub's hourly limit ran out after change details for ${fetched} of ${needed} deployments (the newest ones). ` +
        `Lead time, revert detection and rework use this sample. Run again after the limit resets for the full picture.`,
    );
  }
  if (noPredecessor > 0) {
    notices.push(`${noPredecessor} deployment(s) have no earlier version to compare with, so their changes are not counted.`);
  }
  if (targets.some((d) => d.changesTruncated)) {
    notices.push('Some deployments contain more than 250 commits; GitHub only lists the first 250, so only those are counted.');
  }

  return {
    repo: { fullName: repo.full_name, htmlUrl: repo.html_url },
    source,
    deployments,
    notices,
    changesFetched: fetched,
    changesNeeded: needed,
  };
}

function toChange(c: CompareJson['commits'][number]): Change {
  const date = c.commit.author?.date ?? c.commit.committer?.date ?? '';
  return { sha: c.sha, message: c.commit.message, authoredAt: new Date(date), parents: c.parents.length };
}

async function listReleases(client: GitHubClient, base: string, settings: Settings, versionRe: RegExp, window: TimeWindow) {
  const found: Deployment[] = [];
  let rawCount = 0;
  let pastWindow = false;
  for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
    const list = await client.get<ReleaseJson[]>(`${base}/releases?per_page=100&page=${page}`);
    rawCount += list.length;
    for (const r of list) {
      if (r.draft || !r.published_at) continue;
      if (settings.skipPrereleases && r.prerelease) continue;
      if (!versionRe.test(r.tag_name)) continue;
      found.push({ name: r.tag_name, time: new Date(r.published_at), changes: null, changesTruncated: false });
    }
    if (list.length < 100 || pastWindow) break;
    // Read one more page after reaching the window start, so the predecessors of the
    // earliest releases (often on older version lines) are known.
    const oldest = Math.min(...list.map((r) => Date.parse(r.published_at ?? '') || Infinity));
    if (oldest < window.start.getTime()) pastWindow = true;
  }
  return { found, rawCount };
}

async function listTags(client: GitHubClient, base: string, versionRe: RegExp, window: TimeWindow): Promise<Deployment[]> {
  let refs: RefJson[];
  try {
    refs = await client.get<RefJson[]>(`${base}/git/matching-refs/tags`);
  } catch (e) {
    if (e instanceof GitHubError && e.kind === 'not-found') return []; // empty repository
    throw e;
  }
  const names = refs
    .map((r) => ({ name: r.ref.replace(/^refs\/tags\//, ''), obj: r.object }))
    .filter((t) => versionRe.test(t.name));
  // Newest version first; names that aren't versions can't be ordered, so they come last and are all read.
  names.sort((a, b) => {
    const va = parseVersion(a.name);
    const vb = parseVersion(b.name);
    if (va && vb) return compareVersions(vb, va);
    return va ? -1 : vb ? 1 : a.name.localeCompare(b.name);
  });

  // Read dates newest version first, one version line (major.minor) at a time. Within a line,
  // the first tag older than the window is the predecessor of everything above it, so the rest
  // of that line is skipped. Older lines can still carry backports released inside the window,
  // so lines are read until three in a row turn out to be entirely older than the window.
  const out: Deployment[] = [];
  let staleLines = 0;
  let currentLine: string | null = null;
  let lineDone = false;
  for (const t of names) {
    const v = parseVersion(t.name);
    const line = v ? `${v.major}.${v.minor}` : null;
    if (line !== null && line !== currentLine) {
      currentLine = line;
      lineDone = staleLines >= STALE_LINES_TO_STOP; // older lines are skipped entirely
    }
    if (line !== null && lineDone) continue;
    let time: Date;
    try {
      time = await tagDate(client, base, t.obj);
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'budget') {
        throw new GitHubError('budget', 'Too many tags to read without a token', { withToken: client.hasToken });
      }
      throw e;
    }
    const isNewestOfLine = line !== null && !out.some((d) => lineOf(d.name) === line);
    out.push({ name: t.name, time, changes: null, changesTruncated: false });
    if (line !== null && time < window.start) {
      lineDone = true;
      staleLines = isNewestOfLine ? staleLines + 1 : 0;
    } else if (line !== null && isNewestOfLine) {
      staleLines = 0;
    }
  }
  return out;
}
