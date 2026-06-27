"""Tests for collectors_events_export.py — per-collector event feed (STREAM-01/02/03).

Covers:
    test_collectors_json_extended_keys: collectors.json gains first_page_events,
        total_event_pages, total_event_count while preserving existing keys (display_name
        etc. unchanged — the export must NOT re-aggregate names).
    test_ecdysis_specimen_events: ecdysis specimen yields exactly 1 Collected + 2 Identified
        events (current + superseded); blank scientific_name row is excluded.
    test_identified_events_sort_above_collected: Identified events (sort_ts=modified) appear
        before the Collected event (sort_ts=date@midnight) in reverse-chron order (D-SORT).
    test_waba_specimen_is_pending: waba_specimen yields Collected/is_pending=True, NO
        Identified event (STREAM-02, D-EVENT-02).
    test_chunk_bound: no page (first_page_events or any sub-page events list) exceeds
        EVENT_CHUNK_SIZE (STREAM-03).
    test_slug_resolution: species-tier → slug='Genus/epithet'; genus-tier superseded
        determination → slug='Genus'; unmatched canonical_name → slug=None (D-CARD-02).
    test_collector_event_pages_json_shape: collector_event_pages.json is a JSON array
        whose entries each carry login, page_num>=2, total_pages, events (STREAM-03).
"""

import importlib
import json
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Use a small chunk size so pagination fires deterministically with our fixture.
EVENT_CHUNK_SIZE = "2"

