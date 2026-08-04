#!/usr/bin/env bash
# Single entry point for the BeeAtlas nightly (stelis ADR 0007 Amendment,
# Model Y).
#
# Cron invokes this directly. Crontab owns only host-specific knowledge
# (repo location, log path, schedule). Everything else — dependency
# management, source sync, pipeline orchestration, publish — is owned
# in-repo and version-controlled here.
#
# What this script does, in order. NOTE this list counts the cd+lock as step 1, which
# the numbered comments in the body do not, so from there on the two disagree: this 6
# is the body's 5, and this 7 covers the body's 6 AND 7. Match them by NAME, not by
# number.
#   1. cd to repo root (derived from $0 — host-agnostic); take the publish
#      lock (shared with the st-nee write path: nightly and a note write
#      serialize here).
#   2. Source NVM, `nvm use` the .nvmrc-pinned node, git pull BOTH repos —
#      this one and the stelis checkout that owns the task graph, since a
#      change spanning the two ships only if both move (beeatlas-cwh) — npm
#      ci (lockfile-cached), uv sync.
#   3. Restore the integration-gate baseline (last PUBLISHED artifacts,
#      snapshotted in step 7) into public/data/.
#   4. `npm run fetch-data` — Stelis (github.com/rainhead/stelis) builds the
#      data into $EXPORT_DIR. Content-addressed: unchanged work skips;
#      partial-success (a failed task blocks only its dependents; non-zero
#      exit aborts the publish below via `set -euo pipefail`). On success it
#      stamps $EXPORT_DIR/generated_at — the site's "Data as of" clock, which
#      only this step may advance (beeatlas-923).
#   5. Integration gate: ALL @integration tests must pass (fresh dbt sandbox
#      vs. the step-3 baseline) or the publish is aborted — stale data stays
#      live until fixed.
#   6. `npm run build` — 11ty inlines the baked artifacts from $EXPORT_DIR,
#      Vite hashes the bundles, and the postbuild step (scripts/
#      postbuild-data.mjs) derives _site/data: hashed runtime binaries +
#      stable-URL dirs + the slim manifest, plus the build receipt.
#   6b. JS data-dependent gate (`*.data.test.ts`, which `npm test` excludes):
#      assertions against the _site just built — BEEATLAS_SITE_PREBUILT=1, so it
#      gates the tree about to be published rather than building its own
#      (beeatlas-b4p). A hard gate; failure aborts the publish.
#   7. Merge-swap _site into SITE_ROOT (rsync: assets + hashed data first
#      without --delete, stable dirs with --delete, pages with --delete,
#      manifest.json mv'd atomically LAST, age-prune old hashed files), then
#      snapshot the baseline for tomorrow's gate.
#   8. EXIT trap: back up the DuckDB + taxa cache offsite even on failure so
#      partial progress (e.g. occurrence_links) isn't lost. Still the S3 site
#      bucket for now; relocation to a dedicated backup bucket is st-pry,
#      which then unblocks the site bucket's teardown (st-vjd).
#
# Everything AWS-serving-side is gone (Model Y step C): the S3 site publish,
# CloudFront invalidation, GH-Actions dispatch, the bash manifest block, and
# the S3 pulls (DuckDB, taxa, baseline) — state now lives on this host under
# $VAR_DIR. Only the offsite backup trap remains.
#
# Layout (the /var/www htdocs+var convention; see
# docs/runbooks/serve-from-maderas.md for the migration):
#   $BASE_DIR/htdocs  — SITE_ROOT, the Apache DocumentRoot
#   $BASE_DIR/var     — pipeline state: beeatlas.duckdb, export/, baseline/,
#                       publish.lock

set -euo pipefail

