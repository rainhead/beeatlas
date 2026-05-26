"""Integration test stubs for inat_obs_pipeline (Phase 117 / PIPE-01..04).

Wave 0 Nyquist gate: this file deliberately imports inat_obs_pipeline, which
does NOT exist until Plan 02 lands. pytest will fail to collect this file with
a ModuleNotFoundError — that is the intended RED signal.

Plan 02 delivers data/inat_obs_pipeline.py and turns these tests GREEN.

Test coverage:
  PIPE-01  test_schema_has_12_columns       — output has exactly 12 columns in order
  PIPE-02  test_canonical_name_non_null     — canonical_name never NULL when sci_name present
  PIPE-03  test_dedup_excludes_specimen_obs — rows matching WABA OFV 18116 are excluded
  PIPE-04  test_floral_host_mapping         — floral_host from OFV column; NULL when absent
"""

import csv
import importlib

import duckdb
import pytest

import inat_obs_pipeline  # ModuleNotFoundError until Plan 02 — RED gate

# ---------------------------------------------------------------------------
# CSV header used in all fixture CSVs (matches the 10 source columns from
# data/raw/inat_expert_obs.csv, per interfaces block in 117-01-PLAN.md).
# Note: quality_grade absent from the committed CSV but included here because
# the pipeline uses .get() — tests can supply it or omit it.
# ---------------------------------------------------------------------------
_CSV_HEADER = [
    "id",
    "observed_on",
    "latitude",
    "longitude",
    "scientific_name",
    "user_login",
    "image_url",
    "license",
    "quality_grade",
    "field:associated species with names lookup",
]

# Expected 12-column output schema in ordinal order (D-02 / PIPE-01).
_EXPECTED_COLUMNS = [
    "obs_id",
    "observed_on",
    "lat",
    "lon",
    "canonical_name",
    "scientific_name",
    "user_login",
    "image_url",
    "license",
    "floral_host",
    "quality_grade",
    "obs_url",
]


def _write_csv(path, rows):
    """Write a minimal CSV with the standard header + given data rows."""
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=_CSV_HEADER)
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def inat_obs_db(tmp_path, monkeypatch):
    """Isolated DuckDB with pre-seeded inaturalist_waba_data schemas.

    Mirrors the checklist_db fixture pattern from test_checklist_pipeline.py:
    monkeypatches DB_PATH + EXPORT_DIR, reloads the module so module-level
    constants pick up the patched env, pre-creates the WABA dependency schemas,
    and redirects CSV_PATH to a per-test tmp file.

    Returns (db_path, tmp_path, inat_obs_pipeline_module).
    """
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))

    importlib.reload(inat_obs_pipeline)

    # Pre-create inaturalist_waba_data schemas so the dedup query does not
    # error on a completely empty DB (mirrors prod ordering: waba runs first).
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("CREATE TABLE inaturalist_waba_data.observations (id BIGINT)")
    con.execute(
        "CREATE TABLE inaturalist_waba_data.observations__ofvs ("
        "_dlt_root_id VARCHAR, field_id BIGINT, name VARCHAR, "
        "value VARCHAR, _dlt_id VARCHAR)"
    )
    con.close()

    # Each test writes its own CSV via _write_csv(); redirect the module
    # CSV_PATH so load_inat_obs() reads the per-test file.
    csv_path = tmp_path / "inat_expert_obs.csv"
    monkeypatch.setattr(inat_obs_pipeline, "CSV_PATH", csv_path)

    return db_path, tmp_path, inat_obs_pipeline


def test_schema_has_12_columns(inat_obs_db):
    """PIPE-01: output inat_obs_data.observations has exactly the 12 expected columns
    in ordinal order, and inat_obs.parquet has the same columns when read back."""
    db_path, tmp_path, mod = inat_obs_db
    csv_path = tmp_path / "inat_expert_obs.csv"
    _write_csv(csv_path, [
        {
            "id": "100001",
            "observed_on": "2024-06-01",
            "latitude": "47.5",
            "longitude": "-120.8",
            "scientific_name": "Andrena fulva",
            "user_login": "testuser",
            "image_url": "https://example.com/img.jpg",
            "license": "CC BY",
            "quality_grade": "research",
            "field:associated species with names lookup": "Balsamorhiza sagittata",
        }
    ])

    mod.load_inat_obs()

    # Assert DuckDB table columns in ordinal order.
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='inat_obs_data' AND table_name='observations' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ]
    finally:
        con.close()

    assert cols == _EXPECTED_COLUMNS, (
        f"Column mismatch.\n  Expected: {_EXPECTED_COLUMNS}\n  Got:      {cols}"
    )

    # Assert Parquet output has the same 12 columns.
    parquet_path = tmp_path / "inat_obs.parquet"
    assert parquet_path.exists(), "inat_obs.parquet not written to EXPORT_DIR"
    con2 = duckdb.connect()
    try:
        parquet_cols = [
            row[0]
            for row in con2.execute(
                f"SELECT name FROM parquet_schema('{parquet_path}') WHERE name != 'duckdb_schema'"
            ).fetchall()
        ]
    finally:
        con2.close()
    assert parquet_cols == _EXPECTED_COLUMNS, (
        f"Parquet column mismatch.\n  Expected: {_EXPECTED_COLUMNS}\n  Got: {parquet_cols}"
    )


