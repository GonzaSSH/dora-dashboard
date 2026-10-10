// Serves recorded GitHub API responses instead of the network.
// Shared by the Vitest unit tests and the Playwright e2e tests.
import sandboxFile from '../fixtures/sandbox.json' with { type: 'json' };
import errorsFile from '../fixtures/errors.json' with { type: 'json' };
import prRevertsFile from '../fixtures/pr-reverts.json' with { type: 'json' };

export interface Recorded {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
export type FixtureMap = Record<string, Recorded>;

export const sandboxResponses = sandboxFile.responses as FixtureMap;
export const prRevertResponses = prRevertsFile.responses as FixtureMap;
export const errorFixtures = errorsFile as unknown as {
  notFound: Recorded;
  rateLimited: Recorded;
  secondaryRateLimited: Recorded;
  privateRepoWithToken: Recorded;
  emptyRepo: FixtureMap;
};

/** Looks up a full api.github.com URL in a fixture map (keys are lower-cased path + query). */
export function lookup(map: FixtureMap, url: string): Recorded | undefined {
  const u = new URL(url);
  return map[(u.pathname + u.search).toLowerCase()];
}

export function toResponse(r: Recorded): Response {
  return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
}

/** A fetch replacement for unit tests. Unrecorded URLs fail loudly. */
export function fixtureFetch(map: FixtureMap, calls: { url: string; headers: Headers }[] = []): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    const r = lookup(map, url);
    if (!r) throw new Error(`Unrecorded request in test: ${url}`);
    return toResponse(r);
  };
}