# uv installs to ~/.local/bin which cron omits from PATH.
export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
SITE_ROOT="${SITE_ROOT:-$BASE_DIR/htdocs}"
VAR_DIR="${VAR_DIR:-$BASE_DIR/var}"
# Stelis's build state — observation history + input-addressed cache (st-7wu).
# Belongs beside the DuckDB and export dir it observes, not in whatever engine
# checkout happens to be cwd; step 1 updates that checkout nightly, and a
# project's record of itself should not ride along with it. Exported, so
# scripts/fetch-data.sh's `cd "$STELIS_DIR"` cannot change where state resolves.
# NOTE for interactive use on this host: a shell does NOT inherit this, so a bare
# `racket src/main.rkt --history` reads the cwd-relative default and reports an
# empty history. Pass the variable, or export it in your profile.
export STELIS_STATE_DIR="${STELIS_STATE_DIR:-$VAR_DIR/stelis}"
DB_PATH="${DB_PATH:-$VAR_DIR/beeatlas.duckdb}"
EXPORT_DIR="${EXPORT_DIR:-$VAR_DIR/export}"
BASELINE_DIR="${BASELINE_DIR:-$VAR_DIR/baseline}"
# Notes store (Phase 179): the notes-harvest step reads the SAME authoritative
# SQLite store the write API (systemd beeatlas-api) writes to. Must match the
# API's NOTES_DB_PATH (~/.config/systemd/user/beeatlas-api.service) and the
# go-live runbook (docs/runbooks/notes-write-launch-gate.md §A4), NOT the code
# default in notes_store/db.py (/opt/beeatlas-store/notes.db, which is unused on
# maderas). Without this export the harvest reads a nonexistent store and emits
# an empty notes/ dir — no author note ever reaches the static site.
NOTES_DB_PATH="${NOTES_DB_PATH:-$HOME/beeatlas-store/notes.db}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://hc-ping.com/411cd80a-965b-408c-8f89-b2b3afda0286}"

# Offsite backup (trap, step 8). Same-host is not a backup. The dedicated
# PipelineBackupBucket (CDK, st-pry) is the destination — set
# PIPELINE_BACKUP_BUCKET in the crontab from the stack's
# PipelineBackupBucketName output. No fallback: the old default (the site
# bucket) was DELETED by st-vjd, and a silent upload to a dead bucket would
# look like a backup while `|| true` swallowed every failure. Fail loud
# instead — the missed healthcheck ping is the alarm.
if [[ -z "${PIPELINE_BACKUP_BUCKET:-}" ]]; then
    echo "FATAL: PIPELINE_BACKUP_BUCKET is not set (crontab must pass the" >&2
    echo "PipelineBackupBucketName stack output) — refusing to run without" >&2
    echo "a real offsite backup destination (st-vjd)." >&2
    exit 78  # EX_CONFIG
fi
BACKUP_BUCKET="$PIPELINE_BACKUP_BUCKET"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"
DB_S3_KEY="db/beeatlas.duckdb"
TAXA_S3_KEY="raw/taxa.csv.gz"
TAXA_CACHE_S3_KEY="raw/taxa_cache.json"
TAXA_PATH="$SCRIPT_DIR/raw/taxa.csv.gz"
TAXA_CACHE_PATH="$SCRIPT_DIR/raw/taxa_cache.json"

# One epoch for the whole run: Stelis presets it for build determinism. The slim
# manifest's generated_at does NOT come from here — it comes from the export dir's
# `generated_at` stamp, written by scripts/fetch-data.sh at step 4 when the data
# actually refreshes, so a publish clock can never stand in for a data clock
# (beeatlas-923).
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(date +%s)}"

_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_hash() { sha256sum "$1" | awk '{print $1}'; }
_elapsed() { echo $(( $(date +%s) - $1 ))s; }

# Copy the integration-gate baseline artifacts (artifacts.py baseline-files)
# from $1 to $2, atomically per file. A missing source WARNs and is skipped —
# absence-tolerant in both directions (first run has no snapshot; a partial
# export refreshes only what it built).
_copy_baseline() {
    local from="$1" to="$2" copied=0
    mkdir -p "$to"
    while IFS=$'\t' read -r _name _src; do
        if [[ -f "$from/$_src" ]]; then
            cp "$from/$_src" "$to/.$_src.tmp"
            mv "$to/.$_src.tmp" "$to/$_src"
            copied=$(( copied + 1 ))
        else
            echo "WARN: $from missing $_name ($_src) — skipped" >&2
        fi
    done < <(python3 "$SCRIPT_DIR/artifacts.py" baseline-files)
    echo "  $copied baseline artifacts: $from -> $to"
}

