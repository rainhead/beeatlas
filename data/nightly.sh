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
#   7. Run the Python pipeline (`run.py` — pure data transformation).
#   8. Push exports to S3 + invalidate CloudFront.
#   9. EXIT trap: back up the DuckDB to S3 even on failure so partial
#      progress (e.g. occurrence_links) isn't lost.
#
# Relationship to run.py: run.py is the pure pipeline orchestrator (STEPS
# list, env-driven via DB_PATH + EXPORT_DIR). It knows nothing about S3,
# git, cron, or hosting. nightly.sh wraps run.py with the deployment-time
# concerns above. Local dev typically runs `uv run python run.py` directly
# (against data/beeatlas.duckdb) and skips this whole wrapper.

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
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"
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
    uv run python3 -c "
import json, os, subprocess, sys
manifest = json.load(open('$_PREV_MANIFEST'))
bucket = '$BUCKET'
profile = '$AWS_PROFILE'
dest = '$REPO_ROOT/public/data'

# Derived-from-manifest baseline pull. Every published artifact the integration
# gate may diff must land in public/data/ under a stable local name. The pull
# set is NOT a hardcoded subset — we iterate ALL manifest keys and classify each,
# so a newly published artifact can never be silently dropped (the exact bug that
# left higher_taxa.json/photos.json frozen for days while species.json advanced):
#   - mapped in LOCAL_NAMES      -> pulled to public/data/<local name>
#   - NON_FILE_KEYS              -> metadata, skipped silently
#   - INTENTIONALLY_SKIPPED      -> a real artifact we deliberately don't baseline
#   - anything else              -> WARN (drift alarm: a new key needs classifying)
# A3: 'species' maps to the hashed species.json (NOT species.parquet).
LOCAL_NAMES = {
    'occurrences': 'occurrences.parquet',
    'counties':    'counties.geojson',
    'ecoregions':  'ecoregions.geojson',
    'species':     'species.json',
    'seasonality': 'seasonality.json',
    'higher_taxa': 'higher_taxa.json',  # _data/species.js reads this at build (deploy.yml pulls it too)
    'photos':      'photos.json',
    'collectors':  'collectors.json',
}
# Pure metadata in the manifest — never files.
NON_FILE_KEYS = {'occurrences_db_tables', 'generated_at'}
# Real published artifacts intentionally NOT in the baseline diff (documented so
# they don't trip the drift WARN): occurrences_db is the 23 MB sqlite (the parquet
# is the diff baseline); places/checklist artifacts aren't diffed by the gate today.
# collector_event_pages is ~29 MB — too large for a daily baseline pull (same
# reasoning as occurrences_db).
INTENTIONALLY_SKIPPED = {'occurrences_db', 'places', 'places_meta', 'checklist', 'collector_event_pages'}

pulled, skipped, failed, drift = [], [], [], []
for key, hashed in manifest.items():
    if key in NON_FILE_KEYS or key in INTENTIONALLY_SKIPPED:
        continue
    if key not in LOCAL_NAMES:
        print(f'WARN: manifest key {key!r} is not mapped to a public/data baseline '
              f'file — add it to LOCAL_NAMES (or INTENTIONALLY_SKIPPED) in nightly.sh '
              f'so the integration gate diffs it (drift guard)', file=sys.stderr)
        drift.append(key)
        continue
    local = LOCAL_NAMES[key]
    if not hashed:
        print(f'WARN: manifest key {key!r} ({local}) absent or empty — skipping', file=sys.stderr)
        skipped.append(key)
        continue
    r = subprocess.run(
        ['aws', '--profile', profile, 's3', 'cp', '--no-progress',
         f's3://{bucket}/data/{hashed}', f'{dest}/{local}'],
        capture_output=True
    )
    if r.returncode != 0:
        print(f'WARN: could not pull {hashed} -> {local}: {r.stderr.decode().strip()}', file=sys.stderr)
        failed.append(local)
        continue
    sz = os.path.getsize(f'{dest}/{local}')
    print(f'  pulled {key:<12s} {hashed} -> public/data/{local} ({sz:,} bytes)')
    pulled.append(local)
print(f'  baseline pull: {len(pulled)} pulled, {len(skipped)} skipped, '
      f'{len(failed)} failed, {len(drift)} unmapped(drift)')
# A failed pull means the baseline is incomplete -> the integration gate would
# diff stale/partial data. Surface it loudly; the gate still runs (|| true below).
if failed:
    print(f'WARN: baseline pull had {len(failed)} failures: {failed}', file=sys.stderr)
" 2>&1 || true
    echo "published artifact pull done in $(_elapsed $_t0)"
else
    echo "WARN: no manifest.json in S3 (first run) — test_dbt_diff will skip (not fail)"
fi

# 2. Run pipelines
echo "--- running pipelines ---"
_t0=$(date +%s)
mkdir -p "$EXPORT_DIR"
export DB_PATH EXPORT_DIR
cd "$SCRIPT_DIR"
uv run python run.py
echo "--- pipelines done in $(_elapsed $_t0) ---"

# 2b. Run integration (dataset-validation) tier — HARD GATE before publish.
#
# D-01/D-01b: ALL @integration tests gate the publish. Any single failure
# exits non-zero here, before the S3 upload / CloudFront invalidation /
# healthcheck ping. Stale data stays live until fixed; monitoring catches
# the skipped ping.
#
# D-01a: The gate runs AFTER run.py builds fresh dbt artifacts (SANDBOX is
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

