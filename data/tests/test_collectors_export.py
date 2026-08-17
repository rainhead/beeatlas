"""Tests for collectors_export.py — per-collector stats JSON (PAGE-01/02/03).

Covers:
    test_collectors_json_is_array: collectors.json is a JSON list
    test_gate_excludes_inat_obs_only: D-01 gate removes inat_obs-only logins
    test_sample_host_only_has_nonzero_sample_count: waba_sample rows with
        NULL sample_id get their sample counted via observation_id (Research #3)
    test_status_split_invariant: for every record,
        status_identified + status_awaiting == status_denominator
    test_required_keys: every record carries all 10 required keys
"""

import importlib
import json
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write a small occurrences.parquet fixture with four collector logins.

    Collectors in fixture:
        'alice' — ecdysis-backed (ecdysis_id IS NOT NULL); two catalogued rows:
                  one with a species-rank taxon (taxon_id=10 → in species.parquet),
                  one without a species match (taxon_id=99 → NOT in species.parquet).
                  PLUS one uncatalogued atlas row (ecdysis_id=NULL, record_type='specimen',
                  tier='atlas', year=2025) — the FIX A regression row. This row passes
                  _ACCOM_QUERY (tier='atlas') but NOT the old _QUERY D-01 gate.
                  specimen_count=2, status_denominator=2, status_identified=1, status_awaiting=1.
                  With tier='atlas': seasons_count=3 {2020, 2022, 2025}, county_count=2,
                  and — via the bridge, see _write_test_bridge_parquet —
                  ecoregion_l4_count=2.
        'bob'   — sample-host-only (record_type='provisional_sample', ecdysis_id=None,
                  sample_id=None, observation_id=888, tier='atlas').
                  Passes D-01 gate via record_type='provisional_sample'.
                  sample_count must be NON-ZERO (via the observation_id formula).
        'carol' — inat_expert only (record_type='inat_expert', ecdysis_id=None, tier='other').
                  Must NOT survive the D-01 gate.
        'dave'  — MIXED recordedBy: one specimen row with a real name ('Dave D', tier='atlas')
                  and one provisional_sample row with recordedBy=None (tier='atlas').
                  display_name MUST resolve to 'Dave D', not '@dave' (CR-01 regression:
                  a per-row COALESCE would let the NULL row's '@dave' win the MIN).
    """
    schema = pa.schema([
        ("collector_inat_login", pa.string()),
        ("recordedBy", pa.string()),
        ("host_inat_login", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("record_type", pa.string()),
        ("sample_id", pa.int64()),
        ("observation_id", pa.int64()),
        # Third and fourth branches of the occ_id CASE in _ECOREGION_L4_QUERY.
        # Present so the fixture can exercise the priority order, not just the
        # first branch — the bridge join is keyed on the result.
        ("specimen_observation_id", pa.int64()),
        ("checklist_id", pa.int64()),
        ("taxon_id", pa.int64()),
        ("year", pa.int32()),
        ("county", pa.string()),
        ("ecoregion_l3", pa.string()),
        ("tier", pa.string()),
    ])
    table = pa.table(
        {
            "collector_inat_login": ["alice",   "alice",   "bob",               "carol",      "dave",    "dave",               "alice",   "alice"],
            "recordedBy":           ["Alice A",  "Alice A", None,                "Carol C",    "Dave D",  None,                 "Alice A", "Alice A"],
            "host_inat_login":      ["alice",    "alice",   "bob",               "carol",      "dave",    "dave",               "alice",   "alice"],
            "ecdysis_id":           [42,         77,        None,                None,         55,        None,                 None,      None],
            "record_type":          ["specimen", "specimen", "provisional_sample", "inat_expert", "specimen", "provisional_sample", "specimen", "inat_expert"],
            "sample_id":            [10,         20,        None,                None,         30,        None,                 None,      None],
            "observation_id":       [None,       None,      888,                 999,          None,      777,                  None,      1234],
            "specimen_observation_id": [None,    None,      None,                None,         None,      None,                 5150,      None],
            "checklist_id":         [None,       None,      None,                None,         None,      None,                 None,      None],
            "taxon_id":             [10,         99,        None,                None,         10,        None,                 None,      None],
            # alice: ecdysis-backed years 2020/2022 + uncatalogued tier='atlas' year 2025.
            # With tier='atlas' predicate: 3 distinct seasons {2020, 2022, 2025}.
            # Gaps in 2021/2023/2024 stress-test COUNT(DISTINCT) vs max-min+1 (would be 6).
            # The 8th row is alice's tier='other' casual observation: it passes NO
            # query here (the D-01 gate drops inat_expert, tier drops it from the
            # accomplishment and ecoregion queries) and exists to prove the Level IV
            # coverage query honours tier — it IS bridged to a third ecoregion below.
            "year":                 [2020,       2022,      2023,                2021,         2024,      2024,                 2025,      2026],
            "county":               ["King",    "Yakima",  "King",              "Clark",      "King",    "Yakima",             "King",    "Clark"],
            "ecoregion_l3":         ["Puget Lowland Forests", "Columbia Plateau",
                                     "Puget Lowland Forests", "Cascades",
                                     "Puget Lowland Forests", "Columbia Plateau",
                                     "Puget Lowland Forests", "Cascades"],
            # tier: 'atlas' for WABA collecting rows; 'other' for casual inat_expert rows.
            "tier":                 ["atlas",    "atlas",   "atlas",             "other",      "atlas",   "atlas",              "atlas",   "other"],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_species_parquet(tmp_path: Path) -> Path:
    """Write a small species.parquet with one species-rank taxon (taxon_id=10).

    taxon_id=10 → specific_epithet='testicus', genus='Testgenus',
                  scientificName='Testgenus testicus' (cased — used for display),
                  canonical_name='testgenus testicus' (lowercase — NOT used for display),
                  slug='Testgenus/testicus'.
    taxon_id=99 is absent → LEFT JOIN yields NULL specific_epithet (awaiting).
    """
    schema = pa.schema([
        ("taxon_id", pa.int64()),
        ("specific_epithet", pa.string()),
        ("genus", pa.string()),
        ("canonical_name", pa.string()),
        ("scientificName", pa.string()),
        ("slug", pa.string()),
    ])
    table = pa.table(
        {
            "taxon_id":         [10],
            "specific_epithet": ["testicus"],
            "genus":            ["Testgenus"],
            "canonical_name":   ["testgenus testicus"],  # lowercase in production (not used by export)
            "scientificName":   ["Testgenus testicus"],  # cased — used by _SPECIES_QUERY (FIX B)
            "slug":             ["Testgenus/testicus"],
        },
        schema=schema,
    )
    out_path = tmp_path / "species.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_bridge_parquet(tmp_path: Path) -> Path:
    """Write occurrence_places.parquet — the many-to-many place membership bridge.

    Keyed by the synthetic occ_id (ADR 0035 / src/occurrence.ts priority), so the
    rows here must match what _ECOREGION_L4_QUERY's CASE derives from the
    occurrences fixture:

        ecdysis:42   alice, tier=atlas  → 9a-… (Level IV) AND a SITE
        ecdysis:77   alice, tier=atlas  → 1d-volcanics (Level IV)
        inat_obs:5150 alice, tier=atlas → 9a-… again (a repeat, so DISTINCT matters)
        inat:1234    alice, tier=OTHER  → 2d-… , which must NOT be counted
        inat:888     bob,   tier=atlas  → nothing; bob exercises the empty default

    So alice covers exactly two Level IV ecoregions: the site row proves the
    kind filter, the repeat proves the DISTINCT, the tier='other' row proves the
    predicate.
    """
    schema = pa.schema([("occ_id", pa.string()), ("place_slug", pa.string())])
    table = pa.table(
        {
            "occ_id": [
                "ecdysis:42", "ecdysis:42", "ecdysis:77", "inat_obs:5150", "inat:1234",
            ],
            "place_slug": [
                "9a-yakima-plateau-and-slopes",   # Level IV
                "asotin-creek",                   # a SITE — same bridge, wrong kind
                "1d-volcanics",                   # Level IV
                "9a-yakima-plateau-and-slopes",   # repeat of alice's first
                "2d-olympic-rainshadow",          # Level IV but a tier='other' row
            ],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrence_places.parquet"
    pq.write_table(table, out_path)
    return out_path


def _create_test_places_table(db_path: Path) -> None:
    """Create geographies.places in the test DuckDB.

    _ECOREGION_L4_QUERY joins it to tell an ecoregion place from a site — `kind`
    is the axis, not the absence of land_owner (ADR 0035) — and to read the coded
    display name the SVG's data-region attribute is keyed on.
    """
    con = duckdb.connect(str(db_path))
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
        con.execute(
            "CREATE OR REPLACE TABLE geographies.places "
            "(slug VARCHAR, name VARCHAR, kind VARCHAR)"
        )
        con.executemany(
            "INSERT INTO geographies.places VALUES (?, ?, ?)",
            [
                ("9a-yakima-plateau-and-slopes", "9a. Yakima Plateau and Slopes", "ecoregion_l4"),
                ("1d-volcanics", "1d. Volcanics", "ecoregion_l4"),
                ("2d-olympic-rainshadow", "2d. Olympic Rainshadow", "ecoregion_l4"),
                ("asotin-creek", "Asotin Creek", "site"),
            ],
        )
    finally:
        con.close()


def _setup_env(tmp_path: Path, monkeypatch) -> object:
    """Seed all test fixtures and return the collectors_export module with patched paths."""
    db_path = tmp_path / "test.duckdb"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))

    import collectors_export  # noqa: PLC0415 — must import after env is set
    importlib.reload(collectors_export)

    _write_test_occurrences_parquet(tmp_path)
    _write_test_species_parquet(tmp_path)
    _write_test_bridge_parquet(tmp_path)
    _create_test_places_table(db_path)

    return collectors_export


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_collectors_json_is_array(tmp_path, monkeypatch):
    """collectors.json is a JSON list."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    out = tmp_path / "collectors.json"
    assert out.exists(), "collectors.json was not produced"

    records = json.loads(out.read_text())
    assert isinstance(records, list), "collectors.json must be a JSON array"


def test_gate_excludes_inat_obs_only(tmp_path, monkeypatch):
    """D-01: inat_obs-only login 'carol' must NOT appear in collectors.json.

    Gate predicate: collector_inat_login IS NOT NULL AND
        (ecdysis_id IS NOT NULL OR record_type IN ('waba_specimen', 'provisional_sample'))
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    logins = {r["login"] for r in records}

    assert "carol" not in logins, (
        f"'carol' (inat_obs-only) must be excluded by D-01 gate; got logins={logins}"
    )
    assert "alice" in logins, "'alice' (ecdysis-backed) must pass the D-01 gate"
    assert "bob" in logins, "'bob' (waba_sample host) must pass the D-01 gate"


def test_sample_host_only_has_nonzero_sample_count(tmp_path, monkeypatch):
    """provisional_sample rows have NULL sample_id; their sample is the observation_id.

    Research finding #3: sample_count formula =
        COUNT(DISTINCT sample_id) + COUNT(DISTINCT CASE WHEN record_type='provisional_sample' THEN observation_id END)
    For 'bob' (record_type='provisional_sample', sample_id=None, observation_id=888):
        COUNT(DISTINCT sample_id)=0 + COUNT(DISTINCT observation_id where record_type='provisional_sample')=1 → 1.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}

    bob = by_login.get("bob")
    assert bob is not None, "'bob' must be in collectors.json"
    assert bob["sample_count"] > 0, (
        f"'bob' is a waba_sample host; sample_count must be non-zero "
        f"(waba_sample rows have sample_id=NULL; count via observation_id). "
        f"Got sample_count={bob['sample_count']}"
    )


