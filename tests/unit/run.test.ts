// Whole-run behaviour for each user-facing error case and for sampling.
import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../../src/run';
import { GitHubError } from '../../src/github/client';
import { DEFAULT_SETTINGS } from '../../src/config';
import { messageFor } from '../../src/messages';
import { parseRepo } from '../../src/repo';
import { errorFixtures, fixtureFetch, sandboxResponses, type FixtureMap } from '../helpers/fixtures';

const WINDOW = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') };
const base = '/repos/gonzassh/dora-sandbox';

async function kindOf(map: FixtureMap, repo: string, extra: Partial<Parameters<typeof runAnalysis>[0]> = {}) {
  try {
    await runAnalysis({ repo, settings: DEFAULT_SETTINGS, window: WINDOW, fetchFn: fixtureFetch(map), ...extra });
  } catch (e) {
    if (e instanceof GitHubError) return e.kind;
    throw e;
  }
  return 'ok';
}

describe('error cases', () => {
  it('repo not found', async () => {
    expect(await kindOf({ '/repos/nobody/nothing': errorFixtures.notFound }, 'nobody/nothing')).toBe('not-found');
  });
  it('private repo seen with a token', async () => {
    expect(await kindOf({ '/repos/example/secret': errorFixtures.privateRepoWithToken }, 'example/secret', { token: 'x' })).toBe('private');
  });
  it('repo with no releases and no tags', async () => {
    expect(await kindOf(errorFixtures.emptyRepo, 'example/empty-repo')).toBe('no-deployments');
  });
  it('tags exist but none in the window', async () => {
    const later = { start: new Date('2027-01-01T00:00:00Z'), end: new Date('2027-02-01T00:00:00Z') };
    expect(await kindOf(sandboxResponses, 'GonzaSSH/dora-sandbox', { window: later })).toBe('no-deployments');
  });
  it('rate limit reached', async () => {
    expect(await kindOf({ [base]: errorFixtures.rateLimited }, 'GonzaSSH/dora-sandbox')).toBe('rate-limit');
  });
  it('no network', async () => {
    const offline: typeof fetch = async () => { throw new TypeError('Failed to fetch'); };
    try {
      await runAnalysis({ repo: 'GonzaSSH/dora-sandbox', settings: DEFAULT_SETTINGS, window: WINDOW, fetchFn: offline });
      expect.fail('should throw');
    } catch (e) {
      expect((e as GitHubError).kind).toBe('network');
    }
  });
  it('invalid repo text and invalid patterns are caught before any request', async () => {
    expect(await kindOf({}, 'not a repo')).toBe('invalid-input');
    expect(await kindOf({}, 'GonzaSSH/dora-sandbox', { settings: { ...DEFAULT_SETTINGS, versionPattern: '(' } })).toBe('invalid-input');
  });
  it('every error kind has a plain-language message', () => {
    for (const kind of ['not-found', 'private', 'no-deployments', 'rate-limit', 'network', 'bad-token', 'forbidden', 'server', 'budget', 'invalid-input'] as const) {
      // invalid-input shows its own message to the user, so give it a realistic one.
      const text = kind === 'invalid-input' ? 'Enter a repository as owner/name.' : 'x';
      const m = messageFor(new GitHubError(kind, text, { resetAt: new Date('2026-10-10T18:00:00Z') }));
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.detail.length).toBeGreaterThan(10);
    }
    expect(messageFor(new GitHubError('not-found', 'x')).detail).toMatch(/private/i);
  });
});

describe('sampling when the request budget runs out', () => {
  it('still answers, measures the newest deployments first and says so', async () => {
    // Sandbox v1.3: 17 requests list the 10 deployments (EXPECTED.md: 3 + 14 tag dates), leaving 3 of 20.
    const r = await runAnalysis({ repo: 'GonzaSSH/dora-sandbox', settings: DEFAULT_SETTINGS, window: WINDOW, fetchFn: fixtureFetch(sandboxResponses), budget: 20 });
    expect(r.collected.changesNeeded).toBe(10);
    expect(r.collected.changesFetched).toBe(3);
    expect(r.analysed.filter((d) => d.changes !== null).map((d) => d.name)).toEqual(['v1.5.0', 'v1.5.1', 'v1.5.2']);
    expect(r.collected.notices.join(' ')).toMatch(/3 of 10/);
    expect(r.metrics.deploymentFrequency.count).toBe(10);
  });
});

describe('parseRepo', () => {
  it('accepts owner/name and GitHub URLs', () => {
    expect(parseRepo('GonzaSSH/dora-sandbox')).toEqual({ owner: 'GonzaSSH', name: 'dora-sandbox' });
    expect(parseRepo(' https://github.com/grafana/grafana.git/ ')).toEqual({ owner: 'grafana', name: 'grafana' });
    expect(parseRepo('github.com/a-b/c.d_e')).toEqual({ owner: 'a-b', name: 'c.d_e' });
  });
  it('rejects anything else', () => {
    for (const bad of ['', 'grafana', 'a/b/c', 'a b/c', '../x/y', 'a/..']) expect(parseRepo(bad)).toBeNull();
  });
});
