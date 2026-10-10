import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served from https://gonzassh.github.io/dora-dashboard/
  base: './',
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
