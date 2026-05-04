"""Integration tests for species_export.py.

Covers AGG-01..05, AGG-07, and the success-criterion-4 idempotency contract
(Plan 078-04: two-run byte-equality across parquet + JSON sidecars).

Test names match `.planning/phases/078-pipeline-outputs/078-VALIDATION.md`
Per-Task Verification Map exactly.
"""
import json

import duckdb

import export as occ_export_mod
import species_export as export_mod
from feeds import _slugify


EXPECTED_SPECIES_COLS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'slug',
]


def _run_full_export(fixture_con, export_dir, monkeypatch):
    """Run occurrences.parquet + species_export end-to-end into export_dir."""
    monkeypatch.setattr(occ_export_mod, 'ASSETS_DIR', export_dir)
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    occ_export_mod.export_occurrences_parquet(fixture_con)
    export_mod.export_species_parquet(fixture_con)


def _read_species_rows(export_dir):
    parquet_path = str(export_dir / 'species.parquet')
    rows = duckdb.execute(
        f"SELECT * FROM read_parquet('{parquet_path}') ORDER BY canonical_name"
    ).fetchall()
    cols = [d[0] for d in duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()]
    return [dict(zip(cols, r)) for r in rows], cols


def test_full_outer_three_arms(fixture_con, export_dir, monkeypatch):
    """AGG-01: FULL OUTER preserves checklist-only AND occurrence-only AND matched arms.

    Fixture canonical names (from data/tests/conftest.py LIN-05 seed):
      - 'lasioglossum zonulum'   -> matched (checklist + ecdysis occurrences)
      - 'andrena fulva'          -> checklist-only (no ecdysis row)
      - 'zzzzz nonexistensia'    -> occurrence-only (no checklist row)
    """
    _run_full_export(fixture_con, export_dir, monkeypatch)
    parquet_path = str(export_dir / 'species.parquet')

    matched = duckdb.execute(f"""
        SELECT on_checklist, occurrence_count
        FROM read_parquet('{parquet_path}')
        WHERE canonical_name = 'lasioglossum zonulum'
    """).fetchall()
    assert len(matched) == 1, "matched arm: expected exactly 1 row for 'lasioglossum zonulum'"
    assert matched[0][0] is True, "matched arm: on_checklist must be True"
    assert matched[0][1] > 0, "matched arm: occurrence_count must be > 0"

    checklist_only = duckdb.execute(f"""
        SELECT on_checklist, occurrence_count
        FROM read_parquet('{parquet_path}')
        WHERE canonical_name = 'andrena fulva'
    """).fetchall()
    assert len(checklist_only) == 1, "checklist-only arm: expected 1 row for 'andrena fulva'"
    assert checklist_only[0][0] is True, "checklist-only arm: on_checklist must be True"
    assert checklist_only[0][1] == 0, "checklist-only arm: occurrence_count must be 0"

    occurrence_only = duckdb.execute(f"""
        SELECT on_checklist, occurrence_count
        FROM read_parquet('{parquet_path}')
        WHERE canonical_name = 'zzzzz nonexistensia'
    """).fetchall()
    assert len(occurrence_only) == 1, \
        "occurrence-only arm: expected 1 row for 'zzzzz nonexistensia'"
    assert occurrence_only[0][0] is False, "occurrence-only arm: on_checklist must be False"
    assert occurrence_only[0][1] > 0, "occurrence-only arm: occurrence_count must be > 0"


def test_species_parquet_schema(fixture_con, export_dir, monkeypatch):
    """AGG-02: species.parquet schema includes all 19 EXPECTED_SPECIES_COLS, month_histogram is len-12."""
    _run_full_export(fixture_con, export_dir, monkeypatch)
    parquet_path = str(export_dir / 'species.parquet')

    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]
    for col in EXPECTED_SPECIES_COLS:
        assert col in actual_cols, f"Missing column in species.parquet: {col}"

    rows, _ = _read_species_rows(export_dir)
    assert len(rows) > 0, "species.parquet must have at least one row"
    hist = rows[0]['month_histogram']
    assert isinstance(hist, list), "month_histogram must be a list"
    assert len(hist) == 12, f"month_histogram length must be 12, got {len(hist)}"


def test_slug_invariant(fixture_con, export_dir, monkeypatch):
    """AGG-03: _slugify(scientificName) matches the slug column byte-for-byte for every row."""
    _run_full_export(fixture_con, export_dir, monkeypatch)
    rows, _ = _read_species_rows(export_dir)

    assert rows, "species.parquet must have rows for slug invariant"
    for r in rows:
        expected = _slugify(r['scientificName'])
        assert expected == r['slug'], (
            f"slug invariant violated: scientificName={r['scientificName']!r} "
            f"_slugify->{expected!r} parquet.slug={r['slug']!r}"
        )


