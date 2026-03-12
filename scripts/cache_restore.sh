#!/usr/bin/env bash
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$REPO_ROOT/data"
ASSETS_DIR="$REPO_ROOT/frontend/src/assets"

echo "--- Restoring S3 cache ---"
aws s3 cp "s3://$BUCKET/cache/ecdysis.parquet" "$DATA_DIR/ecdysis.parquet" 2>/dev/null \
  && cp "$DATA_DIR/ecdysis.parquet" "$ASSETS_DIR/ecdysis.parquet" \
  && echo "ecdysis.parquet restored" \
  || echo "ecdysis.parquet not in cache"

aws s3 cp "s3://$BUCKET/cache/samples.parquet" "$DATA_DIR/samples.parquet" 2>/dev/null \
  && cp "$DATA_DIR/samples.parquet" "$ASSETS_DIR/samples.parquet" \
  && echo "samples.parquet restored" \
  || echo "samples.parquet not in cache (full fetch will run)"

aws s3 cp "s3://$BUCKET/cache/last_fetch.txt" "$DATA_DIR/last_fetch.txt" 2>/dev/null \
  && echo "last_fetch.txt restored" \
  || echo "last_fetch.txt not in cache"

aws s3 cp "s3://$BUCKET/cache/observations.ndjson" "$DATA_DIR/observations.ndjson" 2>/dev/null \
  && echo "observations.ndjson restored" \
  || echo "observations.ndjson not in cache (will be written after fetch)"
