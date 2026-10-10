export interface RepoRef {
  owner: string;
  name: string;
}

const PART = /^(?!\.+$)[A-Za-z0-9._-]+$/;

/** Accepts "owner/name" or a github.com URL. Returns null for anything else. */
export function parseRepo(input: string): RepoRef | null {
  const s = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const parts = s.split('/');
  if (parts.length !== 2) return null;
  const [owner, name] = parts as [string, string];
  if (!PART.test(owner) || !PART.test(name)) return null;
  return { owner, name };
}