def test_full_outer_card_counts(fixture_con, export_dir, monkeypatch):
    """AGG-07: no duplicate canonical_name rows in species.parquet (Pitfall #7)."""
    _run_full_export(fixture_con, export_dir, monkeypatch)
    rows, _ = _read_species_rows(export_dir)

    canon_names = [r['canonical_name'] for r in rows]
    assert len(canon_names) == len(set(canon_names)), (
        f"species.parquet has duplicate canonical_name rows: "
        f"{len(canon_names)} rows, {len(set(canon_names))} distinct"
    )


def test_species_json_shape(fixture_con, export_dir, monkeypatch):
    """AGG-04: species.json is a flat array; row[0] has every key in SPECIES_COLUMNS;
    month_histogram is a 12-element list. Size matches parquet row count.
    """
    _run_full_export(fixture_con, export_dir, monkeypatch)
    species_json_path = export_dir / 'species.json'
    assert species_json_path.exists(), "species.json must be written"

    arr = json.loads(species_json_path.read_text(encoding='utf-8'))
    assert isinstance(arr, list), "species.json must be a top-level array"

    rows, _ = _read_species_rows(export_dir)
    assert len(arr) == len(rows), (
        f"species.json length ({len(arr)}) must equal species.parquet row count ({len(rows)})"
    )

    for col in EXPECTED_SPECIES_COLS:
        assert col in arr[0], f"species.json row[0] missing key: {col}"

    hist = arr[0]['month_histogram']
    assert isinstance(hist, list) and len(hist) == 12, \
        f"species.json row[0].month_histogram must be 12-element list, got {hist!r}"

    # Pitfall #6: json.dumps(..., sort_keys=True, indent=2) must round-trip byte-for-byte.
    expected_bytes = json.dumps(arr, sort_keys=True, indent=2)
    on_disk = species_json_path.read_text(encoding='utf-8')
    assert on_disk == expected_bytes, \
        "species.json on-disk content must equal json.dumps(arr, sort_keys=True, indent=2)"


def test_seasonality_shape_and_budget(fixture_con, export_dir, monkeypatch):
    """AGG-05: seasonality.json shape (species → bucket → 12-int array), size < 6 MB,
    sort_keys=True idempotency for byte-for-byte stability (Pitfall #6).
    """
    _run_full_export(fixture_con, export_dir, monkeypatch)
    seas_path = export_dir / 'seasonality.json'
    assert seas_path.exists(), "seasonality.json must be written"

    seas = json.loads(seas_path.read_text(encoding='utf-8'))
    assert isinstance(seas, dict), "seasonality.json must be an object keyed by species"
    assert seas, "seasonality.json must contain at least one species (fixture has occurrences)"

    for canon, buckets in seas.items():
        assert isinstance(buckets, dict), \
            f"seasonality[{canon!r}] must be a dict of bucket → array"
        for bucket_key, hist in buckets.items():
            assert (
                bucket_key == '_total'
                or bucket_key.startswith('county:')
                or bucket_key.startswith('ecoregion_l3:')
            ), f"unexpected bucket key {bucket_key!r} for species {canon!r}"
            assert isinstance(hist, list) and len(hist) == 12, (
                f"seasonality[{canon!r}][{bucket_key!r}] must be a 12-element list, got {hist!r}"
            )
            for v in hist:
                assert isinstance(v, int), \
                    f"seasonality[{canon!r}][{bucket_key!r}] element must be int, got {v!r}"

    size = seas_path.stat().st_size
    assert size < 6 * 1024 * 1024, f"seasonality.json exceeded 6 MB budget ({size:,} bytes)"

    # Pitfall #6: byte-for-byte stability with sort_keys + tight separators.
    expected_bytes = json.dumps(seas, sort_keys=True, separators=(',', ':'))
    on_disk = seas_path.read_text(encoding='utf-8')
    assert on_disk == expected_bytes, (
        "seasonality.json on-disk content must equal "
        "json.dumps(seas, sort_keys=True, separators=(',', ':'))"
    )


def test_idempotency_two_runs(fixture_con, export_dir, monkeypatch):
    """Success crit 4 / Pitfall #6: two consecutive runs produce byte-identical
    artifacts (parquet + JSON sidecars). sha256 over each artifact across runs
    must match; time.sleep between runs makes any time-dependent non-determinism
    observable.
    """
    import hashlib
    import time

    monkeypatch.setattr(occ_export_mod, 'ASSETS_DIR', export_dir)
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)

    artifacts = ['species.parquet', 'species.json', 'seasonality.json']

    occ_export_mod.export_occurrences_parquet(fixture_con)
    export_mod.export_species_parquet(fixture_con)
    first = {
        name: hashlib.sha256((export_dir / name).read_bytes()).hexdigest()
        for name in artifacts
    }

    time.sleep(1.5)  # observable gap so time-dependent non-determinism would surface

    occ_export_mod.export_occurrences_parquet(fixture_con)
    export_mod.export_species_parquet(fixture_con)
    second = {
        name: hashlib.sha256((export_dir / name).read_bytes()).hexdigest()
        for name in artifacts
    }

    for name in artifacts:
        assert first[name] == second[name], (
            f"{name} differs between runs (first={first[name]}, second={second[name]})"
        )
