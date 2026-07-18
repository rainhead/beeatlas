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
#   STELIS_DIR     stelis checkout                (default: ~/dev/stelis)
#   EXPORT_DIR     where artifacts land           (default: <repo>/public/data)
#   DB_PATH        the pipeline DuckDB            (default: <repo>/data/beeatlas.duckdb)
#   NOTES_DB_PATH  the authoritative notes store  (default: stelis's; unset = harvest
#                  sees no store — fine for data-only work, wrong for notes work)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STELIS_DIR="${STELIS_DIR:-$HOME/dev/stelis}"
EXPORT_DIR="${EXPORT_DIR:-$REPO_ROOT/public/data}"

if [[ ! -f "$STELIS_DIR/src/main.rkt" ]]; then
    echo "ERROR: no stelis checkout at $STELIS_DIR (set STELIS_DIR)" >&2
    exit 1
fi

mkdir -p "$EXPORT_DIR"

cd "$STELIS_DIR"
exec env BEEATLAS_DIR="$REPO_ROOT" \
    racket src/main.rkt --build --all --export-dir "$EXPORT_DIR"
