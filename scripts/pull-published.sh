#!/usr/bin/env bash
# Download published data artifacts from S3 into public/data/ for local
# development. Content-hashed filenames are resolved via the S3 manifest.json
# through the data/artifacts.py contract (baseline-pull-plan).
#
# MODEL-Y CAVEAT: once the nightly stopped publishing to S3 (stelis ADR 0007
# Amendment, step C), the S3 manifest froze — this pull serves the last
# S3-published snapshot, drifting further from live each night. Good enough
# for UI work; use `npm run fetch-data` for current data. st-vjd repoints this
# script at the live site (https://beeatlas.net/data/) — note the live slim
# manifest no longer names the baked artifacts this pulls today.
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
# The other way to fill public/data/ is to BUILD it: `npm run fetch-data`
# runs the Stelis data engine against the local pipeline state (needs the
# DuckDB + pipeline env). This script is the light-dev alternative — grab
# what's live without running the pipeline.
#
# Usage: scripts/pull-published.sh [--profile <profile>] [--bucket <bucket>]

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

# Stable-URL dirs: pages reference these in place (/data/species-maps/<slug>.svg,
# the Atom feeds), and postbuild-data.mjs republishes them from the data dir —
# pull all three so a local `npm run build` has the full published surface.
for _dir in feeds species-maps place-maps; do
  echo "Syncing $_dir/..."
  aws --profile "$AWS_PROFILE" s3 sync --no-progress "s3://$BUCKET/data/$_dir/" "$DEST/$_dir/"
done

echo "Done. Files are in $DEST"
echo "Next: node scripts/make-local-manifest.js  (point the dev manifest at them)"
echo "Set VITE_DATA_BASE_URL=/data in .env.local to use them."
