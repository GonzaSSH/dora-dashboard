import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  source: 'auto',
  versionPattern: '^v?\\d+\\.\\d+\\.\\d+$',
  skipPrereleases: true,
  useQuickPatch: true,
  quickPatchHours: 48,
  useRevert: true,
  revertPattern: '^Revert',
  reworkRule: 'fixes',
};

export const DEFAULT_WINDOW_DAYS = 90;
/** Leaves headroom under GitHub's 60 requests/hour for unauthenticated use. */
export const BUDGET_WITHOUT_TOKEN = 50;
export const BUDGET_WITH_TOKEN = 1000;
export const GITHUB_API = 'https://api.github.com';
