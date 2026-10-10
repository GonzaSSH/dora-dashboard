// Records real GitHub API responses for the sandbox repo into
// tests/fixtures/sandbox.json, so unit and e2e tests run offline.
//
//   npm run record-fixtures            (uses GITHUB_TOKEN if set, never saves it)
//
// It deliberately does not reuse the app's own code, so a bug in the app
// can't shape the recorded data. Rate-limit headers are dropped because they
// depend on who recorded the fixtures, not on the repo.
import { writeFileSync } from 'node:fs';

const REPO = process.argv[2] ?? 'GonzaSSH/dora-sandbox';
const OUT = process.argv[3] ?? 'tests/fixtures/sandbox.json';
const API = 'https://api.github.com';
const KEEP_HEADERS = ['content-type', 'link'];

type Recorded = { status: number; headers: Record<string, string>; body: unknown };
const fixtures: Record<string, Recorded> = {};

async function get(path: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(API + path, { headers });
  const body: unknown = await res.json();
  const kept: Record<string, string> = {};
  for (const h of KEEP_HEADERS) {
    const v = res.headers.get(h);
    if (v) kept[h] = v;
  }
  fixtures[path.toLowerCase()] = { status: res.status, headers: kept, body };
  if (!res.ok) throw new Error(`${res.status} on ${path}: ${JSON.stringify(body)}`);
  return body;
}

// Version order including pre-releases (1.6.0-beta.1 < 1.6.0). Non-versions sort last.
function versionKey(name: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-[a-z]+\.?(\d+)?)?$/i.exec(name);
  if (!m) return null;
  const pre = name.includes('-') ? Number(m[4] ?? 0) : Number.MAX_SAFE_INTEGER;
  return [Number(m[1]), Number(m[2]), Number(m[3]), pre];
}
function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

const base = `/repos/${REPO}`;
await get(base);
await get(`${base}/releases?per_page=100&page=1`);
const refs = (await get(`${base}/git/matching-refs/tags`)) as {
  ref: string;
  object: { sha: string; type: string };
}[];
for (const r of refs) {
  await get(r.object.type === 'tag' ? `${base}/git/tags/${r.object.sha}` : `${base}/git/commits/${r.object.sha}`);
}
const versions = refs
  .map((r) => r.ref.replace('refs/tags/', ''))
  .filter((n) => versionKey(n))
  .sort((a, b) => cmp(versionKey(a)!, versionKey(b)!));
// Every adjacent pair, both across all versions and across stable versions only,
// covers every predecessor the app can pick with any sensible pattern.
const stable = versions.filter((v) => !v.includes('-'));
const pairs = new Set<string>();
for (const list of [versions, stable])
  for (let i = 1; i < list.length; i++) pairs.add(`${list[i - 1]}...${list[i]}`);
for (const p of pairs) await get(`${base}/compare/${p}`);

writeFileSync(OUT, JSON.stringify({ repo: REPO, recordedAt: new Date().toISOString(), responses: fixtures }, null, 1) + '\n');
console.log(`Recorded ${Object.keys(fixtures).length} responses to ${OUT}`);
