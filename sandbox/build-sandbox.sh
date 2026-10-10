#!/usr/bin/env bash
# Builds the dora-sandbox git history from scratch with fixed dates, then
# force-pushes it. Rerunning produces the identical history (same SHAs).
#
# Usage:  sandbox/build-sandbox.sh [remote-url]
#   PUSH=0 sandbox/build-sandbox.sh   # build only, print the result, don't push
#
# Normally this runs on GitHub: the workflow on the `claude/sandbox-builder`
# branch of dora-sandbox checks out this repo and runs this script.
#
# The expected DORA metrics for this history are worked out in sandbox/EXPECTED.md.
# If you change anything here, redo EXPECTED.md by hand first.
set -euo pipefail

REMOTE="${1:-https://github.com/GonzaSSH/dora-sandbox.git}"
PUSH="${PUSH:-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

export GIT_AUTHOR_NAME="Sandbox Bot" GIT_AUTHOR_EMAIL="sandbox-bot@example.com"
export GIT_COMMITTER_NAME="Sandbox Bot" GIT_COMMITTER_EMAIL="sandbox-bot@example.com"
export TZ=UTC
GIT=(git -C "$WORK" -c commit.gpgsign=false -c tag.gpgsign=false -c core.autocrlf=false)

at() { export GIT_AUTHOR_DATE="$1 +0000" GIT_COMMITTER_DATE="$1 +0000"; }

# commit <date> <file> <message>: appends the message to <file> and commits it.
commit() {
  at "$1"
  mkdir -p "$WORK/$(dirname "$2")"
  echo "$3" >> "$WORK/$2"
  "${GIT[@]}" add -A
  "${GIT[@]}" commit -q -m "$3"
}

# tag <date> <name>: annotated tag, so the tag date is fixed (tagger date).
tag() { at "$1"; "${GIT[@]}" tag -a "$2" -m "Release $2"; }

"${GIT[@]}" init -q -b main

at "2025-09-01 10:00:00"
cp "$HERE/sandbox-readme.md" "$WORK/README.md"
"${GIT[@]}" add -A && "${GIT[@]}" commit -q -m "Initial commit"
commit "2025-09-10 10:00:00" src/hello.txt "feat: add hello"
tag    "2025-09-15 12:00:00" v0.7.0

# The previous 90 days (v1.3), so the dashboard can compare periods: six releases in
# Oct-Dec 2025, including one quick-patch failure (v0.8.0 -> v0.8.1, 20 hours later).
commit "2025-10-08 12:00:00" src/hello.txt  "feat: add name option"
commit "2025-10-12 12:00:00" docs/usage.txt "docs: add examples"
tag    "2025-10-13 12:00:00" v0.8.0
commit "2025-10-14 06:00:00" src/hello.txt  "fix: crash on empty name"
tag    "2025-10-14 08:00:00" v0.8.1
commit "2025-10-30 12:00:00" src/hello.txt  "fix: trim whitespace in names"
tag    "2025-11-03 12:00:00" v0.8.2
commit "2025-11-14 12:00:00" src/hello.txt  "perf: faster greeting"
tag    "2025-11-17 12:00:00" v0.8.3
commit "2025-11-27 12:00:00" package.txt    "chore: update dependencies"
tag    "2025-12-01 12:00:00" v0.8.4

commit "2025-12-10 10:00:00" src/greeting.txt "feat: add greeting"
tag    "2025-12-15 12:00:00" v0.9.0

commit "2026-01-02 09:00:00" src/farewell.txt "feat: add farewell"
commit "2026-01-04 15:00:00" docs/usage.txt   "docs: describe usage"
tag    "2026-01-05 12:00:00" v1.0.0

commit "2026-01-12 10:00:00" src/counter.txt  "feat: add counter"
commit "2026-01-16 10:00:00" test/counter.txt "test: cover counter"
commit "2026-01-18 18:00:00" src/counter.txt  "refactor: tidy counter"
tag    "2026-01-19 12:00:00" v1.1.0

# Failure 1: v1.2.0 is followed by a quick patch release (v1.2.1) 20 hours later.
commit "2026-01-26 12:00:00" src/config.txt "feat: add config file"
commit "2026-01-30 08:00:00" src/config.txt "feat: read config from env"
tag    "2026-02-02 12:00:00" v1.2.0
commit "2026-02-03 06:00:00" src/config.txt "fix: crash when config file is missing"
tag    "2026-02-03 08:00:00" v1.2.1

# Failure 2: v1.3.0 ships a change that the next release (v1.4.0) reverts.
commit "2026-02-09 12:00:00" src/colour.txt   "feat: add colour output"
commit "2026-02-13 12:00:00" src/progress.txt "feat: add progress bar"
PROGRESS_SHA="$("${GIT[@]}" rev-parse HEAD)"
tag    "2026-02-16 12:00:00" v1.3.0
at "2026-02-17 10:00:00"
"${GIT[@]}" revert --no-edit "$PROGRESS_SHA" >/dev/null
commit "2026-02-18 08:00:00" src/quiet.txt "feat: add quiet flag"
tag    "2026-02-18 12:00:00" v1.4.0

# Rework that is not a failure: a fix-only patch release, well after v1.4.0.
commit "2026-03-02 12:00:00" docs/help.txt "fix: typo in help text"
commit "2026-03-05 12:00:00" src/cli.txt   "fix(cli): handle empty input"
tag    "2026-03-06 12:00:00" v1.4.1

commit "2026-03-12 12:00:00" src/json.txt "feat: add json output"
commit "2026-03-19 12:00:00" src/json.txt "fix: json escaping"
tag    "2026-03-20 12:00:00" v1.5.0

# One failure needing two fix releases (v1.1): v1.5.0 gets a quick patch v1.5.1, which
# itself breaks and gets another quick patch v1.5.2 (each 22 hours later).
commit "2026-03-21 08:00:00" src/json.txt "fix: json escaping for unicode"
tag    "2026-03-21 10:00:00" v1.5.1
commit "2026-03-22 06:00:00" src/json.txt "fix: restore json escaping for ascii"
tag    "2026-03-22 08:00:00" v1.5.2

# Excluded by the default version pattern: a pre-release and a lightweight tag.
commit "2026-03-24 12:00:00" src/plugins.txt "feat: experimental plugin system"
tag    "2026-03-25 12:00:00" v1.6.0-beta.1
"${GIT[@]}" tag experiment

# After the analysis window (ends 2026-03-31): excluded.
commit "2026-04-02 12:00:00" src/runtime.txt "feat!: drop node 18 support"
tag    "2026-04-06 12:00:00" v2.0.0

echo "HEAD $("${GIT[@]}" rev-parse HEAD)"
"${GIT[@]}" log --reverse --format='%h %aI %s'
"${GIT[@]}" for-each-ref refs/tags --sort=creatordate --format='%(refname:short) %(objecttype) %(creatordate:iso-strict)'

if [ "$PUSH" = "1" ]; then
  # Rewrites main and replaces all tags. Other branches are left alone.
  "${GIT[@]}" push --force "$REMOTE" main:refs/heads/main
  "${GIT[@]}" push --force --prune "$REMOTE" 'refs/tags/*:refs/tags/*'
fi
