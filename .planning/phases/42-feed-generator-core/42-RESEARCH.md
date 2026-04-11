# Phase 42: Feed Generator Core — Research

**Researched:** 2026-04-09
**Domain:** Python Atom XML generation from DuckDB; pipeline integration
**Confidence:** HIGH

---

## Summary

Phase 42 creates `data/feeds.py`, a new Python module that queries `beeatlas.duckdb` and writes a single Atom XML file (`frontend/public/data/feeds/determinations.xml`) covering all determinations whose `modified` timestamp falls within the last 90 days.

The implementation is purely additive: no existing schema changes, no new dependencies, no network calls. Python 3.14's standard library (`xml.etree.ElementTree`) handles Atom XML generation correctly. The existing `ecdysis_data.identifications` table contains the required data. The join between `identifications` and `occurrences` is `identifications.coreid = CAST(occurrences.id AS VARCHAR)` — confirmed in the live database.

The 90-day window currently yields ~41,000 rows. With 485 of those having empty `scientific_name` / `identified_by` fields (blank strings, not NULL), the query must use `NULLIF` or filter them out — the requirements say "taxon name, determiner" must be present, so filtering blank-field rows is appropriate.

**Primary recommendation:** Use `xml.etree.ElementTree` (stdlib) with `ET.register_namespace` for the Atom namespace; query DuckDB directly (read-only connection, same pattern as `export.py`); append `feeds` step to `run.py` STEPS list after `export`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEED-01 | Each Atom entry: taxon name, determiner, specimen ID linked to ecdysis.org, collector, collection date | Confirmed all fields exist in joined `identifications` + `occurrences`; Ecdysis URL pattern verified from `ecdysis_pipeline.py` |
| FEED-02 | 90-day window on `modified`; sorted by `modified` desc; per-entry `<updated>` uses `modified` | `modified` is `TIMESTAMP WITH TIME ZONE` in DuckDB; Python returns `datetime.datetime` with tz; RFC 3339 via `.isoformat()` |
| FEED-03 | Feed-level `<updated>` = most recent entry's `modified`; `<title>` = "Washington Bee Atlas — All Recent Determinations" | Atom spec requires feed `<updated>` to be a dateTimeStamp; use MAX(modified) from query |
| FEED-04 | Unfiltered feed at `frontend/public/data/feeds/determinations.xml` | Output dir `frontend/public/data/` confirmed to exist; `feeds/` subdir does not yet exist, must be created with `mkdir -p` |
| PIPE-01 | `data/feeds.py` module; called by `run.py` after export step | `run.py` STEPS list pattern confirmed; adding `("feeds", generate_feeds)` after `("export", export_all)` is the correct integration point |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xml.etree.ElementTree` | stdlib (Python 3.14) | Atom XML generation | Zero new dependencies; `ET.register_namespace` + `ET.indent` handle namespace and pretty-print; confirmed working [VERIFIED: live test in environment] |
| `duckdb` | already in `pyproject.toml` | Query `beeatlas.duckdb` | Same pattern used by `export.py`; read-only connection [VERIFIED: pyproject.toml] |
| `pathlib.Path` | stdlib | Output path management | Used throughout existing pipeline [VERIFIED: codebase grep] |
| `datetime` | stdlib | RFC 3339 timestamp formatting | `datetime.isoformat()` produces valid Atom dateTimeStamp [VERIFIED: live test] |

### No New Dependencies Required

The existing `pyproject.toml` (`dlt[duckdb]`, `duckdb`, `requests`, `beautifulsoup4`, `geopandas`, `boto3`) already covers everything needed. No `pip install` step.

---

## Architecture Patterns

### Recommended Module Structure: `data/feeds.py`

Follow the pattern of `export.py` exactly:

```
data/
├── feeds.py              # New module — mirrors export.py structure
├── run.py                # Append ("feeds", generate_feeds) to STEPS
└── tests/
    ├── conftest.py       # Extend with identifications table + seed data
    └── test_feeds.py     # New test file (see Validation Architecture)
