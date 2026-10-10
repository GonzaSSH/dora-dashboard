import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion } from '../../src/metrics/version';

describe('parseVersion', () => {
  it('reads plain and v-prefixed versions', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: null });
    expect(parseVersion('10.0.12')).toEqual({ major: 10, minor: 0, patch: 12, pre: null });
  });
  it('reads pre-releases', () => {
    expect(parseVersion('v1.6.0-beta.1')?.pre).toBe('beta.1');
  });
  it('rejects non-versions', () => {
    expect(parseVersion('experiment')).toBeNull();
    expect(parseVersion('v1.2')).toBeNull();
  });
});

describe('compareVersions', () => {
  const sorted = (names: string[]) =>
    [...names].sort((a, b) => compareVersions(parseVersion(a)!, parseVersion(b)!));
  it('orders numerically, not alphabetically', () => {
    expect(sorted(['v1.10.0', 'v1.9.0', 'v1.2.10', 'v1.2.9'])).toEqual(['v1.2.9', 'v1.2.10', 'v1.9.0', 'v1.10.0']);
  });
  it('puts a pre-release before its release', () => {
    expect(sorted(['v1.6.0', 'v1.6.0-beta.2', 'v1.6.0-beta.10', 'v1.5.9'])).toEqual([
      'v1.5.9', 'v1.6.0-beta.2', 'v1.6.0-beta.10', 'v1.6.0',
    ]);
  });
});
