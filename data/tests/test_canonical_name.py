"""Unit tests for canonical_name.normalize_scientific_name() — D-04 5-step algorithm.

Pure-function tests, no DB / no fixtures. Per-step coverage + idempotence + the
TAX-04 disagreement fixture (Lasioglossum (Dialictus) zonulum ↔ Lasioglossum
zonulum) that must collapse to the same JOIN key.

D-04 step 3 LOCKS _INFRA_MARKERS to EXACTLY 5 markers: ssp., var., aff., cf.,
nr. — DO NOT add subsp. without a CONTEXT.md amendment.
"""

import pytest

import canonical_name as _cn_mod
from canonical_name import apply_synonym, normalize_scientific_name, _INFRA_MARKERS


# ---------------------------------------------------------------------------
# Step 1: strip authority
# ---------------------------------------------------------------------------

def test_canonicalize_strips_authority_paren_year():
    assert normalize_scientific_name("Andrena fulva (Müller, 1766)") == "andrena fulva"


def test_canonicalize_strips_authority_comma_year():
    assert normalize_scientific_name("Andrena fulva, 1766") == "andrena fulva"


def test_canonicalize_strips_authority_author_comma_year():
    assert normalize_scientific_name("Andrena fulva Müller, 1766") == "andrena fulva"


# ---------------------------------------------------------------------------
# Step 2: strip subgenus parens
# ---------------------------------------------------------------------------

def test_canonicalize_strips_subgenus_parens():
    assert normalize_scientific_name("Lasioglossum (Dialictus) zonulum") == "lasioglossum zonulum"


def test_canonicalize_strips_subgenus_parens_seladonia():
    assert normalize_scientific_name("Halictus (Seladonia) confusus") == "halictus confusus"


# ---------------------------------------------------------------------------
# Step 3: strip infraspecific markers (EXACTLY the 5 D-04 markers)
# ---------------------------------------------------------------------------

def test_canonicalize_strips_infraspecific_ssp():
    assert normalize_scientific_name("Bombus huntii ssp. occidentalis") == "bombus huntii"


def test_canonicalize_aff_folds_to_genus():
    """RESEARCH.md: aff./cf./nr. fold to genus only (not enough info for species)."""
    assert normalize_scientific_name("Hylaeus aff. cressoni") == "hylaeus"


def test_canonicalize_trinomial_folds_to_binomial():
    """PITFALLS.md #2 — trinomials must fold to binomial JOIN key."""
    assert normalize_scientific_name("Bombus melanopygus mixtus") == "bombus melanopygus"
    assert normalize_scientific_name("Colletes consors pascoensis") == "colletes consors"


# ---------------------------------------------------------------------------
# Steps 4 + 5: lowercase + whitespace collapse
# ---------------------------------------------------------------------------

def test_canonicalize_lowercase_and_whitespace():
    assert normalize_scientific_name("  Apis  Mellifera  ") == "apis mellifera"
    assert normalize_scientific_name("APIS MELLIFERA") == "apis mellifera"


# ---------------------------------------------------------------------------
# Genus-only / higher-rank inputs
# ---------------------------------------------------------------------------

def test_canonicalize_genus_only():
    assert normalize_scientific_name("Osmia") == "osmia"


# ---------------------------------------------------------------------------
# TAX-04 — disagreement fixture (the join-key acceptance test)
# ---------------------------------------------------------------------------

def test_canonicalize_disagreement_fixture_collapses_to_same_key():
    """TAX-04: Lasioglossum (Dialictus) zonulum and Lasioglossum zonulum
    must produce the same canonical_name so the JOIN succeeds."""
    a = normalize_scientific_name("Lasioglossum (Dialictus) zonulum")
    b = normalize_scientific_name("Lasioglossum zonulum")
    assert a == b == "lasioglossum zonulum"


# ---------------------------------------------------------------------------
# None / empty
# ---------------------------------------------------------------------------

def test_canonicalize_none_input():
    assert normalize_scientific_name(None) is None


def test_canonicalize_empty_input():
    assert normalize_scientific_name("") is None
    assert normalize_scientific_name("   ") is None


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
        once = normalize_scientific_name(x)
        twice = normalize_scientific_name(once)
        assert once == twice, f"not idempotent for {x!r}: {once!r} != {twice!r}"


# ---------------------------------------------------------------------------
# Combined (authority + subgenus parens)
# ---------------------------------------------------------------------------

def test_canonicalize_authority_plus_subgenus_combined():
    assert normalize_scientific_name("Lasioglossum (Dialictus) zonulum (Smith, 1853)") == "lasioglossum zonulum"


# ---------------------------------------------------------------------------
# Marker constant locked to D-04 (EXACTLY 5)
# ---------------------------------------------------------------------------

def test_infra_markers_locked_to_d04_exactly_five():
    """D-04 step 3 lists EXACTLY 5 markers: ssp., var., aff., cf., nr.
    DO NOT add subsp. without a follow-up CONTEXT.md amendment."""
    assert len(_INFRA_MARKERS) == 5
    assert set(_INFRA_MARKERS) == {"ssp.", "var.", "aff.", "cf.", "nr."}


# ---------------------------------------------------------------------------
# apply_synonym — post-canonicalization occurrence synonymy
# ---------------------------------------------------------------------------

def test_apply_synonym_maps_known(monkeypatch):
    monkeypatch.setattr(_cn_mod, "_SYNONYMS", {"agapostemon texanus": "agapostemon subtilior"})
    assert apply_synonym("agapostemon texanus") == "agapostemon subtilior"


def test_apply_synonym_passthrough_unknown(monkeypatch):
    monkeypatch.setattr(_cn_mod, "_SYNONYMS", {})
    assert apply_synonym("bombus vosnesenskii") == "bombus vosnesenskii"


def test_apply_synonym_none():
    assert apply_synonym(None) is None


def test_apply_synonym_loads_agapostemon_from_csv(monkeypatch):
    """Integration: occurrence_synonyms.csv maps agapostemon texanus → subtilior."""
    monkeypatch.setattr(_cn_mod, "_SYNONYMS", None)  # force re-read from disk
    assert apply_synonym("agapostemon texanus") == "agapostemon subtilior"


def test_apply_synonym_composed_with_normalize_scientific_name():
    """Portman et al. 2024: 'Agapostemon texanus' scientific name → 'agapostemon subtilior'."""
    assert apply_synonym(normalize_scientific_name("Agapostemon texanus")) == "agapostemon subtilior"


# ---------------------------------------------------------------------------
# Phase 135 Plan 01 — RCN-01 trailing-space regression guard.
#
# This test documents existing behavior (normalize_scientific_name already
# handles trailing spaces via step 5 whitespace collapse). It is intentionally
# non-RED — the behavior already exists. Kept as a regression guard so a future
# change to canonical_name.py cannot silently break this RCN-01 requirement.
# ---------------------------------------------------------------------------


def test_canonicalize_trailing_space_regressionguard():
    """RCN-01: trailing whitespace must be stripped from normalized output.

    'Agapostemon texanus ' (trailing space) must normalize to 'agapostemon texanus'
    via step 5 (whitespace collapse + strip) of normalize_scientific_name().
    This test is discoverable via -k trailing.
    """
    assert normalize_scientific_name("Agapostemon texanus ") == "agapostemon texanus"
