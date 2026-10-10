export interface Change {
  sha: string;
  message: string;
  authoredAt: Date;
  /** Number of parent commits; more than one means a merge commit. */
  parents: number;
}

export interface Deployment {
  /** Tag name (also used for releases). */
  name: string;
  time: Date;
  /** Commits since the predecessor; null when unknown (no predecessor, or not fetched). */
  changes: Change[] | null;
  /** True when GitHub returned only part of the commit list. */
  changesTruncated: boolean;
}

/** [start, end): start included, end excluded. */
export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface Settings {
  source: 'auto' | 'releases' | 'tags';
  versionPattern: string;
  skipPrereleases: boolean;
  useQuickPatch: boolean;
  quickPatchHours: number;
  useRevert: boolean;
  revertPattern: string;
  fixPattern: string;
}
