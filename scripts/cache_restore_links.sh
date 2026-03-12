#!/usr/bin/env bash
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

echo "--- Restoring links S3 cache ---"
aws s3 cp "s3://$BUCKET/cache/links.parquet" "$DATA_DIR/links.parquet" 2>/dev/null \
  && echo "links.parquet restored" \
  || echo "links.parquet not in cache (first run or never fetched)"

mkdir -p "$DATA_DIR/raw/ecdysis_cache"
aws s3 sync "s3://$BUCKET/cache/ecdysis_cache/" "$DATA_DIR/raw/ecdysis_cache/" \
  --exclude '*' --include '*.html' \
  || echo "ecdysis_cache not in S3 yet"
