import { defineConfig, devices } from '@playwright/test';

// Tests run against the production build served by `vite preview`, with every
// GitHub API call answered from recorded fixtures (see e2e/fixtures.ts).
// SMOKE_URL switches to a read-only smoke test of a deployed site.
const smokeUrl = process.env.SMOKE_URL;

export default defineConfig({
  testDir: 'e2e',
  testMatch: smokeUrl ? '**/smoke.spec.ts' : '**/*.spec.ts',
  testIgnore: smokeUrl ? undefined : '**/smoke.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // No HTML report for the smoke test: its steps include the token typed into the page.
  reporter: process.env.CI && !smokeUrl ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: smokeUrl ?? 'http://localhost:4173/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: smokeUrl
    ? undefined
    : { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
});
