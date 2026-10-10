// What a revert commit says it reverts (PLAN.md §2, v1.1).
export type RevertTarget =
  | { kind: 'commit'; sha: string }
  | { kind: 'pull'; repo: string | null; number: number }
  | { kind: 'unknown' };

const COMMIT_RE = /This reverts commit ([0-9a-f]{7,40})\b/i;
// GitHub's Revert button writes "Reverts owner/repo#123" on its own line. The "(#12)" in the
// title is the revert's own pull request, so only the "Reverts" line is read.
const PULL_RE = /^Reverts\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\s*$/im;

/** null when the commit isn't a revert (its first line doesn't match the revert pattern). */
export function parseRevert(message: string, revertRe: RegExp): RevertTarget | null {
  const firstLine = message.split('\n')[0] ?? '';
  if (!revertRe.test(firstLine)) return null;
  const commit = COMMIT_RE.exec(message);
  if (commit) return { kind: 'commit', sha: commit[1]!.toLowerCase() };
  const pull = PULL_RE.exec(message);
  if (pull) return { kind: 'pull', repo: pull[1] ?? null, number: Number(pull[2]) };
  return { kind: 'unknown' };
}

/** Commit ids match when one is a prefix of the other (git abbreviates ids). */
export function sameCommit(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.length <= y.length ? y.startsWith(x) : x.startsWith(y);
}
