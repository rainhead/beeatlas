#!/usr/bin/env bash
# Single entry point for the BeeAtlas data pipeline.
#
# Cron invokes this directly. Crontab owns only host-specific knowledge
# (repo location, log path, schedule). Everything else — dependency
# management, source sync, pipeline orchestration, S3 + CloudFront — is
# owned in-repo and version-controlled here.
#
# What this script does, in order:
#   1. cd to repo root (derived from $0 — host-agnostic).
#   2. Source NVM if available, `nvm use` to pick the .nvmrc-pinned node.
#   3. `git pull --ff-only` so the next steps see the latest code.
#   4. `npm ci` so mapshaper (and any other node-side tooling) is present.
#   5. `uv sync` in data/ so the Python pipeline deps are present.
#   6. Pull the DuckDB snapshot from S3 to /tmp.
#   7. Run the data pipeline (Stelis — a content-addressed build over the
#      data/ scripts; see github.com/rainhead/stelis).
#   8. Publish: merge the rendered site + hashed data into SITE_ROOT (the
#      Apache-served root, ADR 0007) and — while PUBLISH_S3=1 — push exports
#      to S3 + invalidate CloudFront + dispatch the GH Actions deploy.
#   9. EXIT trap: back up the DuckDB to S3 even on failure so partial
#      progress (e.g. occurrence_links) isn't lost.
#
# Relationship to Stelis: Stelis is the pure pipeline orchestrator (a dependency
# graph over the data/ scripts, env-driven via DB_PATH + EXPORT_DIR + NOTES_DB_PATH).
# It knows nothing about S3, git, cron, or hosting. nightly.sh wraps Stelis with the
# deployment-time concerns above. Local dev can run a single task with
# `racket src/main.rkt --run <task>` from the Stelis checkout, or the whole build
# with `--build --all`, and skip this wrapper.

set -euo pipefail

# uv installs to ~/.local/bin which cron omits from PATH.
export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUCKET="${BUCKET:-beeatlasstack-sitebucket397a1860-h5dtjzkld3yv}"
DISTRIBUTION_ID="${DISTRIBUTION_ID:-E3SAI2PQ8FN0E7}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://hc-ping.com/411cd80a-965b-408c-8f89-b2b3afda0286}"
DB_S3_KEY="db/beeatlas.duckdb"
DB_PATH="/tmp/beeatlas.duckdb"
EXPORT_DIR="/tmp/beeatlas-export"
# Notes store (Phase 179): the notes-harvest step reads the SAME authoritative
# SQLite store the write API (systemd beeatlas-api) writes to. Must match the
# API's NOTES_DB_PATH (~/.config/systemd/user/beeatlas-api.service) and the
# go-live runbook (docs/runbooks/notes-write-launch-gate.md §A4), NOT the code
# default in notes_store/db.py (/opt/beeatlas-store/notes.db, which is unused on
# maderas). Without this export the harvest reads a nonexistent store and emits
# an empty notes.json — no author note ever reaches the static site.
NOTES_DB_PATH="${NOTES_DB_PATH:-$HOME/beeatlas-store/notes.db}"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"
# Local serving root (stelis ADR 0007, st-bgy): when this directory exists, the
# publish step merges the rendered site + hashed data artifacts into it — the
# Apache DocumentRoot (infra/maderas/beeatlas.net.conf). Absent = local publish
# skipped, so the nightly is unchanged until the vhost is installed.
SITE_ROOT="${SITE_ROOT:-/var/www/beeatlas.net}"
# Kill switch for the S3/CloudFront/GH-dispatch legs. Default ON until the DNS
# flip to maderas has soaked; then set PUBLISH_S3=0 in crontab. (Deleting the
# legs outright is st-vjd's post-soak teardown, not this switch's job.)
PUBLISH_S3="${PUBLISH_S3:-1}"
TAXA_S3_KEY="raw/taxa.csv.gz"
TAXA_CACHE_S3_KEY="raw/taxa_cache.json"
TAXA_PATH="$SCRIPT_DIR/raw/taxa.csv.gz"
TAXA_CACHE_PATH="$SCRIPT_DIR/raw/taxa_cache.json"

_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_hash() { sha256sum "$1" | awk '{print $1}'; }
_elapsed() { echo $(( $(date +%s) - $1 ))s; }