# alice's ecdysis specimen ecdysis_id; coreid in identifications = str(this)
_ECDYSIS_ID = 42
_COREID = str(_ECDYSIS_ID)

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _write_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write occurrences.parquet with one ecdysis specimen + one waba_specimen for 'alice'.

    Rows:
        alice / ecdysis_id=42   / record_type='ecdysis'       / date='2023-05-15'
                                  canonical_name='lasioglossum albohirtum'
                                  catalog_number='WSDA_TEST_42'
        alice / ecdysis_id=None / record_type='waba_specimen' / date='2022-03-10'
                                  canonical_name='bee sp.' (unmatched → species_slug=None)
                                  catalog_number=None (not-yet-catalogued)
        bob   / ecdysis_id=None / record_type='waba_specimen' / date='2021-06-20'
                                  canonical_name='halictus sp.' (unmatched)
                                  catalog_number=None

    With EVENT_CHUNK_SIZE=2, alice's 4 events split across 2 pages (pagination fires).
    """
    schema = pa.schema([
        ("collector_inat_login", pa.string()),
        ("recordedBy", pa.string()),
        ("host_inat_login", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("record_type", pa.string()),
        ("date", pa.string()),
        ("canonical_name", pa.string()),
        ("catalog_number", pa.string()),
    ])
    table = pa.table(
        {
            "collector_inat_login": ["alice",               "alice",        "bob"],
            "recordedBy":           ["Alice A",             "Alice A",      "Bob B"],
            "host_inat_login":      ["alice",               "alice",        "bob"],
            "ecdysis_id":           [_ECDYSIS_ID,           None,           None],
            "record_type":          ["ecdysis",             "waba_specimen", "waba_specimen"],
            "date":                 ["2023-05-15",          "2022-03-10",   "2021-06-20"],
            "canonical_name":       ["lasioglossum albohirtum", "bee sp.", "halictus sp."],
            "catalog_number":       ["WSDA_TEST_42",        None,           None],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def _write_test_species_json(tmp_path: Path) -> Path:
    """Write species.json with Lasioglossum albohirtum (species) + Lasioglossum/Hylaeus (genera).

    Provides:
    - species match for 'lasioglossum albohirtum' → slug='Lasioglossum/albohirtum'
    - genus page for 'lasioglossum' → slug='Lasioglossum'
    - genus page for 'hylaeus' → slug='Hylaeus' (for first-token genus fallback tests)
    """
    data = [
        {
            "canonical_name": "lasioglossum albohirtum",
            "scientificName": "Lasioglossum albohirtum",
            "slug": "Lasioglossum/albohirtum",
            "specific_epithet": "albohirtum",
            "genus": "Lasioglossum",
        },
        {
            "canonical_name": "lasioglossum",
            "scientificName": "Lasioglossum",
            "slug": "Lasioglossum",
            "specific_epithet": None,
            "genus": None,
        },
        {
            "canonical_name": "hylaeus",
            "scientificName": "Hylaeus",
            "slug": "Hylaeus",
            "specific_epithet": None,
            "genus": None,
        },
    ]
    out_path = tmp_path / "species.json"
    out_path.write_text(json.dumps(data), encoding="utf-8")
    return out_path


def _write_test_higher_taxa_json(tmp_path: Path) -> Path:
    """Write higher_taxa.json with Lasioglossum and Hylaeus genera.

    Provides the known-bee-genus set used by _load_species_maps (higher_taxa.json path).
    """
    data = [
        {"name": "Lasioglossum", "rank": "genus"},
        {"name": "Hylaeus", "rank": "genus"},
        {"name": "Dialictus", "rank": "subgenus"},
    ]
    out_path = tmp_path / "higher_taxa.json"
    out_path.write_text(json.dumps(data), encoding="utf-8")
    return out_path


def _write_seed_collectors_json(tmp_path: Path) -> Path:
    """Write seed collectors.json carrying the 10 existing keys for alice and bob.

    The events export must extend these records in place without touching existing keys.
    """
    records = [
        {
            "login": "alice",
            "display_name": "Alice A",
            "recordedBy": "Alice A",
            "host_inat_login": "alice",
            "specimen_count": 1,
            "sample_count": 0,
            "species_count": 1,
            "status_denominator": 2,
            "status_identified": 1,
            "status_awaiting": 1,
        },
        {
            "login": "bob",
            "display_name": "Bob B",
            "recordedBy": "Bob B",
            "host_inat_login": "bob",
            "specimen_count": 0,
            "sample_count": 0,
            "species_count": 0,
            "status_denominator": 1,
            "status_identified": 0,
            "status_awaiting": 1,
        },
    ]
    out_path = tmp_path / "collectors.json"
    out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    return out_path


def _setup_ecdysis_duckdb(tmp_path: Path) -> Path:
    """Create a DuckDB with ecdysis_data.identifications seeded for alice's specimen.

    Seeds coreid='42' (= str(_ECDYSIS_ID)) with THREE rows:
    - Row 1 (superseded, EARLIER modified): scientific_name='Lasioglossum', genus-tier
      → expects species_slug='Lasioglossum' (genus slug)
    - Row 2 (current, LATER modified): scientific_name='Lasioglossum albohirtum'
      → expects species_slug='Lasioglossum/albohirtum' (species slug)
    - Row 3 (blank scientific_name, filtered out): scientific_name=''
      → must NOT appear in output (excluded by WHERE scientific_name != '')
    """
    db_path = tmp_path / "test.duckdb"
    con = duckdb.connect(str(db_path))
    con.execute("CREATE SCHEMA IF NOT EXISTS ecdysis_data")
    con.execute("""
        CREATE TABLE ecdysis_data.identifications (
            coreid                  VARCHAR,
            modified                TIMESTAMPTZ,
            identified_by           VARCHAR,
            scientific_name         VARCHAR,
            date_identified         VARCHAR,
            identification_is_current VARCHAR,
            genus                   VARCHAR
        )
    """)
    # Superseded row first (earlier modified); current row second (later modified)
    con.execute(
        """
        INSERT INTO ecdysis_data.identifications VALUES
            (?, TIMESTAMPTZ '2024-01-15 10:00:00+00',
             'Dr. Smith', 'Lasioglossum', '2024', '0', 'Lasioglossum'),
            (?, TIMESTAMPTZ '2024-06-01 10:00:00+00',
             'Dr. Smith', 'Lasioglossum albohirtum', '2024', '1', 'Lasioglossum'),
            (?, TIMESTAMPTZ '2023-12-01 10:00:00+00',
             '', '', '2023', '0', '')
        """,
        [_COREID, _COREID, _COREID],
    )
    con.close()
    return db_path


def _setup_env(tmp_path: Path, monkeypatch) -> object:
    """Seed all test fixtures, patch env vars, and reload the module under test.

    Pattern mirrors test_collectors_export._setup_env:
      monkeypatch env → deferred import → importlib.reload → write fixtures.

    RED phase: import of 'collectors_events_export' raises ModuleNotFoundError
    because the module does not exist yet. Tests fail with ImportError, not syntax
    error — satisfying the Wave 0 RED criterion.
    """
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.duckdb"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))
    monkeypatch.setenv("EVENT_CHUNK_SIZE", EVENT_CHUNK_SIZE)  # noqa: SIM117

    import collectors_events_export  # noqa: PLC0415 — must import after env vars are set
    importlib.reload(collectors_events_export)

    _write_test_occurrences_parquet(tmp_path)
    _write_test_species_json(tmp_path)
    _write_test_higher_taxa_json(tmp_path)
    _write_seed_collectors_json(tmp_path)
    _setup_ecdysis_duckdb(tmp_path)

    return collectors_events_export


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _gather_all_events(records: list, sub_pages: list, login: str) -> list:
    """Collect all events for a collector across first_page_events + sub-pages."""
    rec = next((r for r in records if r["login"] == login), None)
    if rec is None:
        return []
    all_events = list(rec.get("first_page_events", []))
    for page in sub_pages:
        if page["login"] == login:
            all_events.extend(page["events"])
    return all_events


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_collectors_json_extended_keys(tmp_path, monkeypatch):
    """collectors.json gains first_page_events, total_event_pages, total_event_count
    while PRESERVING every existing key unchanged (STREAM-01)."""
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    out = tmp_path / "collectors.json"
    assert out.exists(), "collectors.json not written"
    records = json.loads(out.read_text())
    assert isinstance(records, list)

    by_login = {r["login"]: r for r in records}
    alice = by_login.get("alice")
    assert alice is not None, "'alice' must remain in collectors.json"

    # New fields must be present
    assert "first_page_events" in alice, "first_page_events missing from alice's record"
    assert isinstance(alice["first_page_events"], list), "first_page_events must be a list"
    assert "total_event_pages" in alice, "total_event_pages missing"
    assert isinstance(alice["total_event_pages"], int), "total_event_pages must be int"
    assert "total_event_count" in alice, "total_event_count missing"
    assert isinstance(alice["total_event_count"], int), "total_event_count must be int"

    # Existing keys must be PRESERVED exactly (export must NOT re-aggregate names)
    assert alice.get("display_name") == "Alice A", (
        f"display_name must not be mutated by events export; got {alice.get('display_name')!r}"
    )
    assert alice.get("specimen_count") == 1, "specimen_count must be preserved"
    assert alice.get("status_denominator") == 2, "status_denominator must be preserved"


def test_ecdysis_specimen_events(tmp_path, monkeypatch):
    """ecdysis specimen yields exactly 1 Collected + 2 Identified events (D-FEED-02);
    the blank scientific_name row is excluded (Pitfall 2)."""
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    all_events = _gather_all_events(records, sub_pages, "alice")

    collected = [e for e in all_events if e["event_type"] == "Collected"]
    identified = [e for e in all_events if e["event_type"] == "Identified"]

    # alice has 1 ecdysis Collected + 1 waba_specimen Collected = 2 total Collected
    assert len(collected) == 2, (
        f"Expected 2 Collected events (ecdysis + waba_specimen); got {len(collected)}"
    )
    # alice has 2 Identified (current + superseded); blank row excluded → NOT 3
    assert len(identified) == 2, (
        f"Expected 2 Identified events (blank row must be excluded); got {len(identified)}"
    )
    # Confirm all events are accounted for
    assert alice_total_count(records) == 4, (
        "alice total_event_count must be 4 (1 Collected ecdysis + 1 waba_specimen + 2 Identified)"
    )


def alice_total_count(records: list) -> int:
    """Helper: return alice's total_event_count from the records list."""
    alice = next((r for r in records if r["login"] == "alice"), None)
    return alice["total_event_count"] if alice else -1


