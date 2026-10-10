// Everything a shared link needs to reproduce the same numbers (v1.2): repository and dates
// (or a demo id), every setting that differs from the default, and manual corrections.
// Never a token.
import { DEFAULT_SETTINGS } from './config';
import type { Settings } from './types';
import type { Corrections } from './metrics/corrections';

export interface PageState {
  repo?: string;
  from?: string;
  to?: string;
  demo?: string;
  settings: Settings;
  corrections: Corrections;
}

const SOURCES = ['auto', 'releases', 'tags'] as const;
const REWORK = ['fixes', 'patches'] as const;

export function readState(p: URLSearchParams): PageState {
  const s: Settings = { ...DEFAULT_SETTINGS };
  const source = p.get('source');
  if (source && (SOURCES as readonly string[]).includes(source)) s.source = source as Settings['source'];
  if (p.has('pattern')) s.versionPattern = p.get('pattern')!;
  if (p.get('prerelease') === 'keep') s.skipPrereleases = false;
  if (p.get('quickpatch') === 'off') s.useQuickPatch = false;
  const hours = Number(p.get('hours'));
  if (p.has('hours') && Number.isFinite(hours) && hours > 0) s.quickPatchHours = hours;
  if (p.get('revert') === 'off') s.useRevert = false;
  if (p.has('revertpattern')) s.revertPattern = p.get('revertpattern')!;
  const rework = p.get('rework');
  if (rework && (REWORK as readonly string[]).includes(rework)) s.reworkRule = rework as Settings['reworkRule'];

  const corrections: Corrections = {
    // failed=v1.4.1 (fixed by the next release), failed=v1.4.1:v1.5.2, failed=v1.4.1:none.
    // Git tag names can't contain ':', so it is a safe separator.
    failed: p.getAll('failed').filter(Boolean).map((v) => {
      const [name, fix] = v.split(':', 2) as [string, string | undefined];
      return { name, fixedBy: fix === undefined ? 'next' : fix === 'none' ? null : fix };
    }),
    notFailed: p.getAll('notfailed').filter(Boolean),
  };
  const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    repo: p.get('repo') ?? undefined,
    from: day(p.get('from')),
    to: day(p.get('to')),
    demo: p.get('demo') ?? undefined,
    settings: s,
    corrections,
  };
}

export function writeState(st: PageState): URLSearchParams {
  const p = new URLSearchParams();
  if (st.demo) {
    // Saved demos always use the default settings; only corrections travel with them.
    p.set('demo', st.demo);
  } else {
    if (st.repo) p.set('repo', st.repo);
    if (st.from) p.set('from', st.from);
    if (st.to) p.set('to', st.to);
    const s = st.settings;
    const d = DEFAULT_SETTINGS;
    if (s.source !== d.source) p.set('source', s.source);
    if (s.versionPattern !== d.versionPattern) p.set('pattern', s.versionPattern);
    if (s.skipPrereleases !== d.skipPrereleases) p.set('prerelease', 'keep');
    if (s.useQuickPatch !== d.useQuickPatch) p.set('quickpatch', 'off');
    if (s.quickPatchHours !== d.quickPatchHours) p.set('hours', String(s.quickPatchHours));
    if (s.useRevert !== d.useRevert) p.set('revert', 'off');
    if (s.revertPattern !== d.revertPattern) p.set('revertpattern', s.revertPattern);
    if (s.reworkRule !== d.reworkRule) p.set('rework', s.reworkRule);
  }
  for (const f of st.corrections.failed) {
    p.append('failed', f.fixedBy === 'next' ? f.name : `${f.name}:${f.fixedBy ?? 'none'}`);
  }
  for (const n of st.corrections.notFailed) p.append('notfailed', n);
  return p;
}