# 3. Hash artifacts, write manifest.json, push to S3.
#
# Content-hashed filenames (e.g. occurrences-abc123def456.parquet) get
# Cache-Control: immutable so browsers never re-validate them. The manifest
# is uploaded no-cache so browsers always fetch the latest hash list.
# GeoJSON files are uploaded with Content-Type application/json (not
# application/geo+json) so CloudFront's auto-compression fires on them —
# AWS's allowlist covers application/json but not the geo+json subtype.
echo "--- hashing and uploading exports ---"
_t0=$(date +%s)

# Upload a file with a content-hash suffix; print the hashed filename.
_upload_hashed() {
    local src="$1" basename="$2"; shift 2
    local ext="${src##*.}"
    local hash; hash=$(sha256sum "$src" | awk '{print $1}' | cut -c1-12)
    local hashed_name="${basename}-${hash}.${ext}"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        --cache-control "public, max-age=31536000, immutable" \
        "$@" "$src" "s3://$BUCKET/data/$hashed_name" >&2
    echo "$hashed_name"
}

# Like _upload_hashed but pre-compresses with gzip and sets Content-Encoding: gzip.
# CloudFront won't auto-compress application/octet-stream, so we do it ourselves.
# Hash is computed from the uncompressed source so content addressing is stable.
_upload_hashed_gz() {
    local src="$1" basename="$2"; shift 2
    local ext="${src##*.}"
    local hash; hash=$(sha256sum "$src" | awk '{print $1}' | cut -c1-12)
    local hashed_name="${basename}-${hash}.${ext}"
    local gz_tmp; gz_tmp=$(mktemp)
    gzip -9 -c "$src" > "$gz_tmp"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        --cache-control "public, max-age=31536000, immutable" \
        --content-encoding gzip \
        "$@" "$gz_tmp" "s3://$BUCKET/data/$hashed_name" >&2
    rm "$gz_tmp"
    echo "$hashed_name"
}

occ_name=$(_upload_hashed "$EXPORT_DIR/occurrences.parquet" "occurrences")
occ_db_name=$(_upload_hashed_gz "$EXPORT_DIR/occurrences.db" "occurrences")
occ_db_tables=$(uv run python3 -c "
import sqlite3, json
con = sqlite3.connect('$EXPORT_DIR/occurrences.db')
tables = sorted(r[0] for r in con.execute(\"SELECT name FROM sqlite_master WHERE type='table'\"))
print(json.dumps(tables))
")
species_name=$(_upload_hashed "$EXPORT_DIR/species.json" "species")
seasonality_name=$(_upload_hashed "$EXPORT_DIR/seasonality.json" "seasonality")
higher_taxa_name=$(_upload_hashed "$EXPORT_DIR/higher_taxa.json" "higher_taxa")
counties_name=$(_upload_hashed "$EXPORT_DIR/counties.geojson" "counties" --content-type application/json)
ecoregions_name=$(_upload_hashed "$EXPORT_DIR/ecoregions.geojson" "ecoregions" --content-type application/json)
places_name=$(_upload_hashed "$EXPORT_DIR/places.geojson" "places" --content-type application/json)
places_meta_name=$(_upload_hashed "$EXPORT_DIR/places.json" "places_meta" --content-type application/json)
checklist_name=$(_upload_hashed "$EXPORT_DIR/checklist.parquet" "checklist")
photos_name=$(_upload_hashed "$EXPORT_DIR/photos.json" "photos")
collectors_name=$(_upload_hashed "$EXPORT_DIR/collectors.json" "collectors")
collector_event_pages_name=$(_upload_hashed "$EXPORT_DIR/collector_event_pages.json" "collector_event_pages")

cat > "$EXPORT_DIR/manifest.json" <<JSON
{
  "occurrences": "$occ_name",
  "occurrences_db": "$occ_db_name",
  "species": "$species_name",
  "seasonality": "$seasonality_name",
  "higher_taxa": "$higher_taxa_name",
  "counties": "$counties_name",
  "ecoregions": "$ecoregions_name",
  "places": "$places_name",
  "places_meta": "$places_meta_name",
  "checklist": "$checklist_name",
  "photos": "$photos_name",
  "collectors": "$collectors_name",
  "collector_event_pages": "$collector_event_pages_name",
  "occurrences_db_tables": $occ_db_tables,
  "generated_at": "$(_ts)"
}
JSON
aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    --cache-control "no-cache" \
    "$EXPORT_DIR/manifest.json" "s3://$BUCKET/data/manifest.json"

# Feeds, species-maps, place-maps, and collector-maps use stable (non-hashed) URLs for external consumers.
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/species-maps/" "s3://$BUCKET/data/species-maps/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/place-maps/" "s3://$BUCKET/data/place-maps/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/collector-maps/" "s3://$BUCKET/data/collector-maps/"   # Phase 172
echo "exports uploaded in $(_elapsed $_t0)"

# 4. Invalidate CloudFront. Hashed artifacts are new URLs each run — no
# edge cache to clear. Only the manifest and the stable-URL paths need it.
echo "--- invalidating CloudFront ---"
_t0=$(date +%s)
aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/data/manifest.json" "/data/feeds/*" "/data/species-maps/*" "/data/place-maps/*" "/data/collector-maps/*" \
    --query "Invalidation.Id" --output text
echo "invalidation requested in $(_elapsed $_t0)"

echo "=== pipeline complete $(_ts) ==="

[[ -n "$HEALTHCHECK_URL" ]] && curl -fsS --retry 3 --max-time 10 "$HEALTHCHECK_URL" > /dev/null

# Trigger GitHub Actions deploy so collector pages refresh from today's S3 data.
GH_DISPATCH_PAT_FILE="${GH_DISPATCH_PAT_FILE:-$HOME/.secrets/beeatlas-github-pat}"
echo "--- triggering repository_dispatch ---"
if [[ -f "$GH_DISPATCH_PAT_FILE" && -r "$GH_DISPATCH_PAT_FILE" ]]; then
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
