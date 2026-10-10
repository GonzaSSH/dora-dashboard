// Thin wrapper around fetch for the GitHub REST API.
// The token lives only in this object's private field: it is sent in the
// Authorization header and never included in URLs, errors or logs.
import { GITHUB_API } from '../config';

export type ErrorKind =
  | 'invalid-input'
  | 'not-found'
  | 'private'
  | 'no-deployments'
  | 'rate-limit'
  | 'network'
  | 'bad-token'
  | 'forbidden'
  | 'server'
  | 'budget';

export class GitHubError extends Error {
  readonly kind: ErrorKind;
  readonly resetAt?: Date;
  constructor(kind: ErrorKind, message: string, extra: { resetAt?: Date } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    this.resetAt = extra.resetAt;
  }
}

export interface RateLimit {
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface ClientOptions {
  token?: string;
  budget?: number;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  /** Called after each request with the running count, for progress display. */
  onRequest?: (used: number) => void;
}

export class GitHubClient {
  #token: string | undefined;
  readonly budget: number;
  readonly #fetch: typeof fetch;
  readonly #base: string;
  readonly #onRequest: ((used: number) => void) | undefined;
  requestsUsed = 0;
  rateLimit: RateLimit | null = null;

  constructor(opts: ClientOptions = {}) {
    this.#token = opts.token?.trim() || undefined;
    this.budget = opts.budget ?? 50;
    this.#fetch = opts.fetchFn ?? ((input, init) => fetch(input, init));
    this.#base = opts.baseUrl ?? GITHUB_API;
    this.#onRequest = opts.onRequest;
  }

  get hasToken(): boolean {
    return this.#token !== undefined;
  }

  /** Requests still allowed: the smaller of our budget and what GitHub says is left. */
  get requestsLeft(): number {
    const own = this.budget - this.requestsUsed;
    return this.rateLimit ? Math.min(own, this.rateLimit.remaining) : own;
  }

  async get<T>(path: string): Promise<T> {
    if (this.requestsLeft <= 0) {
      throw new GitHubError('budget', 'Request budget used up');
    }
    this.requestsUsed++;
    this.#onRequest?.(this.requestsUsed);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`;

    let res: Response;
    try {
      res = await this.#fetch(this.#base + path, { headers });
    } catch {
      throw new GitHubError('network', 'Could not reach GitHub');
    }
    this.#readRateHeaders(res);

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (res.ok) throw new GitHubError('server', `GitHub sent an unreadable response (${res.status})`);
    }
    if (res.ok) return body as T;

    const apiMessage = String((body as { message?: unknown } | null)?.message ?? '');
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (res.status === 429 || (res.status === 403 && (remaining === '0' || /rate limit/i.test(apiMessage)))) {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const retry = Number(res.headers.get('retry-after'));
      const resetAt = reset ? new Date(reset * 1000) : retry ? new Date(Date.now() + retry * 1000) : undefined;
      throw new GitHubError('rate-limit', 'GitHub rate limit reached', { resetAt });
    }
    // Error text below is ours, never GitHub's, so nothing echoed back can leak.
    if (res.status === 401) throw new GitHubError('bad-token', 'GitHub rejected the token (401)');
    if (res.status === 404) throw new GitHubError('not-found', `Not found (404): ${path}`);
    if (res.status === 403) throw new GitHubError('forbidden', `Access denied (403): ${path}`);
    if (res.status === 409) throw new GitHubError('not-found', `Repository is empty (409): ${path}`);
    throw new GitHubError('server', `GitHub returned ${res.status} for ${path}`);
  }

  #readRateHeaders(res: Response): void {
    const limit = res.headers.get('x-ratelimit-limit');
    const remaining = res.headers.get('x-ratelimit-remaining');
    const reset = res.headers.get('x-ratelimit-reset');
    if (limit && remaining && reset) {
      this.rateLimit = { limit: Number(limit), remaining: Number(remaining), resetAt: new Date(Number(reset) * 1000) };
    }
  }
}