```

### Pattern 1: Read-Only DuckDB Connection (from `export.py`)

```python
# Source: data/export.py lines 19-22
import os
from pathlib import Path
import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'frontend' / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))

def main() -> None:
    con = duckdb.connect(DB_PATH, read_only=True)
    # ... do work ...
    con.close()
```

`feeds.py` MUST use the same `DB_PATH` / `ASSETS_DIR` env var pattern. This is what makes tests injectable via `monkeypatch`.

### Pattern 2: run.py STEPS Integration

```python
# Source: data/run.py — existing pattern
from feeds import main as generate_feeds

STEPS: list[tuple[str, Callable]] = [
    ...
    ("export", export_all),
    ("feeds", generate_feeds),   # append here
]
```

### Pattern 3: Atom XML with xml.etree.ElementTree

```python
# Source: verified by live test in this environment
import xml.etree.ElementTree as ET

ATOM_NS = 'http://www.w3.org/2005/Atom'
ET.register_namespace('', ATOM_NS)

def _atom(tag: str) -> str:
    return f'{{{ATOM_NS}}}{tag}'

feed = ET.Element(_atom('feed'))
feed.set('xml:lang', 'en')

title_el = ET.SubElement(feed, _atom('title'))
title_el.text = 'Washington Bee Atlas — All Recent Determinations'

id_el = ET.SubElement(feed, _atom('id'))
id_el.text = 'https://beeatlas.org/data/feeds/determinations.xml'

link_el = ET.SubElement(feed, _atom('link'))
link_el.set('rel', 'self')
link_el.set('href', 'https://beeatlas.org/data/feeds/determinations.xml')

updated_el = ET.SubElement(feed, _atom('updated'))
updated_el.text = most_recent_ts.astimezone(datetime.timezone.utc).isoformat()

for row in rows:
    entry = ET.SubElement(feed, _atom('entry'))
    # ... populate entry fields ...

tree = ET.ElementTree(feed)
ET.indent(tree, space='  ')
out_path.parent.mkdir(parents=True, exist_ok=True)
tree.write(str(out_path), xml_declaration=True, encoding='unicode')
```

**Note on `encoding='unicode'`:** `ET.write` with `encoding='unicode'` writes a Python string without the byte-order-mark; pair with `out_path.write_text(..., encoding='utf-8')` OR use `encoding='utf-8'` and write bytes directly. Both approaches work. Using `encoding='unicode'` and writing with `Path.write_text` avoids the BOM issue.

### Pattern 4: Atom Entry Structure (RFC 4287)

Required per-entry elements:
- `<id>` — must be a permanent URI; use the Ecdysis record URL: `https://ecdysis.org/collections/individual/index.php?occid={ecdysis_id}`
- `<title>` — human-readable; use taxon name
- `<updated>` — RFC 3339 timestamp; use `identification.modified` (in UTC)
- `<summary>` or `<content>` — human-readable description with all required fields

Recommended entry title: `"{taxon_name} — determined by {determiner}"`

Recommended summary (plain text): `"Collected by {collector} on {collection_date}. Specimen: ecdysis:{ecdysis_id}"`

### Pattern 5: DuckDB Feed Query

```sql
-- Source: verified against live beeatlas.duckdb
SELECT
    i.modified,
    NULLIF(i.scientific_name, '')  AS taxon_name,
    NULLIF(i.identified_by, '')    AS determiner,
    o.occurrence_id                AS specimen_occurrence_id,
    o.id                           AS ecdysis_id,
    o.recorded_by                  AS collector,
    o.event_date                   AS collection_date
FROM ecdysis_data.identifications i
JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
WHERE i.modified >= NOW() - INTERVAL '90 days'
  AND i.scientific_name != ''
  AND i.identified_by   != ''
ORDER BY i.modified DESC
```

