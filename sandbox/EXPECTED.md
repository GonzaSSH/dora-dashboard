# Expected DORA metrics for `dora-sandbox`

These values are worked out **by hand** from the history that
[`build-sandbox.sh`](build-sandbox.sh) creates. They were written before any
metric code existed. The tests compare the code against this file, never the
other way round.

**v1.1 definitions (decided by the delivery lead):** a revert only fails the release that
actually shipped the reverted commit; every patch release counts as rework. Steps 3 and 4
were redone by hand for these rules (the sandbox results did not change), and a new
fixture case at the end covers reverts that name a pull request instead of a commit.

## Settings used

All defaults from PLAN.md, with a fixed window:

| Setting | Value |
|---|---|
| Window | 2026-01-01 00:00 UTC up to (not including) 2026-04-01 00:00 UTC = **90 days** |
| Deployment source | Auto → the repo has **no releases**, so **tags** are used |
| Version pattern | `^v?\d+\.\d+\.\d+$` |
| Quick-patch window `H` | 48 hours |
| Revert pattern | `^Revert` (and the revert must name what it reverts, see Step 3) |

All times below are UTC.

## Step 1: Which tags are deployments?

| Tag | Tag date | Matches pattern? | In window? | Deployment in window? |
|---|---|---|---|---|
| v0.9.0 | 2025-12-15 12:00 | yes | no (before) | no, but it's the predecessor of v1.0.0 |
| v1.0.0 | 2026-01-05 12:00 | yes | yes | **yes** |
| v1.1.0 | 2026-01-19 12:00 | yes | yes | **yes** |
| v1.2.0 | 2026-02-02 12:00 | yes | yes | **yes** |
| v1.2.1 | 2026-02-03 08:00 | yes | yes | **yes** |
| v1.3.0 | 2026-02-16 12:00 | yes | yes | **yes** |
| v1.4.0 | 2026-02-18 12:00 | yes | yes | **yes** |
| v1.4.1 | 2026-03-06 12:00 | yes | yes | **yes** |
| v1.5.0 | 2026-03-20 12:00 | yes | yes | **yes** |
| experiment | (lightweight) | no | — | no |
| v1.6.0-beta.1 | 2026-03-25 12:00 | no (pre-release) | — | no |
| v2.0.0 | 2026-04-06 12:00 | yes | no (after) | no |

**n = 8 deployments.**

## Step 2: Predecessors and changes

Predecessor = highest lower version released earlier. Changes = commits in the
tag but not in its predecessor. Lead time per commit = tag date − commit author date.

| Deployment | Predecessor | Commit | Author date | Lead time (h) | Working |
|---|---|---|---|---|---|
| v1.0.0 | v0.9.0 | feat: add farewell | 01-02 09:00 | **75** | 3 days (72) + 3 h |
| | | docs: describe usage | 01-04 15:00 | **21** | 01-04 15:00 → 01-05 12:00 |
| v1.1.0 | v1.0.0 | feat: add counter | 01-12 10:00 | **170** | 7 days (168) + 2 h |
| | | test: cover counter | 01-16 10:00 | **74** | 3 days (72) + 2 h |
| | | refactor: tidy counter | 01-18 18:00 | **18** | 01-18 18:00 → 01-19 12:00 |
| v1.2.0 | v1.1.0 | feat: add config file | 01-26 12:00 | **168** | 01-26 → 02-02 = 7 days (January has 31) |
| | | feat: read config from env | 01-30 08:00 | **76** | 01-30 → 02-02 = 3 days (72) + 4 h |
| v1.2.1 | v1.2.0 | fix: crash when config file is missing | 02-03 06:00 | **2** | 06:00 → 08:00 |
| v1.3.0 | v1.2.1 | feat: add colour output | 02-09 12:00 | **168** | 7 days |
| | | feat: add progress bar | 02-13 12:00 | **72** | 3 days |
| v1.4.0 | v1.3.0 | Revert "feat: add progress bar" | 02-17 10:00 | **26** | 24 + 2 h |
| | | feat: add quiet flag | 02-18 08:00 | **4** | 08:00 → 12:00 |
| v1.4.1 | v1.4.0 | fix: typo in help text | 03-02 12:00 | **96** | 4 days |
| | | fix(cli): handle empty input | 03-05 12:00 | **24** | 1 day |
| v1.5.0 | v1.4.1 | feat: add json output | 03-12 12:00 | **192** | 8 days |
| | | fix: json escaping | 03-19 12:00 | **24** | 1 day |