def test_identified_events_sort_above_collected(tmp_path, monkeypatch):
    """Identified events (modified 2024) appear before Collected events (date 2022-2023)
    in reverse-chronological order (D-SORT)."""
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    all_events = _gather_all_events(records, sub_pages, "alice")

    assert len(all_events) == 4, f"Expected 4 total events for alice; got {len(all_events)}"

    identified_indices = [i for i, e in enumerate(all_events) if e["event_type"] == "Identified"]
    collected_indices = [i for i, e in enumerate(all_events) if e["event_type"] == "Collected"]

    assert identified_indices, "No Identified events found"
    assert collected_indices, "No Collected events found"

    # All Identified events must appear at LOWER indices (= more recent) than Collected events.
    # alice's Identified events have modified in 2024; Collected events are in 2022-2023.
    max_identified_idx = max(identified_indices)
    min_collected_idx = min(collected_indices)
    assert max_identified_idx < min_collected_idx, (
        f"Identified events must sort above (earlier indices than) Collected events; "
        f"max_identified_idx={max_identified_idx}, min_collected_idx={min_collected_idx}"
    )

    # Also confirm the two Identified events are themselves in DESC order by modified
    # (current 2024-06-01 before superseded 2024-01-15)
    identified_events = [all_events[i] for i in identified_indices]
    assert identified_events[0]["event_date"] >= identified_events[1]["event_date"], (
        "Identified events must be sorted modified DESC within themselves"
    )


