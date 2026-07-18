#!/usr/bin/env bash
# Code-only deploy (st-azn): ship a site-code change — templates, JS, CSS,
# pages — WITHOUT running the data pipeline. The render reuses the
# LAST-PUBLISHED export in $EXPORT_DIR, so the data tier is untouched:
# identical export inputs produce identical hashed data artifacts, and the
# slim manifest stays coherent. Fills the gap Model Y left when deploy.yml's
# deploy leg (push -> GH Actions -> S3/CloudFront) was deleted.
#
# Run it on the serving host (maderas) after pushing to main:
#     ssh maderas 'bash ~/dev/beeatlas/data/publish-code.sh'
#
# Steps:
#   1. Take the SAME publish flock the nightly and the note-write path take
#      ($VAR_DIR/publish.lock) so publishes never interleave. Waits (with a
#      note) rather than tempfailing — an interactive deploy queued behind
#      the nightly is better than one silently skipped.
#   2. Source NVM, `nvm use`, git pull --ff-only, npm ci only if the
#      lockfile hash changed (the nightly's .npm-lock-hash cache).
#   3. Gate: `npm run test:data` — the data-dependent JS suites run for real
#      here because $EXPORT_DIR exists (same gate as nightly step 4b).
#   4. `npm run build` against $EXPORT_DIR (lib/build-data-dir.js resolves
#      it ahead of public/data), then merge-swap (data/merge-swap.sh, the
#      shared publish contract). SITE_ROOT absent is a FAILURE here, like
#      the note path — a code deploy with nowhere to publish is an error.
#
# NO stelis invocation, NO integration gate, NO baseline restore/snapshot:
# those all belong to the data tier, which this path never touches.
#
# CAVEAT — data-contract changes ship via the nightly, not here. If the code
# change expects a new or reshaped export artifact, the stale export in
# $EXPORT_DIR won't satisfy it: best case the build/test gate fails, worst
# case the site renders against data it misreads. For those, run the full
# `bash data/nightly.sh` (and see its note on intended contract changes and
# SKIP_INTEGRATION_GATE).
#
# Env contract mirrors data/nightly.sh ($BASE_DIR htdocs+var layout).

set -euo pipefail

# npm-adjacent tooling installs to ~/.local/bin, which non-login shells omit.
export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
SITE_ROOT="${SITE_ROOT:-$BASE_DIR/htdocs}"
VAR_DIR="${VAR_DIR:-$BASE_DIR/var}"
EXPORT_DIR="${EXPORT_DIR:-$VAR_DIR/export}"

# One epoch for the run: the slim manifest's generated_at
# (scripts/postbuild-data.mjs). The data is unchanged; generated_at records
# when THIS site build ran, same semantics as the other publish paths.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(date +%s)}"

_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_elapsed() { echo $(( $(date +%s) - $1 ))s; }

echo "=== code publish $(_ts) ==="

# The render needs the last-published export; without one there is nothing
# to inline (fresh host, or wrong VAR_DIR). That's a nightly's job to fix.
if [[ ! -d "$EXPORT_DIR" ]] || [[ -z "$(ls -A "$EXPORT_DIR")" ]]; then
    echo "ERROR: no export at $EXPORT_DIR — run the full nightly first (bash data/nightly.sh)" >&2
    exit 1
fi

mkdir -p "$VAR_DIR"

# 1. Publish lock, shared with the nightly and the note-write path.
exec 200>"$VAR_DIR/publish.lock"
if ! flock -n 200; then
    echo "publish lock busy (nightly or note write in flight) — waiting..."
    flock 200
fi

# 2. Sync source + dependencies.
echo "--- syncing source + dependencies ---"
_t0=$(date +%s)
cd "$REPO_ROOT"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use --silent
else
    echo "WARN: $HOME/.nvm/nvm.sh not found — node tooling may not resolve" >&2
fi
git pull --ff-only
# Same lockfile-keyed node_modules cache as the nightly (npm ci rebuilds the
# msgpackr-extract native addon — a multi-minute hit when nothing changed).
_LOCK_HASH=$(sha256sum package-lock.json | awk '{print $1}')
_LOCK_CACHE="$REPO_ROOT/.npm-lock-hash"
if [[ -d node_modules && -f "$_LOCK_CACHE" && "$(cat "$_LOCK_CACHE")" == "$_LOCK_HASH" ]]; then
    echo "  npm: package-lock.json unchanged (hash $(echo "$_LOCK_HASH" | cut -c1-12)…); skipping reinstall"
else
    echo "  npm: lockfile changed or node_modules missing; running npm ci"
    npm ci
    echo "$_LOCK_HASH" > "$_LOCK_CACHE"
fi
echo "sync done in $(_elapsed $_t0)"

# 3. JS data-dependent test gate (nightly step 4b): the artifacts exist, so
# these run for real. A failure means the rendered site would be wrong —
# abort rather than publish.
echo "--- JS data-dependent test gate ---"
_t0=$(date +%s)
export EXPORT_DIR
if ! npm run test:data; then
    echo "JS DATA TEST GATE FAILED in $(_elapsed $_t0) — aborting publish" >&2
    exit 1
fi
echo "JS data test gate passed in $(_elapsed $_t0)"

# 4. Render against the last-published export, then merge-swap.
echo "--- building site ---"
_t0=$(date +%s)
npm run build
echo "--- site build done in $(_elapsed $_t0) ---"

echo "--- publishing into $SITE_ROOT ---"
_t0=$(date +%s)
BASE_DIR="$BASE_DIR" SITE_ROOT="$SITE_ROOT" bash "$SCRIPT_DIR/merge-swap.sh"
echo "published in $(_elapsed $_t0)"

echo "=== code publish complete $(_ts) ==="
