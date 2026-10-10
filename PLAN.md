# PLAN — DORA metrics dashboard for public GitHub repos

Status: **Version 1 done and live** at https://gonzassh.github.io/dora-dashboard/. This file is the approved spec; the sections below record decisions made along the way.

## 0. What I can and cannot do from this environment

I work in a cloud container. It has no working `gh` CLI. GitHub work goes
through a built-in GitHub connector plus `git`, and network access is limited.

| # | Task | Who | Notes |
|---|------|-----|-------|
| 1 | Create public repo `dora-sandbox` | **You** | Tried: GitHub refused (`403 Resource not accessible by integration`). Steps in §0.1 A. |
| 2 | Push backdated commits and tags to `dora-sandbox` | **GitHub Actions, set up by me** (decided) | This session may only push `claude/*` branches: pushes to `main` and of tags are refused. So a workflow on the sandbox's `claude/sandbox-builder` branch runs `sandbox/build-sandbox.sh` on GitHub's servers and writes `main` + tags with the sandbox repo's own token. Rebuild: sandbox Actions tab → latest run → Re-run. |
| 3 | Make `dora-dashboard` public, then turn on GitHub Pages | **You** | Free accounts only get Pages on public repos. Tried changing visibility: refused ("Repository settings writes are not permitted"). Steps in §0.1 C. |
| 4 | Create and run GitHub Actions workflows | **Me** (tested: pushed a placeholder workflow and GitHub started running it) | I push workflow files on my branch. They run on GitHub's servers, and I can read their results. |
| 4b | Get changes into `main` (Pages deploys from `main`) | **You merge a pull request** (decided) | I'm only allowed to push to `claude/funny-wright-eioqk2`. |

Other limits, and how the plan works around them:

- **This container can't reach the GitHub API for other repos** (e.g. `grafana/grafana`)
  or `*.github.io`. So the live checks (sandbox, grafana, deployed site) **run
  inside GitHub Actions**, and I read their logs as evidence.
- **The Cypress test-runner download is blocked here**, so I can't run Cypress
  in this container, only in CI. Playwright, with a browser already installed,
  works in both places. That's a strong reason to switch, so it's a question for
  you (§9). Decided: Playwright.

### 0.1 Manual steps (only the ones you need)

**A. Create `dora-sandbox`**
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

**C. Make the repo public, then turn on GitHub Pages**
1. Go to https://github.com/GonzaSSH/dora-dashboard/settings, scroll to the
   **Danger Zone** at the bottom, click **Change visibility → Change to public**,
   and confirm by following the prompts (GitHub asks you to type the repo name).
2. Go to https://github.com/GonzaSSH/dora-dashboard/settings/pages
3. Under **Build and deployment → Source**, pick **GitHub Actions**
4. That's all. There's no Save button; it saves right away.

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

**v1.1: every definition below was reviewed by the delivery lead**, one question at a time:
- **Deployment:** kept as stable versions only.
- **48-hour quick-patch window:** kept.
- **Revert rule:** made strict, and extended to pull-request reverts.
- **Rework rule:** changed to fixes of failed releases. "Every patch release" gave 75–96%
  on five real projects, so it is kept only as a non-default setting.
- **Ratings:** limited to the two directly measured metrics.

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
   - **Revert (strict, v1.1):** a deployment E contains a revert commit (first line matches
     `^Revert`, configurable) that names its target:
     - `This reverts commit <id>` names a commit;
     - `Reverts owner/repo#<n>` names a pull request, whose merge commit is looked up
       (`GET /pulls/<n>`, within the request budget).
     D is the earlier release whose changes contain the target commit; E is D's **remediation**.
     **Title fallback:** whenever the revert can't be located by id (no id, id in no earlier
     release, PR look-up failed or not made), its quoted title `Revert "<title>"` (without a
     trailing `(#n)`) is matched against commit first lines. This catches commits copied
     between version branches under a new id. If several earlier releases match, the one on
     the revert's own version line wins, else the most recent.
     **Same release:** if the target (by id or title) is in E itself, the change never
     shipped without its revert: no failure, not unmatched.
     Otherwise the revert fails **no** release and is counted in one collapsed note,
     "N reverts could not be matched to a release".
   If D has a remediation from both signals, the earliest one counts.

4. **Failed deployment recovery time (proxy)** = median over failed `D ∈ W` of
   `time(remediation(D)) − time(D)`, in hours. If the remediation is itself
   failed, follow the chain to the first deployment that isn't failed.
   (Because a failure is only *detected* through its remediation, every detected
   failure has a recovery; a failure with no fix yet is simply not detected.)

