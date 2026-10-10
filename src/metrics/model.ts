// Applies the proxy rules from PLAN.md §2 to a list of deployments.
import type { Change, Deployment, Settings, TimeWindow } from '../types';
import { compareVersions, parseVersion } from './version';

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
  const fixRe = compilePattern(settings.fixPattern);
  const pred = new Map(deps.map((d) => [d, findPredecessor(d, all)]));

  // Failure: find each deployment's remediation (earliest of the enabled signals).
  const remediation = new Map<Deployment, { by: Deployment; reason: string }>();
  for (const d of deps) {
    const candidates: { by: Deployment; reason: string }[] = [];
    const v = parseVersion(d.name);
    if (settings.useQuickPatch && v && v.pre === null) {
      for (const e of deps) {
        const ev = parseVersion(e.name);
        const dt = e.time.getTime() - d.time.getTime();
        if (ev && ev.pre === null && ev.major === v.major && ev.minor === v.minor && ev.patch === v.patch + 1 &&
            dt > 0 && dt <= settings.quickPatchHours * HOUR) {
          candidates.push({ by: e, reason: `Quick patch: ${e.name} followed within ${settings.quickPatchHours} hours` });
        }
      }
    }
    if (settings.useRevert) {
      for (const e of deps) {
        if (pred.get(e) !== d) continue;
        const revert = e.changes?.find((c) => revertRe.test(c.message));
        if (revert) {
          candidates.push({ by: e, reason: `Revert: ${e.name} contains ‘${firstLine(revert.message)}’` });
        }
      }
    }
    candidates.sort((a, b) => a.by.time.getTime() - b.by.time.getTime());
    if (candidates[0]) remediation.set(d, candidates[0]);
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

    let reworkReason: string | null = null;
    if (remediates.length > 0) {
      reworkReason = `Fixes failed deployment ${remediates.join(', ')}`;
    } else {
      const p = pred.get(d);
      const v = parseVersion(d.name);
      const pv = p ? parseVersion(p.name) : null;
      const code = d.changes?.filter((c) => c.parents <= 1) ?? [];
      if (v && pv && v.major === pv.major && v.minor === pv.minor && v.patch > pv.patch &&
          code.length > 0 && code.every((c) => fixRe.test(c.message))) {
        reworkReason = 'Patch release containing only fixes';
      }
    }

    return {
      name: d.name,
      time: d.time,
      predecessor: pred.get(d)?.name ?? null,
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
      rework: reworkReason !== null,
      reworkReason,
      recoveryHours,
    };
  });
}

function firstLine(s: string): string {
  return s.split('\n')[0] ?? '';
}