16 commits in total.

## Step 3: Failure, remediation and rework flags

Rules (PLAN.md §2, v1.1):
- **Quick patch:** a release is failed if the next patch of it (same major.minor, patch + 1)
  ships within 48 hours. The patch is its remediation.
- **Revert:** a commit starting `Revert` names its target, either as
  `This reverts commit <id>` or as `Reverts owner/repo#<PR>` (the PR's merge commit is looked
  up). The release whose changes contain that target is failed; the release containing the
  revert is its remediation. A revert whose target can't be identified fails nothing and is
  reported as unmatched.
- **Rework:** a release is rework if it fixed a failed release, **or** it is a patch release
  (same major.minor as its predecessor, higher patch), whatever its commits say.

The only revert in the window is in v1.4.0:
`Revert "feat: add progress bar"` / `This reverts commit 59c40ad7467d…`.
Commit `59c40ad…` (*feat: add progress bar*) is one of v1.3.0's changes (Step 2), so v1.3.0
is failed and v1.4.0 is its remediation. Unmatched reverts: none.

| Deployment | Quick patch within 48 h? | A revert targets one of its commits? | Failed? | Remediation of | Patch release? | Rework? |
|---|---|---|---|---|---|---|
| v1.0.0 | no v1.0.1 | no | no | — | no (v0.9.0 → v1.0.0 is a major bump) | no |
| v1.1.0 | no v1.1.1 | no | no | — | no (minor bump) | no |
| v1.2.0 | **v1.2.1, 20 h later** | no | **yes** | — | no (minor bump) | no |
| v1.2.1 | no v1.2.2 | no | no | **v1.2.0** | **yes** (1.2.0 → 1.2.1) | **yes** |
| v1.3.0 | no v1.3.1 | **yes, by v1.4.0** | **yes** | — | no (minor bump) | no |
| v1.4.0 | v1.4.1 is 16 days later (> 48 h) | no | no | **v1.3.0** | no (minor bump) | **yes** |
| v1.4.1 | no v1.4.2 | no | no | — | **yes** (1.4.0 → 1.4.1) | **yes** |
| v1.5.0 | no v1.5.1 | no | no | — | no (minor bump) | no |

## Step 4: The five metrics

### 1. Deployment frequency

`n / (days / 7) = 8 / (90 / 7) = 56 / 90 = 0.6222…` per week.

**Expected: 0.6222… per week (shown as "0.62 per week", 8 in 90 days).**

### 2. Change lead time (median)

The 16 values sorted:
`2, 4, 18, 21, 24, 24, 26, 72, 74, 75, 76, 96, 168, 168, 170, 192`

An even count, so the median is the mean of the 8th and 9th values: `(72 + 74) / 2 = 73` hours.

**Expected: 73 hours (shown as "3.0 days"), from 16 commits.**

### 3. Change failure rate (proxy)

Failed: v1.2.0, v1.3.0 → `2 / 8 = 0.25`.

**Expected: 25%.**

### 4. Failed deployment recovery time (proxy, median)

| Failure | Remediation | Recovery |
|---|---|---|
| v1.2.0 (02-02 12:00) | v1.2.1 (02-03 08:00) | **20 h** |
| v1.3.0 (02-16 12:00) | v1.4.0 (02-18 12:00) | **48 h** |

Median of `[20, 48]` = `(20 + 48) / 2 = 34` hours. Not yet recovered: none.

**Expected: 34 hours (shown as "34 hours").**

### 5. Rework rate (proxy)