**Critical join key:** `identifications.coreid = CAST(occurrences.id AS VARCHAR)`. Joining on `occurrence_id` (the UUID field) yields 0 rows. [VERIFIED: live query against beeatlas.duckdb]

### Anti-Patterns to Avoid

- **Do not use `lxml` or `feedgen`:** Zero new dependencies is the correct choice; stdlib is sufficient and verified.
- **Do not open DuckDB for write:** `export.py` uses `read_only=True`; feeds.py must match.
- **Do not join on `occurrence_id`:** The UUID-based `occurrence_id` field does NOT match `identifications.coreid`. The integer `id` field (cast to VARCHAR) does. [VERIFIED: live query]
- **Do not include blank-taxon entries:** 485 recent rows have empty `scientific_name`; exclude them to avoid uninformative feed entries.
- **Do not emit naive datetimes:** `modified` comes back as timezone-aware `datetime` from DuckDB; convert to UTC via `.astimezone(datetime.timezone.utc)` before `.isoformat()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atom namespace prefixing | Custom string templating | `ET.register_namespace('', ATOM_NS)` | Handles namespace declaration correctly on root element |
| XML indentation | Manual `\n` + spaces | `ET.indent(tree, space='  ')` | Available since Python 3.9; already at Python 3.14 [VERIFIED: Python 3.14 in environment] |
| RFC 3339 formatting | `strftime` with manual tz offset | `datetime.isoformat()` | Python `datetime.isoformat()` on a tz-aware datetime produces valid RFC 3339 [VERIFIED: live test] |

---

## Data Schema Facts

**`ecdysis_data.identifications` columns relevant to feeds:**

| Column | Type | Notes |
|--------|------|-------|
| `coreid` | VARCHAR | Integer as string; matches `occurrences.id` cast to VARCHAR |
| `scientific_name` | VARCHAR | 485 rows in 90-day window are empty string (not NULL) |
| `identified_by` | VARCHAR | 485 rows in 90-day window are empty string (not NULL) |
| `modified` | TIMESTAMP WITH TIME ZONE | Tz-aware; range: 2025-02 to 2026-04; ~41,353 rows in 90-day window |
| `identification_is_current` | VARCHAR | '1' or '0'; 28,104 of 41,353 are current |
| `record_id` | VARCHAR | UUID; unique per identification row |

**`ecdysis_data.occurrences` columns relevant to feeds:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR | Integer as string; join target for `identifications.coreid` |
| `occurrence_id` | VARCHAR | UUID (DarwinCore); used as specimen identifier in Atom `<id>` |
| `recorded_by` | VARCHAR | Collector name; zero nulls in 90-day join |
| `event_date` | VARCHAR | Collection date string; zero nulls in 90-day join |

**Ecdysis URL pattern:** `https://ecdysis.org/collections/individual/index.php?occid={o.id}`
[VERIFIED: `ecdysis_pipeline.py` line 17 and `ECDYSIS_BASE` constant]

**Open question on `identification_is_current`:** Requirements say "all recent determinations" without specifying current-only. Filtering to `identification_is_current = '1'` reduces ~41K to ~28K entries. Recommendation: include all determinations (do not filter by `identification_is_current`) since the requirements state "all recent determinations" — but flag this for planner to confirm.

---

## Common Pitfalls

### Pitfall 1: Wrong Join Key
**What goes wrong:** Joining `identifications.coreid` to `occurrences.occurrence_id` (UUID) returns 0 rows.
**Why it happens:** Symbiota DarwinCore export uses integer IDs in `coreid`; `occurrence_id` is the GUID field.
**How to avoid:** `JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)`
**Warning signs:** Query returns 0 rows despite 80,690 records in `identifications`.

### Pitfall 2: Blank Strings as Non-NULL
**What goes wrong:** `WHERE scientific_name IS NOT NULL` passes 485 rows with empty strings through.
**Why it happens:** The Symbiota tab export writes blank strings rather than NULL for missing data.
**How to avoid:** Filter with `AND i.scientific_name != ''` (or use `NULLIF` in SELECT then filter).

