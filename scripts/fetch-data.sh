#!/usr/bin/env bash
# Build the site's data inputs with Stelis (github.com/rainhead/stelis), the
# content-addressed data engine (stelis ADR 0007 Amendment, Model Y). Produces
# the RAW, unhashed artifacts the site build reads via lib/build-data-dir.js;
# hashing + manifest are the site build's concern, not the data engine's.
#
# By default exports into public/data/ — the same directory `npm run
# pull-published` fills — so the dev server and `npm run build` pick the
# artifacts up with no further wiring. Set EXPORT_DIR to build elsewhere
# (the nightly uses its own export dir).
#
# Stelis skips work whose inputs are unchanged and is partial-success: a failed
# task blocks only its dependents, and the non-zero exit propagates here.
#
# Env (same contract as data/nightly.sh):
#   STELIS_DIR      stelis checkout               (default: ~/dev/stelis)
#   EXPORT_DIR      where artifacts land          (default: <repo>/public/data)
#   DB_PATH         the pipeline DuckDB           (default: <repo>/data/beeatlas.duckdb)
#   NOTES_DB_PATH   the authoritative notes store (default: stelis's; unset = harvest
#                   sees no store — fine for data-only work, wrong for notes work)
#   STELIS_EXPLAIN  when set, log stelis's --explain plan (why each task runs/skips)
#                   before building — same scope + export-dir as the build, so it is
#                   an accurate preview of what this invocation is about to do. Set by
#                   the nightly; off by default so interactive builds stay quiet.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STELIS_DIR="${STELIS_DIR:-$HOME/dev/stelis}"
EXPORT_DIR="${EXPORT_DIR:-$REPO_ROOT/public/data}"

if [[ ! -f "$STELIS_DIR/src/main.rkt" ]]; then
    echo "ERROR: no stelis checkout at $STELIS_DIR (set STELIS_DIR)" >&2
    exit 1
fi

# QUERY mode, not a build: `--moved-keys <artifact>` asks stelis which keys of a
# keyed artifact moved in the LAST recorded build, one per line on stdout (exit 1 =
# no basis, rebuild in full). It lives here rather than in the caller so the query
# runs with the SAME cwd and env as the build above — which is what makes it read
# the state dir that build wrote. Used by data/publish-notes.sh to scope the render
# to the species whose notes actually moved (beeatlas-4oa).
if [[ "${1:-}" == "--moved-keys" ]]; then
    cd "$STELIS_DIR"
    exec env BEEATLAS_DIR="$REPO_ROOT" racket src/main.rkt "$@"
fi

mkdir -p "$EXPORT_DIR"

# Optional args scope the build; no args = --all (every target). The st-nee
# note-write path passes the scoped form:
#   scripts/fetch-data.sh --from notes-harvest notes
if [[ $# -eq 0 ]]; then set -- --all; fi

# Only a FULL run refreshes the data the site calls "the data" (the runtime artifacts
# in lib/runtime-artifacts.js), so only a full run may advance the freshness stamp
# below. A scoped run — notably publish-notes.sh's `--from notes-harvest notes` —
# rebuilds notes, which are rendered into static pages and are not among those
# artifacts, so it must leave the stamp alone.
_full_build=0
if [[ "$1" == "--all" ]]; then _full_build=1; fi

cd "$STELIS_DIR"

_stelis() { env BEEATLAS_DIR="$REPO_ROOT" racket src/main.rkt "$@"; }

# Optional pre-build plan. Same scope ("$@") and export-dir as the build below, so
# freshness is judged against the artifacts the build will actually read. Runs first
# in the same shell, so nothing changes between the plan and the build — an accurate
# preview. Non-fatal: a broken explain must never abort the build (set -e would).
if [[ -n "${STELIS_EXPLAIN:-}" ]]; then
    echo "--- stelis plan (why each task runs/skips) ---"
    _stelis --explain --export-dir "$EXPORT_DIR" "$@" || echo "WARN: stelis --explain failed (non-fatal) — proceeding to build" >&2
fi

env BEEATLAS_DIR="$REPO_ROOT" \
    racket src/main.rkt --build --export-dir "$EXPORT_DIR" "$@"

# The site's "Data as of" clock (beeatlas-923). Written HERE, beside the artifacts it
# describes, because this is the only step that refreshes them — the site build reads
# it (scripts/postbuild-data.mjs) rather than stamping its own clock, so a code-only
# deploy or a note publish inherits it untouched instead of claiming the data is fresh.
#
# `set -e` means we are only reachable when the build above exited 0. Stelis is
# partial-success, so a failed task propagates non-zero here and the stamp stays put —
# a half-built export must not read as a successful refresh.
#
# Epoch seconds, matching what postbuild-data.mjs parses. Not exec'd above so this can
# run after the build; the build's exit status still propagates via `set -e`.
if [[ $_full_build -eq 1 ]]; then
    date +%s > "$EXPORT_DIR/generated_at"
fi
