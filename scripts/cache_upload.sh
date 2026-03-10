#!/usr/bin/env bash
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
CACHE_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

echo "--- Uploading to S3 cache ---"
aws s3 cp "$CACHE_DIR/samples.parquet" "s3://$BUCKET/cache/samples.parquet"
aws s3 cp "$CACHE_DIR/last_fetch.txt" "s3://$BUCKET/cache/last_fetch.txt"
echo "Cache uploaded."
