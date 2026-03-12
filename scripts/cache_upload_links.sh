#!/usr/bin/env bash
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

echo "--- Uploading links cache to S3 ---"
aws s3 cp "$DATA_DIR/links.parquet" "s3://$BUCKET/cache/links.parquet"
echo "links.parquet uploaded."

aws s3 sync "$DATA_DIR/raw/ecdysis_cache/" "s3://$BUCKET/cache/ecdysis_cache/" \
  --exclude '*' --include '*.html'
echo "ecdysis_cache synced to S3."

echo "Links cache uploaded."
