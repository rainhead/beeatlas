#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/data"

echo "--- Downloading Ecdysis data ---"
uv run python ecdysis/download.py --datasetid 44

ZIPFILE=$(ls -t ecdysis_*.zip | head -1)
echo "--- Processing $ZIPFILE ---"
uv run python ecdysis/occurrences.py "$ZIPFILE"

cp ecdysis.parquet "$REPO_ROOT/frontend/src/assets/ecdysis.parquet"
echo "--- Done: ecdysis.parquet copied to frontend/src/assets/ ---"

echo "--- Fetching iNaturalist data ---"
uv run python -m inat.download

cp samples.parquet "$REPO_ROOT/frontend/src/assets/samples.parquet"
echo "--- Done: samples.parquet copied to frontend/src/assets/ ---"

echo "--- Restoring links cache from S3 ---"
cd "$REPO_ROOT"
npm run cache-restore-links

echo "--- Fetching Ecdysis specimen links ---"
npm run fetch-links

echo "--- Uploading links cache to S3 ---"
npm run cache-upload-links

cp "$REPO_ROOT/data/links/links.parquet" "$REPO_ROOT/frontend/src/assets/links.parquet" \
  || echo "links.parquet not found, skipping (pipeline not yet run)"
echo "--- Done: links.parquet step complete ---"