def test_waba_specimen_is_pending(tmp_path, monkeypatch):
    """waba_specimen row yields Collected/is_pending=True; NO Identified event (STREAM-02, D-EVENT-02)."""
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    all_events = _gather_all_events(records, sub_pages, "alice")

    pending = [e for e in all_events if e.get("is_pending")]
    assert len(pending) == 1, (
        f"Expected exactly 1 is_pending=True Collected event (waba_specimen); got {len(pending)}"
    )
    assert pending[0]["event_type"] == "Collected", (
        "Pending event must be of type Collected (not Identified)"
    )

    # Confirm no Identified events for the waba_specimen (ecdysis_id IS NULL)
    # The 2 Identified events both come from the ecdysis specimen (ecdysis_id=42)
    # The waba_specimen has no coreid in identifications → no Identified event
    identified = [e for e in all_events if e["event_type"] == "Identified"]
    assert all(not e.get("is_pending") for e in identified), (
        "Identified events must not be marked is_pending"
    )


def test_chunk_bound(tmp_path, monkeypatch):
    """No page (first_page_events or any sub-page events list) exceeds EVENT_CHUNK_SIZE (STREAM-03)."""
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    chunk_size = int(EVENT_CHUNK_SIZE)

    records = json.loads((tmp_path / "collectors.json").read_text())
    for rec in records:
        fp = rec.get("first_page_events", [])
        assert len(fp) <= chunk_size, (
            f"login={rec['login']}: first_page_events has {len(fp)} events > chunk size {chunk_size}"
        )

    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    for page in sub_pages:
        evs = page.get("events", [])
        assert len(evs) <= chunk_size, (
            f"login={page['login']} page {page['page_num']}: "
            f"{len(evs)} events > chunk size {chunk_size}"
        )


