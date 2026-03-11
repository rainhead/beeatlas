#!/usr/bin/env bash
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
CACHE_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

echo "--- Restoring S3 cache ---"
aws s3 cp "s3://$BUCKET/cache/samples.parquet" "$CACHE_DIR/samples.parquet" 2>/dev/null \
  && echo "samples.parquet restored" \
  || echo "samples.parquet not in cache (full fetch will run)"

aws s3 cp "s3://$BUCKET/cache/last_fetch.txt" "$CACHE_DIR/last_fetch.txt" 2>/dev/null \
  && echo "last_fetch.txt restored" \
  || echo "last_fetch.txt not in cache"

aws s3 cp "s3://$BUCKET/cache/observations.ndjson" "$CACHE_DIR/observations.ndjson" 2>/dev/null \
  && echo "observations.ndjson restored" \
  || echo "observations.ndjson not in cache (will be written after fetch)"
