#!/usr/bin/env bash
# Download the CURRENT published data artifacts from S3 into public/data/ for
# local development. Content-hashed filenames are resolved via the live
# manifest.json using the same data/artifacts.py contract nightly.sh publishes
# with, so this can never drift from what is actually served.
#
# (Supersedes the old hardcoded unhashed-key list — s3://.../data/<bare-name> —
# which silently pulled months-stale relics left by a retired pipeline that
# published unhashed names. Those bare keys are no longer refreshed by the
# nightly, and the frontend resolveDataUrl reads only hashed names from the
# manifest, so the bare keys are dead. See beeatlas-3q8.)
#
# After running this, regenerate the local dev manifest so it points at the
# downloaded (source_file) names: node scripts/make-local-manifest.js
#
# Usage: scripts/fetch-data.sh [--profile <profile>] [--bucket <bucket>]

set -euo pipefail

BUCKET="${BUCKET:-beeatlasstack-sitebucket397a1860-h5dtjzkld3yv}"
AWS_PROFILE="${AWS_PROFILE:-beeatlas}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/public/data"

while [[ $# -gt 0 ]]; do
  case $1 in
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --bucket)  BUCKET="$2";      shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$DEST"

MANIFEST="$(mktemp)"
trap 'rm -f "$MANIFEST"' EXIT
echo "Fetching manifest.json..."
aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/data/manifest.json" "$MANIFEST"

# artifacts.py baseline-pull-plan emits, for each baseline-diffable artifact,
# name<TAB>current-hashed-name (from the manifest)<TAB>local source_file name.
# Download each hashed object to its local name. Process substitution (not a
# pipe) keeps the loop in the current shell so set -e aborts on a failed cp.
while IFS=$'\t' read -r name hashed local; do
  echo "Downloading $name ($hashed -> $local)..."
  aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/data/$hashed" "$DEST/$local"
done < <(python3 "$REPO_ROOT/data/artifacts.py" baseline-pull-plan "$MANIFEST")

echo "Syncing feeds/..."
aws --profile "$AWS_PROFILE" s3 sync --no-progress "s3://$BUCKET/data/feeds/" "$DEST/feeds/"

echo "Done. Files are in $DEST"
echo "Next: node scripts/make-local-manifest.js  (point the dev manifest at them)"
echo "Set VITE_DATA_BASE_URL=/data in .env.local to use them."
