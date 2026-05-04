"""Project-wide configuration sourced from pyproject.toml [tool.beeatlas].

Single point of truth for cross-state-expansion knobs (Phase 78 D-02).

Phase 78 introduces only STATE_FIPS; future multi-state generalization
will add bbox / viewBox / county-loader config alongside it (CONTEXT.md
Deferred Ideas).
"""

import tomllib
from pathlib import Path

_PYPROJECT = Path(__file__).parent / "pyproject.toml"
with _PYPROJECT.open("rb") as fh:
    _CFG = tomllib.load(fh)

_BEEATLAS = _CFG.get("tool", {}).get("beeatlas", {})

# Default to Washington ('53') if missing — matches the existing SQL idiom
# `WHERE state_fips = '53'` in data/export.py and data/feeds.py.
STATE_FIPS: str = _BEEATLAS.get("state_fips", "53")
