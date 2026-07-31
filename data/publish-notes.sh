#!/usr/bin/env bash
# The st-nee note-write publish (stelis ADR 0007 — synchronous burned-in
# publish): the SAME build + place the nightly runs, scoped to notes.
#
# Invoked by the write API (api/main.py:_publish_notes) after a note CRUD
# commits. Commit-first is the CALLER's contract: this script failing never
# unwinds the note row — the API logs loudly, responds "saved; publish
# pending", and the nightly repairs.
#
# Steps:
#   1. Take the SAME publish flock the nightly takes ($VAR_DIR/publish.lock)
#      so a note write and the nightly never interleave a publish. Bounded
#      wait (PUBLISH_LOCK_WAIT, default 60s): if the nightly holds the lock,
#      exit 75 (EX_TEMPFAIL) — the run holding the lock reads the SAME
#      committed store and bakes the note itself (or the next nightly does),
#      so "pending" is the truthful outcome, not a failure.
#   2. Scoped stelis build: `--from notes-harvest … notes`. The notes-store
#      digest names the changed canonical_names, and the harvest rebuilds only
#      those keys of the per-species notes/ dir (STELIS_REBUILD_KEYS, st-pd1).
#      The notes.json roll-up is retired (beeatlas-6x9): _data/notes.js reads
#      the dir directly, so the keyed file IS the handoff.
#   3. The site render, SCOPED to the species whose notes moved when it can be
#      proven sound (beeatlas-4oa), and a full `npm run build` when it cannot.
#      Notes reach exactly one template, so this is a few pages instead of 1668.
#   4. Merge-swap into SITE_ROOT (data/merge-swap.sh, the shared contract).
#
# NO baseline restore/snapshot and NO integration gate: notes/ is not a
# baseline artifact (data/artifacts.py baseline-files) and the data tier is
# untouched by a note write.
#
# Env contract mirrors data/nightly.sh ($BASE_DIR htdocs+var layout).

set -euo pipefail

# uv/racket install to ~/.local/bin, which the systemd user service omits.
export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE_DIR="${BASE_DIR:-/var/www/beeatlas.net}"
SITE_ROOT="${SITE_ROOT:-$BASE_DIR/htdocs}"
VAR_DIR="${VAR_DIR:-$BASE_DIR/var}"
DB_PATH="${DB_PATH:-$VAR_DIR/beeatlas.duckdb}"
EXPORT_DIR="${EXPORT_DIR:-$VAR_DIR/export}"
NOTES_DB_PATH="${NOTES_DB_PATH:-$HOME/beeatlas-store/notes.db}"
STELIS_DIR="${STELIS_DIR:-$HOME/dev/stelis}"

# One epoch for the run: stelis build determinism + the slim manifest's
# generated_at (scripts/postbuild-data.mjs).
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(date +%s)}"

_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_elapsed() { echo $(( $(date +%s) - $1 ))s; }

echo "=== note publish $(_ts) ==="

mkdir -p "$VAR_DIR" "$EXPORT_DIR"

# 1. Publish lock, shared with the nightly. Bounded wait, then EX_TEMPFAIL.
exec 200>"$VAR_DIR/publish.lock"
if ! flock -w "${PUBLISH_LOCK_WAIT:-60}" 200; then
    echo "publish lock busy after ${PUBLISH_LOCK_WAIT:-60}s — the holder bakes the committed note" >&2
    exit 75
fi

# Node via NVM (the systemd user service has no login shell environment).
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    cd "$REPO_ROOT"
    nvm use --silent
else
    echo "WARN: $HOME/.nvm/nvm.sh not found — node tooling may not resolve" >&2
fi

# 2. Scoped stelis build: only the notes suffix, targeted to the changed keys.
echo "--- building notes (stelis, scoped) ---"
_t0=$(date +%s)
export DB_PATH EXPORT_DIR NOTES_DB_PATH STELIS_DIR
bash "$REPO_ROOT/scripts/fetch-data.sh" --from notes-harvest notes
echo "--- notes build done in $(_elapsed $_t0) ---"

# 3. Site render. SCOPED when we can prove it is sound (beeatlas-4oa), full
# otherwise. Two independent facts have to line up, and either one missing means a
# full build — never a partial publish:
#
#   WHICH species moved. Stelis's per-key observation of the notes/ dir, i.e. the
#   same digest that decided which keys to re-harvest (st-2k9 / st-066). Taking it
#   from there rather than from the API's canonical_name is what makes the render
#   agree with the harvest by construction: a publish deferred earlier leaves two
#   species pending, and the store digest knows that where one request does not.
#   Non-zero exit = stelis has no basis to answer, so render everything.
#
#   WHETHER _site may be added to. A scoped render rewrites a few pages over the
#   last full build's output and publishes the whole tree, so that tree must BE the
#   last full build's output, for the current code, manifest and data
#   (scripts/build-receipt.mjs — the same precondition Stelis's own partial
#   rebuilds enforce with prior-complete-build?, st-243).
echo "--- building site ---"
_t0=$(date +%s)
cd "$REPO_ROOT"

_scoped=""
if _moved=$(bash "$REPO_ROOT/scripts/fetch-data.sh" --moved-keys notes); then
    # Stelis reports notes/ FILENAMES; the render is keyed by canonical_name. Same
    # basename mapping _data/notes.js applies when it reads the dir (beeatlas-6x9).
    _keys=$(printf '%s' "$_moved" | sed 's/\.json$//')
    if node scripts/build-receipt.mjs --check; then
        _scoped=yes
    fi
fi

if [[ -n "$_scoped" ]]; then
    # Deliberately EXPORTED even when empty: presence is the signal (the
    # STELIS_REBUILD_KEYS convention). Empty means "no species moved" — a real
    # answer, and a legitimately empty render — not "render everything".
    echo "--- scoped render: $(printf '%s' "$_keys" | grep -c . || true) species ---"
    BEEATLAS_RENDER_KEYS="$_keys" npm run build:content
else
    npm run build
fi
echo "--- site build done in $(_elapsed $_t0) ---"

# 4. Merge-swap into the served root. Exit 3 (SITE_ROOT absent) propagates as
# a failure here — unlike the nightly, a note write with nowhere to publish
# IS a publish failure (the API responds "pending").
echo "--- publishing into $SITE_ROOT ---"
_t0=$(date +%s)
BASE_DIR="$BASE_DIR" SITE_ROOT="$SITE_ROOT" bash "$SCRIPT_DIR/merge-swap.sh"
echo "published in $(_elapsed $_t0)"

echo "=== note publish complete $(_ts) ==="