echo "=== BeeAtlas nightly pipeline $(_ts) ==="

mkdir -p "$VAR_DIR" "$EXPORT_DIR"

# Publish lock: the st-nee write path runs the same fetch-data → build →
# merge-swap sequence for a single note; both serialize here so a nightly and
# a note write never interleave a publish. Waits (no -n): a queued run is
# better than a skipped one.
exec 200>"$VAR_DIR/publish.lock"
flock 200

# 1. Sync source + dependencies. NVM is required for node tooling: the site build
# (root package.json) and the pipeline's mapshaper (data/package.json, called by
# data/topology_postprocess.py). Both trees are installed below.
echo "--- syncing source + dependencies ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use --silent
else
    echo "WARN: $HOME/.nvm/nvm.sh not found — node tooling may not resolve" >&2
fi
git pull --ff-only

# Sync STELIS too (beeatlas-cwh). The task graph lives in a SEPARATE repo, so a
# change spanning both — a loader + dbt model here, its graph node there — ships
# only if BOTH move. Pulling one was a real failure on 2026-07-25: the new dbt
# model ran against a graph that never produced its input, and the error named a
# missing SCHEMA, which reads like a broken migration rather than "the other repo
# is one commit behind".
#
# We auto-FOLLOW stelis main rather than pinning a SHA. The nightly already adopts
# beeatlas main unreviewed a few lines up — the repo holding the loaders and dbt
# models — so this is the same risk already accepted, not a new category. Stelis is
# content-addressed, so a pull reads as 'code-changed and rebuilds exactly what the
# edit reaches. And the integration gate below still stands between a bad build and
# the publish. The alternatives (a pinned SHA in-repo, or vendoring stelis as a
# submodule) are written up on beeatlas-cwh and stay the right shape if this ever
# needs a review step per ship.
#
# A dirty or diverged stelis checkout — someone debugging on this host — fails
# --ff-only. That has to name STELIS_DIR HERE rather than surface an hour later as
# a dbt Catalog Error.
STELIS_DIR="${STELIS_DIR:-$HOME/dev/stelis}"
export STELIS_DIR
if [[ ! -d "$STELIS_DIR/.git" ]]; then
    echo "FATAL: no stelis git checkout at $STELIS_DIR — the task graph lives" >&2
    echo "there and cannot be synced. Set STELIS_DIR, or clone" >&2
    echo "github.com/rainhead/stelis." >&2
    exit 78  # EX_CONFIG
fi
if ! git -C "$STELIS_DIR" pull --ff-only; then
    echo "FATAL: 'git pull --ff-only' failed in the STELIS checkout $STELIS_DIR" >&2
    echo "(dirty working tree? diverged branch?). That checkout owns the task" >&2
    echo "graph; building with a stale one fails deep inside dbt instead of here." >&2
    exit 1
fi
echo "  stelis: $(git -C "$STELIS_DIR" rev-parse --short HEAD) $(git -C "$STELIS_DIR" log -1 --format=%s)"
# Racket compiles on demand, so this is an optimization, not a correctness step —
# but a cold compile of the whole graph inside the build is a slow surprise, and
# the 2026-07-25 recovery needed it. Non-fatal if raco is absent: `racket` is what
# fetch-data.sh actually invokes, and it would fail with a better message.
if command -v raco > /dev/null; then
    (cd "$STELIS_DIR" && raco make src/main.rkt)
else
    echo "  WARN: raco not on PATH — skipping stelis bytecode build" >&2
fi