def test_slug_resolution(tmp_path, monkeypatch):
    """D-CARD-02 rank-aware slug resolution (ORCHESTRATOR CORRECTION):
    - species-tier Identified (current, scientific_name='Lasioglossum albohirtum')
      → species_slug='Lasioglossum/albohirtum'
    - genus-tier Identified (superseded, scientific_name='Lasioglossum')
      → species_slug='Lasioglossum' (genus slug from genus_map)
    - Collected for 'bee sp.' (unmatched) → species_slug=None
    """
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    all_events = _gather_all_events(records, sub_pages, "alice")

    # Map (event_type, is_current) → species_slug for assertions
    slug_map = {}
    for ev in all_events:
        key = (ev["event_type"], ev.get("is_current"))
        slug_map[key] = ev.get("species_slug")

    # Current Identified (species-rank): scientific_name='Lasioglossum albohirtum'
    species_slug = slug_map.get(("Identified", True))
    assert species_slug == "Lasioglossum/albohirtum", (
        f"Species-rank Identified must have slug='Lasioglossum/albohirtum'; got {species_slug!r}"
    )

    # Superseded Identified (genus-rank): scientific_name='Lasioglossum'
    genus_slug = slug_map.get(("Identified", False))
    assert genus_slug == "Lasioglossum", (
        f"Genus-rank Identified must have slug='Lasioglossum'; got {genus_slug!r}"
    )

    # Pending waba_specimen Collected (canonical_name='bee sp.' → unmatched)
    pending = [e for e in all_events if e.get("is_pending")]
    assert pending, "No pending (waba_specimen) event found"
    assert pending[0]["species_slug"] is None, (
        f"Unmatched canonical_name must yield species_slug=None; got {pending[0]['species_slug']!r}"
    )


def test_collector_event_pages_json_shape(tmp_path, monkeypatch):
    """collector_event_pages.json is a JSON array; entries have login/page_num>=2/total_pages/events
    (STREAM-03)."""
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    out = tmp_path / "collector_event_pages.json"
    assert out.exists(), "collector_event_pages.json not written"

    sub_pages = json.loads(out.read_text())
    assert isinstance(sub_pages, list), "collector_event_pages.json must be a JSON array"
    # alice has 4 events at chunk_size=2 → page 2 exists; bob has 1 event → no sub-page
    assert len(sub_pages) > 0, (
        "collector_event_pages.json must be non-empty (alice should have a page 2)"
    )

    for page in sub_pages:
        assert "login" in page and isinstance(page["login"], str), (
            f"page entry missing or wrong-type 'login': {page!r}"
        )
        assert "page_num" in page and page["page_num"] >= 2, (
            f"page_num must be >=2 (page 1 goes in collectors.json); got {page.get('page_num')!r}"
        )
        assert "total_pages" in page and isinstance(page["total_pages"], int), (
            f"total_pages missing or wrong type: {page!r}"
        )
        assert "events" in page and isinstance(page["events"], list), (
            f"events missing or wrong type: {page!r}"
        )
        assert len(page["events"]) > 0, (
            f"sub-page must have at least 1 event; got empty events for login={page['login']}"
        )


def test_catalog_number_and_ecdysis_id_fields(tmp_path, monkeypatch):
    """Every event emits catalog_number and ecdysis_id fields.

    - alice's ecdysis specimen (ecdysis_id=42, catalog_number='WSDA_TEST_42') → Collected and
      Identified events must carry both fields.
    - alice's waba_specimen (ecdysis_id=None, catalog_number=None) → Collected event has
      ecdysis_id=None and catalog_number=None (empty catalog cell, no link).
    - Covers D-CARD-03 reversal: catalog number + Ecdysis link now in scope (operator UAT).
    """
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    all_events = _gather_all_events(records, sub_pages, "alice")

    # Collected event for alice's ecdysis specimen must carry catalog_number + ecdysis_id
    ecdysis_collected = [
        e for e in all_events
        if e["event_type"] == "Collected" and e.get("ecdysis_id") == _ECDYSIS_ID
    ]
    assert len(ecdysis_collected) == 1, (
        f"Expected 1 Collected event with ecdysis_id={_ECDYSIS_ID}; got {len(ecdysis_collected)}"
    )
    ec = ecdysis_collected[0]
    assert ec["catalog_number"] == "WSDA_TEST_42", (
        f"Collected event for ecdysis specimen must carry catalog_number; got {ec.get('catalog_number')!r}"
    )
    assert ec["ecdysis_id"] == _ECDYSIS_ID, (
        f"Collected event must carry ecdysis_id={_ECDYSIS_ID}; got {ec.get('ecdysis_id')!r}"
    )

    # Identified events for alice's ecdysis specimen must also carry catalog_number + ecdysis_id
    identified = [e for e in all_events if e["event_type"] == "Identified"]
    assert len(identified) == 2, f"Expected 2 Identified events; got {len(identified)}"
    for ev in identified:
        assert ev["ecdysis_id"] == _ECDYSIS_ID, (
            f"Identified event must carry ecdysis_id; got {ev.get('ecdysis_id')!r}"
        )
        assert ev["catalog_number"] == "WSDA_TEST_42", (
            f"Identified event must carry catalog_number; got {ev.get('catalog_number')!r}"
        )

    # alice's waba_specimen Collected event must have ecdysis_id=None + catalog_number=None
    pending_events = [e for e in all_events if e.get("is_pending")]
    assert len(pending_events) == 1, f"Expected 1 pending event; got {len(pending_events)}"
    pe = pending_events[0]
    assert pe["ecdysis_id"] is None, (
        f"waba_specimen Collected event must have ecdysis_id=None; got {pe.get('ecdysis_id')!r}"
    )
    assert pe["catalog_number"] is None, (
        f"waba_specimen Collected event must have catalog_number=None; got {pe.get('catalog_number')!r}"
    )


