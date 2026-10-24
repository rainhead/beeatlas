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
#      pages referencing it. If you change either side, change both. The data
#      files are handled here instead: only new names are copied, and the live
#      copy of every file the build names is touched (beeatlas-gcdo.2). The
#      stable-URL dirs are compared by checksum, so unchanged files stay put.
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

# The data files are named by a hash of their content, so one already in SITE_ROOT
# holds these bytes, and copying it again is pure cost: postbuild-data rewrites every
# one with a fresh mtime, so `rsync -a` alone recopied all ~66 MB on every note save
# (beeatlas-gcdo.2). --ignore-existing copies only names that are new. That is safe
# only while EVERY top-level entry but manifest.json and the three stable-URL dirs is a
# content-named file, because anything else (a file, or a new directory, which rsync
# would recurse into) would never be updated again, silently; so check first.
_hashed=() _unhashed=()
shopt -s dotglob nullglob
for _f in "$REPO_ROOT/_site/data"/*; do
    _name="${_f##*/}"
    case "$_name" in manifest.json | feeds | species-maps | place-maps) continue ;; esac
    # <basename>-<12 hex>.<ext>, optionally .br or .gz: exactly what postbuild-data writes.
    if [[ -f "$_f" && ! -L "$_f" && "$_name" =~ ^.+-[0-9a-f]{12}\.[A-Za-z0-9]+(\.(br|gz))?$ ]]; then
        _hashed+=("$SITE_ROOT/data/$_name")
    else
        _unhashed+=("$_name")
    fi
done
shopt -u dotglob nullglob
if (( ${#_unhashed[@]} > 0 )); then
    echo "FATAL: _site/data has top-level entries not named by a content hash; merge-swap" >&2
    echo "       copies only new names there, so these would never be updated:" >&2
    printf '         %s\n' "${_unhashed[@]}" >&2
    exit 1
fi
# A live file with the right name and the wrong bytes (disk damage, a hand edit) would
# survive --ignore-existing, and the touch below would keep it. MERGE_SWAP_VERIFY=1
# compares content instead, replacing any that differ; the nightly sets it, so damage
# lasts a day at most. Not every publish: reading the live data cold took 2.4 s on the
# Fly volume, nothing in a nightly but a quarter of what skipping saves a note save.
if [[ -n "${MERGE_SWAP_VERIFY:-}" ]]; then _data_mode=--checksum; else _data_mode=--ignore-existing; fi
rsync -a "$_data_mode" --exclude='/manifest.json' --exclude='/feeds' \
    --exclude='/species-maps' --exclude='/place-maps' \
    "$REPO_ROOT/_site/data/" "$SITE_ROOT/data/"
# The age-prune below reads mtimes, and a skipped file keeps the one from the publish
# that first copied it. So refresh the live copy of every file this build names,
# which keeps "older than 30 days" meaning "no publish has named it for 30 days".
if (( ${#_hashed[@]} > 0 )); then
    touch -c -- "${_hashed[@]}"
fi

# These keep their URLs, so their names say nothing about their bytes, and every
# build writes them with fresh mtimes. --checksum compares content instead, so only
# what changed is copied: ~76 MB recopied per note save before, for the cost of
# reading both sides (0.04 s locally, warm; about 1 s on the Fly volume when cold).
for _dir in feeds species-maps place-maps; do
    rsync -a --checksum --delete "$REPO_ROOT/_site/data/$_dir/" "$SITE_ROOT/data/$_dir/"
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
