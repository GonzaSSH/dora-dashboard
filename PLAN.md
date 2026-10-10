# PLAN — DORA metrics dashboard for public GitHub repos

Status: **Phase 1, waiting for approval.** No app code yet.

## 0. What I can and cannot do from this environment

I work in a cloud container. It has no working `gh` CLI. GitHub work goes
through a built-in GitHub connector plus `git`, and network access is limited.

| # | Task | Who | Notes |
|---|------|-----|-------|
| 1 | Create public repo `dora-sandbox` | **Me** (connector tool), fallback **you** | I have a "create repository" tool but haven't used it yet. If it fails, the steps are in §0.1. |
| 2 | Push backdated commits and tags to `dora-sandbox` | **Me, after you approve one permission** | `git` can set any date. But this session can only push to repos attached to it. Attaching a repo with write access is blocked until you explicitly approve it. If it's still blocked, you start a new session with both repos selected (§0.1). |
| 3 | Turn on GitHub Pages for `dora-dashboard` | **You** (one setting) | I have no tool for repo settings. Steps in §0.1. |
| 4 | Create and run GitHub Actions workflows | **Me** (tested, see final report) | I push workflow files on my branch. They run on GitHub's servers. |
| 4b | Get changes into `main` (Pages deploys from `main`) | **You merge a pull request**, unless you let me push to `main` | I'm only allowed to push to `claude/funny-wright-eioqk2`. |

Other limits, and how the plan works around them:

- **This container can't reach the GitHub API for other repos** (e.g. `grafana/grafana`)
  or `*.github.io`. So the live checks (sandbox, grafana, deployed site) **run
  inside GitHub Actions**, and I read their logs as evidence.
- **The Cypress test-runner download is blocked here**, so I can't run Cypress
  in this container, only in CI. Playwright, with a browser already installed,
  works in both places. That's a strong reason to switch, so it's a question for
  you (§9).

### 0.1 Manual steps (only the ones you need)

**A. Create `dora-sandbox` (only if I report my attempt failed)**
1. Go to https://github.com/new
2. Owner: `GonzaSSH`. Repository name: `dora-sandbox`
3. Description: `Scripted fake history with known DORA answers, for testing dora-dashboard`
4. Choose **Public**
5. Leave "Add a README", ".gitignore" and "license" **unticked** (the repo must be empty)
6. Click **Create repository**

**B. Let me push to `dora-sandbox`**
- Reply in this chat: *"Yes, attach GonzaSSH/dora-sandbox with push access."*
- If I still report it's blocked: go to https://claude.ai/code, start a new
  session, and select **both** `GonzaSSH/dora-dashboard` and `GonzaSSH/dora-sandbox`.

**C. Turn on GitHub Pages**
1. Go to https://github.com/GonzaSSH/dora-dashboard/settings/pages
2. Under **Build and deployment → Source**, pick **GitHub Actions**
3. That's all. There's no Save button; it saves right away.

**D. Merge my pull requests into `main`** (unless you allow direct pushes)
1. Open the pull request link I give you
2. Wait for the green check marks
3. Click **Merge pull request**, then **Confirm merge**

## 1. Definitions

**Window.** Each run analyses a date range `[start, end]`. The default is the
last 90 days. All metrics only count deployments whose time falls inside the window.

**Deployment** (configurable in the UI):

| Setting | Default | Meaning |
|---|---|---|
| Source | `Auto` | Use GitHub **Releases** if the repo has any; otherwise use **tags**. Can be forced to `Releases` or `Tags`. |
| Version pattern | `^v?\d+\.\d+\.\d+$` | Only names matching this count. The default skips pre-releases like `v2.0.0-beta.1`. |
| Skip draft / pre-release releases | on | |

Deployment time:
- Release: `published_at`
- Annotated tag: tagger date
- Lightweight tag: the tagged commit's committer date

**Predecessor of a deployment D.** If both names are versions: the deployment
with the **highest version lower than D** that happened before D. Otherwise:
the deployment just before D in time. Version order handles repos that
release several branches in parallel, like grafana's 11.x and 12.x lines.

**Changes in D.** The commits in D that are not in its predecessor (GitHub
"compare" `pred...D`). If D has no predecessor (the repo's first deployment
ever), its changes are unknown and D is left out of lead time.

## 2. The five metrics: exact formulas