def test_is_reidentification_chronological_label(tmp_path, monkeypatch):
    """is_reidentification is based on chronological order of modifications, not is_current.

    Fixture identifications for ecdysis_id=42:
    - Row 1 (EARLIER modified 2024-01-15): scientific_name='Lasioglossum', is_current='0'
      → is_reidentification=False (it is the FIRST determination; label = 'Identified')
    - Row 2 (LATER modified 2024-06-01): scientific_name='Lasioglossum albohirtum', is_current='1'
      → is_reidentification=True (it is a LATER determination; label = 'Re-identified')

    This is the operator-UAT-driven reversal of the previous is_current-based label logic.
    is_current is still emitted and drives visual emphasis (accent color) in the templates.
    """
    mod = _setup_env(tmp_path, monkeypatch)
    mod.export_collectors_events_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    all_events = _gather_all_events(records, sub_pages, "alice")

    identified = [e for e in all_events if e["event_type"] == "Identified"]
    assert len(identified) == 2, f"Expected 2 Identified events; got {len(identified)}"

    # All Identified events must have is_reidentification set (not None)
    for ev in identified:
        assert "is_reidentification" in ev, f"is_reidentification missing from event {ev!r}"
        assert isinstance(ev["is_reidentification"], bool), (
            f"is_reidentification must be bool for Identified events; got {ev.get('is_reidentification')!r}"
        )

    # The earliest determination (2024-01-15, Lasioglossum genus, is_current=False)
    # must be is_reidentification=False.
    # Events are returned sorted DESC (newest first), so this is the SECOND in the list.
    # Use event_date to identify: '2024-01-15' vs '2024-06-01'.
    by_date = {ev["event_date"]: ev for ev in identified}
    earliest = by_date.get("2024-01-15")
    later = by_date.get("2024-06-01")

    assert earliest is not None, "No Identified event with event_date='2024-01-15'"
    assert later is not None, "No Identified event with event_date='2024-06-01'"

    assert earliest["is_reidentification"] is False, (
        f"Earliest determination (2024-01-15) must have is_reidentification=False; "
        f"got {earliest['is_reidentification']!r}"
    )
    assert later["is_reidentification"] is True, (
        f"Later determination (2024-06-01) must have is_reidentification=True; "
        f"got {later['is_reidentification']!r}"
    )

    # is_current must still be correctly emitted (orthogonal to is_reidentification)
    assert earliest["is_current"] is False, (
        f"Earliest determination (2024-01-15, superseded) must have is_current=False; "
        f"got {earliest['is_current']!r}"
    )
    assert later["is_current"] is True, (
        f"Later determination (2024-06-01, current) must have is_current=True; "
        f"got {later['is_current']!r}"
    )

    # Collected events must have is_reidentification=None (field exists, but is None)
    collected = [e for e in all_events if e["event_type"] == "Collected"]
    for ev in collected:
        assert "is_reidentification" in ev, (
            f"is_reidentification must be present on Collected events too; missing from {ev!r}"
        )
        assert ev["is_reidentification"] is None, (
            f"Collected events must have is_reidentification=None; got {ev.get('is_reidentification')!r}"
        )