Rework: v1.2.1 (patch release, and fixed v1.2.0), v1.4.0 (fixed v1.3.0), v1.4.1 (patch release)
→ `3 / 8 = 0.375`.

**Expected: 37.5%.**

## Summary

| Metric | Expected | Shown as |
|---|---|---|
| Deployment frequency | 56/90 = 0.6222… per week (8 deployments) | 0.62 per week |
| Change lead time | 73 h (median of 16 commits) | 3.0 days |
| Change failure rate | 2/8 = 0.25 | 25% |
| Failed deployment recovery time | 34 h (median of 2) | 34 hours |
| Rework rate | 3/8 = 0.375 | 37.5% |

**Display rule:** durations under 48 hours are shown in hours. 48 hours or
more are shown in days with one decimal place.

## Fixture case: reverts that name a pull request

GitHub's **Revert** button creates a commit like `Revert "feat: search (#10)" (#12)` whose
message says `Reverts example/pr-reverts#10`, naming a pull request instead of a commit.
Pull-request merge times can't be backdated, so this case is a hand-written fixture
(`tests/fixtures/pr-reverts.json`), not part of the sandbox repository.

Repository `example/pr-reverts`, GitHub Releases, same window (2026-01-01 → 2026-04-01, 90 days):

| Release | Published | Predecessor | Changes (commit id, message, written) |
|---|---|---|---|
| v1.9.0 | 2025-12-01 12:00 | — (before the window) | — |
| v2.0.0 | 2026-01-10 12:00 | v1.9.0 | `a0` *feat: version two*, 01-09 12:00 |
| v2.1.0 | 2026-01-20 12:00 | v2.0.0 | `a1` *feat: search (#10)*, 01-15 12:00 |
| v2.2.0 | 2026-02-01 12:00 | v2.1.0 | `b1` *Revert "feat: search (#10)" (#12)* / `Reverts example/pr-reverts#10`, 01-25 12:00; `c1` *feat: export (#11)*, 01-28 12:00 |
| v2.3.0 | 2026-02-15 12:00 | v2.2.0 | `d1` *Revert "feat: beta flag" (#14)* / `Reverts example/pr-reverts#99`, 02-10 12:00; `e1` *Revert "chore: tidy"* (no target named), 02-12 12:00 |

Pull requests: #10 was merged as commit `a1`. #99 does not exist (GitHub answers 404).

**Reverts:**
- `b1` names PR #10 → merge commit `a1` → shipped in **v2.1.0** → v2.1.0 failed, remediation v2.2.0.
- `d1` names PR #99 → not found → **unmatched**, fails nothing.
- `e1` names nothing → **unmatched**, fails nothing.

So there are **2 unmatched reverts**, which the app reports as a note.

**Lead times (h):** v2.0.0: 24 · v2.1.0: 120 (5 days) · v2.2.0: 168 (7 days), 96 (4 days) ·
v2.3.0: 120 (5 days), 72 (3 days). Sorted: `24, 72, 96, 120, 120, 168`; median = `(96 + 120) / 2 = 108` h.

| Metric | Expected | Shown as |
|---|---|---|
| Deployment frequency | 4 / (90 / 7) = 28/90 = 0.3111… per week | 0.31 per week |
| Change lead time | 108 h (6 commits) | 4.5 days |
| Change failure rate | 1/4 = 0.25 (v2.1.0) | 25% |
| Failed deployment recovery time | v2.1.0 (01-20 12:00) → v2.2.0 (02-01 12:00) = 12 days = 288 h | 12.0 days |
| Rework rate | 1/4 = 0.25 (v2.2.0 fixed v2.1.0; no patch releases) | 25% |
| Unmatched reverts | 2 | "2 reverts could not be matched to a release" |

**Requests:** repository 1 + releases 1 + 4 comparisons + 2 pull-request look-ups (#10, #99) = **8**.
With a budget of 7, the comparisons still fit (6 requests), the look-up for #99 is the 7th
(newest release first) and #10 can't be looked up: **0 failures, 3 unmatched**, and a note
that the request limit stopped the look-ups.