def test_status_split_invariant(tmp_path, monkeypatch):
    """D-05/D-06/D-07: status_identified + status_awaiting == status_denominator for every record.

    For 'alice' (2 ecdysis rows):
        taxon_id=10 → specific_epithet IS NOT NULL → identified=1
        taxon_id=99 → not in species.parquet → specific_epithet IS NULL → awaiting=1
        denominator=2, identified=1, awaiting=1 → 1+1==2 ✓
    For 'bob' (0 ecdysis rows, 0 waba_specimen rows):
        denominator=0, identified=0, awaiting=0 → 0+0==0 ✓
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    assert len(records) > 0, "collectors.json must have records"

    for r in records:
        assert r["status_identified"] + r["status_awaiting"] == r["status_denominator"], (
            f"Split invariant violated for login={r['login']}: "
            f"identified={r['status_identified']} + awaiting={r['status_awaiting']} "
            f"!= denominator={r['status_denominator']}"
        )


def test_mixed_null_recordedby_keeps_real_name(tmp_path, monkeypatch):
    """CR-01 regression: a collector with both a named row and a NULL-recordedBy row
    must display the real name, not the '@login' fallback.

    'dave' has a specimen row (recordedBy='Dave D') and a provisional_sample row
    (recordedBy=None). A per-row COALESCE(recordedBy, '@'||login) followed by MIN
    would pick '@dave' (the '@' sorts before letters), masking the real name.
    The correct COALESCE(MIN(recordedBy), '@'||MIN(login)) yields 'Dave D'.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}

    dave = by_login.get("dave")
    assert dave is not None, "'dave' must be in collectors.json"
    assert dave["display_name"] == "Dave D", (
        f"Mixed-null recordedBy must resolve to the real name, not '@login'. "
        f"Got display_name={dave['display_name']!r}"
    )