# ---------------------------------------------------------------------------
# New: Part 1 + Part 2 — iNat URL fallback for non-bee; improved bee resolution
# ---------------------------------------------------------------------------

# Separate DuckDB coreid for the iNat-URL test (distinct from _ECDYSIS_ID=42)
_INAT_COREID = "99"


def _setup_ecdysis_duckdb_with_nonbee(tmp_path: Path) -> Path:
    """Create a DuckDB seeded with identifications covering the four D-CARD-02 cases.

    coreid=99 (alice's specimen) — four identification rows:
    - 'Lasioglossum (Dialictus)': subgenus-parenthetical bee → slug='Lasioglossum'
    - 'Hylaeus polifolii': first-token genus fallback (genus col empty) → slug='Hylaeus'
    - 'Diptera': non-bee named determination → inat_url set, slug=None
    - 'undetermined': undetermined → neither slug nor inat_url
    """
    db_path = tmp_path / "test_inat.duckdb"
    con = duckdb.connect(str(db_path))
    con.execute("CREATE SCHEMA IF NOT EXISTS ecdysis_data")
    con.execute("""
        CREATE TABLE ecdysis_data.identifications (
            coreid                  VARCHAR,
            modified                TIMESTAMPTZ,
            identified_by           VARCHAR,
            scientific_name         VARCHAR,
            date_identified         VARCHAR,
            identification_is_current VARCHAR,
            genus                   VARCHAR
        )
    """)
    con.execute(
        """
        INSERT INTO ecdysis_data.identifications VALUES
            (?, TIMESTAMPTZ '2024-01-10 10:00:00+00', 'Dr A', 'Lasioglossum (Dialictus)', '2024', '0', ''),
            (?, TIMESTAMPTZ '2024-02-10 10:00:00+00', 'Dr B', 'Hylaeus polifolii',        '2024', '0', ''),
            (?, TIMESTAMPTZ '2024-03-10 10:00:00+00', 'Dr C', 'Diptera',                  '2024', '0', ''),
            (?, TIMESTAMPTZ '2024-04-10 10:00:00+00', 'Dr D', 'undetermined',             '2024', '1', '')
        """,
        [_INAT_COREID, _INAT_COREID, _INAT_COREID, _INAT_COREID],
    )
    con.close()
    return db_path


def _write_inat_test_occurrences_parquet(tmp_path: Path) -> Path:
    """Write minimal occurrences.parquet with alice's ecdysis specimen (coreid=99)."""
    schema = pa.schema([
        ("collector_inat_login", pa.string()),
        ("recordedBy", pa.string()),
        ("host_inat_login", pa.string()),
        ("ecdysis_id", pa.int64()),
        ("record_type", pa.string()),
        ("date", pa.string()),
        ("canonical_name", pa.string()),
        ("catalog_number", pa.string()),
    ])
    table = pa.table(
        {
            "collector_inat_login": ["alice"],
            "recordedBy":           ["Alice A"],
            "host_inat_login":      ["alice"],
            "ecdysis_id":           [int(_INAT_COREID)],
            "record_type":          ["ecdysis"],
            "date":                 ["2023-06-01"],
            "canonical_name":       ["lasioglossum albohirtum"],
            "catalog_number":       ["WSDA_INAT_99"],
        },
        schema=schema,
    )
    out_path = tmp_path / "occurrences.parquet"
    pq.write_table(table, out_path)
    return out_path


