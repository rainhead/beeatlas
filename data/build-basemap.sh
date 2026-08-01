#!/usr/bin/env bash
# Build the self-hosted basemap tile archive (beeatlas-hvp, beeatlas-4mk).
#
# Extracts Washington out of the Protomaps daily OSM planet build over HTTP range
# requests — the planet is ~137 GB but we only pull the tiles inside the clip, so
# this is minutes, not hours (measured 2026-08-01: WA z14 = 8.7 s, 111 requests,
# 304 MB transferred, 227 MB archive).
#
# Run this ON MADERAS, not on a laptop: the artifact is ~227 MB and the source is
# remote either way, so building in place avoids a pointless upload. It is
# deliberately NOT part of the nightly — OSM currency is not a product
# requirement and the artifact's lifecycle is quarterly-ish. See
# data/publish-basemap.sh for how it reaches the web root.
#
# Requires the pmtiles Go CLI (github.com/protomaps/go-pmtiles) on PATH.
#
# Usage: data/build-basemap.sh [YYYYMMDD]
#   with no argument, uses today's Protomaps build.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
# Build into a staging dir OUTSIDE the served basemap root: $BASEMAP_DIR is
# web-reachable through the Apache Alias, so staging inside it would publish
# every half-extracted archive at /basemap/tiles/staging/… mid-build.
STAGING_DIR="${STAGING_DIR:-$BASE_DIR/var/basemap-staging}"

# z14 is NOT a comfort setting. Measured against the Protomaps schema: paths,
# streams and peaks — the layers volunteers named as must-haves — do not enter
# the tiles at all until z13. Dropping to z12 to save space silently deletes the
# trail network. See beeatlas-4mk notes for the per-zoom decode.
MAXZOOM="${MAXZOOM:-14}"
REGION="$REPO_ROOT/data/basemap/wa.geojson"

BUILD_DATE="${1:-$(date -u +%Y%m%d)}"
SRC="https://build.protomaps.com/${BUILD_DATE}.pmtiles"
OUT_NAME="wa-${BUILD_DATE}.pmtiles"

# Homebrew installs the binary as `pmtiles`; `go install github.com/protomaps/
# go-pmtiles@latest` names it `go-pmtiles` after the module. Accept either rather
# than making the runbook depend on which way it was installed.
PMTILES="${PMTILES:-$(command -v pmtiles || command -v go-pmtiles || true)}"
[[ -n "$PMTILES" ]] || {
    echo "ERROR: pmtiles CLI not found (looked for 'pmtiles' and 'go-pmtiles')." >&2
    echo "  go install github.com/protomaps/go-pmtiles@latest" >&2
    exit 1
}
[[ -f "$REGION" ]] || { echo "ERROR: clip polygon missing: $REGION" >&2; exit 1; }

mkdir -p "$STAGING_DIR"
STAGED="$STAGING_DIR/$OUT_NAME"

echo "Extracting $OUT_NAME from $SRC (maxzoom $MAXZOOM)..."
# --region (polygon) rather than --bbox: measured 18% smaller for WA, and far
# more for any region whose bounding box is mostly ocean or another jurisdiction.
"$PMTILES" extract "$SRC" "$STAGED" --region="$REGION" --maxzoom="$MAXZOOM"

echo
echo "Built: $STAGED ($(du -h "$STAGED" | cut -f1))"
echo "Publish it with: data/publish-basemap.sh $OUT_NAME"
