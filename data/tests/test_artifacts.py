"""Bootstrap tests for artifacts.py — RED phase (Task 2).

These minimal tests will be expanded to the full suite in Task 3.
"""
from artifacts import load, validate


def test_load_returns_16_artifacts():
    """Loader returns 16 artifacts from the real contract."""
    spec = load()
    assert len(spec) == 16


def test_validate_passes_real_contract():
    """validate() does not raise on the real contract."""
    spec = load()
    validate(spec)  # must not raise
