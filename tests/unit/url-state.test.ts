// Shared links carry repo, dates, non-default settings and corrections (v1.2).
import { describe, expect, it } from 'vitest';
import { readState, writeState } from '../../src/url-state';
import { DEFAULT_SETTINGS } from '../../src/config';

describe('url state', () => {
  it('writes only what differs from the defaults', () => {
    const p = writeState({ repo: 'a/b', from: '2026-01-01', to: '2026-03-31', settings: DEFAULT_SETTINGS, corrections: { failed: [], notFailed: [] } });
    expect(p.toString()).toBe('repo=a%2Fb&from=2026-01-01&to=2026-03-31');
  });

  it('round-trips every non-default setting and the corrections', () => {
    const settings = {
      source: 'tags' as const, versionPattern: '^v\\d+$', skipPrereleases: false, useQuickPatch: false,
      quickPatchHours: 24, useRevert: false, revertPattern: '^Back out', reworkRule: 'patches' as const,
    };
    const corrections = { failed: [{ name: 'v1.4.1', fixedBy: 'next' as const }, { name: 'v1.0.0', fixedBy: 'v1.1.0' }, { name: 'v1.5.2', fixedBy: null }], notFailed: ['v1.2.0'] };
    const p = writeState({ repo: 'a/b', from: '2026-01-01', to: '2026-03-31', settings, corrections });
    const back = readState(new URLSearchParams(p.toString()));
    expect(back.settings).toEqual(settings);
    expect(back.corrections).toEqual(corrections);
    expect(back.repo).toBe('a/b');
  });

  it('a demo link keeps its id and corrections, never settings or a repo', () => {
    const p = writeState({ demo: 'sandbox', repo: 'x/y', settings: { ...DEFAULT_SETTINGS, quickPatchHours: 24 }, corrections: { failed: [], notFailed: ['v1.2.0'] } });
    expect(p.toString()).toBe('demo=sandbox&notfailed=v1.2.0');
  });

  it('ignores invalid values instead of failing', () => {
    const s = readState(new URLSearchParams('repo=a/b&source=nonsense&hours=-3&rework=all&prerelease=maybe'));
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('never reads or writes a token', () => {
    const s = readState(new URLSearchParams('repo=a/b&token=ghp_secret'));
    expect(JSON.stringify(s)).not.toContain('ghp_secret');
  });
});
