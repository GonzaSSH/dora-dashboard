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
- Snapshots (saved demo results in `public/snapshots/`, loaded by `?demo=<id>` with zero API calls):
  - Locally: `GITHUB_TOKEN=... npm run snapshots`, then commit the changed files.
  - In Claude Code cloud (only the sandbox is reachable): run the **Refresh snapshots** workflow
    (Actions tab, or push to `claude/refresh-snapshots`). It uploads a `snapshots` artifact and
    force-pushes the files to `claude/snapshots-latest`; then
    `git checkout origin/claude/snapshots-latest -- public/snapshots/<id>.json` and commit.
  - `npm run snapshots -- --offline` rebuilds only the sandbox snapshot (deterministic; a unit
    test fails if it drifts from the code).
- Releases: add `release-notes/vX.Y.Z.md`, then run the **Release** workflow (version, target)

## Rules
- Never weaken, skip or delete a test to make it pass. Never change EXPECTED.md (or tests/expected.ts) to match the code unless the hand arithmetic is shown to be wrong.
- Changing sandbox/build-sandbox.sh means redoing EXPECTED.md by hand first, then re-recording fixtures.
- Tokens: memory only. Never put a token in a URL, storage, log, error message, fixture, trace or commit. No `console` in src/ (lint enforces).
- Render GitHub data with textContent only (src/ui/dom.ts `h()`), never innerHTML.
- Stay within 50 requests per analysis without a token (GitHub allows 60/hour).
- The sandbox repo's main and tags are written by the workflow on its `claude/sandbox-builder` branch, not by direct pushes.
- After any change to metric code, rebuild the sandbox snapshot (`npm run snapshots -- --offline`) and refresh the other snapshots, so demo links never show stale definitions.
- CI (.github/workflows/ci.yml) must be green; Pages deploys from `main` only.
