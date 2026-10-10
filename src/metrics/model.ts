// Applies the proxy rules from PLAN.md §2 to a list of deployments.
import type { Change, Deployment, Settings, TimeWindow } from '../types';
import { compareVersions, parseVersion } from './version';
import { parseRevert, quotedTitle, sameCommit } from './revert';

const HOUR = 3_600_000;

export interface Analysed {
  name: string;
  time: Date;
  predecessor: string | null;
  changes: Change[] | null;
  changesTruncated: boolean;
  /** Lead time per non-merge commit, in hours; null when changes are unknown. */
  leadTimesHours: number[] | null;
  failed: boolean;
  failureReason: string | null;
  /** The deployment that fixed this one (only when failed). */
  remediation: string | null;
  /** Failed deployments this one fixed. */
  remediates: string[];
  rework: boolean;
  reworkReason: string | null;
  /** Hours from this failed deployment to the first good one after it. */
  recoveryHours: number | null;
  /** First lines of reverts in this deployment that couldn't be matched to a release. */
  unmatchedReverts: string[];
}

/**
 * The deployment this one builds on: the highest lower version released earlier.
 * For names that are not versions, the previous deployment in time.
 */
export function findPredecessor(d: Deployment, all: Deployment[]): Deployment | null {
  const earlier = all.filter((e) => e !== d && e.time < d.time);
  const v = parseVersion(d.name);
  if (v) {
    let best: Deployment | null = null;
    let bestV = null;
    for (const e of earlier) {
      const ev = parseVersion(e.name);
      if (!ev || compareVersions(ev, v) >= 0) continue;
      if (!bestV || compareVersions(ev, bestV) > 0) {
        best = e;
        bestV = ev;
      }
    }
    return best;
  }
  return earlier.reduce<Deployment | null>((acc, e) => (!acc || e.time > acc.time ? e : acc), null);
}

export function inWindow(d: { time: Date }, w: TimeWindow): boolean {
  return d.time >= w.start && d.time < w.end;
}

export function compilePattern(pattern: string): RegExp {
  return new RegExp(pattern, 'i');
}