5. **Rework rate (proxy)** = `rework(W) / n`, where D is **rework** (an
   unplanned deployment made to fix something) if D is the remediation of some failed
   deployment. In a chain (a fix that itself fails and needs another fix) every fix
   release counts.
   - With public data this is usually close to the change failure rate: DORA
     [describes](https://dora.dev/insights/dora-metrics-history/) change failure rate as
     "a proxy for the amount of rework a team must perform".
   - Non-default setting `reworkRule: 'patches'`: also every patch release (same
     major.minor as its predecessor, higher patch). On five real projects this gave
     75–96%, so it is labelled as a broad reading.

Details settled during the build:
- Remediations are looked for among deployments **inside the window** only.
- **Merge commits** (more than one parent) are left out of lead time; their date is
  the merge, not when the change was written.
- A negative lead time (commit dated after its release, i.e. a clock problem) counts as 0.

Every proxy metric shows a **"Proxy"** badge and a one-line "how we guessed this".
The UI also lists every deployment with its time, number of commits, and
failed / remediation / rework flags, so people can check the numbers themselves.

**Rough guide shown in the app (v1.1).** Only the two directly measured metrics are
rated, labelled "rough guide", with the advice to compare a team with its own past,
not with other teams:

| Metric | Strong | Weak |
|---|---|---|
| Deployment frequency | daily or more | less than monthly |
| Change lead time | under 1 day | over 1 month |

The three proxy metrics get **no rating**. Each shows its number, its plain-language
explanation, the "Proxy" label, and one sentence on what makes it higher or lower.

## 2b. Manual corrections and shareable definitions (v1.2)

- **Corrections.** In the deployments list a person can mark any release *failed* (choosing
  the release that fixed it: the next one by default, any later one, or "not fixed in this
  period") or *not failed*.
  - The corrections override the automatic flags. Remediations, rework and recovery chains
    are then recalculated with the same rules as §2, and nothing is fetched again.
  - A failure not fixed in the period counts in the change failure rate but has no recovery
    time; the tile says how many such failures there are.
  - Corrected releases are labelled "manually corrected", with an "N releases corrected by
    hand" line and a **Reset corrections** button. Corrections for releases outside the
    period, or a fix that isn't a later release, are ignored with a note.
- **Page address only.** Corrections are kept in the page address
  (`failed=v1.4.1`, `failed=v1.4.1:v1.5.2`, `failed=v1.5.2:none`, `notfailed=v1.2.0`), together
  with every setting that differs from the default (`source`, `pattern`, `prerelease=keep`,
  `quickpatch=off`, `hours`, `revert=off`, `revertpattern`, `rework=patches`). Nothing is stored
  anywhere else; a shared link reproduces the same numbers. Saved demos keep default settings.
- **Definitions used.** A line under the tiles lists the active rules; ones that differ from
  the defaults are marked "(changed)".

## 2c. Context on the tiles (v1.3)

Worked examples and exact rules: sandbox/EXPECTED.md, "Context on the tiles (v1.3)".

- **Sentence** on every tile, generated from the value (`src/context/sentences.ts`).
  Durations: "less than an hour" under 1 h, hours under 48 h, days under 14 days, weeks under
  60 days, else months. Shares: "about 1 in k" when that is within 10% of the exact share,
  else "f of n". Own wording for zero, one and not enough data.
- **Previous period** of equal length ending where the window starts, same settings,
  automatic detection (manual corrections apply to the current period only).
  - Measured after the current period with the same client and budget. The client remembers
    successful responses, so listings and tag dates already read are free.
  - Fewer than 5 releases in it: "Not compared: the previous N days had only M releases (at
    least 5 are needed)." Change details aren't fetched then.
  - Budget or rate limit runs out while listing: every tile says the comparison needs a
    token. Runs out while fetching change details: deployment frequency is compared, the
    other four say it needs a token. The current period is never affected.
  - Direction is decided on the shown values; equal shown values say "about the same".
- **DORA 2025 context** on deployment frequency and lead time only (`src/context/dora2025.ts`),
  from *State of AI-assisted Software Development 2025* (v2025.2), page 20, Figures 11 and 12,
  "Top %" column; licence CC BY-NC-SA 4.0 (report page 141), linked on the tile with the
  source. The band containing the value gives "About X% of surveyed teams ship this often or
  more" / "have this lead time or shorter". The "on demand" band can't be told apart from
  "daily" with release data, so daily-or-more uses the hourly–daily figure (22.7%). Always
  with the note "DORA surveys mostly teams running services. Libraries release on a different
  rhythm."
- **Proxies:** no distribution; one line says the survey asks about real incidents while
  this is estimated from public release patterns.
- **Snapshots** store the previous period. Live demos are saved with a token (budget 1000)
  and the page says "saved with a GitHub token"; the sandbox stays on the anonymous budget.

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
scratch in a temp folder. A workflow on the sandbox's `claude/sandbox-builder`
branch checks out this repo and runs it on GitHub (see §0, row 2). It uses fixed dates (`GIT_AUTHOR_DATE`,
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
GitHub Actions, GitHub Pages. **End-to-end tests: Playwright** instead of
Cypress, because the Cypress download is blocked here (see §0 and §9).

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

## 9. Decisions (answered by the delivery lead)

1. E2E tool: **Playwright**. Cypress can't be downloaded in this environment;
   Playwright runs both here and in CI.
2. Getting work into `main`: **I open pull requests; the delivery lead merges them.**
3. Default window: **last 90 days.**
4. Force-pushing the scripted history to `dora-sandbox`'s `main`: **approved.**
