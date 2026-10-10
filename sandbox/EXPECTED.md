# Expected DORA metrics for `dora-sandbox`

These values are worked out **by hand** from the history that
[`build-sandbox.sh`](build-sandbox.sh) creates. They were written before any
metric code existed. The tests compare the code against this file, never the
other way round.

## Settings used

All defaults from PLAN.md, with a fixed window:

| Setting | Value |
|---|---|
| Window | 2026-01-01 00:00 UTC up to (not including) 2026-04-01 00:00 UTC = **90 days** |
| Deployment source | Auto → the repo has **no releases**, so **tags** are used |
| Version pattern | `^v?\d+\.\d+\.\d+$` |
| Quick-patch window `H` | 48 hours |
| Revert pattern | `^Revert` |
| Fix pattern | `^(fix\|hotfix\|bugfix)(\(.+\))?!?:\|^Revert` |

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

| Deployment | Quick patch within 48 h? | Next deployment (whose predecessor is this) has a revert? | Failed? | Remediation of | Fix-only patch bump? | Rework? |
|---|---|---|---|---|---|---|
| v1.0.0 | no v1.0.1 | v1.1.0: no | no | — | no (minor bump) | no |
| v1.1.0 | no v1.1.1 | v1.2.0: no | no | — | no | no |
| v1.2.0 | **v1.2.1, 20 h later** | v1.2.1: no | **yes** | — | no | no |
| v1.2.1 | no v1.2.2 | v1.3.0: no | no | **v1.2.0** | yes (`fix:` only) | **yes** |
| v1.3.0 | no v1.3.1 | **v1.4.0: yes** | **yes** | — | no | no |
| v1.4.0 | v1.4.1 is 16 days later (> 48 h) | v1.4.1: no | no | **v1.3.0** | no (minor bump) | **yes** |
| v1.4.1 | no v1.4.2 | v1.5.0: no | no | — | **yes** (both commits are `fix…:`) | **yes** |
| v1.5.0 | no v1.5.1 | no later deployment in window | no | — | no | no |

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

Rework: v1.2.1, v1.4.0, v1.4.1 → `3 / 8 = 0.375`.

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
