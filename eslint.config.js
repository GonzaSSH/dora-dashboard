import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Never log anything from the app: a token must not reach the console.
      'no-console': 'error',
    },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
