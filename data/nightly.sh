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

# 2. Run pipelines
echo "--- running pipelines ---"
_t0=$(date +%s)
mkdir -p "$EXPORT_DIR"
export DB_PATH EXPORT_DIR
cd "$SCRIPT_DIR"
uv run python run.py
echo "--- pipelines done in $(_elapsed $_t0) ---"

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
  "occurrences_db_tables": $occ_db_tables,
  "generated_at": "$(_ts)"
}
JSON
aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    --cache-control "no-cache" \
    "$EXPORT_DIR/manifest.json" "s3://$BUCKET/data/manifest.json"

# Feeds, species-maps, and place-maps use stable (non-hashed) URLs for external consumers.
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/species-maps/" "s3://$BUCKET/data/species-maps/"
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/place-maps/" "s3://$BUCKET/data/place-maps/"
echo "exports uploaded in $(_elapsed $_t0)"

# 4. Invalidate CloudFront. Hashed artifacts are new URLs each run — no
# edge cache to clear. Only the manifest and the stable-URL paths need it.
echo "--- invalidating CloudFront ---"
_t0=$(date +%s)
aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/data/manifest.json" "/data/feeds/*" "/data/species-maps/*" "/data/place-maps/*" \
    --query "Invalidation.Id" --output text
echo "invalidation requested in $(_elapsed $_t0)"

echo "=== pipeline complete $(_ts) ==="

[[ -n "$HEALTHCHECK_URL" ]] && curl -fsS --retry 3 --max-time 10 "$HEALTHCHECK_URL" > /dev/null