### Pitfall 3: Naive Datetime → Invalid Atom
**What goes wrong:** Emitting a naive datetime like `2026-04-02T05:34:23` fails Atom validation (RFC 4287 requires full offset or 'Z').
**Why it happens:** Forgetting `.astimezone(utc)` before `.isoformat()`.
**How to avoid:** Always normalize to UTC before formatting: `ts.astimezone(datetime.timezone.utc).isoformat()` → `2026-04-02T12:34:23+00:00`.

### Pitfall 4: `feeds/` Directory Not Created
**What goes wrong:** `FileNotFoundError` when writing the first XML file because `frontend/public/data/feeds/` does not exist.
**How to avoid:** `out_path.parent.mkdir(parents=True, exist_ok=True)` before writing.
**Confirmed:** The `feeds/` subdir does not exist yet [VERIFIED: live filesystem check].

### Pitfall 5: `<updated>` on Empty Feed
**What goes wrong:** If somehow the 90-day window returns 0 rows, `MAX(modified)` is `None` — cannot write feed `<updated>`.
**How to avoid:** Guard with `if not rows: write empty feed with current UTC time` OR simply skip writing if no rows (acceptable for a nightly job).

### Pitfall 6: Non-Unique Atom Entry IDs
**What goes wrong:** Multiple identifications for the same specimen would share the Ecdysis URL as entry `<id>`.
**Why it matters:** Atom `<id>` must be globally unique per entry (RFC 4287 §4.1.2).
**How to avoid:** Use `identifications.record_id` (UUID) as the Atom entry `<id>`, not the Ecdysis occurrence URL. Use the Ecdysis occurrence URL as `<link href="...">` instead.
**Confirmed:** 5 specimens in the 90-day window have 2 identifications each [VERIFIED: live query].

---

## Code Examples

### Complete Feed Entry Pattern

```python
# Source: RFC 4287 Atom spec + verified ET pattern
import xml.etree.ElementTree as ET
import datetime

ATOM_NS = 'http://www.w3.org/2005/Atom'
ET.register_namespace('', ATOM_NS)

def _atom(tag: str) -> str:
    return f'{{{ATOM_NS}}}{tag}'

def _build_entry(feed: ET.Element, row: tuple) -> None:
    modified, taxon_name, determiner, specimen_uuid, ecdysis_id, collector, coll_date = row
    utc_ts = modified.astimezone(datetime.timezone.utc).isoformat()
    ecdysis_url = f'https://ecdysis.org/collections/individual/index.php?occid={ecdysis_id}'

    entry = ET.SubElement(feed, _atom('entry'))

    id_el = ET.SubElement(entry, _atom('id'))
    # Use specimen_uuid (occurrence_id UUID) as globally-unique Atom entry ID
    id_el.text = f'urn:ecdysis:{specimen_uuid}'

    title_el = ET.SubElement(entry, _atom('title'))
    title_el.text = f'{taxon_name} — determined by {determiner}'

    updated_el = ET.SubElement(entry, _atom('updated'))
    updated_el.text = utc_ts

    link_el = ET.SubElement(entry, _atom('link'))
    link_el.set('href', ecdysis_url)

    summary_el = ET.SubElement(entry, _atom('summary'))
    summary_el.set('type', 'text')
    summary_el.text = (
        f'Collected by {collector} on {coll_date}. '
        f'Specimen: ecdysis:{ecdysis_id}'
    )
```

### Feed Writer Pattern

