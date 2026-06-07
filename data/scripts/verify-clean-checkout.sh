#!/usr/bin/env bash
# Verify the fast test suite passes on a clean checkout (TPERF-03, D-02).
#
# Creates a git worktree at HEAD, strips built/un-checked-in assets to simulate
# a clean checkout, then runs `uv run pytest -m "not integration"` inside the
# worktree's data/ directory. No AWS. No built assets. No network at TEST time
# (the pytest run itself touches no network); see the cold-cache caveat below for
# the one exception during `uv sync --frozen`.
#
# Phase 143 CI can call this script directly for the clean-checkout gate
# (TCI-01/TCI-02). The script exits 0 on success and non-zero on any failure.
#
# Assumption: the uv package cache is warm (packages pre-downloaded). If the
# cache is cold, uv sync --frozen will require network access to prime it.
#
# Usage: bash data/scripts/verify-clean-checkout.sh

set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKTREE="$(mktemp -d)"

# Ensure the worktree is removed on exit (success or failure).
trap 'git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true; rm -rf "$WORKTREE"' EXIT

echo "=== clean-checkout fast-suite proof (TPERF-03) ==="
echo "Repo root:  $REPO_ROOT"
echo "Worktree:   $WORKTREE"

git -C "$REPO_ROOT" worktree add --detach "$WORKTREE" HEAD

# Strip built/un-checked-in assets to simulate a clean checkout.
# These are the assets that exist on maderas after a nightly run but would
# not be present in a fresh clone or CI environment.
rm -rf \
    "$WORKTREE/data/dbt/target" \
    "$WORKTREE/public/data" \
    "$WORKTREE/data/raw/taxa.csv.gz" \
    "$WORKTREE/data/beeatlas.duckdb"

# Run the fast suite inside the worktree.
# addopts in data/pyproject.toml deselects @integration by default, so this
# runs only the build-time tier (code validation, no dataset validation).
cd "$WORKTREE/data"
uv sync --frozen
uv run pytest -x --tb=short -q

echo "=== PASSED: fast suite green on clean checkout ==="
