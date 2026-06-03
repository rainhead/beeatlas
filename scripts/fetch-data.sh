#!/usr/bin/env bash
# Download canonical data artifacts from S3 into public/data/ for local development.
# Mirrors the upload list in data/nightly.sh.
# Usage: scripts/fetch-data.sh [--profile <profile>] [--bucket <bucket>]

set -euo pipefail

BUCKET="${BUCKET:-beeatlasstack-sitebucket397a1860-h5dtjzkld3yv}"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/data"

while [[ $# -gt 0 ]]; do
  case $1 in
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --bucket)  BUCKET="$2";      shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$DEST"

for f in occurrences.parquet counties.geojson ecoregions.geojson species.json seasonality.json higher_taxa.json; do
  echo "Downloading $f..."
  aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/data/$f" "$DEST/$f"
done

echo "Syncing feeds/..."
aws --profile "$AWS_PROFILE" s3 sync --no-progress "s3://$BUCKET/data/feeds/" "$DEST/feeds/"

echo "Done. Files are in $DEST"
echo "Set VITE_DATA_BASE_URL=/data in .env.local to use them."