```python
def write_determinations_feed(con: duckdb.DuckDBPyConnection, out_dir: Path) -> None:
    rows = con.execute("""
        SELECT
            i.modified,
            NULLIF(i.scientific_name, '') AS taxon_name,
            NULLIF(i.identified_by, '')   AS determiner,
            o.occurrence_id               AS specimen_occurrence_id,
            o.id                          AS ecdysis_id,
            o.recorded_by                 AS collector,
            o.event_date                  AS collection_date
        FROM ecdysis_data.identifications i
        JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
        WHERE i.modified >= NOW() - INTERVAL '90 days'
          AND i.scientific_name != ''
          AND i.identified_by   != ''
        ORDER BY i.modified DESC
    """).fetchall()

    if not rows:
        print("  feeds: no recent determinations in 90-day window — skipping")
        return

    most_recent_ts = rows[0][0].astimezone(datetime.timezone.utc)
    feed = ET.Element(_atom('feed'))
    feed.set('xml:lang', 'en')

    ET.SubElement(feed, _atom('title')).text = \
        'Washington Bee Atlas \u2014 All Recent Determinations'
    ET.SubElement(feed, _atom('id')).text = \
        'https://beeatlas.org/data/feeds/determinations.xml'
    link_el = ET.SubElement(feed, _atom('link'))
    link_el.set('rel', 'self')
    link_el.set('href', 'https://beeatlas.org/data/feeds/determinations.xml')
    ET.SubElement(feed, _atom('updated')).text = most_recent_ts.isoformat()

    for row in rows:
        _build_entry(feed, row)

    tree = ET.ElementTree(feed)
    ET.indent(tree, space='  ')
    out_path = out_dir / 'feeds' / 'determinations.xml'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(str(out_path), xml_declaration=True, encoding='unicode')
    print(f"  feeds/determinations.xml: {len(rows):,} entries, "
          f"{out_path.stat().st_size:,} bytes")


def main() -> None:
    con = duckdb.connect(DB_PATH, read_only=True)
    write_determinations_feed(con, ASSETS_DIR)
    con.close()
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14 | feeds.py, run.py | ✓ | 3.14.3 | — |
| duckdb (Python) | DB queries | ✓ | already installed | — |
| `xml.etree.ElementTree` | Atom XML | ✓ | stdlib | — |
| `frontend/public/data/` dir | XML output | ✓ | exists | — |
| `frontend/public/data/feeds/` dir | XML output | ✗ | does not exist | create with `mkdir -p` |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:**
- `feeds/` subdir: does not exist — `mkdir(parents=True, exist_ok=True)` in feeds.py creates it at runtime.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2+ |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` testpaths = ["tests"] |
| Quick run command | `cd data && uv run pytest tests/test_feeds.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEED-01 | Each entry contains taxon, determiner, ecdysis link, collector, date | unit | `uv run pytest tests/test_feeds.py::test_entry_fields -x` | ❌ Wave 0 |
| FEED-02 | 90-day window, sorted newest-first, per-entry `<updated>` = `modified` | unit | `uv run pytest tests/test_feeds.py::test_time_window_and_sort -x` | ❌ Wave 0 |
| FEED-03 | Feed `<updated>` = max entry modified; `<title>` correct | unit | `uv run pytest tests/test_feeds.py::test_feed_metadata -x` | ❌ Wave 0 |
| FEED-04 | File written to `feeds/determinations.xml` | unit | `uv run pytest tests/test_feeds.py::test_output_path -x` | ❌ Wave 0 |
| PIPE-01 | `run.py` calls feeds after export without error | smoke | `cd data && uv run python -c "import feeds; print('ok')"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_feeds.py -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `data/tests/test_feeds.py` — all 5 test cases above
- [ ] `data/tests/conftest.py` — extend fixture DB with `identifications` table and seed rows

**conftest.py extension needed:**

```python
# Add to _create_tables() in conftest.py
con.execute("""
    CREATE TABLE ecdysis_data.identifications (
        coreid VARCHAR,
        scientific_name VARCHAR,
        identified_by VARCHAR,
        modified TIMESTAMPTZ,
        record_id VARCHAR,
        identification_is_current VARCHAR,
        date_identified VARCHAR,
        _dlt_load_id VARCHAR,
        _dlt_id VARCHAR
    )
""")
```

