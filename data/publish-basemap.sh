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
# TWO KINDS OF ARCHIVE live here (beeatlas-8py): the vector basemap
# (wa-YYYYMMDD.pmtiles) and the terrain/DEM pyramid the hillshade reads
# (wa-terrain-YYYYMMDD.pmtiles). They are built by different scripts on different
# schedules and PUBLISH INDEPENDENTLY — so this script updates only its own kind's
# entry in the manifest and prunes only its own kind's supersedes. Publishing one
# must never disturb the other.
#
# Usage: data/publish-basemap.sh <wa-YYYYMMDD.pmtiles | wa-terrain-YYYYMMDD.pmtiles>

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

ARCHIVE="${1:?usage: publish-basemap.sh <wa-YYYYMMDD.pmtiles|wa-terrain-YYYYMMDD.pmtiles>}"
STAGED="$STAGING_DIR/$ARCHIVE"

# Which kind is this? The two globs are deliberately disjoint. Note that the
# vector glob has to EXCLUDE the terrain names: 'wa-*.pmtiles' matches
# 'wa-terrain-20260802.pmtiles' too, so a naive prune on it would age-delete the
# terrain archive out from under a working hillshade — a blank layer in the
# field, not a build failure.
case "$ARCHIVE" in
    wa-terrain-*.pmtiles) KIND=terrain; PRUNE_MATCH=(-name 'wa-terrain-*.pmtiles') ;;
    wa-*.pmtiles)         KIND=vector;  PRUNE_MATCH=(-name 'wa-*.pmtiles' ! -name 'wa-terrain-*.pmtiles') ;;
    *) echo "ERROR: unrecognized archive name: $ARCHIVE" >&2; exit 1 ;;
esac

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
    # Read the archive THIS KIND is superseding. A regex over the whole file used
    # to be enough when there was one archive; with a nested terrain entry it
    # would match whichever "archive" key came first, so this parses properly.
    PREV=$(python3 -c '
import json, sys
kind, path = sys.argv[1], sys.argv[2]
try:
    region = json.load(open(path))["regions"]["wa"]
except Exception:
    sys.exit(0)
entry = region.get("terrain", {}) if kind == "terrain" else region
print(entry.get("archive", ""))
' "$KIND" "$BASEMAP_DIR/manifest.json")
fi
if [[ -n "$PREV" && "$PREV" != "$ARCHIVE" && -f "$BASEMAP_DIR/$PREV" ]]; then
    touch "$BASEMAP_DIR/$PREV"
    echo "Superseded $PREV; grace clock started (${GRACE_DAYS}d)."
fi

# Take maxzoom from the ARCHIVE rather than restating it, so a build made with a
# non-default MAXZOOM cannot publish a manifest that lies about its own tiles.
MAXZOOM=$("$PMTILES" show "$BASEMAP_DIR/$ARCHIVE" | sed -n 's/^max zoom:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
[[ -n "$MAXZOOM" ]] || { echo "ERROR: could not read max zoom from $ARCHIVE" >&2; exit 1; }

BYTES=$(stat -c%s "$BASEMAP_DIR/$ARCHIVE" 2>/dev/null || stat -f%z "$BASEMAP_DIR/$ARCHIVE")

# The manifest is the ONLY mutable file here and is written LAST, so every name
# it resolves already exists by the time a reader sees it. Same ordering rule as
# merge-swap.sh's data/manifest.json.
#
# MERGED, not rewritten: this script publishes one kind of archive and must leave
# the other kind's entry exactly as it found it. The terrain attribution is read
# out of the archive the builder stamped rather than restated here, for the same
# reason maxzoom is — one source of truth per fact.
"$PMTILES" show "$BASEMAP_DIR/$ARCHIVE" --metadata > "$BASEMAP_DIR/.meta.json.tmp"
python3 -c '
import json, os, sys
kind, out, archive, size, maxzoom, meta_path = sys.argv[1:7]

manifest = {"regions": {}}
if os.path.exists(out):
    try:
        loaded = json.load(open(out))
        if isinstance(loaded.get("regions"), dict):
            manifest = loaded
    except (OSError, ValueError):
        # A corrupt manifest is recoverable by rewriting it; refusing to publish
        # over one would leave the site stuck with the corrupt file.
        print(f"WARNING: {out} unreadable; rewriting from scratch", file=sys.stderr)

region = manifest["regions"].setdefault("wa", {})
entry = {"archive": archive, "bytes": int(size), "maxzoom": int(maxzoom)}

if kind == "terrain":
    attribution = ""
    try:
        attribution = json.load(open(meta_path)).get("attribution", "")
    except (OSError, ValueError):
        pass
    if not attribution:
        raise SystemExit(f"ERROR: {archive} carries no attribution metadata")
    entry["attribution"] = attribution
    region["terrain"] = entry
    if "archive" not in region:
        # Terrain published before any vector archive. The frontend requires a
        # region to name a vector archive, so it will reject this manifest and
        # fall back to the blank style — say so here rather than at 404 time.
        print("WARNING: no vector archive published yet; manifest is incomplete "
              "until data/publish-basemap.sh runs for one", file=sys.stderr)
else:
    entry["attribution"] = "© OpenStreetMap contributors · Protomaps"
    # Preserve the terrain entry across a vector publish.
    entry_terrain = region.get("terrain")
    if entry_terrain:
        entry["terrain"] = entry_terrain
    manifest["regions"]["wa"] = entry

tmp = out + ".tmp"
with open(tmp, "w") as fh:
    json.dump(manifest, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
os.replace(tmp, out)
' "$KIND" "$BASEMAP_DIR/manifest.json" "$ARCHIVE" "$BYTES" "$MAXZOOM" "$BASEMAP_DIR/.meta.json.tmp"
rm -f "$BASEMAP_DIR/.meta.json.tmp"

# `regions` is keyed for a future multi-region world but has exactly one entry
# today; no picker, no abstraction. See beeatlas-4mk.

# Kind-scoped, so a vector publish cannot prune terrain archives or vice versa.
find "$BASEMAP_DIR" -maxdepth 1 -type f "${PRUNE_MATCH[@]}" \
    ! -name "$ARCHIVE" -mtime "+$GRACE_DAYS" -delete

echo "Published $KIND archive $ARCHIVE ($BYTES bytes); manifest updated."
