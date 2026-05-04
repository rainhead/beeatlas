"""Tests for data/config.py — pyproject-sourced project configuration.

Phase 78 D-02 (LOCKED): state_fips is config-driven (sourced from
[tool.beeatlas] in data/pyproject.toml), not hardcoded in modules.
"""


def test_state_fips_value_is_53():
    """STATE_FIPS resolves to '53' (Washington), the value seeded in pyproject.toml."""
    from config import STATE_FIPS
    assert STATE_FIPS == "53"


def test_state_fips_is_string():
    """STATE_FIPS is a `str`, matching the existing SQL idiom

    `WHERE state_fips = '53'` (data/export.py and data/feeds.py). Forcing an
    int would require casts at every call site.
    """
    from config import STATE_FIPS
    assert isinstance(STATE_FIPS, str), f"expected str, got {type(STATE_FIPS).__name__}"
