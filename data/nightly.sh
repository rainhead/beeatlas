#!/usr/bin/env bash
# Single entry point for the BeeAtlas nightly (stelis ADR 0007 Amendment,
# Model Y).
#
# Cron invokes this directly. Crontab owns only host-specific knowledge
# (repo location, log path, schedule). Everything else — dependency
# management, source sync, pipeline orchestration, publish — is owned
# in-repo and version-controlled here.
#
# What this script does, in order:
#   1. cd to repo root (derived from $0 — host-agnostic); take the publish
#      lock (shared with the st-nee write path: nightly and a note write
#      serialize here).
#   2. Source NVM, `nvm use` the .nvmrc-pinned node, git pull, npm ci
#      (lockfile-cached), uv sync.
#   3. Restore the integration-gate baseline (last PUBLISHED artifacts,
#      snapshotted in step 7) into public/data/.
#   4. `npm run fetch-data` — Stelis (github.com/rainhead/stelis) builds the
#      data into $EXPORT_DIR. Content-addressed: unchanged work skips;
#      partial-success (a failed task blocks only its dependents; non-zero
#      exit aborts the publish below via `set -euo pipefail`).
#   5. Integration gate: ALL @integration tests must pass (fresh dbt sandbox
#      vs. the step-3 baseline) or the publish is aborted — stale data stays
#      live until fixed.
#   6. `npm run build` — 11ty inlines the baked artifacts from $EXPORT_DIR,
#      Vite hashes the bundles, and the postbuild step (scripts/
#      postbuild-data.mjs) derives _site/data: hashed runtime binaries +
#      stable-URL dirs + the slim manifest.
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

# One epoch for the whole run: Stelis presets it for build determinism, and
# postbuild-data.mjs stamps it into the slim manifest as generated_at.
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

# 1. Sync source + dependencies. NVM is required for node tooling
# (mapshaper, called by data/topology_postprocess.py, and the site build).
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
# Cache node_modules between runs keyed on package-lock.json hash. npm ci wipes
# node_modules and reinstalls everything every call, which on this repo means
# rebuilding the msgpackr-extract native addon (transitive via mapshaper) — a
# multi-minute hit even when nothing has changed. The cache file lives outside
# node_modules so `npm ci` can't blow it away.
_LOCK_HASH=$(sha256sum package-lock.json | awk '{print $1}')
_LOCK_CACHE="$REPO_ROOT/.npm-lock-hash"
if [[ -d node_modules && -f "$_LOCK_CACHE" && "$(cat "$_LOCK_CACHE")" == "$_LOCK_HASH" ]]; then
    echo "  npm: package-lock.json unchanged (hash $(echo "$_LOCK_HASH" | cut -c1-12)…); skipping reinstall"
else
    echo "  npm: lockfile changed or node_modules missing; running npm ci"
    npm ci
    echo "$_LOCK_HASH" > "$_LOCK_CACHE"
fi
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
# snapshot in step 5 below — NOT last night's possibly-unpublished export).
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
# $STELIS_DIR/.stelis/ across nightlies, so an unchanged nightly is fast.
# Replaced run.py at the 2026-07-17 cutover; Model Y (ADR 0007 Amendment)
# narrowed Stelis to the data engine — the site render below is top-level.
echo "--- building data (stelis fetch-data) ---"
_t0=$(date +%s)
export DB_PATH EXPORT_DIR NOTES_DB_PATH
STELIS_DIR="${STELIS_DIR:-$HOME/dev/stelis}"
export STELIS_DIR
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

# 4b. JS suites that need the pipeline's artifacts (*.data.test.ts). These are
# excluded from `npm test` because a clean CI checkout has no data dir — see
# vite.config.ts and beeatlas-6q2, which is the CI red this split fixes. Here
# the data exists, so they run for real: EXPORT_DIR is already exported above
# and lib/build-data-dir.js resolves it ahead of public/data.
#
# This is a hard gate, like the integration gate: a failure here means the
# rendered site would be wrong, so we abort rather than publish. Note that
# SKIP_INTEGRATION_GATE does NOT bypass it — that flag is scoped to the pytest
# contract gate above.
echo "--- JS data-dependent test gate ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
if ! npm run test:data; then
    echo "JS DATA TEST GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
fi
echo "JS data test gate passed in $(_elapsed $_t0)"

# 5. Render the site. 11ty inlines the baked artifacts straight from
# $EXPORT_DIR (lib/build-data-dir.js honors the env), Vite hashes the
# bundles, and the postbuild step derives _site/data (hashed runtime
# binaries + stable dirs + slim manifest, generated_at from
# SOURCE_DATE_EPOCH above).
echo "--- building site ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
npm run build
echo "--- site build done in $(_elapsed $_t0) ---"

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