# 1b. Can this host RUN the engine, and does the engine still agree with THIS
# repo? Two questions, both about the checkout we just pulled unreviewed.
#
# PROVISIONING (stelis scripts/preflight.sh, st-7lm): a stelis push arrives via
# the pull above, and nothing checked the host can load it. On 2026-08-01 `sha`
# was missing here, every `racket src/main.rkt` failed to load, and this whole
# leg was dead — as a module-resolution stack trace naming no fix. Fatal, early,
# and it prints the install command.
#
# DRIFT (the stelis suite, st-r0x): stelis MIRRORS things that live in this repo
# — notes-digest hardcodes notes_harvest's join, filter, and hashed field list;
# the graph declares each task's inputs and outputs. Nothing but stelis's tests
# ties the two, and they CANNOT run in stelis's CI, which has no beeatlas
# checkout. This host has both repos, so it is the only place they run at all.
#
# BEEATLAS_DIR is load-bearing, not decoration. Those tests default it to a path
# that exists only on Peter's laptop, and SKIP when it is absent — measured
# 2026-08-04, the suite skips 9 things without it and 2 with it. Unset, this gate
# would pass while running none of the checks it exists for.
#
# STELIS_STATE_DIR is redirected to a scratch dir for the same reason it is set
# globally above: tests must never write into the production build history.
#
# 40-65s on this host across two runs (measured 2026-08-04), against an hour for
# the data build — so it goes BEFORE that build rather than after.
echo "--- stelis preflight + test gate ---"
_t0=$(date +%s)
if [[ -n "${SKIP_STELIS_GATE:-}" ]]; then
    echo "WARN: SKIP_STELIS_GATE set — BYPASSING the stelis preflight + test gate." >&2
    echo "WARN: this publishes with the cross-repo drift checks UNRUN." >&2