export function analyse(all: Deployment[], window: TimeWindow, settings: Settings): Analysed[] {
  const deps = all
    .filter((d) => inWindow(d, window))
    .sort((a, b) => a.time.getTime() - b.time.getTime() || a.name.localeCompare(b.name));
  const revertRe = compilePattern(settings.revertPattern);
  const pred = new Map(deps.map((d) => [d, findPredecessor(d, all)]));

  // Failure: each deployment's remediation is the earliest one found by the enabled signals.
  const candidates = new Map<Deployment, { by: Deployment; reason: string }[]>();
  const addCandidate = (d: Deployment, c: { by: Deployment; reason: string }) =>
    candidates.set(d, [...(candidates.get(d) ?? []), c]);

  if (settings.useQuickPatch) {
    for (const d of deps) {
      const v = parseVersion(d.name);
      if (!v || v.pre !== null) continue;
      for (const e of deps) {
        const ev = parseVersion(e.name);
        const dt = e.time.getTime() - d.time.getTime();
        if (ev && ev.pre === null && ev.major === v.major && ev.minor === v.minor && ev.patch === v.patch + 1 &&
            dt > 0 && dt <= settings.quickPatchHours * HOUR) {
          addCandidate(d, { by: e, reason: `Quick patch: ${e.name} followed within ${settings.quickPatchHours} hours` });
        }
      }
    }
  }

  // Revert (v1.1, PLAN.md §2): a revert fails the release that shipped what it reverts.
  // 1. By commit id (named directly, or a pull request's merge commit looked up by the collector).
  // 2. Otherwise by the quoted title, which also catches commits copied between version
  //    branches under a new id. Among several earlier releases, the revert's own line wins.
  // A revert of a change in its own release fails nothing. Anything else is unmatched.
  const unmatched = new Map<Deployment, string[]>();
  if (settings.useRevert) {
    for (const e of deps) {
      for (const change of e.changes ?? []) {
        const target = parseRevert(change.message, revertRe);
        if (!target) continue;
        const others = (e.changes ?? []).filter((x) => x !== change);
        const earlier = deps.filter((d) => d !== e && d.time < e.time);
        const sha = target.kind === 'commit' ? target.sha : target.kind === 'pull' ? change.revertTarget ?? null : null;

        if (sha && others.some((x) => sameCommit(x.sha, sha))) continue; // reverted before release
        let shipped = sha ? pickRelease(earlier.filter((d) => d.changes?.some((x) => sameCommit(x.sha, sha))), e) : null;
        if (!shipped) {
          const title = quotedTitle(change.message);
          const hasTitle = (x: Change) => (x.message.split('\n')[0] ?? '') === title;
          if (title && others.some(hasTitle)) continue; // a copy reverted in its own release
          if (title) shipped = pickRelease(earlier.filter((d) => d.changes?.some(hasTitle)), e);
        }
        if (shipped) {
          addCandidate(shipped, { by: e, reason: `Revert: ${e.name} contains ‘${firstLine(change.message)}’` });
        } else {
          unmatched.set(e, [...(unmatched.get(e) ?? []), firstLine(change.message)]);
        }
      }
    }
  }

  const remediation = new Map<Deployment, { by: Deployment; reason: string }>();
  for (const [d, list] of candidates) {
    list.sort((a, b) => a.by.time.getTime() - b.by.time.getTime());
    remediation.set(d, list[0]!);
  }

  return deps.map((d) => {
    const fix = remediation.get(d);
    const remediates = deps.filter((x) => remediation.get(x)?.by === d).map((x) => x.name);

    let recoveryHours: number | null = null;
    if (fix) {
      let cur: Deployment = d;
      while (remediation.has(cur)) cur = remediation.get(cur)!.by;
      recoveryHours = (cur.time.getTime() - d.time.getTime()) / HOUR;
    }

    // Rework (v1.1): a release that fixed a detected failure. The broad, non-default setting
    // also counts every patch release, whatever its commits say.
    const reasons: string[] = [];
    if (remediates.length > 0) reasons.push(`Fixes failed deployment ${remediates.join(', ')}`);
    const p = pred.get(d);
    const v = parseVersion(d.name);
    const pv = p ? parseVersion(p.name) : null;
    if (settings.reworkRule === 'patches' && v && pv && v.major === pv.major && v.minor === pv.minor && v.patch > pv.patch) {
      reasons.push(`Patch release (${p!.name} → ${d.name})`);
    }

    return {
      name: d.name,
      time: d.time,
      predecessor: p?.name ?? null,
      changes: d.changes,
      changesTruncated: d.changesTruncated,
      leadTimesHours: d.changes
        ? d.changes
            .filter((c) => c.parents <= 1)
            .map((c) => Math.max(0, (d.time.getTime() - c.authoredAt.getTime()) / HOUR))
        : null,
      failed: fix !== undefined,
      failureReason: fix?.reason ?? null,
      remediation: fix?.by.name ?? null,
      remediates,
      rework: reasons.length > 0,
      reworkReason: reasons.length ? reasons.join('; ') : null,
      recoveryHours,
      unmatchedReverts: unmatched.get(d) ?? [],
    };
  });
}

/** The release on the revert's own version line, else the most recent one. */
function pickRelease(candidates: Deployment[], revert: Deployment): Deployment | null {
  if (candidates.length === 0) return null;
  const line = (n: string) => {
    const v = parseVersion(n);
    return v ? `${v.major}.${v.minor}` : null;
  };
  const byRecency = [...candidates].sort((a, b) => b.time.getTime() - a.time.getTime());
  return byRecency.find((d) => line(d.name) !== null && line(d.name) === line(revert.name)) ?? byRecency[0]!;
}

function firstLine(s: string): string {
  return s.split('\n')[0] ?? '';
}
