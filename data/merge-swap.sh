#!/usr/bin/env bash
# Merge-swap the built _site into the served root — THE publish contract,
# shared by data/nightly.sh (the full nightly) and data/publish-notes.sh
# (the st-nee note-write path). Order is load-bearing:
#   a. hashed assets + data first, NO --delete — a cached index.html may still
#      reference last night's hashed names; age-pruned instead (new URLs each
#      publish, so nothing stale is ever re-served under a current name).
#   b. stable-URL dirs with --delete so removed species/places prune.
#   c. the page tree with --delete (excluding /assets and /data).
#   d. manifest.json LAST and atomically: every name it resolves already
#      exists by the time readers (and the SW's NetworkFirst route) see it.
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
rsync -a --delete --exclude='/assets' --exclude='/data' \
    "$REPO_ROOT/_site/" "$SITE_ROOT/"
find "$SITE_ROOT/assets" -type f -mtime +30 -delete
find "$SITE_ROOT/data" -maxdepth 1 -type f -name '*-*.*' -mtime +30 -delete
cp "$REPO_ROOT/_site/data/manifest.json" "$SITE_ROOT/data/.manifest.json.tmp"
mv "$SITE_ROOT/data/.manifest.json.tmp" "$SITE_ROOT/data/manifest.json"