else
    bash "$STELIS_DIR/scripts/preflight.sh"          # exits 78 on a provisioning gap
    _stelis_test_state="$(mktemp -d)"
    if ! (cd "$STELIS_DIR" &&           BEEATLAS_DIR="$REPO_ROOT" STELIS_STATE_DIR="$_stelis_test_state"           raco test src/*-test.rkt); then
        rm -rf "$_stelis_test_state"
        echo "STELIS TEST GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
        echo "The engine disagrees with this repo (or with itself). Publishing now" >&2
        echo "would build data with a pipeline whose contracts no longer hold." >&2
        exit 1
    fi
    rm -rf "$_stelis_test_state"
    echo "stelis gate passed in $(_elapsed $_t0)"
fi

# Cache node_modules between runs keyed on package-lock.json hash. npm ci wipes
# node_modules and reinstalls everything every call, which for the DATA tooling
# means rebuilding the msgpackr-extract and better-sqlite3 native addons
# (transitive via mapshaper) — a multi-minute hit even when nothing has changed.
# The cache file lives outside node_modules so `npm ci` can't blow it away.
#
# Two npm trees since beeatlas-dqh: the root one builds the SITE, data/ holds the
# PIPELINE's Node tooling (mapshaper). Splitting them kept 217 packages and both
# native addons out of the site build; the root tree now has no native addon at
# all on Linux, so its cache is just an I/O saving while data/'s is the real one.
_npm_sync() {
    local dir="$1" label="$2" hash cache
    hash=$(sha256sum "$dir/package-lock.json" | awk '{print $1}')
    cache="$dir/.npm-lock-hash"
    if [[ -d "$dir/node_modules" && -f "$cache" && "$(cat "$cache")" == "$hash" ]]; then
        echo "  npm[$label]: package-lock.json unchanged (hash ${hash:0:12}…); skipping reinstall"
    else
        echo "  npm[$label]: lockfile changed or node_modules missing; running npm ci"
        ( cd "$dir" && npm ci )
        echo "$hash" > "$cache"
    fi
}
_npm_sync "$REPO_ROOT" site
_npm_sync "$SCRIPT_DIR" data
cd "$SCRIPT_DIR"
uv sync
echo "sync done in $(_elapsed $_t0)"

# Always back up DuckDB + taxa cache on exit (success or failure) so pipeline
# progress (e.g. occurrence_links) is not lost if a later step fails. `|| true`
# per copy so the trap preserves the script's exit code.
trap '
if [[ -f "$DB_PATH" ]]; then
    echo "--- backing up DuckDB (trap) --- sha256=$(_hash "$DB_PATH")"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$DB_PATH" "s3://$BACKUP_BUCKET/$DB_S3_KEY" || true
fi
if [[ -f "$TAXA_PATH" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_PATH" "s3://$BACKUP_BUCKET/$TAXA_S3_KEY" || true
fi
if [[ -f "$TAXA_CACHE_PATH" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_CACHE_PATH" "s3://$BACKUP_BUCKET/$TAXA_CACHE_S3_KEY" || true
fi
' EXIT

if [[ ! -f "$DB_PATH" ]]; then
    echo "WARN: no DuckDB at $DB_PATH — first run on this layout? Loaders start fresh." >&2
    echo "WARN: migrating hosts? restore the offsite backup first: aws s3 cp s3://$BACKUP_BUCKET/$DB_S3_KEY $DB_PATH" >&2
fi

# 2. Restore the integration-gate baseline into public/data/ so test_dbt_diff
# can compare tonight's fresh sandbox against the last PUBLISHED data (the
# snapshot in step 7 below — NOT last night's possibly-unpublished export).
# First run: no snapshot yet → the diff tests skip (not fail) on the missing
# files, same first-run semantics as the retired S3 manifest pull.
echo "--- restoring integration baseline ---"
mkdir -p "$REPO_ROOT/public/data"
if [[ -d "$BASELINE_DIR" ]]; then
    _copy_baseline "$BASELINE_DIR" "$REPO_ROOT/public/data"
else
    echo "  no baseline snapshot yet (first run) — diff tests will skip (not fail)"
fi

# 3. Build the data — Stelis via the site repo's own interface (npm run
# fetch-data → stelis --build --all --export-dir). Cache + history persist in
# $STELIS_STATE_DIR across nightlies (set near the top, under $VAR_DIR beside the
# DuckDB and export dir they observe — stelis st-7wu), so an unchanged nightly is
# fast and the state does not live in the engine checkout that step 1 updates.
# Replaced run.py at the 2026-07-17 cutover; Model Y (ADR 0007 Amendment)
# narrowed Stelis to the data engine — the site render below is top-level.
echo "--- building data (stelis fetch-data) ---"
_t0=$(date +%s)
export DB_PATH EXPORT_DIR NOTES_DB_PATH
# STELIS_DIR is set and exported in step 1, which also syncs that checkout.
# Log the content-addressed plan (why each task runs/skips) before building, so the
# nightly log records what Stelis decided and why. scripts/fetch-data.sh runs the
# explain pass against the same export dir the build reads (non-fatal on error).
export STELIS_EXPLAIN=1
cd "$REPO_ROOT"
npm run fetch-data
echo "--- data build done in $(_elapsed $_t0) ---"

# 4. Integration (dataset-validation) gate — HARD GATE before build/publish.
#
# ALL @integration tests gate the publish: any single failure exits non-zero
# here, before the site build and merge-swap. Stale data stays live until
# fixed; monitoring catches the skipped healthcheck ping.
#
# The gate runs AFTER Stelis builds fresh dbt artifacts (SANDBOX is populated)
# and AFTER step 2 restored the last-published baseline into public/data/
# (PUBLIC is populated) — the correct regression-diff pairing.
#
# EXPECTED FIRST-RUN BEHAVIOR after an INTENDED occurrences-contract change:
# test_dbt_diff WILL fail — the baseline carries the OLD schema, the sandbox
# the NEW. Correct regression behavior, but a one-time DEADLOCK (the gate
# blocks the publish that would refresh the baseline). Break it with ONE
# gate-bypassed run:
#     SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
# Use the bypass ONLY for an intended, reviewed contract change — never to
# paper over an unexpected diff.
echo "--- integration test gate ---"
_t0=$(date +%s)
cd "$SCRIPT_DIR"
if [[ -n "${SKIP_INTEGRATION_GATE:-}" ]]; then
    echo "WARN: SKIP_INTEGRATION_GATE set — BYPASSING integration gate for this run." >&2
    echo "WARN: intended only for the one-time publish after a reviewed contract change." >&2
elif ! uv run pytest -m integration -x --tb=short -q; then
    echo "INTEGRATION GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
else
    echo "integration gate passed in $(_elapsed $_t0)"
fi

# 5. Render the site. 11ty inlines the baked artifacts straight from
# $EXPORT_DIR (lib/build-data-dir.js honors the env), Vite hashes the
# bundles, and the postbuild step derives _site/data (hashed runtime
# binaries + stable dirs + slim manifest, generated_at from
# SOURCE_DATE_EPOCH above) and records the build receipt a scoped note
# render checks (beeatlas-4oa).
#
# This runs BEFORE the JS gate below, which is the whole point (beeatlas-b4p):
# build-output.data.test.ts used to build the site ITSELF, in a beforeAll, so the
# nightly built twice and gated a tree it then threw away in favour of a second
# build nothing had looked at. They were byte-identical in practice, which is
# exactly why it went unnoticed. Now there is one build and the gate inspects the
# artifact that gets published.
echo "--- building site ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
npm run build
echo "--- site build done in $(_elapsed $_t0) ---"

# 5b. JS suites that need the pipeline's artifacts (*.data.test.ts). These are
# excluded from `npm test` because a clean CI checkout has no data dir — see
# vite.config.ts and beeatlas-6q2, which is the CI red this split fixes. Here
# the data exists, so they run for real: EXPORT_DIR is already exported above
# and lib/build-data-dir.js resolves it ahead of public/data.
#
# BEEATLAS_SITE_PREBUILT=1 tells build-output.data.test.ts to assert against the
# _site just built above instead of building its own (beeatlas-b4p). The suite
# fails loudly if that tree is missing, so the flag cannot silently gate nothing.
#
# This is a hard gate, like the integration gate: a failure here means the
# rendered site would be wrong, so we abort rather than publish. Note that
# SKIP_INTEGRATION_GATE does NOT bypass it — that flag is scoped to the pytest
# contract gate above.
echo "--- JS data-dependent test gate ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
if ! BEEATLAS_SITE_PREBUILT=1 npm run test:data; then
    echo "JS DATA TEST GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
fi
echo "JS data test gate passed in $(_elapsed $_t0)"

# 6. Merge-swap into SITE_ROOT (the Apache DocumentRoot). The rsync sequence
# lives in data/merge-swap.sh — THE publish contract, shared with the st-nee
# note-write path (data/publish-notes.sh). Exit 3 = SITE_ROOT absent, which
# for the nightly is a skip (fresh host), not a failure.
echo "--- publishing into $SITE_ROOT ---"
_t0=$(date +%s)
_published=""
_swap_rc=0
BASE_DIR="$BASE_DIR" SITE_ROOT="$SITE_ROOT" bash "$SCRIPT_DIR/merge-swap.sh" || _swap_rc=$?
if [[ $_swap_rc -eq 0 ]]; then
    _published=1
    echo "published in $(_elapsed $_t0)"
elif [[ $_swap_rc -eq 3 ]]; then
    echo "NOTE: SITE_ROOT $SITE_ROOT absent — publish skipped (install: docs/runbooks/serve-from-maderas.md)" >&2
else
    exit $_swap_rc
fi

# 7. Snapshot the baseline for tomorrow's gate — only after a successful
# publish, so the baseline is always the last data that actually went live.
# A publish-skipped run (no SITE_ROOT) must NOT advance the baseline to data
# that never went live.
if [[ -n "$_published" ]]; then
    echo "--- snapshotting integration baseline ---"
    _copy_baseline "$EXPORT_DIR" "$BASELINE_DIR"
else
    echo "publish skipped — baseline snapshot skipped (stays at last published)"
fi

echo "=== pipeline complete $(_ts) ==="

[[ -n "$HEALTHCHECK_URL" ]] && curl -fsS --retry 3 --max-time 10 "$HEALTHCHECK_URL" > /dev/null
