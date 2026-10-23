#!/usr/bin/env bash
# Merge-swap the built _site into the served root — THE publish contract,
# shared by data/nightly.sh (the full nightly) and data/publish-notes.sh
# (the st-nee note-write path). Order is load-bearing:
#   a. hashed assets + data first, NO --delete — a cached index.html may still
#      reference last night's hashed names; age-pruned instead (new URLs each
#      publish, so nothing stale is ever re-served under a current name).
#      THE AGE-PRUNE BELOW DEPENDS ON THE ASSETS LOOKING FRESH. That used to be
#      automatic — every build reran Vite, which rewrote them. Since beeatlas-bon
#      a build may REUSE the bundle instead, so scripts/build-app.mjs touches the
#      files it reuses; without that, `rsync -a` would carry their old mtimes here
#      and `-mtime +30` would eventually delete the live bundle out from under the
#      pages referencing it. If you change either side, change both.
#   b. stable-URL dirs with --delete so removed species/places prune.
#   c. the page tree with --delete (excluding /assets and /data).
#   d. manifest.json LAST and atomically: every name it resolves already
#      exists by the time readers (and the SW's NetworkFirst route) see it.
#
# A publish killed at ANY point leaves a site that serves (beeatlas-z1b3: on Fly a
# deploy or a restart can stop the Machine mid-publish). That holds by design, for
# three reasons this file must keep:
#   - rsync writes each file under a temporary name and renames it into place (its
#     default; never pass --inplace here), so every file is either the old one or
#     the complete new one, never half of either.
#   - The order above: anything a page or the manifest can name (a, b) lands before
#     the pages (c) and the manifest (d) that name it, and old hashed names stay for
#     30 days, so a page from either side of the cut still finds what it references.
#   - The age-prune runs only after the page tree is complete, so it cannot delete a
#     file a page left over from an interrupted publish still names.
# The worst a kill leaves is a mix of last night's and tonight's pages and stable
# files, each one whole, until the next publish completes the swap.
#
# Exit 3 (distinct from any rsync failure) when SITE_ROOT does not exist —
# callers decide whether that is a skip (nightly on a fresh host) or a
# publish failure (a note write).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
SITE_ROOT="${SITE_ROOT:-$BASE_DIR/htdocs}"

if [[ ! -d "$SITE_ROOT" ]]; then
    echo "NOTE: SITE_ROOT $SITE_ROOT absent — nothing to publish into (install: docs/runbooks/serve-from-maderas.md)" >&2
    exit 3
fi

mkdir -p "$SITE_ROOT/data"
rsync -a "$REPO_ROOT/_site/assets/" "$SITE_ROOT/assets/"
rsync -a --exclude='/manifest.json' --exclude='/feeds' \
    --exclude='/species-maps' --exclude='/place-maps' \
    "$REPO_ROOT/_site/data/" "$SITE_ROOT/data/"
for _dir in feeds species-maps place-maps; do
    rsync -a --delete "$REPO_ROOT/_site/data/$_dir/" "$SITE_ROOT/data/$_dir/"
done
# /build-log.html is the Stelis operator page (stelis st-9rf) — served from
# SITE_ROOT but written by nightly.sh's trap, never part of _site, so the page
# rsync's --delete would remove it without this exclude. NOTE this exclude list
# is a hand-kept extent map of SITE_ROOT's other writers (stelis st-s8i's
# lesson); anything else that writes into SITE_ROOT outside _site must be
# added here or --delete reaps it on the next publish.
rsync -a --delete --exclude='/assets' --exclude='/data' \
    --exclude='/build-log.html' \
    "$REPO_ROOT/_site/" "$SITE_ROOT/"
find "$SITE_ROOT/assets" -type f -mtime +30 -delete
find "$SITE_ROOT/data" -maxdepth 1 -type f -name '*-*.*' -mtime +30 -delete
cp "$REPO_ROOT/_site/data/manifest.json" "$SITE_ROOT/data/.manifest.json.tmp"
mv "$SITE_ROOT/data/.manifest.json.tmp" "$SITE_ROOT/data/manifest.json"

# On Fly, Caddy holds the species redirects as config rather than reading
# species-redirects.map per request as Apache does, so a publish that changed the
# map regenerates Caddy's snippet and reloads it (fly/caddy-redirects.sh,
# beeatlas-zsi8). Not a publish failure: the build's meta-refresh page at each
# folded URL still forwards the reader until the next publish retries.
if [[ -n "${BEEATLAS_CONTAINER:-}" ]]; then
    bash "$REPO_ROOT/fly/caddy-redirects.sh" \
        || echo "WARN: fly/caddy-redirects.sh failed; folded species URLs fall back to their meta-refresh pages" >&2
fi
