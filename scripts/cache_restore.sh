#!/usr/bin/env bash
set -euo pipefail
BUCKET="${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$REPO_ROOT/frontend/src/assets"

echo "--- Restoring parquet assets from S3 ---"
aws s3 cp "s3://$BUCKET/data/ecdysis.parquet" "$ASSETS_DIR/ecdysis.parquet" \
  && echo "ecdysis.parquet restored" \
  || { echo "ecdysis.parquet not found in S3"; exit 1; }

aws s3 cp "s3://$BUCKET/data/samples.parquet" "$ASSETS_DIR/samples.parquet" \
  && echo "samples.parquet restored" \
  || { echo "samples.parquet not found in S3"; exit 1; }