```python
# Add to _seed_data() in conftest.py
import datetime
con.execute("""
    INSERT INTO ecdysis_data.identifications VALUES (
        '5594569',
        'Eucera acerba',
        'Test Determiner',
        ?,
        'det-uuid-1',
        '1',
        '2026-01-15',
        'load1',
        'det-1'
    )
""", [datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=10)])
```

---

## Security Domain

**Assessment:** This phase writes static XML files from a local database. No network requests, no user input, no authentication, no cryptography. ASVS categories V2, V3, V4, V6 do not apply.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | minimal | Taxon/determiner names from DB are escaped by `xml.etree.ElementTree` automatically |
| V6 Cryptography | no | — |

**XML injection:** `ET.SubElement.text = value` automatically escapes `<`, `>`, `&` in text content. No raw string concatenation into XML. No risk.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `identification_is_current` should NOT be filtered (include all recent determinations regardless) | Data Schema Facts | If wrong, feed contains superseded determinations; low user impact since entries are still factually correct |
| A2 | Ecdysis feed `<id>` canonical URL is `https://beeatlas.org/data/feeds/determinations.xml` | Code Examples | If domain is wrong, feed validators warn about mismatch between `<id>` and actual URL; easy to fix |
| A3 | `specimen_occurrence_id` (UUID) is stable across pipeline reloads (suitable as Atom `<id>`) | Data Schema Facts | If occurrence UUIDs change on re-import, RSS readers see duplicate entries; unlikely given DarwinCore UUID semantics |

---

## Open Questions

1. **`identification_is_current` filter**
   - What we know: 28,104 of 41,353 recent identifications have `identification_is_current = '1'`; the other 13,249 are superseded.
   - What's unclear: Do users want to see all determination events (including corrections), or only the current accepted name?
   - Recommendation: Include all (no filter). The feed title is "All Recent Determinations" — superseded identifications are legitimate events in the determination workflow.

2. **Canonical feed base URL**
   - What we know: Feed requires `<id>` and `<link rel="self">` URLs; the site is deployed to S3 but actual domain is not confirmed in codebase.
   - What's unclear: Is the deployed domain `beeatlas.org` or another subdomain?
   - Recommendation: Use a placeholder like `https://beeatlas.org/data/feeds/determinations.xml` and confirm before deployment. Does not affect local validation.

---

## Sources

### Primary (HIGH confidence)

- Live `beeatlas.duckdb` queries — schema, join keys, row counts, null analysis [VERIFIED: executed in this session]
- `data/export.py` — DB_PATH/ASSETS_DIR env var pattern, read-only connection pattern [VERIFIED: read in this session]
- `data/run.py` — STEPS list integration pattern [VERIFIED: read in this session]
- `data/ecdysis_pipeline.py` — Ecdysis URL pattern (`ECDYSIS_BASE`), `occurrences.id` integer key [VERIFIED: read in this session]
- `data/pyproject.toml` — Python >=3.14, existing dependencies [VERIFIED: read in this session]
- `data/tests/conftest.py` — fixture DB structure, test patterns [VERIFIED: read in this session]
- Python 3.14 stdlib live test — `xml.etree.ElementTree`, `datetime.isoformat()` [VERIFIED: executed in this session]

### Secondary (MEDIUM confidence)

- RFC 4287 (Atom Syndication Format) — entry `<id>` uniqueness requirement, required elements [ASSUMED based on training knowledge; widely-implemented standard unchanged since 2005]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all verified against live environment
- Architecture: HIGH — follows existing `export.py` pattern exactly; all join keys confirmed
- Pitfalls: HIGH — join key and blank-string issues verified against live data
- Test patterns: HIGH — follows existing `conftest.py` / `test_export.py` structure exactly

**Research date:** 2026-04-09
**Valid until:** 2026-07-09 (stable — no external APIs, no version churn risk)