Let `W` = deployments in the window, `n = |W|`, and `days` = window length in days.

1. **Deployment frequency** = `n / (days / 7)` deployments per week.
   The total `n` is shown too.

2. **Change lead time** = median over every commit `c` in the changes of each
   `D ∈ W` of `(time(D) − authorDate(c))`, in hours. I use the author date because
   it survives rebases and means "when the change was written". The median ignores
   extreme outliers better than the mean. The number of commits used is shown.

3. **Change failure rate (proxy)** = `failed(W) / n`, where D is **failed** if
   either signal fires (each can be switched on or off in the UI):
   - **Quick patch:** another deployment E has the same major.minor,
     `patch(E) = patch(D) + 1`, and `0 < time(E) − time(D) ≤ H` hours (default `H = 48`). E is D's **remediation**.
   - **Revert:** a deployment E whose predecessor is D contains a commit whose
     message starts with `Revert` (pattern configurable). E is D's **remediation**.
   If D has a remediation from both signals, the earliest one counts.

4. **Failed deployment recovery time (proxy)** = median over failed `D ∈ W` of
   `time(remediation(D)) − time(D)`, in hours. If the remediation is itself
   failed, follow the chain to the first deployment that isn't failed.
   Failures with no recovery by the end of the window are listed as "not yet
   recovered" and left out of the median.

5. **Rework rate (proxy)** = `rework(W) / n`, where D is **rework** (an
   unplanned deployment made to fix something) if:
   - D is the remediation of some failed deployment, **or**
   - D is a patch bump (same major.minor as its predecessor) and **every**
     change commit matches the fix pattern
     `^(fix|hotfix|bugfix)(\(.+\))?!?:|^Revert` (configurable).

Every proxy metric shows a **"Proxy"** badge and a one-line "how we guessed this".
The UI also lists every deployment with its time, number of commits, and
failed / remediation / rework flags, so people can check the numbers themselves.

**Rough "good / bad" guide shown in the app** (based on DORA research, given as
a rough guide, not a hard rule):

| Metric | Strong | Weak |
|---|---|---|
| Deployment frequency | daily or more | less than monthly |
| Change lead time | under 1 day | over 1 month |
| Change failure rate | under 15% | over 30% |
| Recovery time | under 1 day | over 1 week |
| Rework rate | under 10% | over 25% |

## 3. GitHub API usage and rate limits

- **Without a token:** 60 requests per hour. The app keeps a **request budget**
  (default 50). Once the budget is used up, it stops fetching per-deployment
  details and marks the affected metrics "based on a sample of X of Y deployments".
  It reads `x-ratelimit-remaining` and shows what's left.
- **With a token:** budget 1000. The token sits in a JavaScript variable only:
  never in localStorage, cookies, the URL, logs or error messages. The input is a
  password field. Reloading the page forgets it.
- Requests: `GET /repos/{o}/{r}` (exists? private?), `/releases?per_page=100`
  (paginated, stop at window start), or `/git/matching-refs/tags` plus one
  request per tag for its date (newest version first, stop past window start),
  plus one `/compare/{pred}...{tag}` per deployment.

**Errors** (a clear message, never a crash):

| Case | How it's detected | Message |
|---|---|---|
| Repo not found | 404 on repo | "We couldn't find that repository. Check the spelling (owner/name)." |
| Private repo | 404 without a token (GitHub hides it), or `private: true` with a token | Not found message plus "…or it may be private. Only public repos are supported." |
| No deployments | 0 releases and 0 matching tags | "This repo has no releases or version tags in the window, so there's nothing to measure. Try a longer window or a different tag pattern." |
| Rate limit | 403/429 with remaining = 0 | "GitHub's hourly limit is used up. It resets at HH:MM. Add a token to continue now." |
| No network | `fetch` throws | "Couldn't reach GitHub. Check your internet connection." |
| Bad input | doesn't match `owner/name` | Shown inline before any request |

## 4. Sandbox design (`GonzaSSH/dora-sandbox`)

A Bash script `sandbox/build-sandbox.sh` in this repo builds the history from
scratch in a temp folder. It uses fixed dates (`GIT_AUTHOR_DATE`,
`GIT_COMMITTER_DATE`, annotated tags so the tagger date is fixed) and
force-pushes to `dora-sandbox`. Rerunning it gives the identical history:
same dates, same messages, same tag dates. No releases are created, because
release times can't be backdated. Tags only.

