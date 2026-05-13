#!/usr/bin/env bash
# Wrapper: ensures dbt finds in-repo profiles.yml regardless of cwd.
# A1 fallback: dbt-duckdb 1.10.1 is incompatible with Python 3.14 (mashumaro class-var
# changes in CPython 3.14); invokes dbt via uvx which uses an isolated Python 3.13 tool env.
# Usage: bash data/dbt/run.sh build [options]
#        bash data/dbt/run.sh debug
#        bash data/dbt/run.sh --version

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set directory env vars so all invocations (including --version) see the right paths.
export DBT_PROFILES_DIR="${DBT_PROFILES_DIR:-$DIR}"
export DBT_PROJECT_DIR="${DBT_PROJECT_DIR:-$DIR}"

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
    exec uvx --from dbt-core==1.10.* --with dbt-duckdb==1.10.1 dbt "$@"
    ;;
  *)
    exec uvx --from dbt-core==1.10.* --with dbt-duckdb==1.10.1 dbt "$@" --profiles-dir "$DIR" --project-dir "$DIR"
    ;;
esac
