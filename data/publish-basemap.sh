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
#   $BASE_DIR/htdocs               served, rewritten by every publish
#   $BASE_DIR/var                  pipeline state, never web-reachable
#   $BASE_DIR/var/basemap-staging  half-built archives, never web-reachable
#   $BASE_DIR/basemap              this — web-reachable via an Apache Alias,
#                                  never rewritten by any publish path
# Nothing in the publish path can reach it, by construction rather than by an
# --exclude a future edit could drop.
#
# Usage: data/publish-basemap.sh <wa-YYYYMMDD.pmtiles>

set -euo pipefail

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
BASEMAP_DIR="${BASEMAP_DIR:-$BASE_DIR/basemap}"
# Staging lives OUTSIDE the served directory. $BASEMAP_DIR is web-reachable via
# the Apache Alias, so a staging/ subdirectory inside it publishes every
# half-extracted archive at /basemap/tiles/staging/… — `Options -Indexes` hides
# the listing, not the file. var/ is the documented never-web-reachable sibling.
STAGING_DIR="${STAGING_DIR:-$BASE_DIR/var/basemap-staging}"
# Keep superseded archives around so a client holding a cached manifest can
# finish an in-flight download rather than 404 mid-stream.
GRACE_DAYS="${GRACE_DAYS:-30}"

ARCHIVE="${1:?usage: publish-basemap.sh <wa-YYYYMMDD.pmtiles>}"
STAGED="$STAGING_DIR/$ARCHIVE"

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

# Two moves, not one, and the second is the point. Staging now lives under var/,
# which may be a different mount from basemap/ — so the first mv can degrade to a
# copy, which is NOT atomic and would expose a partial file under a name clients
# fetch. Landing on a dot-prefixed name first means the rename into the served
# name is always within one directory, hence always atomic.
mv "$STAGED" "$BASEMAP_DIR/.$ARCHIVE.incoming"
mv "$BASEMAP_DIR/.$ARCHIVE.incoming" "$BASEMAP_DIR/$ARCHIVE"

# Start the outgoing archive's grace clock NOW. The prune below is `find -mtime`,
# which reads the file's own mtime — i.e. when it was BUILT, not when it stopped
# being current. At a quarterly refresh cadence the outgoing archive is already
# months old, so it was being deleted instantly on every publish and the grace
# period protected nobody. Touching it here makes "+$GRACE_DAYS" mean
# "superseded more than N days ago", which is what the requirement asked for.
PREV=""
if [[ -f "$BASEMAP_DIR/manifest.json" ]]; then
    PREV=$(sed -n 's/.*"archive"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
           "$BASEMAP_DIR/manifest.json" | head -1)
fi
if [[ -n "$PREV" && "$PREV" != "$ARCHIVE" && -f "$BASEMAP_DIR/$PREV" ]]; then
    touch "$BASEMAP_DIR/$PREV"
    echo "Superseded $PREV; grace clock started (${GRACE_DAYS}d)."
fi

# Take maxzoom from the ARCHIVE rather than restating it, so a build made with a
# non-default MAXZOOM cannot publish a manifest that lies about its own tiles.
MAXZOOM=$("$PMTILES" show "$BASEMAP_DIR/$ARCHIVE" | sed -n 's/^max zoom:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
[[ -n "$MAXZOOM" ]] || { echo "ERROR: could not read max zoom from $ARCHIVE" >&2; exit 1; }

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
      "maxzoom": $MAXZOOM,
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