def test_canonical_name_non_null(inat_obs_db):
    """PIPE-02: after load_inat_obs(), no row has canonical_name IS NULL when
    scientific_name IS NOT NULL."""
    db_path, tmp_path, mod = inat_obs_db
    csv_path = tmp_path / "inat_expert_obs.csv"
    _write_csv(csv_path, [
        {
            "id": "200001",
            "observed_on": "2024-05-15",
            "latitude": "47.6",
            "longitude": "-121.0",
            "scientific_name": "Bombus vosnesenskii",
            "user_login": "userA",
            "image_url": "",
            "license": "CC0",
            "quality_grade": "needs_id",
            "field:associated species with names lookup": "",
        },
        {
            "id": "200002",
            "observed_on": "2024-07-01",
            "latitude": "48.0",
            "longitude": "-122.0",
            "scientific_name": "Halictus (Dialictus) rubicundus",
            "user_login": "userB",
            "image_url": "",
            "license": "",
            "quality_grade": "research",
            "field:associated species with names lookup": "",
        },
    ])

    mod.load_inat_obs()

    con = duckdb.connect(db_path, read_only=True)
    try:
        null_count = con.execute(
            "SELECT count(*) FROM inat_obs_data.observations "
            "WHERE canonical_name IS NULL AND scientific_name IS NOT NULL"
        ).fetchone()[0]
    finally:
        con.close()

    assert null_count == 0, (
        f"Found {null_count} rows with canonical_name IS NULL but scientific_name IS NOT NULL "
        "(PIPE-02 violation)"
    )


def test_dedup_excludes_specimen_obs(inat_obs_db):
    """PIPE-03: a row whose obs_id matches a WABA specimen_observation_id
    (field_id=18116) must be absent from inat_obs_data.observations after
    load_inat_obs(); a second row with a different obs_id must be present.

    Dedup seed IDs (per 117-01-PLAN.md interfaces):
      999000001  — duplicate (linked to WABA specimen via OFV 18116); must be excluded
      999000002  — keep row (not linked); must appear in output
    """
    db_path, tmp_path, mod = inat_obs_db

    # Seed inaturalist_waba_data so the raw-table fallback dedup query works.
    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_waba_data.observations VALUES (999000001)")
    con.execute(
        "INSERT INTO inaturalist_waba_data.observations__ofvs VALUES "
        "('root1', 18116, 'observation', '999000001', 'dltid1')"
    )
    con.close()

    csv_path = tmp_path / "inat_expert_obs.csv"
    _write_csv(csv_path, [
        {
            "id": "999000001",  # duplicate — must be excluded
            "observed_on": "2024-06-01",
            "latitude": "47.5",
            "longitude": "-120.8",
            "scientific_name": "Eucera acerba",
            "user_login": "wabauser",
            "image_url": "",
            "license": "CC BY",
            "quality_grade": "research",
            "field:associated species with names lookup": "",
        },
        {
            "id": "999000002",  # non-duplicate — must appear in output
            "observed_on": "2024-07-10",
            "latitude": "47.9",
            "longitude": "-121.5",
            "scientific_name": "Osmia lignaria",
            "user_login": "expertuser",
            "image_url": "",
            "license": "CC BY-NC",
            "quality_grade": "research",
            "field:associated species with names lookup": "",
        },
    ])

    mod.load_inat_obs()

    con = duckdb.connect(db_path, read_only=True)
    try:
        ids_in_output = {
            row[0]
            for row in con.execute(
                "SELECT obs_id FROM inat_obs_data.observations"
            ).fetchall()
        }
    finally:
        con.close()

    assert 999000001 not in ids_in_output, (
        "obs_id 999000001 should have been excluded (WABA specimen dedup / PIPE-03)"
    )
    assert 999000002 in ids_in_output, (
        "obs_id 999000002 should be present (non-duplicate / PIPE-03)"
    )


def test_floral_host_mapping(inat_obs_db):
    """PIPE-04: floral_host is populated from the 'field:associated species
    with names lookup' column when present; NULL when the field is absent or empty."""
    db_path, tmp_path, mod = inat_obs_db
    csv_path = tmp_path / "inat_expert_obs.csv"
    _write_csv(csv_path, [
        {
            "id": "300001",
            "observed_on": "2024-06-01",
            "latitude": "47.5",
            "longitude": "-120.8",
            "scientific_name": "Andrena nigrocaerulea",
            "user_login": "userC",
            "image_url": "",
            "license": "CC BY",
            "quality_grade": "research",
            "field:associated species with names lookup": "Balsamorhiza sagittata",
        },
        {
            "id": "300002",
            "observed_on": "2024-06-02",
            "latitude": "47.6",
            "longitude": "-121.0",
            "scientific_name": "Bombus melanopygus",
            "user_login": "userD",
            "image_url": "",
            "license": "",
            "quality_grade": "needs_id",
            "field:associated species with names lookup": "",  # empty — must map to NULL
        },
    ])

    mod.load_inat_obs()

    con = duckdb.connect(db_path, read_only=True)
    try:
        rows = {
            row[0]: row[1]
            for row in con.execute(
                "SELECT obs_id, floral_host FROM inat_obs_data.observations ORDER BY obs_id"
            ).fetchall()
        }
    finally:
        con.close()

    assert rows[300001] == "Balsamorhiza sagittata", (
        f"Expected floral_host='Balsamorhiza sagittata' for obs 300001, got {rows.get(300001)!r}"
    )
    assert rows[300002] is None, (
        f"Expected floral_host IS NULL for obs 300002 (empty OFV), got {rows.get(300002)!r}"
    )
