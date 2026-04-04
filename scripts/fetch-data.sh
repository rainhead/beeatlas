#!/usr/bin/env bash
# Download the four data files from S3 into frontend/public/data/ for local development.
# Usage: scripts/fetch-data.sh [--profile <profile>] [--bucket <bucket>]

set -euo pipefail

BUCKET="${BUCKET:-beeatlasstack-sitebucket397a1860-h5dtjzkld3yv}"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/frontend/public/data"

while [[ $# -gt 0 ]]; do
  case $1 in
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --bucket)  BUCKET="$2";      shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$DEST"

for f in ecdysis.parquet samples.parquet counties.geojson ecoregions.geojson; do
  echo "Downloading $f..."
  aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/data/$f" "$DEST/$f"
done

echo "Done. Files are in $DEST"
echo "Set VITE_DATA_BASE_URL=/data in frontend/.env.local to use them."