def test_display_name_uses_most_recent_recordedby(tmp_path, monkeypatch):
    """display_name takes the MOST RECENT recordedBy (arg_max by year), not MIN.

    Discriminating fixture: 'erin' is 'Amy Adams' in 2021 and 'Zelda Q' in 2024 (a name
    change), both on catalogued specimen rows. MIN(recordedBy) would pick the stale
    'Amy Adams'; most-recent picks 'Zelda Q'. (Operator decision 2026-06-28: names can
    change over time — show the latest.)
    """
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))
    import collectors_export  # noqa: PLC0415
    importlib.reload(collectors_export)

    occ = pa.table({
        "collector_inat_login": ["erin", "erin"],
        "recordedBy":           ["Amy Adams", "Zelda Q"],   # older name MIN-wins, newer differs
        "host_inat_login":      ["erin", "erin"],
        "ecdysis_id":           [101, 202],                 # both catalogued → in _QUERY predicate
        "record_type":          ["specimen", "specimen"],
        "sample_id":            [1, 2],
        "observation_id":       [None, None],
        "specimen_observation_id": [None, None],
        "checklist_id":         [None, None],
        "taxon_id":             [10, 10],
        "year":                 [2021, 2024],               # 'Zelda Q' is most recent
        "county":               ["King", "King"],
        "ecoregion_l3":         ["Puget Lowland Forests", "Puget Lowland Forests"],
        "tier":                 ["atlas", "atlas"],
    }, schema=pa.schema([
        ("collector_inat_login", pa.string()), ("recordedBy", pa.string()),
        ("host_inat_login", pa.string()), ("ecdysis_id", pa.int64()),
        ("record_type", pa.string()), ("sample_id", pa.int64()),
        ("observation_id", pa.int64()), ("specimen_observation_id", pa.int64()),
        ("checklist_id", pa.int64()), ("taxon_id", pa.int64()),
        ("year", pa.int32()), ("county", pa.string()),
        ("ecoregion_l3", pa.string()), ("tier", pa.string()),
    ]))
    pq.write_table(occ, tmp_path / "occurrences.parquet")
    _write_test_species_parquet(tmp_path)
    # erin is bridged to nothing; the export still requires the artifacts to exist.
    _write_test_bridge_parquet(tmp_path)
    _create_test_places_table(tmp_path / "test.duckdb")

    collectors_export.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    erin = {r["login"]: r for r in records}.get("erin")
    assert erin is not None, "'erin' must be in collectors.json"
    assert erin["display_name"] == "Zelda Q", (
        f"display_name must be the most-recent recordedBy ('Zelda Q', 2024), not MIN "
        f"('Amy Adams'). Got {erin['display_name']!r}"
    )


