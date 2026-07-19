#!/usr/bin/env bash
# Download the LIVE published data artifacts from https://beeatlas.net/data/
# into public/data/ for local development. Content-hashed filenames are
# resolved via the live slim manifest through the data/artifacts.py contract
# (pull-plan). Plain HTTPS — no AWS credentials, no pipeline
# (st-vjd repointed this off the retired S3 site bucket).
#
# What you get: the runtime artifacts the live site serves (occurrences.db,
# the region GeoJSONs, places_meta), downloaded to their local source_file
# names. What you DON'T get: the build-time exports (species.json, notes.json,
# …) and the stable-URL dirs (feeds/, species-maps/, place-maps/) — those are
# not enumerable over HTTPS. For the full surface, BUILD it: `npm run
# fetch-data` runs the Stelis data engine against the local pipeline state
# (needs the DuckDB + pipeline env). This script is the light-dev alternative
# — grab what's live without running the pipeline.
#
# After running this, regenerate the local dev manifest so it points at the
# downloaded (source_file) names: node scripts/make-local-manifest.js
#
# Usage: scripts/pull-published.sh [--base-url <url>]

set -euo pipefail

BASE_URL="${BASE_URL:-https://beeatlas.net/data}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/public/data"

while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url) BASE_URL="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$DEST"

MANIFEST="$(mktemp)"
trap 'rm -f "$MANIFEST"' EXIT
echo "Fetching manifest.json..."
curl -fsS "$BASE_URL/manifest.json" -o "$MANIFEST"

# artifacts.py pull-plan emits, for each hashed artifact
# named by the live manifest, name<TAB>current-hashed-name<TAB>local
# source_file name. Download each hashed file to its local name. Process
# substitution (not a pipe) keeps the loop in the current shell so set -e
# aborts on a failed download.
while IFS=$'\t' read -r name hashed local; do
  echo "Downloading $name ($hashed -> $local)..."
  curl -fsS "$BASE_URL/$hashed" -o "$DEST/$local"
done < <(python3 "$REPO_ROOT/data/artifacts.py" pull-plan "$MANIFEST")

echo "Done. Files are in $DEST"
echo "Next: node scripts/make-local-manifest.js  (point the dev manifest at them)"
echo "Set VITE_DATA_BASE_URL=/data in .env.local to use them."