Fixed analysis window: **2026-01-01 00:00 UTC → 2026-03-31 23:59:59 UTC (90 days).**
Planned shape (exact timestamps get fixed in Phase 2):

| Tag | Date | Role |
|---|---|---|
| v0.9.0 | mid Dec 2025 | Before the window. Predecessor/baseline only |
| v1.0.0, v1.1.0 | Jan | Normal releases |
| v1.2.0 → v1.2.1 | Feb, ~20 h apart | **Failure 1** (quick patch) + recovery |
| v1.3.0 → v1.4.0 | Feb, ~2 days apart, v1.4.0 has a `Revert "…"` commit | **Failure 2** (revert) + recovery |
| v1.4.1 | Mar, >48 h after v1.4.0, only `fix:` commits | **Rework that isn't a failure** |
| v1.5.0 | Mar | Normal |
| v1.6.0-beta.1 | Mar | Excluded by the version pattern |
| `experiment` (lightweight) | Mar | Excluded by the version pattern |
| v2.0.0 | Apr 2026 | After the window. Excluded |

Before any metric code: `sandbox/EXPECTED.md` with every metric worked out by hand.

**Fixtures:** `scripts/record-fixtures.ts` saves the real API responses for
the sandbox into `tests/fixtures/sandbox/` plus error responses (404, rate
limit). Tests swap `fetch` for a fixture lookup, so they run offline.

## 5. Stack

TypeScript + Vite, plain DOM (no framework, it's one page), ESLint, Vitest,
GitHub Actions, GitHub Pages. **End-to-end tests:** Cypress as requested, or
Playwright (my recommendation, see §0 and §9).

## 6. File structure

```
PLAN.md  README.md  CLAUDE.md
index.html  vite.config.ts  tsconfig.json  eslint.config.js  package.json
src/
  main.ts                 wiring: form → fetch → metrics → render
  config.ts               defaults (window, patterns, H, budgets)
  github/client.ts        fetch wrapper: auth header, budget, rate-limit + error mapping
  github/collect.ts       repo → normalized Deployment[] (with changes)
  metrics/version.ts      parse/compare versions
  metrics/model.ts        predecessor, failure, remediation, rework flags
  metrics/compute.ts      the five formulas (pure functions)
  ui/render.ts  ui/settings.ts  ui/explanations.ts  ui/styles.css
tests/unit/*.test.ts      Vitest
tests/fixtures/sandbox/*.json  tests/fixtures/errors/*.json
e2e/                      browser tests (fixtures served via request interception)
sandbox/build-sandbox.sh  sandbox/EXPECTED.md  sandbox/README.md
scripts/record-fixtures.ts  scripts/live-check.ts
.github/workflows/ci.yml  (lint, typecheck, unit, e2e, build, live checks, deploy, smoke test)
```

## 7. Test strategy

| Check | Where | Pass condition |
|---|---|---|
| Type check + lint | local + CI | 0 errors, 0 warnings |
| Unit: version, predecessor, flags, formulas | local + CI | — |
| Unit: sandbox fixtures → metrics | local + CI | every value equals EXPECTED.md exactly |
| Unit: client error mapping | local + CI | each error case → the right message |
| E2E: full flow + 5 error cases + token never stored | local + CI | — |
| Live sandbox | CI (`scripts/live-check.ts`) | live values equal EXPECTED.md |
| Live grafana/grafana | CI | finishes, requests used ≤ 50 (fits the 60/hour unauthenticated limit) |
| Build | local + CI | `vite build` succeeds |
| Deployed site smoke test | CI, after the Pages deploy on `main` | page loads, sandbox run shows the expected numbers |

CI runs on every push. The live checks call the real API from GitHub's servers
using the workflow's own temporary token (it's never printed).

## 8. Repos and URLs

- App: https://github.com/GonzaSSH/dora-dashboard
- Sandbox: https://github.com/GonzaSSH/dora-sandbox
- Live demo: https://gonzassh.github.io/dora-dashboard/

## 9. Open questions (asked in chat)

1. E2E tool: Playwright (recommended) or Cypress?
2. Getting work into `main`: you merge pull requests, or I may push to `main` directly?
3. Default window: last 90 days?
4. Approve force-pushing the scripted history to `dora-sandbox`'s `main`
   (it's a throwaway test repo; rerunning the script rewrites it)?
