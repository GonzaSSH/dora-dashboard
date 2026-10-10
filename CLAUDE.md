# CLAUDE.md

Browser-only TypeScript + Vite app computing DORA metrics for public GitHub repos.
Spec: PLAN.md. Expected sandbox values: sandbox/EXPECTED.md (mirrored in tests/expected.ts).

## Commands
- `npm run typecheck` / `npm run lint`: must be 0 errors, 0 warnings
- `npm test`: Vitest unit tests (offline, fixtures in tests/fixtures/)
- `npm run e2e`: Playwright against the production build with fixtures (Playwright pinned to 1.56.1 to match the preinstalled Chromium)
- `npm run build`: production build to dist/
- `npm run live-check -- sandbox` | `-- large grafana/grafana`: real API (set GITHUB_TOKEN; in Claude Code cloud also NODE_USE_ENV_PROXY=1)
- `npm run record-fixtures`: re-record tests/fixtures/sandbox.json from the real sandbox
- `PUSH=0 sandbox/build-sandbox.sh`: build the sandbox history locally without pushing

## Rules
- Never weaken, skip or delete a test to make it pass. Never change EXPECTED.md (or tests/expected.ts) to match the code unless the hand arithmetic is shown to be wrong.
- Changing sandbox/build-sandbox.sh means redoing EXPECTED.md by hand first, then re-recording fixtures.
- Tokens: memory only. Never put a token in a URL, storage, log, error message, fixture, trace or commit. No `console` in src/ (lint enforces).
- Render GitHub data with textContent only (src/ui/dom.ts `h()`), never innerHTML.
- Stay within 50 requests per analysis without a token (GitHub allows 60/hour).
- The sandbox repo's main and tags are written by the workflow on its `claude/sandbox-builder` branch, not by direct pushes.
- CI (.github/workflows/ci.yml) must be green; Pages deploys from `main` only.
