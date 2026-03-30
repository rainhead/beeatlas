#!/usr/bin/env bash
# Nightly pipeline: pull DuckDB from S3, run pipelines, push exports + DB, invalidate CloudFront.
# Runs: ecdysis -> ecdysis-links -> inaturalist -> projects -> export
# Designed for cron on maderas. Logs to stdout/stderr (capture with cron's MAILTO or redirect).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUCKET="${BUCKET:-beeatlasstack-sitebucket397a1860-h5dtjzkld3yv}"
DISTRIBUTION_ID="${DISTRIBUTION_ID:-E3SAI2PQ8FN0E7}"
DB_S3_KEY="db/beeatlas.duckdb"
DB_PATH="/tmp/beeatlas.duckdb"
EXPORT_DIR="/tmp/beeatlas-export"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"

echo "=== BeeAtlas nightly pipeline $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

# 1. Pull DuckDB from S3 (missing = first run, not an error)
echo "--- pulling DuckDB from S3 ---"
if ! aws --profile "$AWS_PROFILE" s3 cp "s3://$BUCKET/$DB_S3_KEY" "$DB_PATH" 2>/dev/null; then
    echo "No existing DuckDB in S3 (first run), starting fresh."
fi

# 2. Run pipelines
echo "--- running pipelines ---"
mkdir -p "$EXPORT_DIR"
export DB_PATH EXPORT_DIR
cd "$SCRIPT_DIR"
~/.local/bin/uv run python - <<'EOF'
import sys, time
from ecdysis_pipeline import load_ecdysis, load_links
from inaturalist_pipeline import load_observations
from projects_pipeline import load_projects
from export import main as export_all

steps = [
    ("ecdysis",        load_ecdysis),
    ("ecdysis-links",  load_links),
    ("inaturalist",    load_observations),
    ("projects",       load_projects),
    ("export",         export_all),
]
for name, fn in steps:
    print(f"--- {name} ---")
    t = time.monotonic()
    fn()
    print(f"--- {name} done in {time.monotonic()-t:.1f}s ---")
EOF

# 3. Push exports to S3 /data/
echo "--- uploading exports ---"
for f in ecdysis.parquet samples.parquet counties.geojson ecoregions.geojson; do
    aws --profile "$AWS_PROFILE" s3 cp "$EXPORT_DIR/$f" "s3://$BUCKET/data/$f"
done

# 4. Back up DuckDB to S3 /db/
echo "--- backing up DuckDB ---"
aws --profile "$AWS_PROFILE" s3 cp "$DB_PATH" "s3://$BUCKET/$DB_S3_KEY"

# 5. Invalidate CloudFront /data/*
echo "--- invalidating CloudFront ---"
aws --profile "$AWS_PROFILE" cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/data/*" \
    --query "Invalidation.Id" --output text

echo "=== pipeline complete $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