def test_required_keys(tmp_path, monkeypatch):
    """Every record carries all 10 required keys with correct types."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    assert len(records) > 0, "collectors.json must have records"

    required_str_keys = {"login", "display_name"}
    required_int_keys = {
        "specimen_count", "sample_count", "species_count",
        "status_denominator", "status_identified", "status_awaiting",
    }
    # recordedBy and host_inat_login may be None for some collectors
    required_present_keys = required_str_keys | required_int_keys | {"recordedBy", "host_inat_login"}

    for r in records:
        missing = required_present_keys - set(r.keys())
        assert not missing, f"Missing keys in login={r['login']}: {missing}"

        for k in required_str_keys:
            assert isinstance(r[k], str), f"login={r['login']}: {k} must be str, got {type(r[k])}"

        for k in required_int_keys:
            assert isinstance(r[k], int), f"login={r['login']}: {k} must be int, got {type(r[k])}"


# ---------------------------------------------------------------------------
# Phase 172 — ACCOM-01/02/03/04 aggregation-field tests (RED until Plan 02)
#
# These tests fail with KeyError/AssertionError because collectors_export.py
# does not yet emit the new fields. They turn GREEN in Plan 02 when the
# export is extended. The existing tests above remain GREEN throughout.
# ---------------------------------------------------------------------------

def test_badge_fields_present_and_typed(tmp_path, monkeypatch):
    """active_since (int) and seasons_count (int) present for every record (ACCOM-04)."""
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    for r in records:
        assert isinstance(r["active_since"], int), (
            f"active_since must be int for login={r['login']}, got {type(r.get('active_since'))}"
        )
        assert isinstance(r["seasons_count"], int), (
            f"seasons_count must be int for login={r['login']}, got {type(r.get('seasons_count'))}"
        )


def test_seasons_count_is_distinct_years(tmp_path, monkeypatch):
    """seasons_count = COUNT(DISTINCT year) over tier='atlas' rows.

    alice has tier='atlas' years {2020, 2022, 2025}: two ecdysis-backed rows (2020, 2022)
    plus the uncatalogued regression row (2025, ecdysis_id=NULL, tier='atlas').
    COUNT(DISTINCT year) = 3. A max-min+1 span (2025-2020+1=6) would be wrong.
    The gaps in 2021/2023/2024 confirm COUNT(DISTINCT) rather than span arithmetic.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    assert alice["seasons_count"] == 3, (
        f"alice has 3 distinct tier='atlas' years {{2020, 2022, 2025}} — seasons_count "
        f"must be 3 (max-min+1 span would be 6). "
        f"Got seasons_count={alice['seasons_count']}."
    )


