#!/usr/bin/env bash
# Publish a built basemap archive into the served basemap root (beeatlas-hvp).
#
# WHY THIS IS NOT merge-swap.sh: the basemap artifact is ~227 MB, immutable,
# refreshed quarterly, and must survive every nightly, code publish and note
# publish untouched. Those all operate inside $BASE_DIR/htdocs — the page tree
# rsync in merge-swap.sh:44 is `--delete` excluding only /assets and /data, and
# merge-swap.sh:47 age-prunes hashed files older than 30 days. A quarterly
# artifact living under htdocs would be deleted by one or the other, and the
# symptom is a blank basemap in the field, not a build failure.
#
# So the artifact lives in a THIRD sibling of the htdocs+var convention:
#   $BASE_DIR/htdocs   served, rewritten by every publish
#   $BASE_DIR/var      pipeline state, never web-reachable
#   $BASE_DIR/basemap  this — web-reachable via an Apache Alias, never rewritten
# Nothing in the publish path can reach it, by construction rather than by an
# --exclude a future edit could drop.
#
# Usage: data/publish-basemap.sh <wa-YYYYMMDD.pmtiles>

set -euo pipefail

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
BASEMAP_DIR="${BASEMAP_DIR:-$BASE_DIR/basemap}"
# Keep superseded archives around so a client holding a cached manifest can
# finish an in-flight download rather than 404 mid-stream.
GRACE_DAYS="${GRACE_DAYS:-30}"

ARCHIVE="${1:?usage: publish-basemap.sh <wa-YYYYMMDD.pmtiles>}"
STAGED="$BASEMAP_DIR/staging/$ARCHIVE"

[[ -d "$BASEMAP_DIR" ]] || {
    echo "NOTE: BASEMAP_DIR $BASEMAP_DIR absent (install: docs/runbooks/serve-from-maderas.md)" >&2
    exit 3
}
[[ -f "$STAGED" ]] || { echo "ERROR: not built: $STAGED" >&2; exit 1; }

# Homebrew names the binary `pmtiles`, `go install` names it `go-pmtiles`.
PMTILES="${PMTILES:-$(command -v pmtiles || command -v go-pmtiles || true)}"
[[ -n "$PMTILES" ]] || { echo "ERROR: pmtiles CLI not found" >&2; exit 1; }

# Sanity-check the archive before it goes live: pmtiles verifies the header and
# directory, so a truncated download cannot be published.
"$PMTILES" verify "$STAGED" >/dev/null || { echo "ERROR: $ARCHIVE failed verify" >&2; exit 1; }

# Never write into a name a client might already be range-requesting: land the
# bytes on the same filesystem, then mv (atomic within a filesystem).
mv "$STAGED" "$BASEMAP_DIR/.$ARCHIVE.incoming"
mv "$BASEMAP_DIR/.$ARCHIVE.incoming" "$BASEMAP_DIR/$ARCHIVE"

# The manifest is the ONLY mutable file here and is written LAST, so every name
# it resolves already exists by the time a reader sees it. Same ordering rule as
# merge-swap.sh's data/manifest.json.
BYTES=$(stat -c%s "$BASEMAP_DIR/$ARCHIVE" 2>/dev/null || stat -f%z "$BASEMAP_DIR/$ARCHIVE")
cat > "$BASEMAP_DIR/.manifest.json.tmp" <<JSON
{
  "regions": {
    "wa": {
      "archive": "$ARCHIVE",
      "bytes": $BYTES,
      "maxzoom": 14,
      "attribution": "© OpenStreetMap contributors · Protomaps"
    }
  }
}
JSON
mv "$BASEMAP_DIR/.manifest.json.tmp" "$BASEMAP_DIR/manifest.json"

# `regions` is keyed for a future multi-region world but has exactly one entry
# today; no picker, no abstraction. See beeatlas-4mk.

find "$BASEMAP_DIR" -maxdepth 1 -type f -name 'wa-*.pmtiles' \
    ! -name "$ARCHIVE" -mtime "+$GRACE_DAYS" -delete

echo "Published $ARCHIVE ($BYTES bytes); manifest updated."
