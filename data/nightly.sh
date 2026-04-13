#!/usr/bin/env bash
# Nightly pipeline: pull DuckDB from S3, run pipelines, push exports + DB, invalidate CloudFront.
# Runs: ecdysis -> ecdysis-links -> inaturalist -> projects -> export -> feeds
# Designed for cron on maderas. Logs to stdout/stderr (capture with cron's MAILTO or redirect).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUCKET="${BUCKET:-beeatlasstack-sitebucket397a1860-h5dtjzkld3yv}"
DISTRIBUTION_ID="${DISTRIBUTION_ID:-E3SAI2PQ8FN0E7}"
DB_S3_KEY="db/beeatlas.duckdb"
DB_PATH="/tmp/beeatlas.duckdb"
EXPORT_DIR="/tmp/beeatlas-export"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"

_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_hash() { sha256sum "$1" | awk '{print $1}'; }
_elapsed() { echo $(( $(date +%s) - $1 ))s; }

echo "=== BeeAtlas nightly pipeline $(_ts) ==="

# Always back up DuckDB on exit (success or failure) so pipeline progress
# (e.g. occurrence_links) is not lost if a later step fails.
trap 'if [[ -f "$DB_PATH" ]]; then echo "--- backing up DuckDB (trap) --- sha256=$(_hash "$DB_PATH")"; aws --profile "$AWS_PROFILE" s3 cp --no-progress "$DB_PATH" "s3://$BUCKET/$DB_S3_KEY" || true; fi' EXIT

# 1. Pull DuckDB from S3 (missing = first run, not an error)
echo "--- pulling DuckDB from S3 ---"
_t0=$(date +%s)
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/$DB_S3_KEY" "$DB_PATH" 2>/dev/null; then
    echo "No existing DuckDB in S3 (first run), starting fresh."
else
    echo "sha256=$(_hash "$DB_PATH") ($(_elapsed $_t0))"
fi

# 2. Run pipelines
echo "--- running pipelines ---"
_t0=$(date +%s)
mkdir -p "$EXPORT_DIR"
export DB_PATH EXPORT_DIR
cd "$SCRIPT_DIR"
uv run python run.py
echo "--- pipelines done in $(_elapsed $_t0) ---"

# 3. Push exports to S3 /data/
echo "--- uploading exports ---"
_t0=$(date +%s)
for f in ecdysis.parquet samples.parquet counties.geojson ecoregions.geojson; do
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$EXPORT_DIR/$f" "s3://$BUCKET/data/$f"
done
aws --profile "$AWS_PROFILE" s3 sync --no-progress "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"
echo "exports uploaded in $(_elapsed $_t0)"

# 4. Invalidate CloudFront /data/*
echo "--- invalidating CloudFront ---"
_t0=$(date +%s)
aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/data/*" \
    --query "Invalidation.Id" --output text
echo "invalidation requested in $(_elapsed $_t0)"

echo "=== pipeline complete $(_ts) ==="
