#!/usr/bin/env bash
# Build the self-hosted TERRAIN (DEM) tile archive (beeatlas-8py).
#
# The hillshade half of the basemap. Downloads a terrarium-encoded elevation
# pyramid for Washington from the AWS Open Data "Terrain Tiles" bucket,
# requantizes it to whole metres as lossless WebP (see data/terrain_tiles.py for
# why that is most of the file size), and converts it to PMTiles.
#
# SEPARATE FROM build-basemap.sh ON PURPOSE. Different source, different tile
# type, different lifecycle — the vector archive tracks OSM and is refreshed
# quarterly-ish; the ground does not move. Each publishes on its own and the
# hillshade rolls back by removing one source and one layer from the style. It is
# deliberately NOT part of the nightly.
#
# RUN THIS ON A WORKSTATION AND UPLOAD THE RESULT — the opposite of
# build-basemap.sh, and for a concrete reason. That script is a network extract:
# it range-requests a remote planet file, so the bytes have to cross the wire
# either way and building on the server saves an upload. This one is CPU-bound
# in the lossless WebP encoder, and the artifact is only ~61 MB. Measured
# 2026-08-02: ~9 min on an 8-core laptop; on maderas's 2 cores the same build ran
# at ~11 tiles/min, i.e. ~3 HOURS pinning both cores of the live web server.
# Upload the 61 MB instead.
#
#   STAGING_DIR=/tmp/terrain data/build-terrain-basemap.sh
#   scp /tmp/terrain/wa-terrain-YYYYMMDD.pmtiles \
#       maderas:/var/www/beeatlas.net/var/basemap-staging/
#   ssh maderas 'cd ~/dev/beeatlas && data/publish-basemap.sh wa-terrain-YYYYMMDD.pmtiles'
#
# Requires the pmtiles Go CLI and the data/ uv environment (numpy + pillow).
#
# Usage: data/build-terrain-basemap.sh [YYYYMMDD]
#   with no argument, stamps the archive with today's date.
#   STAGING_DIR overrides where the archive lands (default: the maderas staging
#   dir, which is what publish-basemap.sh reads).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
# Same staging dir as the vector build, and for the same reason: $BASEMAP_DIR is
# web-reachable through the Apache Alias, so a half-built archive inside it would
# be served at /basemap/tiles/… mid-build.
STAGING_DIR="${STAGING_DIR:-$BASE_DIR/var/basemap-staging}"

# PAIRED WITH src/basemap-style.ts's TERRAIN_FADE_END. The style fades the
# hillshade to nothing by z13.5, so tiles above this zoom would never be drawn;
# raising it here alone buys nothing but bytes, and raising the fade alone makes
# the map worse. Each level costs ~4x the tiles. See beeatlas-8py.
MAXZOOM="${MAXZOOM:-11}"
REGION="$REPO_ROOT/data/basemap/wa.geojson"

BUILD_DATE="${1:-$(date -u +%Y%m%d)}"
OUT_NAME="wa-terrain-${BUILD_DATE}.pmtiles"

PMTILES="${PMTILES:-$(command -v pmtiles || command -v go-pmtiles || true)}"
[[ -n "$PMTILES" ]] || {
    echo "ERROR: pmtiles CLI not found (looked for 'pmtiles' and 'go-pmtiles')." >&2
    echo "  go install github.com/protomaps/go-pmtiles@latest" >&2
    exit 1
}
[[ -f "$REGION" ]] || { echo "ERROR: region polygon missing: $REGION" >&2; exit 1; }

mkdir -p "$STAGING_DIR"
STAGED="$STAGING_DIR/$OUT_NAME"
# The MBTiles is scratch — the only artifact that leaves here is the PMTiles.
# Staged beside it so a partial run leaves nothing web-reachable, and removed on
# exit however this script ends.
MBTILES="$STAGING_DIR/.wa-terrain-${BUILD_DATE}.mbtiles"
trap 'rm -f "$MBTILES"' EXIT

echo "Downloading terrain tiles for $REGION (maxzoom $MAXZOOM)..."
( cd "$REPO_ROOT/data" && uv run python terrain_tiles.py \
    --region "$REGION" --out "$MBTILES" --maxzoom "$MAXZOOM" )

echo "Converting to PMTiles..."
"$PMTILES" convert "$MBTILES" "$STAGED" --force

echo
echo "Built: $STAGED ($(du -h "$STAGED" | cut -f1))"
echo "Publish it with: data/publish-basemap.sh $OUT_NAME"
