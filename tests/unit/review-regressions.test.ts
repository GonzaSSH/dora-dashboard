// Regression tests for the findings of the independent review (Phase 5).
import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../../src/run';
import { GitHubError } from '../../src/github/client';
import { DEFAULT_SETTINGS } from '../../src/config';
import { messageFor } from '../../src/messages';
import { fixtureFetch, sandboxResponses } from '../helpers/fixtures';
import { SANDBOX_REPO, SANDBOX_WINDOW as W } from '../expected';

const json = (body: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: h });

/** A tag-only repo whose tags have the given dates. Records which URLs were read. */
function tagRepo(tags: Record<string, string>, seen: string[] = []): typeof fetch {
  return async (u) => {
    const url = String(u);
    seen.push(url);
    const p = new URL(url).pathname;
    if (p === '/repos/a/b') return json({ full_name: 'a/b', html_url: 'https://github.com/a/b', private: false });
    if (p.endsWith('/releases')) return json([]);
    if (p.endsWith('/matching-refs/tags')) return json(Object.keys(tags).map((n) => ({ ref: `refs/tags/${n}`, object: { sha: n, type: 'tag' } })));
    const m = /git\/tags\/(.*)$/.exec(p);
    if (m) return json({ tagger: { date: tags[m[1]!] } });
    if (p.includes('/compare/')) return json({ total_commits: 1, commits: [{ sha: 's', parents: [{}], commit: { message: 'feat: x', author: { date: '2026-01-10T00:00:00Z' }, committer: null } }] });
    throw new Error(`unexpected ${url}`);
  };
}

/** Wraps the sandbox fixtures so GitHub reports `left` requests remaining, counting down. */
function limitedSandbox(left: number, limit = 60): typeof fetch {
  const inner = fixtureFetch(sandboxResponses);
  return async (u, i) => {
    const r = await inner(u, i);
    left--;
    const h = new Headers(r.headers);
    h.set('x-ratelimit-remaining', String(left));
    h.set('x-ratelimit-limit', String(limit));
    h.set('x-ratelimit-reset', '1791748800');
    return new Response(await r.text(), { status: r.status, headers: h });
  };
}

async function failure(p: Promise<unknown>): Promise<GitHubError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof GitHubError) return e;
    throw e;
  }
  throw new Error('expected an error');
}

describe('finding 1: tag mode keeps backports on older version lines', () => {
  it('counts a backport released inside the window', async () => {
    const r = await runAnalysis({
      repo: 'a/b', settings: DEFAULT_SETTINGS, window: W,
      fetchFn: tagRepo({ 'v2.1.0': '2026-02-01T00:00:00Z', 'v2.0.0': '2025-12-01T00:00:00Z', 'v1.9.1': '2026-01-15T00:00:00Z', 'v1.9.0': '2025-11-01T00:00:00Z' }),
    });
    expect(r.analysed.map((d) => [d.name, d.predecessor])).toEqual([['v1.9.1', 'v1.9.0'], ['v2.1.0', 'v2.0.0']]);
  });

  it('stops reading after three version lines in a row are entirely before the window', async () => {
    const tags: Record<string, string> = { 'v2.0.0': '2026-02-01T00:00:00Z' };
    for (let i = 0; i <= 30; i++) tags[`v1.${i}.0`] = `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`;
    const seen: string[] = [];
    const r = await runAnalysis({ repo: 'a/b', settings: DEFAULT_SETTINGS, window: W, fetchFn: tagRepo(tags, seen) });
    expect(r.analysed.map((d) => d.name)).toEqual(['v2.0.0']);
    expect(seen.filter((s) => s.includes('/git/tags/')).map((s) => s.split('/').pop())).toEqual(['v2.0.0', 'v1.30.0', 'v1.29.0', 'v1.28.0']);
  });
});

describe('finding 1 (related): releases mode reads one page past the window start', () => {
  it('fetches the next page so predecessors of early releases are found', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      tag_name: `v3.0.${100 - i}`, draft: false, prerelease: false,
      published_at: i < 99 ? '2026-02-01T00:00:00Z' : '2025-12-01T00:00:00Z',
    }));
    const page2 = [{ tag_name: 'v2.9.0', draft: false, prerelease: false, published_at: '2025-06-01T00:00:00Z' }];
    const seen: string[] = [];
    const f: typeof fetch = async (u) => {
      const url = String(u);
      seen.push(url);
      const p = new URL(url);
      if (p.pathname === '/repos/a/b') return json({ full_name: 'a/b', html_url: 'x', private: false });
      if (p.pathname.endsWith('/releases')) return json(p.searchParams.get('page') === '1' ? page1 : p.searchParams.get('page') === '2' ? page2 : []);
      return json({ total_commits: 0, commits: [] });
    };
    await runAnalysis({ repo: 'a/b', settings: DEFAULT_SETTINGS, window: W, fetchFn: f, budget: 10 });
    expect(seen.some((s) => s.includes('page=2'))).toBe(true);
    expect(seen.some((s) => s.includes('page=3'))).toBe(false);
  });
});

describe('finding 2: running out of GitHub\'s hourly limit', () => {
  it('while listing deployments is reported as the rate limit, with the reset time', async () => {
    const e = await failure(runAnalysis({ repo: SANDBOX_REPO, settings: DEFAULT_SETTINGS, window: W, fetchFn: limitedSandbox(5) }));
    expect(e.kind).toBe('rate-limit');
    expect(e.resetAt?.getTime()).toBe(1791748800 * 1000);
  });

  it('while fetching change details falls back to a sample and says why', async () => {
    // 13 requests list the deployments; GitHub then allows 3 more.
    const r = await runAnalysis({ repo: SANDBOX_REPO, settings: DEFAULT_SETTINGS, window: W, fetchFn: limitedSandbox(16) });
    expect(r.collected.changesFetched).toBe(3);
    expect(r.collected.notices.join(' ')).toMatch(/hourly limit/i);
    expect(r.metrics.deploymentFrequency.count).toBe(8);
  });
});

describe('finding 3: rate-limit advice depends on whether a token was used', () => {
  it('suggests a token only when none was used', async () => {
    const withToken = await failure(runAnalysis({ repo: SANDBOX_REPO, token: 'ghp_x', settings: DEFAULT_SETTINGS, window: W, fetchFn: limitedSandbox(5, 5000) }));
    expect(withToken.kind).toBe('rate-limit');
    expect(messageFor(withToken).detail).not.toMatch(/add a (GitHub )?token/i);
    const without = await failure(runAnalysis({ repo: SANDBOX_REPO, settings: DEFAULT_SETTINGS, window: W, fetchFn: limitedSandbox(5) }));
    expect(messageFor(without).detail).toMatch(/add a GitHub token/i);
  });
});
