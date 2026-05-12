#!/usr/bin/env bash
# Smoke test covering SCAFFOLD-03 invariants: file presence, gitignore, no production touch.
# Usage: bash data/dbt/tests/scaffold_assert.sh  (from repo root)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=== scaffold_assert.sh: SCAFFOLD-03 smoke checks ==="
cd "$REPO_ROOT"

# --- File presence checks ---
echo "Checking required files..."
test -f data/dbt/dbt_project.yml || { echo "FAIL: data/dbt/dbt_project.yml missing"; exit 1; }
test -f data/dbt/profiles.yml     || { echo "FAIL: data/dbt/profiles.yml missing";     exit 1; }
test -f data/dbt/models/sources.yml || { echo "FAIL: data/dbt/models/sources.yml missing"; exit 1; }
test -x data/dbt/run.sh            || { echo "FAIL: data/dbt/run.sh missing or not executable"; exit 1; }
echo "  [OK] all required files present"

# --- Gitignore checks (Pitfall 8: must be in place before any dbt build) ---
echo "Checking gitignore rules..."
git check-ignore data/dbt/target/manifest.json > /dev/null \
    || { echo "FAIL: data/dbt/target/ is not gitignored"; exit 1; }
git check-ignore data/dbt/logs/dbt.log > /dev/null \
    || { echo "FAIL: data/dbt/logs/ is not gitignored"; exit 1; }
git check-ignore data/dbt/dbt_packages/foo > /dev/null \
    || { echo "FAIL: data/dbt/dbt_packages/ is not gitignored"; exit 1; }
echo "  [OK] target/, logs/, dbt_packages/ all gitignored"

# --- No-production-touch check (V-SCAFFOLD-03a) ---
echo "Checking no production references to data/dbt..."
# git grep exits 1 on no-match (that is success here)
if git grep -l "data/dbt" -- data/run.py data/nightly.sh .github/workflows/ 2>/dev/null; then
    echo "FAIL: found 'data/dbt' references in production files (see output above)"
    exit 1
fi
echo "  [OK] no data/dbt references in data/run.py, data/nightly.sh, .github/workflows/"

echo "=== All SCAFFOLD-03 checks passed! ==="
