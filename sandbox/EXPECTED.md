# Expected DORA metrics for `dora-sandbox`

These values are worked out **by hand** from the history that
[`build-sandbox.sh`](build-sandbox.sh) creates. The tests compare the code against this
file, never the other way round.

**History of this file**
- **v1.0:** written before any metric code existed.
  - Sandbox results: 8 deployments, 0.62/week, 3.0 days, 25%, 34 hours, 37.5%.
- **v1.3:** the sandbox gained six releases before the window (v0.7.0, v0.8.0–v0.8.4) so the
  previous 90 days can be compared; current-period values are unchanged (see "Context on the
  tiles" below).
- **v1.1:** redone by hand after the delivery lead reviewed every definition:
  - a revert only fails the release that shipped the reverted change;
  - rework counts only releases that fixed a failed release.

  The sandbox also gained a case where **one failure needed two fix releases**
  (v1.5.0 → v1.5.1 → v1.5.2). Two hand-written fixture cases cover reverts that name a
  pull request and reverts of copied commits.

## Settings used

All defaults from PLAN.md, with a fixed window:

| Setting | Value |
|---|---|
| Window | 2026-01-01 00:00 UTC up to (not including) 2026-04-01 00:00 UTC = **90 days** |
| Deployment source | Auto → the repo has **no releases**, so **tags** are used |
| Version pattern | `^v?\d+\.\d+\.\d+$` |
| Quick-patch window `H` | 48 hours |
| Revert pattern | `^Revert` (and the revert must name what it reverts, see Step 3) |
| Rework rule | Fixes of failed releases (default) |

All times below are UTC.

## Step 1: Which tags are deployments?

| Tag | Tag date | Matches pattern? | In window? | Deployment in window? |
|---|---|---|---|---|
| v0.7.0 | 2025-09-15 12:00 | yes | no (before) | no (v1.3: baseline of the previous period) |
| v0.8.0 | 2025-10-13 12:00 | yes | no (before) | no (v1.3: previous period) |
| v0.8.1 | 2025-10-14 08:00 | yes | no (before) | no (v1.3: previous period) |
| v0.8.2 | 2025-11-03 12:00 | yes | no (before) | no (v1.3: previous period) |
| v0.8.3 | 2025-11-17 12:00 | yes | no (before) | no (v1.3: previous period) |
| v0.8.4 | 2025-12-01 12:00 | yes | no (before) | no (v1.3: previous period) |
| v0.9.0 | 2025-12-15 12:00 | yes | no (before) | no, but it's the predecessor of v1.0.0 |
| v1.0.0 | 2026-01-05 12:00 | yes | yes | **yes** |
| v1.1.0 | 2026-01-19 12:00 | yes | yes | **yes** |
| v1.2.0 | 2026-02-02 12:00 | yes | yes | **yes** |
| v1.2.1 | 2026-02-03 08:00 | yes | yes | **yes** |
| v1.3.0 | 2026-02-16 12:00 | yes | yes | **yes** |
| v1.4.0 | 2026-02-18 12:00 | yes | yes | **yes** |
| v1.4.1 | 2026-03-06 12:00 | yes | yes | **yes** |
| v1.5.0 | 2026-03-20 12:00 | yes | yes | **yes** |
| v1.5.1 | 2026-03-21 10:00 | yes | yes | **yes** |
| v1.5.2 | 2026-03-22 08:00 | yes | yes | **yes** |
| experiment | (lightweight) | no | — | no |
| v1.6.0-beta.1 | 2026-03-25 12:00 | no (pre-release) | — | no |
| v2.0.0 | 2026-04-06 12:00 | yes | no (after) | no |

**n = 10 deployments.**

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
| | | feat: add progress bar (`59c40ad…`) | 02-13 12:00 | **72** | 3 days |
| v1.4.0 | v1.3.0 | Revert "feat: add progress bar" | 02-17 10:00 | **26** | 24 + 2 h |
| | | feat: add quiet flag | 02-18 08:00 | **4** | 08:00 → 12:00 |
| v1.4.1 | v1.4.0 | fix: typo in help text | 03-02 12:00 | **96** | 4 days |
| | | fix(cli): handle empty input | 03-05 12:00 | **24** | 1 day |
| v1.5.0 | v1.4.1 | feat: add json output | 03-12 12:00 | **192** | 8 days |
| | | fix: json escaping | 03-19 12:00 | **24** | 1 day |
| v1.5.1 | v1.5.0 | fix: json escaping for unicode | 03-21 08:00 | **2** | 08:00 → 10:00 |
| v1.5.2 | v1.5.1 | fix: restore json escaping for ascii | 03-22 06:00 | **2** | 06:00 → 08:00 |

18 commits in total.

## Step 3: Failure, remediation and rework flags

Rules (PLAN.md §2, v1.1):
- **Quick patch:** a release is failed if the next patch of it (same major.minor, patch + 1)
  ships within 48 hours. The patch is its remediation.
- **Revert:** a commit starting `Revert` names its target, either as
  `This reverts commit <id>` or as `Reverts owner/repo#<PR>` (the PR's merge commit is looked
  up). The release that shipped the target is failed: matched by commit id, or, whenever the
  revert can't be located by id (no id, id in no earlier release, look-up failed or not made),
  by the quoted title (`Revert "<title>"`, without a trailing `(#n)`); the release containing the revert is
  its remediation. A revert of a change in its own release fails nothing. A revert whose
  target can't be found fails nothing and is reported as unmatched.
- **Rework (default):** a release is rework if it fixed a failed release. If a fix itself
  fails and needs another fix, both fix releases count.
- **Recovery:** from a failed release to the first release after it that isn't failed.

The only revert in the window is in v1.4.0:
`Revert "feat: add progress bar"` / `This reverts commit 59c40ad7467d…`.
Commit `59c40ad…` is one of v1.3.0's changes (Step 2), so v1.3.0 is failed and v1.4.0 is
its remediation. Unmatched reverts: none.

| Deployment | Quick patch within 48 h? | A revert targets one of its commits? | Failed? | Fixes | Rework? |
|---|---|---|---|---|---|
| v1.0.0 | no v1.0.1 | no | no | — | no |
| v1.1.0 | no v1.1.1 | no | no | — | no |
| v1.2.0 | **v1.2.1, 20 h later** | no | **yes** | — | no |
| v1.2.1 | no v1.2.2 | no | no | **v1.2.0** | **yes** |
| v1.3.0 | no v1.3.1 | **yes, by v1.4.0** | **yes** | — | no |
| v1.4.0 | v1.4.1 is 16 days later (> 48 h) | no | no | **v1.3.0** | **yes** |
| v1.4.1 | no v1.4.2 | no | no | — | no (a planned patch, not a fix of a failure) |
| v1.5.0 | **v1.5.1, 22 h later** (03-20 12:00 → 03-21 10:00) | no | **yes** | — | no |
| v1.5.1 | **v1.5.2, 22 h later** (03-21 10:00 → 03-22 08:00) | no | **yes** | **v1.5.0** | **yes** |
| v1.5.2 | no v1.5.3 | no | no | **v1.5.1** | **yes** |

## Step 4: The five metrics

### 1. Deployment frequency

`n / (days / 7) = 10 / (90 / 7) = 70 / 90 = 0.7777…` per week.

**Expected: 0.7777… per week (shown as "0.78 per week", 10 in 90 days).**

### 2. Change lead time (median)

The 18 values sorted:
`2, 2, 2, 4, 18, 21, 24, 24, 26, 72, 74, 75, 76, 96, 168, 168, 170, 192`

An even count, so the median is the mean of the 9th and 10th values: `(26 + 72) / 2 = 49` hours.

**Expected: 49 hours (shown as "2.0 days", 49 ÷ 24 = 2.04), from 18 commits.**

### 3. Change failure rate (proxy)

Failed: v1.2.0, v1.3.0, v1.5.0, v1.5.1 → `4 / 10 = 0.4`.

**Expected: 40%.**

### 4. Failed deployment recovery time (proxy, median)

| Failure | First good release after it | Recovery |
|---|---|---|
| v1.2.0 (02-02 12:00) | v1.2.1 (02-03 08:00) | **20 h** |
| v1.3.0 (02-16 12:00) | v1.4.0 (02-18 12:00) | **48 h** |
| v1.5.0 (03-20 12:00) | v1.5.2 (03-22 08:00), because the fix v1.5.1 itself failed | 2 days − 4 h = **44 h** |
| v1.5.1 (03-21 10:00) | v1.5.2 (03-22 08:00) | **22 h** |

Sorted `[20, 22, 44, 48]`, median = `(22 + 44) / 2 = 33` hours. Not yet recovered: none.

**Expected: 33 hours (shown as "33 hours").**

### 5. Rework rate (proxy)

Rework: v1.2.1 (fixed v1.2.0), v1.4.0 (fixed v1.3.0), v1.5.1 (fixed v1.5.0), v1.5.2 (fixed v1.5.1)
→ `4 / 10 = 0.4`.

With public data, rework is built from the same detected failures as the change failure
rate, so the two usually come out close; here both are 4 of 10. They differ when one release
fixes several failures (rework counts it once) or a failure's fix falls outside the window.

**Expected: 40%.**

**With the broad, non-default setting "every patch release is rework":** the fixes above
plus every patch release (v1.2.1, v1.4.1, v1.5.1, v1.5.2) → v1.2.1, v1.4.0, v1.4.1, v1.5.1,
v1.5.2 → `5 / 10 = 0.5` (**50%**).

## Summary

| Metric | Expected | Shown as |
|---|---|---|
| Deployment frequency | 70/90 = 0.7777… per week (10 deployments) | 0.78 per week |
| Change lead time | 49 h (median of 18 commits) | 2.0 days |
| Change failure rate | 4/10 = 0.4 | 40% |
| Failed deployment recovery time | 33 h (median of 4) | 33 hours |
| Rework rate | 4/10 = 0.4 (broad setting: 5/10 = 0.5) | 40% (broad: 50%) |

**Requests (no token), current period only:** repository 1 + releases 1 + tag list 1 + 14 tag
dates + 10 comparisons = **27**. Tag dates are read newest version line first (lines 2.0: 1,
1.5: 3, 1.4: 2, 1.3: 1, 1.2: 2, 1.1: 1, 1.0: 1), then lines entirely before the window until
three in a row are found: 0.9 (v0.9.0), 0.8 (its newest, v0.8.4) and 0.7 (v0.7.0) = 3 more.
(v1.2 had 25: the v1.3 sandbox added the 0.8 and 0.7 lines.)

**Display rule:** durations under 48 hours are shown in hours. 48 hours or
more are shown in days with one decimal place.

## Context on the tiles (v1.3)

### Plain-language sentences

Rules (PLAN.md §2c): durations in words are "less than an hour" under 1 h, hours under 48 h,
days (rounded) under 14 days, weeks (rounded) under 60 days, else months (rounded, 30 days).
"About 1 in k" is used only when `k = round(n / f)` is at least 2 and `1/k` is within 10% of
`f/n`; otherwise the exact "f of n".

| Tile | Working | Sentence |
|---|---|---|
| Deployment frequency | 90 days ÷ 10 releases = 9 days | "A new release about every 9 days." |
| Change lead time | 49 h ≥ 48 h → days: round(49 / 24) = 2 | "A finished change waits about 2 days before users get it." |
| Change failure rate | 4 of 10: k = round(2.5) = 3, 1/3 = 0.33 is 17% off 0.4 → exact | "4 of 10 releases needed an urgent fix." |
| Recovery time | 33 h < 48 h → hours | "When a release went wrong, the fix usually reached users within about 33 hours." |
| Rework rate | 4 of 10 → exact (as above) | "4 of 10 releases were urgent fixes for earlier releases." |

### The previous 90 days

Window: 2025-10-03 00:00 UTC up to (not including) 2026-01-01 00:00 UTC (90 days, ending where
the current window starts). Same rules and settings.

| Release | Date | Predecessor | Changes (written) | Lead time (h) |
|---|---|---|---|---|
| v0.8.0 | 10-13 12:00 | v0.7.0 | feat: add name option (10-08 12:00); docs: add examples (10-12 12:00) | **120**, **24** |
| v0.8.1 | 10-14 08:00 | v0.8.0 | fix: crash on empty name (10-14 06:00) | **2** |
| v0.8.2 | 11-03 12:00 | v0.8.1 | fix: trim whitespace in names (10-30 12:00) | **96** (4 days) |
| v0.8.3 | 11-17 12:00 | v0.8.2 | perf: faster greeting (11-14 12:00) | **72** (3 days) |
| v0.8.4 | 12-01 12:00 | v0.8.3 | chore: update dependencies (11-27 12:00) | **96** (4 days) |
| v0.9.0 | 12-15 12:00 | v0.8.4 | feat: add greeting (12-10 10:00) | **122** (5 days + 2 h) |

- **n = 6** → `6 × 7 / 90 = 42/90 = 0.4666…` per week (**0.47 per week**).
- **Lead time:** sorted `2, 24, 72, 96, 96, 120, 122`; 7 values, median = 4th = **96 h** ("4.0 days").
- **Failures:** v0.8.1 is the next patch of v0.8.0, 20 h later (≤ 48 h) → **v0.8.0 failed**,
  remediation v0.8.1. Other patches: v0.8.1 → v0.8.2 is 20 days, v0.8.2 → v0.8.3 14 days,
  v0.8.3 → v0.8.4 14 days, all over 48 h. No reverts. **Failure rate 1/6 = 16.7%.**
- **Recovery:** v0.8.0 (10-13 12:00) → v0.8.1 (10-14 08:00) = **20 h**.
- **Rework:** v0.8.1 (fixed v0.8.0) → **1/6 = 16.7%**.

### Comparison lines

Direction is decided on the shown values; equal shown values say "about the same".

| Tile | Current vs previous | Line |
|---|---|---|
| Deployment frequency | 0.78 vs 0.47 per week | "More often than the previous 90 days (0.78 vs 0.47 per week)." |
| Change lead time | 49 h vs 96 h | "Faster than the previous 90 days (2.0 days vs 4.0 days)." |
| Change failure rate | 40% vs 16.7% | "Higher than the previous 90 days (40% vs 16.7%)." |
| Recovery time | 33 h vs 20 h | "Slower than the previous 90 days (33 hours vs 20 hours)." |
| Rework rate | 40% vs 16.7% | "Higher than the previous 90 days (40% vs 16.7%)." |

**Requests for the comparison (no token):** responses already fetched for the current period
are reused, so the previous period adds only 4 tag dates (v0.8.3, v0.8.2, v0.8.1, v0.8.0;
v0.8.4, v0.9.0 and v0.7.0 were already read) + 6 comparisons (v0.7.0…v0.8.0 to v0.8.4…v0.9.0)
= **10**. Total **27 + 10 = 37**, within the 50-request budget.

**When the previous period can't be compared:** with fewer than 5 releases in it, every tile
says "Not compared: the previous 90 days had only N releases (at least 5 are needed)." If the
request budget runs out before the previous period is fully measured, the tiles that need
commit details (lead time, failure rate, recovery, rework) say the comparison needs a token;
deployment frequency needs only release dates and is still compared when those were read.

### DORA 2025 context (deployment frequency and lead time only)

Source: *State of AI-assisted Software Development 2025* (DORA, Google LLC, v2025.2), page 20,
Figures 11 and 12, "Top %" column; licensed CC BY-NC-SA 4.0.

- **Deployment frequency:** 0.78 per week is at least weekly-to-monthly (≥ 7/30 = 0.233 per
  week) but less than weekly (< 1 per week) → band "Between once per week and once per month",
  Top % **76.1** → "About 76% of surveyed teams ship this often or more."
- **Lead time:** 49 h is at least one day (24 h) and under one week (168 h) → band "Between one
  day and one week", Top % **56.4** → "About 56% of surveyed teams have this lead time or
  shorter."
- The three proxy tiles show no DORA figure.

## Manual corrections (v1.2)

A person can overrule the automatic detection for any release in the deployments list
(PLAN.md §2b). Same sandbox, same window and settings as above, with two corrections:

- **v1.4.1 marked as failed**, fixed by the next release (the default): **v1.5.0**.
- **v1.2.0 marked as not failed** (say its quick patch v1.2.1 was planned).

Rules: a release marked failed gets the chosen fix as its remediation; a release marked not
failed has no remediation. Everything else stays automatic. Recovery and rework are then
recalculated from the corrected list, exactly as in Step 3–4.

| Deployment | Automatic | Corrected | Fixes (after correction) | Rework? |
|---|---|---|---|---|
| v1.2.0 | failed (quick patch v1.2.1) | **not failed** (by hand) | — | no |
| v1.2.1 | — | — | nothing any more (v1.2.0 is not failed) | **no** (was yes) |
| v1.3.0 | failed (revert in v1.4.0) | failed | — | no |
| v1.4.0 | — | — | v1.3.0 | yes |
| v1.4.1 | not failed | **failed** (by hand), fixed by v1.5.0 | — | no |
| v1.5.0 | failed (quick patch v1.5.1) | failed | **v1.4.1** | **yes** (was no) |
| v1.5.1 | failed (quick patch v1.5.2) | failed | v1.5.0 | yes |
| v1.5.2 | — | — | v1.5.1 | yes |

**Change failure rate:** failed = v1.3.0, v1.4.1, v1.5.0, v1.5.1 → `4 / 10 = 0.4` (**40%**,
unchanged: one failure added, one removed).

**Recovery** (to the first release after it that isn't failed):

| Failure | Chain | Recovery |
|---|---|---|
| v1.3.0 (02-16 12:00) | → v1.4.0 (02-18 12:00) | **48 h** |
| v1.4.1 (03-06 12:00) | → v1.5.0 (failed) → v1.5.1 (failed) → v1.5.2 (03-22 08:00) | 16 days − 4 h = 384 − 4 = **380 h** |
| v1.5.0 (03-20 12:00) | → v1.5.1 (failed) → v1.5.2 (03-22 08:00) | **44 h** |
| v1.5.1 (03-21 10:00) | → v1.5.2 (03-22 08:00) | **22 h** |

Sorted `[22, 44, 48, 380]`, median = `(44 + 48) / 2 = 46` hours (**"46 hours"**).

**Rework:** v1.4.0, v1.5.0, v1.5.1, v1.5.2 → `4 / 10 = 0.4` (**40%**; different releases from
the automatic result: v1.2.1 drops out, v1.5.0 comes in).

**Unchanged:** deployment frequency 0.78 per week, lead time 49 h (2.0 days); corrections don't
touch dates or commits.

| Metric | Automatic | With the two corrections |
|---|---|---|
| Deployment frequency | 0.78 per week | 0.78 per week |
| Change lead time | 2.0 days | 2.0 days |
| Change failure rate | 40% | 40% |
| Failed deployment recovery time | 33 hours | **46 hours** |
| Rework rate | 40% | 40% (v1.4.0, v1.5.0, v1.5.1, v1.5.2) |

**A failure that isn't fixed in the period.** If instead **v1.5.2** (the last release) is marked
failed, there is no later release, so the default fix is "not fixed in this period":
failed = v1.2.0, v1.3.0, v1.5.0, v1.5.1, v1.5.2 → `5 / 10 = 0.5` (**50%**). v1.5.1's chain now
ends at a failed release with no fix, and so does v1.5.0's, so neither has a recovery time;
recoveries are v1.2.0 20 h and v1.3.0 48 h → median `(20 + 48) / 2 = 34` h (**"34 hours"**,
from 2 of 5 failures, 3 not recovered in the period). Rework is unchanged at
v1.2.1, v1.4.0, v1.5.1, v1.5.2 → **40%**.

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
- `d1` names PR #99 → not found; title fallback: *feat: beta flag* is in no release →
  **unmatched**, fails nothing.
- `e1` names nothing; its quoted title *chore: tidy* is in no release → **unmatched**.

So there are **2 unmatched reverts**, which the app reports as one collapsed note.

**Lead times (h):** v2.0.0: 24 · v2.1.0: 120 (5 days) · v2.2.0: 168 (7 days), 96 (4 days) ·
v2.3.0: 120 (5 days), 72 (3 days). Sorted: `24, 72, 96, 120, 120, 168`; median = `(96 + 120) / 2 = 108` h.

| Metric | Expected | Shown as |
|---|---|---|
| Deployment frequency | 4 / (90 / 7) = 28/90 = 0.3111… per week | 0.31 per week |
| Change lead time | 108 h (6 commits) | 4.5 days |
| Change failure rate | 1/4 = 0.25 (v2.1.0) | 25% |
| Failed deployment recovery time | v2.1.0 (01-20 12:00) → v2.2.0 (02-01 12:00) = 12 days = 288 h | 12.0 days |
| Rework rate | 1/4 = 0.25 (v2.2.0 fixed v2.1.0) | 25% |
| Unmatched reverts | 2 | "2 reverts could not be matched to a release" |

**Requests:** repository 1 + releases 1 + 4 comparisons + 2 pull-request look-ups (#10, #99) = **8**.
With a budget of 7, the comparisons still fit (6 requests), the look-up for #99 is the 7th
(newest release first) and #10 can't be looked up, with a note that the request limit
stopped the look-ups. The title fallback still applies to `b1`: its quoted title
*feat: search (#10)* (the revert's own `(#12)` suffix is not part of it) is exactly `a1`'s
first line, shipped in v2.1.0. So the result is the same **1 failure (v2.1.0)**, and
**2 unmatched** (`d1`, `e1`), with 7 requests.

## Fixture case: reverts of copied commits

Projects like angular copy ("cherry-pick") fixes onto maintenance branches; each copy gets a
new commit id, and a revert on a maintenance branch often names the id of the original on the
main branch. Hand-written deployments (`tests/unit/definitions-v1-1.test.ts`), window
2026-01-01 → 2026-02-01, two version lines (3.0.x maintenance, 3.1.x current):

| Release | Time | Changes (commit id, first line) |
|---|---|---|
| v3.0.0 | 01-05 00:00 | — |
| v3.0.1 | 01-10 00:00 | `aaaa111` *fix(router): handle slashes* (a copy) |
| v3.1.0 | 01-12 00:00 | `bbbb222` *fix(router): handle slashes* (another copy); `cccc333` *feat: x*; `dddd444` *Revert "feat: x"* / `This reverts commit cccc333.` |
| v3.0.2 | 01-15 00:00 | `eeee555` *Revert "fix(router): handle slashes"* / `This reverts commit 9999aaa.` (`9999aaa` is the main-branch original, in no release) |
| v3.1.1 | 01-20 00:00 | `ffff777` *Revert "feat: y"* / `This reverts commit 8888bbb.` (no release has `8888bbb` or *feat: y*) |

**Reverts:**
- `dddd444` reverts `cccc333`, which is in **its own release** v3.1.0: the change never
  reached users. Not a failure, not unmatched.
- `eeee555` names `9999aaa`, found in no release → **title fallback**: *fix(router): handle
  slashes* is in v3.0.1 and in v3.1.0, both earlier. The copy on the revert's own version
  line (3.0) wins → **v3.0.1 failed**, remediation v3.0.2.
- `ffff777` → neither the id nor the title is found → **unmatched**.

Quick patches: v3.0.0 → v3.0.1 is 5 days, v3.0.1 → v3.0.2 is 5 days, v3.1.0 → v3.1.1 is
8 days, all over 48 h → none.

| Metric | Expected |
|---|---|
| Deployments | 5 |
| Failed | v3.0.1 only → 1/5 = 0.2 (20%) |
| Recovery | v3.0.1 (01-10 00:00) → v3.0.2 (01-15 00:00) = 120 h ("5.0 days") |
| Rework | v3.0.2 (fixed v3.0.1) → 1/5 = 0.2 (20%) |
| Unmatched reverts | 1 (`Revert "feat: y"`) |
