// Manual corrections of the failure detection (PLAN.md §2b). Applied on top of the automatic
// result, so they also work on saved demo results and need no GitHub requests.
import type { Settings } from '../types';
import type { Analysed } from './model';
import { parseVersion } from './version';

export interface Corrections {
  /** Releases marked failed. fixedBy: a later release, 'next' (default) or null (not fixed in the period). */
  failed: { name: string; fixedBy: string | 'next' | null }[];
  /** Releases marked not failed. */
  notFailed: string[];
}

export const NO_CORRECTIONS: Corrections = { failed: [], notFailed: [] };

export function hasCorrections(c: Corrections): boolean {
  return c.failed.length > 0 || c.notFailed.length > 0;
}

const HOUR = 3_600_000;

export function applyCorrections(
  auto: Analysed[],
  c: Corrections,
  settings: Settings,
): { analysed: Analysed[]; corrected: string[]; ignored: string[] } {
  const deps = auto.map((d) => ({ ...d, manuallyCorrected: false }));
  const index = new Map(deps.map((d, i) => [d.name, i]));
  const ignored: string[] = [];
  const corrected = new Set<string>();

  for (const f of c.failed) {
    const i = index.get(f.name);
    if (i === undefined) {
      ignored.push(f.name);
      continue;
    }
    const d = deps[i]!;
    let fix: string | null;
    if (f.fixedBy === 'next') {
      fix = deps.find((x) => x.time > d.time)?.name ?? null;
    } else if (f.fixedBy === null) {
      fix = null;
    } else {
      const j = index.get(f.fixedBy);
      if (j === undefined || deps[j]!.time <= d.time) {
        ignored.push(f.name);
        continue;
      }
      fix = f.fixedBy;
    }
    deps[i] = {
      ...d,
      failed: true,
      remediation: fix,
      failureReason: fix ? `Marked as failed by hand, fixed by ${fix}` : 'Marked as failed by hand, not fixed in this period',
      manuallyCorrected: true,
    };
    corrected.add(d.name);
  }
  for (const name of c.notFailed) {
    const i = index.get(name);
    if (i === undefined) {
      ignored.push(name);
      continue;
    }
    deps[i] = { ...deps[i]!, failed: false, remediation: null, failureReason: null, manuallyCorrected: true };
    corrected.add(name);
  }
  if (corrected.size === 0) return { analysed: auto.map((d) => ({ ...d, manuallyCorrected: false })), corrected: [], ignored };

  // Recalculate everything that depends on the failure flags: remediates, rework, recovery.
  const byName = new Map(deps.map((d) => [d.name, d]));
  const result = deps.map((d) => {
    const remediates = deps.filter((x) => x.failed && x.remediation === d.name).map((x) => x.name);
    const reasons: string[] = [];
    if (remediates.length > 0) reasons.push(`Fixes failed deployment ${remediates.join(', ')}`);
    const v = parseVersion(d.name);
    const pv = d.predecessor ? parseVersion(d.predecessor) : null;
    if (settings.reworkRule === 'patches' && v && pv && v.major === pv.major && v.minor === pv.minor && v.patch > pv.patch) {
      reasons.push(`Patch release (${d.predecessor} → ${d.name})`);
    }
    let recoveryHours: number | null = null;
    if (d.failed) {
      let cur = d;
      while (cur.failed && cur.remediation) cur = byName.get(cur.remediation)!;
      recoveryHours = cur.failed ? null : (cur.time.getTime() - d.time.getTime()) / HOUR;
    }
    return { ...d, remediates, rework: reasons.length > 0, reworkReason: reasons.length ? reasons.join('; ') : null, recoveryHours };
  });
  return { analysed: result, corrected: result.filter((d) => corrected.has(d.name)).map((d) => d.name), ignored };
}
