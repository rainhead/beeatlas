"""Integration tests for inat_obs_pipeline (Phase 117 / PIPE-01..04; rewritten
for the beeatlas-iek cutover, 2026-08-12).

load_inat_obs() now reads inat_expert_data.observations (the live v2 API
dataset from inat_expert_pipeline.py) instead of the retired CSV export. The
four original coverage points survive against the new source, plus a
license-uppercasing parity check:

  PIPE-01  test_schema_has_12_columns       — output has exactly 12 columns in order
  PIPE-02  test_canonical_name_non_null     — canonical_name never NULL when sci_name present
  PIPE-03  test_dedup_excludes_specimen_obs — rows matching WABA OFV 18116 are excluded
  PIPE-04  test_floral_host_mapping         — floral_host passed through; NULL when absent
  IEK-01   test_license_uppercased          — API license_code 'cc-by-nc' -> 'CC-BY-NC'
"""

import importlib

import duckdb
import pytest

import inat_obs_pipeline

# Expected 12-column output schema in ordinal order (D-02 / PIPE-01) —
# unchanged from the CSV era; downstream (int_combined ARM 4) depends on it.
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

# Source columns load_inat_obs() reads from inat_expert_data.observations.
_SRC_COLUMNS = (
    "id BIGINT, observed_on VARCHAR, latitude DOUBLE, longitude DOUBLE, "
    "taxon__name VARCHAR, user__login VARCHAR, image_url VARCHAR, "
    "license_code VARCHAR, floral_host VARCHAR, quality_grade VARCHAR"
)


def _obs(obs_id, name, *, login="testuser", license_code="cc-by",
         quality="research", floral_host=None, image_url=None,
         observed_on="2024-06-01", lat=47.5, lon=-120.8):
    return (obs_id, observed_on, lat, lon, name, login, image_url,
            license_code, floral_host, quality)


def _seed_expert_obs(db_path, rows):
    con = duckdb.connect(db_path)
    try:
        con.executemany(
            "INSERT INTO inat_expert_data.observations VALUES (?,?,?,?,?,?,?,?,?,?)",
            rows,
        )
    finally:
        con.close()


@pytest.fixture
def inat_obs_db(tmp_path, monkeypatch):
    """Isolated DuckDB pre-seeded with the two upstream schemas load_inat_obs()
    touches: inat_expert_data (its source) and inaturalist_waba_data (the
    dedup fallback query). Mirrors the checklist_db fixture pattern.

    Returns (db_path, inat_obs_pipeline_module).
    """
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    importlib.reload(inat_obs_pipeline)

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inat_expert_data")
    con.execute(f"CREATE TABLE inat_expert_data.observations ({_SRC_COLUMNS})")
    # Pre-create inaturalist_waba_data so the dedup query does not error on a
    # completely empty DB (mirrors prod ordering: waba runs first).
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("CREATE TABLE inaturalist_waba_data.observations (id BIGINT)")
    con.execute(
        "CREATE TABLE inaturalist_waba_data.observations__ofvs ("
        "_dlt_root_id VARCHAR, field_id BIGINT, name VARCHAR, "
        "value VARCHAR, _dlt_id VARCHAR)"
    )
    con.close()

    return db_path, inat_obs_pipeline


def test_schema_has_12_columns(inat_obs_db):
    """PIPE-01: output inat_obs_data.observations has exactly the 12 expected
    columns in ordinal order."""
    db_path, mod = inat_obs_db
    _seed_expert_obs(db_path, [
        _obs(100001, "Andrena fulva", floral_host="Balsamorhiza sagittata",
             image_url="https://example.com/medium.jpg"),
    ])

    mod.load_inat_obs()

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


def test_canonical_name_non_null(inat_obs_db):
    """PIPE-02: no row has canonical_name IS NULL when scientific_name IS NOT NULL —
    including the parenthetical-subgenus form."""
    db_path, mod = inat_obs_db
    _seed_expert_obs(db_path, [
        _obs(200001, "Bombus vosnesenskii", license_code="cc0", quality="needs_id"),
        _obs(200002, "Halictus (Dialictus) rubicundus", license_code=None),
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
    (field_id=18116) must be absent from the output; others present."""
    db_path, mod = inat_obs_db

    con = duckdb.connect(db_path)
    con.execute("INSERT INTO inaturalist_waba_data.observations VALUES (999000001)")
    con.execute(
        "INSERT INTO inaturalist_waba_data.observations__ofvs VALUES "
        "('root1', 18116, 'observation', '999000001', 'dltid1')"
    )
    con.close()

    _seed_expert_obs(db_path, [
        _obs(999000001, "Eucera acerba", login="wabauser"),     # linked — excluded
        _obs(999000002, "Osmia lignaria", login="expertuser"),  # kept
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
    """PIPE-04: floral_host passes through; NULL when absent."""
    db_path, mod = inat_obs_db
    _seed_expert_obs(db_path, [
        _obs(300001, "Andrena nigrocaerulea", floral_host="Balsamorhiza sagittata"),
        _obs(300002, "Bombus melanopygus", floral_host=None, quality="needs_id"),
    ])

    mod.load_inat_obs()

    con = duckdb.connect(db_path, read_only=True)
    try:
        rows = dict(con.execute(
            "SELECT obs_id, floral_host FROM inat_obs_data.observations ORDER BY obs_id"
        ).fetchall())
    finally:
        con.close()

    assert rows[300001] == "Balsamorhiza sagittata"
    assert rows[300002] is None


def test_license_uppercased(inat_obs_db):
    """IEK-01: the API's lowercase license_code lands as the CSV-era uppercase
    vocabulary ('cc-by-nc' -> 'CC-BY-NC'); NULL stays NULL."""
    db_path, mod = inat_obs_db
    _seed_expert_obs(db_path, [
        _obs(400001, "Anthophora pacifica", license_code="cc-by-nc"),
        _obs(400002, "Anthidium manicatum", license_code=None),
    ])

    mod.load_inat_obs()

    con = duckdb.connect(db_path, read_only=True)
    try:
        rows = dict(con.execute(
            "SELECT obs_id, license FROM inat_obs_data.observations"
        ).fetchall())
    finally:
        con.close()

    assert rows[400001] == "CC-BY-NC"
    assert rows[400002] is None
