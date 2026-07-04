"""Ensure the repo root is on sys.path so `import api.*` resolves regardless
of how pytest is invoked (e.g. `cd data && uv run pytest ../api/tests/...`).

Without this, pytest's rootdir/ini discovery only walks up from the test
file's own directory when given an explicit path argument outside the ini
file's directory (data/pyproject.toml) — it never finds data/pyproject.toml's
`pythonpath = [".", ".."]` setting in that invocation form, and `import
api.config`/`import api.oauth` fail with `ModuleNotFoundError: No module
named 'api'`. Explicitly inserting the repo root here makes both invocation
forms work.
"""

import sys
from pathlib import Path

_REPO_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
