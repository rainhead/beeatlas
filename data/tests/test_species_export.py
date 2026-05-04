"""Integration tests for species_export.py.

Covers AGG-01..05, AGG-07, idempotency. Written Wave 0 (Plan 078-01) — these
tests FAIL before Plan 078-02 lands data/species_export.py. Each stub
attempts the lazy import inside a try/except so the failure surfaces as a
deterministic `Wave 0 stub` message rather than an opaque collection error.

Test names match `.planning/phases/078-pipeline-outputs/078-VALIDATION.md`
Per-Task Verification Map exactly.
"""
import pytest


EXPECTED_SPECIES_COLS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'slug',
]


def _import_or_skip_with_wave0(fn_name: str):
    """Lazy import of species_export; converts ModuleNotFoundError into a
    deterministic Wave 0 stub failure so `grep -c "Wave 0 stub"` works.
    """
    try:
        import species_export as export_mod  # noqa: F401
        return export_mod
    except ModuleNotFoundError:
        pytest.fail(f"Wave 0 stub — Plan 078-02 implements {fn_name}")


def test_full_outer_three_arms(fixture_con, export_dir, monkeypatch):
    """AGG-01: FULL OUTER preserves checklist-only AND occurrence-only AND matched arms."""
    export_mod = _import_or_skip_with_wave0("export_species_parquet")
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-02 implements export_species_parquet")


def test_species_parquet_schema(fixture_con, export_dir, monkeypatch):
    """AGG-02: species.parquet schema includes EXPECTED_SPECIES_COLS."""
    export_mod = _import_or_skip_with_wave0("export_species_parquet")
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-02 implements export_species_parquet")


def test_slug_invariant(fixture_con, export_dir, monkeypatch):
    """AGG-03: _slugify(scientificName) matches the slug column byte-for-byte for every row."""
    export_mod = _import_or_skip_with_wave0("export_species_parquet")
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-02 implements export_species_parquet")


def test_species_json_shape(fixture_con, export_dir, monkeypatch):
    """AGG-04: species.json is a flat array; row[0] has expected keys."""
    export_mod = _import_or_skip_with_wave0("export_species_parquet")
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-02 implements export_species_parquet")


def test_seasonality_shape_and_budget(fixture_con, export_dir, monkeypatch):
    """AGG-05: seasonality.json keys species → bucket → 12-int array; size < 6 MB."""
    export_mod = _import_or_skip_with_wave0("export_species_parquet")
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-02 implements export_species_parquet")


def test_full_outer_card_counts(fixture_con, export_dir, monkeypatch):
    """AGG-07: FULL OUTER fixture produces correct card counts (matched / checklist-only / occurrence-only)."""
    export_mod = _import_or_skip_with_wave0("export_species_parquet")
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-02 implements export_species_parquet")


def test_idempotency_two_runs(fixture_con, export_dir, monkeypatch):
    """Success crit 4: two consecutive runs produce identical artifact bytes (parquet + JSON)."""
    export_mod = _import_or_skip_with_wave0("export_species_parquet")
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_species_parquet(fixture_con)
    export_mod.export_species_parquet(fixture_con)
    pytest.fail("Wave 0 stub — Plan 078-02 implements export_species_parquet")
