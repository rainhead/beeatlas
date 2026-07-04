"""Ensure the repo root AND data/ are on sys.path so `import api.*` and
`import notes_store.*` both resolve regardless of how pytest is invoked
(e.g. `cd data && uv run pytest ../api/tests/...`).

Without this, pytest's rootdir/ini discovery only walks up from the test
file's own directory when given an explicit path argument outside the ini
file's directory (data/pyproject.toml) — it never finds data/pyproject.toml's
`pythonpath = [".", ".."]` setting in that invocation form, and `import
api.config`/`import api.oauth` fail with `ModuleNotFoundError: No module
named 'api'`. `data/` is also inserted so `api/*` modules that touch the
177 store (`notes_store.db`, `notes_store.models`, `notes_store.roles`) can
`import notes_store.*` the same way `data/tests/*` already does.
Explicitly inserting both here makes both invocation forms work.
"""

import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_DATA_DIR = _REPO_ROOT / "data"

for _p in (str(_REPO_ROOT), str(_DATA_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)


@pytest.fixture(autouse=True)
def _force_prod_mode(monkeypatch):
    """Make the suite hermetic to the developer's local api/secrets.toml.

    A localhost redirect_uri in the (gitignored) secrets file flips
    config.DEV_MODE on at import — which would silently change cookie
    Secure flags and origin-gate behavior under test depending on whose
    machine the suite runs on. Force production behavior; dev-mode tests
    (test_dev_mode.py) opt back in with their own monkeypatch, which
    overrides this fixture's value within the test.
    """
    import api.config as _config
    import api.main as _main

    monkeypatch.setattr(_config, "DEV_MODE", False)
    monkeypatch.setattr(_main, "_COOKIE_SECURE", True)