echo "=== BeeAtlas nightly pipeline $(_ts) ==="

# 0. Sync source + dependencies. NVM is required for node tooling
# (mapshaper, called by data/topology_postprocess.py).
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

# Always back up DuckDB on exit (success or failure) so pipeline progress
# (e.g. occurrence_links) is not lost if a later step fails.
trap '
if [[ -f "$DB_PATH" ]]; then
    echo "--- backing up DuckDB (trap) --- sha256=$(_hash "$DB_PATH")"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$DB_PATH" "s3://$BUCKET/$DB_S3_KEY" || true
fi
if [[ -f "$TAXA_PATH" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_PATH" "s3://$BUCKET/$TAXA_S3_KEY" || true
fi
if [[ -f "$TAXA_CACHE_PATH" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_CACHE_PATH" "s3://$BUCKET/$TAXA_CACHE_S3_KEY" || true
fi
' EXIT

# 1. Pull DuckDB from S3 (missing = first run, not an error)
echo "--- pulling DuckDB from S3 ---"
_t0=$(date +%s)
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/$DB_S3_KEY" "$DB_PATH" 2>/dev/null; then
    echo "No existing DuckDB in S3 (first run), starting fresh."
else
    echo "sha256=$(_hash "$DB_PATH") ($(_elapsed $_t0))"
fi

# 1b. Pull taxa.csv.gz and ETag sidecar from S3 (missing on first run = not an error)
echo "--- pulling taxa.csv.gz from S3 ---"
mkdir -p "$SCRIPT_DIR/raw"
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/$TAXA_S3_KEY" "$TAXA_PATH" 2>/dev/null; then
    echo "No cached taxa.csv.gz in S3 (first run), will download from iNat."
fi
# Pull sidecar alongside archive so ETag conditional GET fires on next run
aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/$TAXA_CACHE_S3_KEY" "$TAXA_CACHE_PATH" 2>/dev/null || true

# 1c. Pull currently-live published artifacts to public/data/ so test_dbt_diff
# can compare fresh sandbox vs last-night's live data (regression baseline).
#
# NOTE (A3): The manifest `species` key maps to the hashed species.json, NOT
# species.parquet. species.parquet is not published via manifest and is therefore
# NOT pulled here. Tests that diff public/data/species.parquet will skip in
# nightly — this is acceptable (those tests skip, they do not fail; the
# non-parquet diffs still gate). Do not invent a species.parquet manifest key.
#
# First-run behavior: if no manifest.json exists in S3 (very first nightly run),
# the pull is skipped gracefully. test_dbt_diff will skip (not fail) — this is
# expected. On subsequent runs the manifest is present and the diff asserts.
echo "--- pulling published artifacts for integration baseline ---"
_t0=$(date +%s)
_PREV_MANIFEST="/tmp/beeatlas-prev-manifest.json"
mkdir -p "$REPO_ROOT/public/data"
if aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/data/manifest.json" "$_PREV_MANIFEST" 2>/dev/null; then
    # Pull baseline artifacts via the declarative contract.
    # The contract emits: name<TAB>hashed<TAB>source_file for each baseline_diff artifact.
    # Unknown manifest keys trigger a WARN to stderr (drift alarm); see artifacts.toml.
    # NOTE (A3): 'species' maps to species.json (not species.parquet); see artifacts.toml.
    _pulled=0; _failed=0
    while IFS=$'\t' read -r _name _hashed _local; do
        if aws --profile "$AWS_PROFILE" s3 cp --no-progress \
            "s3://$BUCKET/data/$_hashed" "$REPO_ROOT/public/data/$_local"; then
            _sz=$(wc -c < "$REPO_ROOT/public/data/$_local" 2>/dev/null || echo 0)
            printf '  pulled %-14s %s -> public/data/%s (%s bytes)\n' \
                "$_name" "$_hashed" "$_local" "$_sz"
            _pulled=$(( _pulled + 1 ))
        else
            printf 'WARN: could not pull %s -> %s\n' "$_hashed" "$_local" >&2
            _failed=$(( _failed + 1 ))
        fi
    done < <(python3 $SCRIPT_DIR/artifacts.py baseline-pull-plan "$_PREV_MANIFEST") || true
    printf '  baseline pull: %d pulled, %d failed\n' "$_pulled" "$_failed"
    [[ "$_failed" -gt 0 ]] && printf 'WARN: baseline pull had %d failures\n' "$_failed" >&2 || true
    echo "published artifact pull done in $(_elapsed $_t0)"
else
    echo "WARN: no manifest.json in S3 (first run) — test_dbt_diff will skip (not fail)"
fi

# 2. Run pipelines — Stelis (github.com/rainhead/stelis) orchestrates the build.
#
# Stelis models the pipeline as a content-addressed dependency graph: `--build
# --all` runs every task, but skips work whose inputs are unchanged and is
# partial-success (a failed task blocks only its dependents; the resulting
# non-zero exit then aborts publish below via `set -euo pipefail`). It shells the
# SAME data/ scripts via uv, reading the pipeline's DuckDB (DB_PATH) and the notes
# store (NOTES_DB_PATH) through the env exported below. Cache + history persist in
# $STELIS_DIR/.stelis/ across nightlies, so an unchanged nightly is fast.
#
# Replaced run.py (the imperative STEPS loop that always ran everything fail-fast)
# at the 2026-07-17 cutover. To roll back to run.py, restore it from git history.
echo "--- running pipelines ---"
_t0=$(date +%s)
mkdir -p "$EXPORT_DIR"
export DB_PATH EXPORT_DIR NOTES_DB_PATH
cd "$SCRIPT_DIR"
STELIS_DIR="${STELIS_DIR:-$HOME/dev/stelis}"
echo "  orchestrator: stelis --build --all  (STELIS_DIR=$STELIS_DIR)"
( cd "$STELIS_DIR" && BEEATLAS_DIR="$REPO_ROOT" \
    racket src/main.rkt --build --all --export-dir "$EXPORT_DIR" )
echo "--- pipelines done in $(_elapsed $_t0) ---"

# 2b. Run integration (dataset-validation) tier — HARD GATE before publish.
#
# D-01/D-01b: ALL @integration tests gate the publish. Any single failure
# exits non-zero here, before the S3 upload / CloudFront invalidation /
# healthcheck ping. Stale data stays live until fixed; monitoring catches
# the skipped ping.
#
# D-01a: The gate runs AFTER Stelis builds fresh dbt artifacts (SANDBOX is
# populated) and AFTER block 1c pulled last-night's live data into public/data/
# (PUBLIC is populated). test_dbt_diff therefore compares fresh sandbox vs
# currently-live S3 data — the correct regression-diff baseline.
#
# EXIT trap: The DuckDB/taxa.csv.gz backup trap (set above) still fires on
# exit 1 — it uses `|| true` for each S3 copy so the exit code is preserved.
# Do not modify the trap.
#
# Drop -x to get a full failure inventory at the cost of slower abort
# (Pitfall 7 — -x is faster and sufficient for the deploy gate).
#
# EXPECTED FIRST-RUN BEHAVIOR after an INTENDED occurrences-contract change:
# test_dbt_diff WILL fail on the first nightly — the currently-live
# public/data/occurrences.parquet carries the OLD schema while the fresh sandbox
# carries the NEW schema. This is CORRECT regression behavior, not a defect. But
# it is a one-time DEADLOCK: the gate also blocks the very publish that would
# refresh the baseline, so it cannot self-heal on its own.
# To break it, run ONE publish of the new schema with the gate bypassed:
#     SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
# The NEXT normal run then compares new-vs-new and the gate passes unaided.
# (e.g. v4.7 added checklist_id/verbatim_name/locality/collapsed_count, 33->37.)
# Use the bypass ONLY for an intended, reviewed contract change — never to paper
# over an unexpected diff.
echo "--- integration test gate ---"
_t0=$(date +%s)
cd "$SCRIPT_DIR"
if [[ -n "${SKIP_INTEGRATION_GATE:-}" ]]; then
    echo "WARN: SKIP_INTEGRATION_GATE set — BYPASSING integration gate for this run." >&2
    echo "WARN: intended only for the one-time publish after a reviewed occurrences-contract change." >&2
elif ! uv run pytest -m integration -x --tb=short -q; then
    echo "INTEGRATION GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
else
    echo "integration gate passed in $(_elapsed $_t0)"
fi

# 3. Hash artifacts, write manifest.json, publish — locally into SITE_ROOT
# (ADR 0007: the Apache-served root on this host) and, while PUBLISH_S3=1, to
# S3 + CloudFront as before.
#
# Content-hashed filenames (e.g. occurrences-abc123def456.parquet) get
# Cache-Control: immutable so browsers never re-validate them (locally the
# vhost's LocationMatch sets the header). The manifest is published no-cache
# so browsers always fetch the latest hash list. GeoJSON files are uploaded
# with Content-Type application/json (not application/geo+json) so
# CloudFront's auto-compression fires on them — AWS's allowlist covers
# application/json but not the geo+json subtype.
echo "--- hashing and publishing exports ---"
_t0=$(date +%s)

_publish_local=""
if [[ -d "$SITE_ROOT" ]]; then
    _publish_local=1
    mkdir -p "$SITE_ROOT/data"
    if [[ -d "$EXPORT_DIR/site" ]]; then
        # Merge the rendered site: assets first (new HTML may reference them),
        # then the page tree with --delete so removed pages prune. /assets and
        # /data are never deleted on merge — a cached index.html may still
        # reference last night's hashed bundle (deploy.yml's old
        # sync-without-delete semantics); age-pruned instead.
        rsync -a "$EXPORT_DIR/site/assets/" "$SITE_ROOT/assets/"
        rsync -a --delete --exclude='/assets' --exclude='/data' \
            "$EXPORT_DIR/site/" "$SITE_ROOT/"
        find "$SITE_ROOT/assets" -type f -mtime +30 -delete
    else
        echo "WARN: $EXPORT_DIR/site missing — site render not merged" >&2
    fi
else
    echo "NOTE: SITE_ROOT $SITE_ROOT absent — local publish skipped (install: docs/runbooks/serve-from-maderas.md)" >&2
fi

# Upload a file at its content-hashed name (computed by the publish loop).
_upload_hashed() {
    local src="$1" hashed_name="$2"; shift 2
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        --cache-control "public, max-age=31536000, immutable" \
        "$@" "$src" "s3://$BUCKET/data/$hashed_name" >&2
}

# Like _upload_hashed but pre-compresses with gzip and sets Content-Encoding: gzip.
# CloudFront won't auto-compress application/octet-stream, so we do it ourselves.
_upload_hashed_gz() {
    local src="$1" hashed_name="$2"; shift 2
    local gz_tmp; gz_tmp=$(mktemp)
    gzip -9 -c "$src" > "$gz_tmp"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        --cache-control "public, max-age=31536000, immutable" \
        --content-encoding gzip \
        "$@" "$gz_tmp" "s3://$BUCKET/data/$hashed_name" >&2
    rm "$gz_tmp"
}

# Read occurrences.db tables (stays in bash — sqlite I/O is local, not S3).
occ_db_tables=$(uv run python3 -c "
import sqlite3, json
con = sqlite3.connect('$EXPORT_DIR/occurrences.db')
tables = sorted(r[0] for r in con.execute(\"SELECT name FROM sqlite_master WHERE type='table'\"))
print(json.dumps(tables))
")

# Publish each artifact from the declarative contract at its content-hashed
# name (hash of the uncompressed source, so addressing is stable across the
# local/S3 legs); accumulate name→hashed pairs for the manifest.
_mapfile=$(mktemp)
while IFS=$'\t' read -r _name _src _basename _gzip _ctype; do
    _src_path="$EXPORT_DIR/$_src"
    _ext="${_src_path##*.}"
    _hname="${_basename}-$(_hash "$_src_path" | cut -c1-12).${_ext}"
    if [[ -n "$_publish_local" ]]; then
        cp "$_src_path" "$SITE_ROOT/data/.$_hname.tmp"
        mv "$SITE_ROOT/data/.$_hname.tmp" "$SITE_ROOT/data/$_hname"
    fi
    if [[ "$PUBLISH_S3" == "1" ]]; then
        _fn="_upload_hashed"
        [[ "$_gzip" == "true" ]] && _fn="_upload_hashed_gz"
        _call_args=("$_src_path" "$_hname")
        [[ "$_ctype" != "-" ]] && _call_args+=(--content-type "$_ctype")
        "$_fn" "${_call_args[@]}"
    fi
    printf '%s\t%s\n' "$_name" "$_hname" >> "$_mapfile"
done < <(python3 $SCRIPT_DIR/artifacts.py publish-plan)

# Assemble manifest.json from the contract + hashed names + bash-side metadata.
python3 $SCRIPT_DIR/artifacts.py manifest "$_mapfile" \
    --meta "occurrences_db_tables=$occ_db_tables" \
    --meta "generated_at=$(_ts)" \
    > "$EXPORT_DIR/manifest.json"
rm "$_mapfile"

if [[ -n "$_publish_local" ]]; then
    # Stable-URL directories for external consumers, then age-prune old hashed
    # artifacts (manifest.json has no hash suffix — untouched), then the
    # manifest LAST and atomically: every name it resolves already exists by
    # the time readers (and the SW's NetworkFirst route) can see it.
    rsync -a --delete "$EXPORT_DIR/feeds/"        "$SITE_ROOT/data/feeds/"
    rsync -a --delete "$EXPORT_DIR/species-maps/" "$SITE_ROOT/data/species-maps/"
    rsync -a --delete "$EXPORT_DIR/place-maps/"   "$SITE_ROOT/data/place-maps/"
    find "$SITE_ROOT/data" -maxdepth 1 -type f -name '*-*.*' -mtime +30 -delete
    cp "$EXPORT_DIR/manifest.json" "$SITE_ROOT/data/.manifest.json.tmp"
    mv "$SITE_ROOT/data/.manifest.json.tmp" "$SITE_ROOT/data/manifest.json"
    echo "local publish into $SITE_ROOT done"
fi

if [[ "$PUBLISH_S3" == "1" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        --cache-control "no-cache" \
        "$EXPORT_DIR/manifest.json" "s3://$BUCKET/data/manifest.json"

    # Feeds, species-maps, and place-maps use stable (non-hashed) URLs for external consumers.
    # collector-maps removed in Phase 172 GC2 — replaced by committed SVG partials in _includes/maps/.
    aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"
    aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/species-maps/" "s3://$BUCKET/data/species-maps/"
    aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/place-maps/" "s3://$BUCKET/data/place-maps/"
    echo "exports published in $(_elapsed $_t0)"

    # 4. Invalidate CloudFront. Hashed artifacts are new URLs each run — no
    # edge cache to clear. Only the manifest and the stable-URL paths need it.
    echo "--- invalidating CloudFront ---"
    _t0=$(date +%s)
    aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/data/manifest.json" "/data/feeds/*" "/data/species-maps/*" "/data/place-maps/*" \
        --query "Invalidation.Id" --output text
    echo "invalidation requested in $(_elapsed $_t0)"
else
    echo "S3/CloudFront publish disabled (PUBLISH_S3=0)"
fi

echo "=== pipeline complete $(_ts) ==="

[[ -n "$HEALTHCHECK_URL" ]] && curl -fsS --retry 3 --max-time 10 "$HEALTHCHECK_URL" > /dev/null

# Trigger GitHub Actions deploy so collector pages refresh from today's S3 data.
# Gated with the S3 legs: deploy.yml builds FROM S3, so with PUBLISH_S3=0 a
# dispatch would rebuild the retired S3 site from stale data.
GH_DISPATCH_PAT_FILE="${GH_DISPATCH_PAT_FILE:-$HOME/.secrets/beeatlas-github-pat}"
echo "--- triggering repository_dispatch ---"
if [[ "$PUBLISH_S3" != "1" ]]; then
    echo "  skipped (PUBLISH_S3=0)"
elif [[ -f "$GH_DISPATCH_PAT_FILE" && -r "$GH_DISPATCH_PAT_FILE" ]]; then
    GH_PAT=$(cat "$GH_DISPATCH_PAT_FILE")
    curl -fsS --retry 3 --max-time 15 \
        -X POST \
        -H "Authorization: token $GH_PAT" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/rainhead/beeatlas/dispatches" \
        -d '{"event_type":"nightly-data-updated"}' \
    && echo "  dispatch sent" \
    || echo "WARN: repository_dispatch failed (non-fatal)" >&2
else
    echo "WARN: $GH_DISPATCH_PAT_FILE not found or unreadable — skipping dispatch" >&2
fi
