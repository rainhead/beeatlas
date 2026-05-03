"""Unit tests for canonical_name.canonicalize() — D-04 5-step algorithm.

Pure-function tests, no DB / no fixtures. Per-step coverage + idempotence + the
TAX-04 disagreement fixture (Lasioglossum (Dialictus) zonulum ↔ Lasioglossum
zonulum) that must collapse to the same JOIN key.

D-04 step 3 LOCKS _INFRA_MARKERS to EXACTLY 5 markers: ssp., var., aff., cf.,
nr. — DO NOT add subsp. without a CONTEXT.md amendment.
"""

import pytest

from canonical_name import canonicalize, _INFRA_MARKERS


# ---------------------------------------------------------------------------
# Step 1: strip authority
# ---------------------------------------------------------------------------

def test_canonicalize_strips_authority_paren_year():
    assert canonicalize("Andrena fulva (Müller, 1766)") == "andrena fulva"


def test_canonicalize_strips_authority_comma_year():
    assert canonicalize("Andrena fulva, 1766") == "andrena fulva"


def test_canonicalize_strips_authority_author_comma_year():
    assert canonicalize("Andrena fulva Müller, 1766") == "andrena fulva"


# ---------------------------------------------------------------------------
# Step 2: strip subgenus parens
# ---------------------------------------------------------------------------

def test_canonicalize_strips_subgenus_parens():
    assert canonicalize("Lasioglossum (Dialictus) zonulum") == "lasioglossum zonulum"


def test_canonicalize_strips_subgenus_parens_seladonia():
    assert canonicalize("Halictus (Seladonia) confusus") == "halictus confusus"


# ---------------------------------------------------------------------------
# Step 3: strip infraspecific markers (EXACTLY the 5 D-04 markers)
# ---------------------------------------------------------------------------

def test_canonicalize_strips_infraspecific_ssp():
    assert canonicalize("Bombus huntii ssp. occidentalis") == "bombus huntii"


def test_canonicalize_aff_folds_to_genus():
    """RESEARCH.md: aff./cf./nr. fold to genus only (not enough info for species)."""
    assert canonicalize("Hylaeus aff. cressoni") == "hylaeus"


def test_canonicalize_trinomial_folds_to_binomial():
    """PITFALLS.md #2 — trinomials must fold to binomial JOIN key."""
    assert canonicalize("Bombus melanopygus mixtus") == "bombus melanopygus"
    assert canonicalize("Colletes consors pascoensis") == "colletes consors"


# ---------------------------------------------------------------------------
# Steps 4 + 5: lowercase + whitespace collapse
# ---------------------------------------------------------------------------

def test_canonicalize_lowercase_and_whitespace():
    assert canonicalize("  Apis  Mellifera  ") == "apis mellifera"
    assert canonicalize("APIS MELLIFERA") == "apis mellifera"


# ---------------------------------------------------------------------------
# Genus-only / higher-rank inputs
# ---------------------------------------------------------------------------

def test_canonicalize_genus_only():
    assert canonicalize("Osmia") == "osmia"


# ---------------------------------------------------------------------------
# TAX-04 — disagreement fixture (the join-key acceptance test)
# ---------------------------------------------------------------------------

def test_canonicalize_disagreement_fixture_collapses_to_same_key():
    """TAX-04: Lasioglossum (Dialictus) zonulum and Lasioglossum zonulum
    must produce the same canonical_name so the JOIN succeeds."""
    a = canonicalize("Lasioglossum (Dialictus) zonulum")
    b = canonicalize("Lasioglossum zonulum")
    assert a == b == "lasioglossum zonulum"


# ---------------------------------------------------------------------------
# None / empty
# ---------------------------------------------------------------------------

def test_canonicalize_none_input():
    assert canonicalize(None) is None


def test_canonicalize_empty_input():
    assert canonicalize("") is None
    assert canonicalize("   ") is None


# ---------------------------------------------------------------------------
# Idempotence
# ---------------------------------------------------------------------------

def test_canonicalize_idempotent():
    cases = [
        "Lasioglossum (Dialictus) zonulum",
        "Andrena fulva (Müller, 1766)",
        "Bombus melanopygus mixtus",
        "Hylaeus aff. cressoni",
        "  Apis  Mellifera  ",
        "Osmia",
    ]
    for x in cases:
        once = canonicalize(x)
        twice = canonicalize(once)
        assert once == twice, f"not idempotent for {x!r}: {once!r} != {twice!r}"


# ---------------------------------------------------------------------------
# Combined (authority + subgenus parens)
# ---------------------------------------------------------------------------

def test_canonicalize_authority_plus_subgenus_combined():
    assert canonicalize("Lasioglossum (Dialictus) zonulum (Smith, 1853)") == "lasioglossum zonulum"


# ---------------------------------------------------------------------------
# Marker constant locked to D-04 (EXACTLY 5)
# ---------------------------------------------------------------------------

def test_infra_markers_locked_to_d04_exactly_five():
    """D-04 step 3 lists EXACTLY 5 markers: ssp., var., aff., cf., nr.
    DO NOT add subsp. without a follow-up CONTEXT.md amendment."""
    assert len(_INFRA_MARKERS) == 5
    assert set(_INFRA_MARKERS) == {"ssp.", "var.", "aff.", "cf.", "nr."}