def test_nonbee_inat_url_and_bee_resolution(tmp_path, monkeypatch):
    """D-CARD-02 Part 1 + Part 2: iNat URL for non-bee; bees resolve to species_slug.

    - 'Lasioglossum (Dialictus)': subgenus-parenthetical → species_slug='Lasioglossum', no inat_url
    - 'Hylaeus polifolii': first-token genus fallback (genus col empty) → species_slug='Hylaeus', no inat_url
    - 'Diptera': non-bee named determination → inat_url set, species_slug=None
    - 'undetermined': undetermined → neither species_slug nor inat_url (plain text)
    """
    db_path = tmp_path / "test_inat.duckdb"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path))
    monkeypatch.setenv("EVENT_CHUNK_SIZE", "100")

    import collectors_events_export
    importlib.reload(collectors_events_export)

    _write_inat_test_occurrences_parquet(tmp_path)
    _write_test_species_json(tmp_path)
    _write_test_higher_taxa_json(tmp_path)
    _write_seed_collectors_json(tmp_path)
    _setup_ecdysis_duckdb_with_nonbee(tmp_path)

    collectors_events_export.export_collectors_events_step()

    records = json.loads((tmp_path / "collectors.json").read_text())
    sub_pages = json.loads((tmp_path / "collector_event_pages.json").read_text())
    all_events = _gather_all_events(records, sub_pages, "alice")

    identified = [e for e in all_events if e["event_type"] == "Identified"]
    # Map by the species_name field (which equals the original scientific_name for non-species matches)
    by_name = {e["species_name"]: e for e in identified}

    # --- Subgenus parenthetical: "Lasioglossum (Dialictus)" → genus slug, no inat_url ---
    las_dialictus = by_name.get("Lasioglossum (Dialictus)")
    assert las_dialictus is not None, "'Lasioglossum (Dialictus)' event not found"
    assert las_dialictus["species_slug"] == "Lasioglossum", (
        f"Subgenus-paren bee must resolve to genus slug='Lasioglossum'; "
        f"got {las_dialictus['species_slug']!r}"
    )
    assert las_dialictus.get("inat_url") is None, (
        "Bee determination (Lasioglossum (Dialictus)) must NOT have inat_url"
    )

    # --- First-token genus fallback: "Hylaeus polifolii" (genus col empty) → genus slug ---
    hyl = by_name.get("Hylaeus polifolii")
    assert hyl is not None, "'Hylaeus polifolii' event not found"
    assert hyl["species_slug"] == "Hylaeus", (
        f"First-token genus fallback must resolve to slug='Hylaeus'; got {hyl['species_slug']!r}"
    )
    assert hyl.get("inat_url") is None, (
        "Bee determination (Hylaeus polifolii) must NOT have inat_url"
    )

    # --- Non-bee: "Diptera" → inat_url, no species_slug ---
    diptera = by_name.get("Diptera")
    assert diptera is not None, "'Diptera' event not found"
    assert diptera["species_slug"] is None, (
        "Non-bee determination (Diptera) must NOT resolve to a BeeAtlas slug"
    )
    inat = diptera.get("inat_url")
    assert inat is not None, "Non-bee determination (Diptera) must have inat_url"
    assert "inaturalist.org" in inat, f"inat_url must link to iNaturalist; got {inat!r}"
    assert "Diptera" in inat, f"inat_url must include the taxon name; got {inat!r}"
    assert inat.startswith("https://www.inaturalist.org/taxa/search?q="), (
        f"inat_url must use the taxa/search endpoint; got {inat!r}"
    )

    # --- Undetermined: "undetermined" → neither species_slug nor inat_url ---
    undet = by_name.get("undetermined")
    assert undet is not None, "'undetermined' event not found"
    assert undet["species_slug"] is None, (
        "Undetermined must NOT have species_slug"
    )
    assert undet.get("inat_url") is None, (
        "Undetermined must NOT have inat_url (plain text only)"
    )

    # --- Mutual exclusivity: no event has both species_slug and inat_url ---
    for ev in all_events:
        assert not (ev.get("species_slug") and ev.get("inat_url")), (
            f"species_slug and inat_url are mutually exclusive; both set on {ev!r}"
        )
