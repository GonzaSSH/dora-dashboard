// GitHub client: error mapping, budget, and token safety.
import { describe, expect, it } from 'vitest';
import { GitHubClient, GitHubError } from '../../src/github/client';
import { runAnalysis } from '../../src/run';
import { DEFAULT_SETTINGS } from '../../src/config';
import { errorFixtures, fixtureFetch, sandboxResponses, toResponse, type Recorded } from '../helpers/fixtures';

const TOKEN = 'ghp_TESTTOKEN0000000000000000000000000000';
const respondWith = (r: Recorded): typeof fetch => async () => toResponse(r);
const WINDOW = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') };

async function errorOf(p: Promise<unknown>): Promise<GitHubError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof GitHubError) return e;
    throw e;
  }
  throw new Error('expected an error');
}

describe('GitHubClient errors', () => {
  it('maps 404 to not-found', async () => {
    const c = new GitHubClient({ fetchFn: respondWith(errorFixtures.notFound) });
    expect((await errorOf(c.get('/repos/a/b'))).kind).toBe('not-found');
  });
  it('maps an exhausted primary limit to rate-limit with the reset time', async () => {
    const c = new GitHubClient({ fetchFn: respondWith(errorFixtures.rateLimited) });
    const e = await errorOf(c.get('/repos/a/b'));
    expect(e.kind).toBe('rate-limit');
    expect(e.resetAt?.toISOString()).toBe(new Date(1791748800 * 1000).toISOString());
  });
  it('maps a secondary limit (429) to rate-limit', async () => {
    const c = new GitHubClient({ fetchFn: respondWith(errorFixtures.secondaryRateLimited) });
    expect((await errorOf(c.get('/repos/a/b'))).kind).toBe('rate-limit');
  });
  it('maps a thrown fetch (offline, DNS, CORS) to network', async () => {
    const c = new GitHubClient({ fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
    expect((await errorOf(c.get('/repos/a/b'))).kind).toBe('network');
  });
  it('maps 401 to bad-token', async () => {
    const c = new GitHubClient({ fetchFn: respondWith({ status: 401, headers: {}, body: { message: 'Bad credentials' } }) });
    expect((await errorOf(c.get('/repos/a/b'))).kind).toBe('bad-token');
  });
  it('maps 5xx to server', async () => {
    const c = new GitHubClient({ fetchFn: respondWith({ status: 502, headers: {}, body: {} }) });
    expect((await errorOf(c.get('/repos/a/b'))).kind).toBe('server');
  });
  it('stops at the request budget instead of calling GitHub', async () => {
    let calls = 0;
    const c = new GitHubClient({ budget: 1, fetchFn: async () => { calls++; return toResponse(sandboxResponses['/repos/gonzassh/dora-sandbox']!); } });
    await c.get('/repos/gonzassh/dora-sandbox');
    expect((await errorOf(c.get('/repos/gonzassh/dora-sandbox/releases'))).kind).toBe('budget');
    expect(calls).toBe(1);
  });
  it('answers a repeated request from memory, without calling GitHub or counting it (v1.3)', async () => {
    let calls = 0;
    const c = new GitHubClient({ budget: 1, fetchFn: async () => { calls++; return toResponse(sandboxResponses['/repos/gonzassh/dora-sandbox']!); } });
    const first = await c.get('/repos/gonzassh/dora-sandbox');
    expect(await c.get('/repos/gonzassh/dora-sandbox')).toBe(first);
    expect(calls).toBe(1);
    expect(c.requestsUsed).toBe(1);
  });
  it('does not remember failed requests', async () => {
    let calls = 0;
    const c = new GitHubClient({ budget: 5, fetchFn: async () => { calls++; return toResponse(errorFixtures.notFound); } });
    await errorOf(c.get('/repos/a/b'));
    await errorOf(c.get('/repos/a/b'));
    expect(calls).toBe(2);
  });
  it('never spends more than GitHub says is left', async () => {
    // Like real GitHub, each response reports one fewer request left: 1, then 0.
    let left = 2;
    let calls = 0;
    const c = new GitHubClient({
      budget: 50,
      fetchFn: async () => {
        calls++;
        left--;
        return toResponse({ status: 200, headers: { 'x-ratelimit-remaining': String(left), 'x-ratelimit-limit': '60', 'x-ratelimit-reset': '1791748800' }, body: {} });
      },
    });
    await c.get('/x');
    await c.get('/y');
    // GitHub's own limit is reported as the rate limit (PLAN.md §3, review finding 2).
    expect((await errorOf(c.get('/z'))).kind).toBe('rate-limit');
    expect(calls).toBe(2);
  });
});

describe('token safety', () => {
  it('sends the token only in the Authorization header', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    await runAnalysis({ repo: 'GonzaSSH/dora-sandbox', token: TOKEN, settings: DEFAULT_SETTINGS, window: WINDOW, fetchFn: fixtureFetch(sandboxResponses, calls) });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
      expect(call.url).not.toContain(TOKEN);
    }
  });
  it('sends no Authorization header without a token', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    await runAnalysis({ repo: 'GonzaSSH/dora-sandbox', settings: DEFAULT_SETTINGS, window: WINDOW, fetchFn: fixtureFetch(sandboxResponses, calls) });
    for (const call of calls) expect(call.headers.has('authorization')).toBe(false);
  });
  it('never puts the token in an error message', async () => {
    const e = await errorOf(runAnalysis({ repo: 'a/b', token: TOKEN, settings: DEFAULT_SETTINGS, window: WINDOW,
      fetchFn: respondWith({ status: 401, headers: {}, body: { message: `Bad credentials ${TOKEN}` } }) }));
    expect(JSON.stringify({ m: e.message, s: e.stack })).not.toContain(TOKEN);
  });
});
