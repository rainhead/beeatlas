"""Byte-equivalence and behavioral tests for data/domain.py.

Proves that domain.slugify produces byte-for-byte identical output to the
prior private _slugify implementation in feeds.py (Phase 78 D-01 invariant).
"""

import re
import unicodedata

import pytest

from domain import slugify


def _prior_impl(value: str) -> str:
    """Verbatim reproduction of feeds._slugify as it existed before Phase 102.

    This function is intentionally self-contained — it does not import from
    feeds.py — so the byte-equivalence test remains valid even after Phase 102
    removes _slugify from feeds.py.
    """
    # Transliterate accented characters to ASCII equivalents
    value = unicodedata.normalize('NFKD', value)
    value = value.encode('ascii', 'ignore').decode('ascii')
    value = value.lower()
    # Spaces, underscores, dots, commas -> hyphen
    value = re.sub(r'[\s_.,]+', '-', value)
    # Strip remaining non-alphanumeric-hyphen characters (including / and .)
    value = re.sub(r'[^a-z0-9-]', '', value)
    # Collapse runs of hyphens
    value = re.sub(r'-+', '-', value)
    return value.strip('-') or 'unknown'


# ---------------------------------------------------------------------------
# Behavioral tests
# ---------------------------------------------------------------------------

def test_slugify_basic():
    """Basic slug conversion: spaces to hyphens, lowercase, accented chars transliterated."""
    assert slugify("Jane Smith") == "jane-smith"
    assert slugify("") == "unknown"
    assert slugify("Müller") == "muller"


def test_slugify_strips_punctuation():
    """Parentheses and other non-[a-z0-9-] chars are stripped."""
    slug = slugify("Mucera (subgenus)")
    assert all(c in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in slug), \
        f"Slug contains non-[a-z0-9-] chars: {slug!r}"


def test_slugify_path_traversal_safe():
    """'/' and '.' are absent from slugified path traversal strings."""
    result = slugify("../../etc/passwd")
    assert '/' not in result, f"'/' found in slug: {result!r}"
    assert '.' not in result, f"'.' found in slug: {result!r}"


def test_slugify_collapses_runs():
    """Multiple separators (spaces, underscores, dots, commas) collapse to single hyphen."""
    assert slugify("a  b__c..d,,e") == "a-b-c-d-e"


def test_slugify_unicode_dash():
    """Em-dash is not in [a-z0-9-] and gets stripped after ASCII transliteration."""
    result = slugify("foo—bar")
    assert result == "foobar", f"Expected 'foobar', got {result!r}"


# ---------------------------------------------------------------------------
# Byte-equivalence test (Phase 78 D-01 invariant)
# ---------------------------------------------------------------------------

_CORPUS = [
    "Jane Smith",
    "",
    "Müller",
    "Mucera (subgenus)",
    "../../etc/passwd",
    "a  b__c..d,,e",
    "foo—bar",          # em-dash
    "François O'Brien",
    "hyphen---runs",
    "   ",
    "!!!",
    "Andrena (Plastandrena) fenningeri",
]


def test_slugify_byte_equivalence():
    """domain.slugify produces byte-for-byte identical output to prior feeds._slugify.

    The prior implementation is reproduced verbatim inside this test (see
    _prior_impl above) so the assertion is self-contained and does not depend
    on feeds._slugify still existing after Phase 102.
    """
    for s in _CORPUS:
        expected = _prior_impl(s)
        actual = slugify(s)
        assert actual == expected, (
            f"Byte-equivalence failure for input {s!r}: "
            f"slugify={actual!r}, prior_impl={expected!r}"
        )
