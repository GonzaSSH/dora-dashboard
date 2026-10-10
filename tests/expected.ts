// The values from sandbox/EXPECTED.md, transcribed once and shared by the unit
// tests, the e2e tests and the live check. Change EXPECTED.md first, never this alone.
export const SANDBOX_REPO = 'GonzaSSH/dora-sandbox';
export const SANDBOX_WINDOW = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') };

export const EXPECTED = {
  deploymentFrequency: { perWeek: 70 / 90, count: 10, days: 90, shown: '0.78 per week' },
  leadTime: { medianHours: 49, commitCount: 18, shown: '2.0 days' },
  changeFailureRate: { rate: 0.4, failed: 4, shown: '40%' },
  recoveryTime: { medianHours: 33, count: 4, shown: '33 hours' },
  reworkRate: { rate: 0.4, rework: 4, shown: '40%' },
} as const;

/** EXPECTED.md Step 5, non-default setting "every patch release is rework". */
export const EXPECTED_BROAD_REWORK = { rate: 0.5, rework: 5, shown: '50%' } as const;
export const SANDBOX_REQUESTS = 25;

// sandbox/EXPECTED.md, "Fixture case: reverts that name a pull request".
export const PR_REVERTS_REPO = 'example/pr-reverts';
export const EXPECTED_PR_REVERTS = {
  deploymentFrequency: { perWeek: 28 / 90, count: 4, shown: '0.31 per week' },
  leadTime: { medianHours: 108, commitCount: 6, shown: '4.5 days' },
  changeFailureRate: { rate: 0.25, failed: 1, shown: '25%' },
  recoveryTime: { medianHours: 288, count: 1, shown: '12.0 days' },
  reworkRate: { rate: 0.25, rework: 1, shown: '25%' },
  unmatchedReverts: 2,
  requests: 8,
} as const;

/** EXPECTED.md, "Fixture case: reverts of copied commits". */
export const EXPECTED_COPIED_REVERTS = {
  deployments: 5,
  failed: ['v3.0.1'],
  remediationOf: { 'v3.0.1': 'v3.0.2' },
  changeFailureRate: 0.2,
  recoveryHours: 120,
  reworkRate: 0.2,
  unmatched: ['Revert "feat: y"'],
} as const;

/** EXPECTED.md, "Manual corrections": v1.4.1 marked failed (fixed by v1.5.0), v1.2.0 not failed. */
export const EXPECTED_CORRECTED = {
  failed: ['v1.3.0', 'v1.4.1', 'v1.5.0', 'v1.5.1'],
  rework: ['v1.4.0', 'v1.5.0', 'v1.5.1', 'v1.5.2'],
  deploymentFrequency: { shown: '0.78 per week' },
  leadTime: { shown: '2.0 days' },
  changeFailureRate: { rate: 0.4, shown: '40%' },
  recoveryTime: { medianHours: 46, count: 4, shown: '46 hours' },
  reworkRate: { rate: 0.4, shown: '40%' },
} as const;

/** EXPECTED.md, "A failure that isn't fixed in the period": v1.5.2 marked failed. */
export const EXPECTED_UNFIXED = {
  changeFailureRate: { rate: 0.5, failed: 5 },
  recoveryTime: { medianHours: 34, count: 2, unrecovered: 3 },
  reworkRate: { rate: 0.4 },
} as const;