def test_active_since_is_min_year(tmp_path, monkeypatch):
    """active_since = MIN(year) over D-01 WABA-contribution rows.

    alice's earliest WABA year is 2020.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    assert alice["active_since"] == 2020, (
        f"alice's earliest year is 2020; active_since must be 2020. "
        f"Got active_since={alice['active_since']}."
    )


def test_county_counts(tmp_path, monkeypatch):
    """county_count and county_names are over tier='atlas' rows (ACCOM-01).

    alice has tier='atlas' county rows: King (2020), Yakima (2022), King (2025) → 2 distinct.
    county_names must be a sorted JSON array of the distinct values.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    assert isinstance(alice["county_count"], int), (
        f"county_count must be int for alice, got {type(alice.get('county_count'))}"
    )
    assert alice["county_count"] == 2, (
        f"alice's tier='atlas' rows cover King and Yakima counties; county_count must be 2. "
        f"Got county_count={alice['county_count']} (ACCOM-01)."
    )
    assert isinstance(alice["county_names"], list), (
        f"county_names must be a list for alice, got {type(alice.get('county_names'))}"
    )
    assert alice["county_names"] == ["King", "Yakima"], (
        f"county_names must be sorted ['King', 'Yakima']. Got {alice['county_names']}"
    )
    assert alice["county_count"] == len(alice["county_names"]), (
        "county_count must equal len(county_names)"
    )


def test_ecoregion_l4_coverage_comes_from_the_bridge(tmp_path, monkeypatch):
    """ecoregion_l4_names/count come from occurrence_places, filtered to kind and tier.

    A Level IV ecoregion is a PLACE (ADR 0035), so coverage is a bridge join, not
    a COUNT(DISTINCT) over a column — which is what these fields used to be, when
    they meant Level III. The fixture bridges alice to four rows and exactly two
    must survive; each of the other two is a distinct way to get this wrong:

        asotin-creek            a SITE — same bridge, filtered out by kind
        9a-… twice              one via ecdysis:42, one via inat_obs:5150 — DISTINCT
        2d-olympic-rainshadow   reached only by a tier='other' row

    The names are the coded display form, because that is what the base map's
    data-region attribute is keyed on; return the bare Level IV name and every
    collector page silently highlights nothing.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]

    assert alice["ecoregion_l4_names"] == ["1d. Volcanics", "9a. Yakima Plateau and Slopes"], (
        "ecoregion_l4_names must be the sorted coded names of the tier='atlas' Level IV "
        f"places alice is bridged to. Got {alice['ecoregion_l4_names']}. "
        "A site slug here means the kind filter is gone; 2d. Olympic Rainshadow means "
        "the tier predicate is."
    )
    assert isinstance(alice["ecoregion_l4_count"], int), (
        f"ecoregion_l4_count must be int, got {type(alice.get('ecoregion_l4_count'))}"
    )
    assert alice["ecoregion_l4_count"] == len(alice["ecoregion_l4_names"]), (
        "ecoregion_l4_count must equal len(ecoregion_l4_names) — a repeat slug reached "
        "by two different occ_ids must not double-count"
    )


def test_ecoregion_l4_absent_bridge_rows_yield_empty_not_missing(tmp_path, monkeypatch):
    """A collector with no Level IV bridge row gets [] / 0, not a missing key.

    bob is in collectors.json (the D-01 gate passes him via provisional_sample) but
    has no bridge row. The template guards on ecoregion_l4_count, so a missing key
    would read as undefined and silently drop his coverage map — the same outcome as
    zero, which is why this needs asserting rather than eyeballing.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    bob = by_login["bob"]
    assert bob["ecoregion_l4_names"] == [], f"Got {bob['ecoregion_l4_names']}"
    assert bob["ecoregion_l4_count"] == 0, f"Got {bob['ecoregion_l4_count']}"


