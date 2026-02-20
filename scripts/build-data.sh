#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/data"

echo "--- Downloading Ecdysis data ---"
uv run python ecdysis/download.py --db 164

ZIPFILE=$(ls -t ecdysis_*.zip | head -1)
echo "--- Processing $ZIPFILE ---"
uv run python ecdysis/occurrences.py "$ZIPFILE"

cp ecdysis.parquet "$REPO_ROOT/frontend/src/assets/ecdysis.parquet"
echo "--- Done: ecdysis.parquet copied to frontend/src/assets/ ---"
