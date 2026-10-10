// The values from sandbox/EXPECTED.md, transcribed once and shared by the unit
// tests, the e2e tests and the live check. Change EXPECTED.md first, never this alone.
export const SANDBOX_REPO = 'GonzaSSH/dora-sandbox';
export const SANDBOX_WINDOW = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') };

export const EXPECTED = {
  deploymentFrequency: { perWeek: 56 / 90, count: 8, days: 90, shown: '0.62 per week' },
  leadTime: { medianHours: 73, commitCount: 16, shown: '3.0 days' },
  changeFailureRate: { rate: 0.25, failed: 2, shown: '25%' },
  recoveryTime: { medianHours: 34, count: 2, shown: '34 hours' },
  reworkRate: { rate: 0.375, rework: 3, shown: '37.5%' },
} as const;

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