def test_ecoregion_l3_fields_are_gone(tmp_path, monkeypatch):
    """The old Level III fields must not survive under their old names.

    They were renamed rather than repointed on purpose: "ecoregion_count" meaning
    9-region coverage and meaning 57-region coverage are different claims, and a
    silent change of meaning under a stable name is the failure this guards.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    for r in records:
        assert "ecoregion_count" not in r, f"{r['login']} still carries ecoregion_count"
        assert "ecoregion_names" not in r, f"{r['login']} still carries ecoregion_names"


def test_species_by_genus_structure(tmp_path, monkeypatch):
    """species_by_genus is a list of {genus, species:[{name (cased), slug, count}]} (ACCOM-02).

    FIX B: `name` uses cased sp.scientificName, not lowercase sp.canonical_name.
    UAT round 2: per-species `count` (atlas records of that species) restored,
    rendered "N specimens" in the template.

    The fixture has taxon_id=10 → scientificName='Testgenus testicus' (cased).
    alice has taxon_id=10 (species-rank); the species list must include one genus
    group with one species entry carrying `name`='Testgenus testicus'.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    for r in records:
        assert isinstance(r["species_by_genus"], list), (
            f"species_by_genus must be a list for login={r['login']}"
        )
        for g in r["species_by_genus"]:
            assert "genus" in g, f"genus key missing in species_by_genus entry for {r['login']}"
            assert isinstance(g["species"], list), (
                f"species must be a list in genus group for {r['login']}"
            )
            for sp in g["species"]:
                # FIX B: `name` (cased scientificName) replaces `canonical_name`.
                assert "name" in sp, (
                    f"'name' key missing in species entry for {r['login']} — "
                    f"export must use cased sp.scientificName"
                )
                assert sp["name"][0].isupper(), (
                    f"species name must be cased (FIX B); got {sp['name']!r} for {r['login']}"
                )
                assert "slug" in sp, f"slug missing in species entry for {r['login']}"
                # UAT round 2: per-species count restored (atlas records of the species).
                assert isinstance(sp.get("count"), int) and sp["count"] >= 1, (
                    f"per-species 'count' must be a positive int (UAT round 2). "
                    f"Got {sp.get('count')!r} for {r['login']}"
                )
                assert "canonical_name" not in sp, (
                    f"'canonical_name' must be replaced by 'name' (FIX B). "
                    f"Got keys: {list(sp.keys())} for {r['login']}"
                )


def test_uncatalogued_atlas_specimen_counted_in_seasons(tmp_path, monkeypatch):
    """FIX A regression: tier='atlas' specimens with ecdysis_id=NULL must be counted.

    The fixture includes alice's 2025 row: record_type='specimen', tier='atlas',
    ecdysis_id=NULL.  Under the old ecdysis_id-based _QUERY predicate, this row was
    dropped, giving seasons_count=2 (years 2020, 2022 only).  After FIX A, the
    _ACCOM_QUERY uses tier='atlas', which includes the uncatalogued 2025 row:
    seasons_count=3 {2020, 2022, 2025}.

    This is the exact UAT bug: operator collected in 2024/2025/2026 but the badge
    showed only catalogued years.
    """
    ce_mod = _setup_env(tmp_path, monkeypatch)
    ce_mod.export_collectors_step()
    records = json.loads((tmp_path / "collectors.json").read_text())
    by_login = {r["login"]: r for r in records}
    alice = by_login["alice"]
    assert alice["seasons_count"] == 3, (
        f"alice's tier='atlas' rows span years {{2020, 2022, 2025}} — the 2025 row has "
        f"ecdysis_id=NULL but tier='atlas'. seasons_count must be 3 "
        f"(was 2 under the old ecdysis_id-based predicate). "
        f"Got seasons_count={alice['seasons_count']} (FIX A)."
    )
    assert alice["active_since"] == 2020, (
        f"active_since must still be the earliest year (2020), not 2025. "
        f"Got active_since={alice['active_since']} (FIX A)."
    )
