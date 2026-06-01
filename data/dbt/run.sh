#!/usr/bin/env bash
# Wrapper: ensures dbt finds in-repo profiles.yml regardless of cwd.
# A1 fallback: dbt-duckdb 1.10.1 is incompatible with Python 3.14 (mashumaro class-var
# changes in CPython 3.14); invokes dbt via uvx with an explicit --python 3.13 pin so
# uvx provisions Python 3.13 in its tool env regardless of what's installed on the host.
# Without the explicit pin uvx picks the newest interpreter available (3.14 on maderas),
# which breaks at JSONObjectSchema import with UnserializableField.
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
  --version|--help|-h|"")
    exec uvx --python 3.13 --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1 dbt "$@"
    ;;
  *)
    exec uvx --python 3.13 --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1 dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"
    ;;
esac
