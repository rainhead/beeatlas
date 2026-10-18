#!/usr/bin/env bash
# Wrapper: ensures dbt finds in-repo profiles.yml regardless of cwd.
# dbt runs from data/'s own uv environment, so its version is pinned in data/uv.lock
# with everything else. It used to run through uvx on Python 3.13 with its own pins,
# because dbt 1.10 could not import on Python 3.14 (mashumaro); dbt-core 1.12 can.
# Usage: bash data/dbt/run.sh build [options]
#        bash data/dbt/run.sh debug
#        bash data/dbt/run.sh --version

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set directory env vars so all invocations (including --version) see the right paths.
export DBT_PROFILES_DIR="${DBT_PROFILES_DIR:-$DIR}"
export DBT_PROJECT_DIR="${DBT_PROJECT_DIR:-$DIR}"

# Default DB_PATH to an ABSOLUTE path (data/beeatlas.duckdb) when unset, so local-dev
# `run.sh build` is deterministic regardless of invocation CWD. profiles.yml otherwise
# falls back to a relative `../beeatlas.duckdb`, which dbt-duckdb can resolve inconsistently
# depending on CWD/state (DEF-128-01). nightly.sh sets DB_PATH=/tmp/beeatlas.duckdb
# explicitly, so the `:-` default preserves it and nightly behavior is unchanged.
export DB_PATH="${DB_PATH:-$(cd "$DIR/.." && pwd)/beeatlas.duckdb}"

# dbt otherwise asks PyPI on every run whether a newer dbt exists, and prints a
# banner about dbt v2 when it does. The pin is in uv.lock; the question is noise.
export DBT_VERSION_CHECK=false

# Every dbt call goes through data/'s environment. --frozen: use uv.lock as it is,
# never re-resolve it mid-pipeline.
UV_RUN=(uv run --frozen --project "$(cd "$DIR/.." && pwd)")

# cd into the project dir so the relative `path: ../beeatlas.duckdb` in profiles.yml
# resolves to data/beeatlas.duckdb regardless of where the wrapper was invoked from.
cd "$DIR"

# Ensure the sandbox output directory exists. `dbt clean` removes target/ including
# target/sandbox/, and DuckDB's COPY statement cannot create directories — only files.
# This mkdir is idempotent and safe to run before every dbt invocation.
mkdir -p "$DIR/target/sandbox"

# Also pass explicit flags for commands that accept them (belt-and-suspenders per
# dbt-core profile-search-order pitfall; --version passes without them via the env vars).
case "${1:-}" in
  --identity)
    # Stelis's runtime-identity probe (stelis st-kbi). It runs at PLAN time, so
    # it must neither reach the network nor change the environment: --offline
    # and --no-sync. It reports the versions uv.lock pins (dbt-core, dbt-duckdb,
    # and the duckdb ENGINE, which owns the output bytes) plus the exact CPython
    # build, so a change to any of them reruns dbt-build.
    #
    # Deliberately NOT `dbt --version`: its output embeds "latest: X - Update
    # available!", a string that moves whenever dbt RELEASES — an upstream press
    # release is not a change to this pipeline.
    exec "${UV_RUN[@]}" --offline --no-sync python -c '
import sys, duckdb
from importlib.metadata import version
print(sys.version)
print("duckdb", duckdb.__version__)
print("dbt-core", version("dbt-core"))
print("dbt-duckdb", version("dbt-duckdb"))'
    ;;
  --version|--help|-h|"")
    exec "${UV_RUN[@]}" dbt "$@"
    ;;
  *)
    exec "${UV_RUN[@]}" dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"
    ;;
esac
