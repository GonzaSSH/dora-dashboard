// Turns a repository into a list of deployments with their changes (PLAN.md §1, §3).
import type { Change, Deployment, Settings, TimeWindow } from '../types';
import type { RepoRef } from '../repo';
import { compilePattern, findPredecessor, inWindow } from '../metrics/model';
import { compareVersions, parseVersion } from '../metrics/version';
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
interface CompareJson {
  total_commits: number;
  commits: { sha: string; parents: unknown[]; commit: { message: string; author: { date: string } | null; committer: { date: string } | null } }[];
}

const MAX_RELEASE_PAGES = 10;

export async function collect(client: GitHubClient, ref: RepoRef, settings: Settings, window: TimeWindow): Promise<Collected> {
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

  let fetched = 0;
  let budgetHit = false;
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
      if (e instanceof GitHubError && e.kind === 'budget') {
        budgetHit = true;
        break;
      }
      if (e instanceof GitHubError && e.kind === 'not-found') continue;
      throw e;
    }
  }

  const needed = targets.length - noPredecessor;
  if (budgetHit) {
    notices.push(
      `Change details were fetched for ${fetched} of ${needed} deployments (the newest ones) to stay within ` +
        `GitHub's hourly limit. Lead time, revert detection and rework use this sample. Add a token for the full picture.`,
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
  for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
    const list = await client.get<ReleaseJson[]>(`${base}/releases?per_page=100&page=${page}`);
    rawCount += list.length;
    for (const r of list) {
      if (r.draft || !r.published_at) continue;
      if (settings.skipPrereleases && r.prerelease) continue;
      if (!versionRe.test(r.tag_name)) continue;
      found.push({ name: r.tag_name, time: new Date(r.published_at), changes: null, changesTruncated: false });
    }
    if (list.length < 100) break;
    const oldest = Math.min(...list.map((r) => Date.parse(r.published_at ?? '') || Infinity));
    if (oldest < window.start.getTime()) break;
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

  const out: Deployment[] = [];
  let reachedBeforeWindow = false;
  for (const t of names) {
    const isVersion = parseVersion(t.name) !== null;
    if (reachedBeforeWindow && isVersion) continue;
    let time: Date;
    try {
      if (t.obj.type === 'tag') {
        const tag = await client.get<{ tagger: { date: string } }>(`${base}/git/tags/${t.obj.sha}`);
        time = new Date(tag.tagger.date);
      } else {
        const commit = await client.get<{ committer: { date: string } }>(`${base}/git/commits/${t.obj.sha}`);
        time = new Date(commit.committer.date);
      }
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'budget') {
        throw new GitHubError('budget', 'Too many tags to read without a token');
      }
      throw e;
    }
    out.push({ name: t.name, time, changes: null, changesTruncated: false });
    // Versions are read newest first, so the first one older than the window is the
    // predecessor of the window's earliest deployment; older ones aren't needed.
    if (isVersion && time < window.start) reachedBeforeWindow = true;
  }
  return out;
}
