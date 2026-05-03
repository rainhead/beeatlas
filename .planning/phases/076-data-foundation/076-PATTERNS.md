# Phase 76: Data Foundation — Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 13 (8 NEW + 5 MODIFIED)
**Analogs found:** 13 / 13 (every file has a strong existing analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/checklist_pipeline.py` | pipeline (DuckDB loader + reconciler) | one-shot file-I/O → DB; sidecar CSV writeback | `data/geographies_pipeline.py` (one-shot DuckDB load, no dlt) + `data/feeds.py` (CSV/file writeback at end of pipeline step) | exact (load shape) + role-match (sidecar) |
| `data/canonical_name.py` | utility (pure string transform) | transform (no I/O) | `data/feeds.py:_slugify` (lines 132-148) — single pure string-transform helper imported across pipeline steps | exact |
| `data/checklists/wa_bee_checklist.tsv` | committed source data (TSV) | static asset | No analog (first committed source TSV in repo). Closest precedent: `data/last_fetch.txt` for "small committed asset under data/". | none (data file, not code) |
| `data/checklists/README.md` | provenance docs | static asset | `data/README.md` (top-of-data-dir provenance/usage notes) | role-match |
| `data/checklist_synonyms.csv` | committed override table (header-only initial) | static asset | No analog | none (data file) |
| `data/checklist_unmatched.csv` | regenerated sidecar artifact, committed each run | file-I/O write target | `public/data/feeds/index.json` regeneration pattern (`feeds.py` writes deterministically each run) | role-match |
| `data/tests/test_checklist_pipeline.py` | pytest integration test | DB-fixture-driven assertion | `data/tests/test_export.py` (uses `fixture_con` from conftest, asserts on table contents) | exact |
| `data/tests/test_taxon_lineage.py` | pytest integration test (HTTP mocked) | DB fixture + mock + DB assertion | `data/tests/test_export.py` (DB-fixture pattern); HTTP-mocking precedent: none in repo today — `responses` / `monkeypatch` on `requests.get` is the path | role-match (fixture); new pattern (HTTP mock) |
| `data/tests/test_canonical_name.py` (recommended split) | pytest unit test (pure function) | transform input → output | `data/tests/test_transforms.py` (pure-function unit tests; no DB, no fixture) | exact |
| `data/run.py` (MODIFIED) | orchestrator (STEPS list + migrations) | imperative sequencing | self-modifying — see existing `STEPS` block lines 31-40 and `_apply_migrations()` lines 43-90 | exact (in-file edit) |
| `data/inaturalist_pipeline.py` (MODIFIED) | dlt source + post-load enrichment | API → DB | `data/waba_pipeline.py:enrich_taxon_lineage` (lines 109-160) — same iNat v2 `/v2/taxa/{ids}` batched fetch + `CREATE OR REPLACE` + `executemany INSERT` | exact |
| `data/tests/conftest.py` (MODIFIED) | pytest fixture (DuckDB session-scoped) | DB seed | self-modifying — extend existing `_create_tables()` and `_seed_data()` pattern (lines 18-227) | exact (in-file extension) |
| `.planning/REQUIREMENTS.md` (MODIFIED) | requirements doc | text edit | self-modifying — CHECK-01 line 12 (`.csv` → `.tsv`); CHECK-03 line 14 (footnote on `status` enum) | exact |

## Pattern Assignments

### `data/checklist_pipeline.py` (NEW — pipeline, one-shot file-I/O → DuckDB)

**Primary analog:** `data/geographies_pipeline.py` (lines 1-148) — same shape: read static source from disk → `con.execute("CREATE OR REPLACE TABLE …")` → no dlt, no incremental cursor, no API.

**Module preamble pattern** (`data/geographies_pipeline.py:16-25`):
```python
import os
import zipfile  # adapt to: import csv
from pathlib import Path

import duckdb
import requests  # not needed for checklist (no API)

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
```

Use the same `DB_PATH` resolution. The checklist module also needs path constants:
```python
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
SYNONYMS_PATH = Path(__file__).parent / "checklist_synonyms.csv"
UNMATCHED_PATH = Path(__file__).parent / "checklist_unmatched.csv"
SOURCE_CITATION = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)"
```

**Top-level entry point pattern** (`data/geographies_pipeline.py:79-82, 143-148`):
```python
def load_geographies() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    # ... CREATE OR REPLACE TABLE … blocks
    con.close()


if __name__ == "__main__":
    load_geographies()
```

For `load_checklist()`: drop the `INSTALL spatial; LOAD spatial;` line (not needed); keep `CREATE SCHEMA IF NOT EXISTS checklist_data`; close at end. Mirror the `if __name__ == "__main__":` block so the module is independently runnable (matches every other pipeline file: `geographies_pipeline.py:146-148`, `inaturalist_pipeline.py:139-141`, `waba_pipeline.py:187-189`).

**CREATE OR REPLACE + executemany INSERT pattern** (`data/waba_pipeline.py:147-157`):
```python
con.execute("""
    CREATE OR REPLACE TABLE inaturalist_waba_data.taxon_lineage (
        taxon_id BIGINT PRIMARY KEY,
        genus VARCHAR,
        family VARCHAR
    )
""")
con.executemany(
    "INSERT INTO inaturalist_waba_data.taxon_lineage VALUES (?, ?, ?)",
    [[tid, d["genus"], d["family"]] for tid, d in lineage.items()],
)
count = con.execute("SELECT count(*) FROM inaturalist_waba_data.taxon_lineage").fetchone()[0]
print(f"taxon_lineage: {count} rows")  # noqa: T201
```

Apply this exact shape for both `checklist_data.species` (11 cols including `canonical_name`) and `checklist_data.species_counties` (2 cols). End each block with a `count` log and `# noqa: T201` on the print.

**ALTER TABLE … ADD COLUMN IF NOT EXISTS pattern** (`data/run.py:84-88`):
```python
con.execute("INSTALL spatial; LOAD spatial;")
for qualified in needs_geom:
    print(f"Migration: adding geom column to {qualified}")
    con.execute(f"ALTER TABLE {qualified} ADD COLUMN geom GEOMETRY")
    con.execute(f"UPDATE {qualified} SET geom = ST_GeomFromText(geometry_wkt)")
```

The checklist step does the analogous operation on `ecdysis_data.occurrences.canonical_name`:
```python
con.execute("ALTER TABLE ecdysis_data.occurrences ADD COLUMN IF NOT EXISTS canonical_name VARCHAR")
# Pull DISTINCT names → canonicalize() in Python → writeback. ~45K rows ~1s.
```

**CSV/TSV reading pattern** (no direct repo analog — use stdlib `csv.DictReader` per RESEARCH.md §Standard Stack). Precedent for stdlib `csv` use: `data/ecdysis_pipeline.py:54-60` (the research notes already point to this).

**Sidecar file writeback pattern** (`data/feeds.py:120-129`):
```python
out_path = out_dir / 'feeds' / 'determinations.xml'
out_path.parent.mkdir(parents=True, exist_ok=True)
result = ET.tostring(feed, xml_declaration=True, encoding='unicode')
out_path.write_text(result, encoding='utf-8')

print(  # noqa: T201
    f"  feeds/determinations.xml: {len(rows):,} entries, "
    f"{out_path.stat().st_size:,} bytes"
)
```

For `checklist_unmatched.csv`: use stdlib `csv.writer` writing to `UNMATCHED_PATH`, header row `["checklist_name", "canonical_name", "reason"]`, then one row per still-unmatched entry. Print line count with `# noqa: T201`. Per D-05 this is warn-only — never raise on non-empty output.

---

### `data/canonical_name.py` (NEW — utility, pure transform)

**Primary analog:** `data/feeds.py:_slugify` (lines 132-148) — single pure function, regex-based, no I/O, importable across pipeline steps.

**Full template** (`data/feeds.py:132-148`):
```python
def _slugify(value: str) -> str:
    """Convert a human name or place name to a URL-safe ASCII slug.

    Strips all characters that are not [a-z0-9-], preventing path traversal
    (../) and special characters in filenames.
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
```

Apply the same code shape: module-level imports (`import re`); single public function `canonicalize(name: str) -> str`; doc-comment each step inline. Per D-04 the steps are: (1) strip authority via regex on first `, ` or ` (Author` token, (2) strip subgenus parens (`r'\s*\([^)]+\)\s*'` → `' '`), (3) strip infraspecific markers (`ssp.`, `var.`, `aff.`, `cf.`, `nr.` and any tokens after), (4) `.lower()`, (5) `re.sub(r'\s+', ' ', value).strip()`. Single-fallback return — if input is empty/None after stripping, return `''` (NOT a sentinel; test fixtures must verify this).

**Recommendation:** Place in NEW `data/canonical_name.py` (per RESEARCH.md §Architecture lines 65) so both `data/checklist_pipeline.py` and future `data/species_export.py` (Phase 77) can import without circular dependency on the checklist module.

---

### `data/inaturalist_pipeline.py` (MODIFIED — add `enrich_taxon_lineage_extended()`, call from `load_observations`)

**Primary analog:** `data/waba_pipeline.py:enrich_taxon_lineage` (lines 109-160) — exact pattern. New function is a wider-schema sibling, NOT a replacement (per D-03 the existing waba function stays untouched).

**Full function template** (`data/waba_pipeline.py:109-160`):
```python
def enrich_taxon_lineage(db_path: str) -> None:
    """Fetch genus and family for all WABA observation taxon IDs via the iNat taxa endpoint.

    Creates/replaces inaturalist_waba_data.taxon_lineage(taxon_id, genus, family).
    export.py joins against this table to populate specimen_inat_genus and specimen_inat_family.
    """
    con = duckdb.connect(db_path)
    taxon_ids = [
        row[0] for row in con.execute(
            "SELECT DISTINCT taxon__id FROM inaturalist_waba_data.observations WHERE taxon__id IS NOT NULL"
        ).fetchall()
    ]
    if not taxon_ids:
        print("taxon_lineage: no taxon IDs found, skipping")  # noqa: T201
        con.close()
        return

    lineage: dict[int, dict] = {}
    batch_size = 30
    for i in range(0, len(taxon_ids), batch_size):
        batch = taxon_ids[i : i + batch_size]
        ids_path = ",".join(map(str, batch))
        resp = requests.get(
            f"https://api.inaturalist.org/v2/taxa/{ids_path}",
            params={"fields": "id,name,rank,ancestors.name,ancestors.rank"},
            timeout=30,
        )
        resp.raise_for_status()
        for taxon in resp.json().get("results", []):
            genus = taxon["name"] if taxon.get("rank") == "genus" else None
            family = taxon["name"] if taxon.get("rank") == "family" else None
            for anc in taxon.get("ancestors", []):
                if anc.get("rank") == "genus" and genus is None:
                    genus = anc["name"]
                elif anc.get("rank") == "family" and family is None:
                    family = anc["name"]
            lineage[taxon["id"]] = {"genus": genus, "family": family}

    con.execute("""
        CREATE OR REPLACE TABLE inaturalist_waba_data.taxon_lineage (
            taxon_id BIGINT PRIMARY KEY,
            genus VARCHAR,
            family VARCHAR
        )
    """)
    con.executemany(
        "INSERT INTO inaturalist_waba_data.taxon_lineage VALUES (?, ?, ?)",
        [[tid, d["genus"], d["family"]] for tid, d in lineage.items()],
    )
    count = con.execute("SELECT count(*) FROM inaturalist_waba_data.taxon_lineage").fetchone()[0]
    print(f"taxon_lineage: {count} rows")  # noqa: T201
    con.close()
```

**Adaptations for `enrich_taxon_lineage_extended`:**
1. **Source query change** — taxon IDs come from a UNION of two tables:
   ```sql
   SELECT DISTINCT taxon__id FROM (
       SELECT taxon__id FROM inaturalist_data.observations WHERE taxon__id IS NOT NULL
       UNION
       SELECT taxon__id FROM inaturalist_waba_data.observations WHERE taxon__id IS NOT NULL
   )
   ```
2. **Wider rank harvest** — alongside `genus`/`family`, also extract `subfamily`, `tribe`, `subgenus` via the same `for anc in taxon.get("ancestors", []):` loop, adding 3 elif branches.
3. **Wider table schema:**
   ```sql
   CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended (
       taxon_id BIGINT PRIMARY KEY,
       family VARCHAR, subfamily VARCHAR, tribe VARCHAR,
       genus VARCHAR, subgenus VARCHAR
   )
   ```
4. **Six-column `executemany INSERT`** (not three).
5. **`CREATE SCHEMA IF NOT EXISTS inaturalist_data`** is NOT needed — the schema already exists from the dlt run.
6. **Print prefix change:** `taxon_lineage_extended: {count} rows`.

**Wire-up — call site pattern** (`data/waba_pipeline.py:184`):
```python
def load_observations(full_reload: bool = False) -> None:
    pipeline = dlt.pipeline(...)
    # ... existing dlt run logic ...
    load_info = pipeline.run(source)
    print(load_info)  # noqa: T201
    load_info.raise_on_failed_jobs()
    enrich_taxon_lineage(DB_PATH)   # ← LAST line of function
```

In `data/inaturalist_pipeline.py:114-136`, the existing `load_observations()` ends at line 136 with `load_info.raise_on_failed_jobs()`. Add `enrich_taxon_lineage_extended(DB_PATH)` as the new last line (line 137-ish). Per D-03, this function MUST run after WABA so the union covers WABA taxa — but ordering across modules is enforced by `data/run.py STEPS` (`inaturalist` runs after `waba`? — no: STEPS shows `inaturalist` BEFORE `waba`). **Resolution:** call `enrich_taxon_lineage_extended` from a step that runs after both — either move the call to a new step in `run.py` between `anti-entropy` and `checklist`, OR keep the call in `inaturalist_pipeline.load_observations()` AND swap STEPS so `waba` runs before `inaturalist`. **Planner decision required.** RESEARCH.md (line 134-135 ASCII diagram) shows ordering `inaturalist → waba → projects → anti-entropy → checklist`, implying the cleanest fit is to lift the call out of `load_observations` into a small standalone step. This conflicts with the CONTEXT.md instruction "Called from `inaturalist_pipeline.py::load_observations()` after the dlt run completes". The planner should reconcile.

---

### `data/run.py` (MODIFIED — STEPS list + maybe migration entry)

**STEPS insertion pattern** (`data/run.py:31-40`):
```python
STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("export", export_all),
    ("feeds", generate_feeds),
]
```

Per CHECK-04, insert `("checklist", load_checklist)` between `anti-entropy` and `export`:
```python
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),       # ← NEW (Phase 76 / CHECK-04)
    ("export", export_all),
```

Add the import at the top alongside other pipeline imports (`run.py:22-29`):
```python
from checklist_pipeline import load_checklist
```

**Migration entry point** (`data/run.py:43-90`) — `_apply_migrations()` is conditionally needed:
- New tables `checklist_data.species`, `checklist_data.species_counties`, `inaturalist_data.taxon_lineage_extended` use `CREATE OR REPLACE` and need NO migration.
- `ecdysis_data.occurrences.canonical_name` is a NEW COLUMN added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` from inside `checklist_pipeline.py` (not from `_apply_migrations()`). Because ecdysis writes with `replace` disposition (per CONTEXT.md "ecdysis writes with replace, so the migration is a re-add each run"), the column is dropped on every ecdysis run; the `ALTER TABLE … ADD COLUMN` inside `load_checklist()` is the idempotent re-add. **No `_apply_migrations()` change needed** if the planner chooses to live with this re-add-each-run shape.

If the planner prefers a one-shot upfront migration in `_apply_migrations()`, follow this skeleton (`data/run.py:58-65`):
```python
cols = {row[0] for row in con.execute(
    "SELECT column_name FROM information_schema.columns "
    "WHERE table_schema = 'ecdysis_data' AND table_name = 'occurrences'"
).fetchall()}
if 'canonical_name' not in cols:
    print("Migration: adding canonical_name column to ecdysis_data.occurrences")
    con.execute("ALTER TABLE ecdysis_data.occurrences ADD COLUMN canonical_name VARCHAR")
```
Either path is acceptable; the in-pipeline re-add is simpler.

---

### `data/tests/conftest.py` (MODIFIED — extend `_create_tables` + `_seed_data`)

**Schema-creation extension pattern** (`data/tests/conftest.py:18-111`):
The existing `_create_tables()` function `CREATE TABLE`s for every schema the tests need. Append blocks for:
```python
con.execute("CREATE SCHEMA checklist_data")
con.execute("""
    CREATE TABLE checklist_data.species (
        scientificName VARCHAR, family VARCHAR, subfamily VARCHAR,
        tribe VARCHAR, genus VARCHAR, subgenus VARCHAR,
        specific_epithet VARCHAR, status VARCHAR,
        source_citation VARCHAR, notes VARCHAR,
        canonical_name VARCHAR
    )
""")
con.execute("""
    CREATE TABLE checklist_data.species_counties (
        scientificName VARCHAR, county VARCHAR
    )
""")
con.execute("""
    CREATE TABLE inaturalist_data.taxon_lineage_extended (
        taxon_id BIGINT, family VARCHAR, subfamily VARCHAR,
        tribe VARCHAR, genus VARCHAR, subgenus VARCHAR
    )
""")
```

Also: add `canonical_name VARCHAR` to the `ecdysis_data.occurrences` definition at line 38-50 (this propagates to every existing test fixture; verify no breakage).

**Seed-row extension pattern** (`data/tests/conftest.py:114-227`):
The existing `_seed_data()` shows the `INSERT INTO … VALUES (…)` style with positional `?` parameters. Add seed rows for the disagreement fixtures (per TAX-04 / CONTEXT.md):
```python
# Checklist row using neuter epithet
con.execute("""
    INSERT INTO checklist_data.species VALUES (
        'Lasioglossum zonulum', NULL, NULL, NULL,
        'Lasioglossum', NULL, 'zonulum',
        'verified', ?, NULL, 'lasioglossum zonulum'
    )
""", [SOURCE_CITATION_FIXTURE])

# Authority-bearing variant for canonicalize() coverage
con.execute("""
    INSERT INTO checklist_data.species VALUES (
        'Andrena fulva (Müller, 1766)', ...
        ..., 'andrena fulva'
    )
""")

# Ecdysis occurrence with subgenus parens form (must canonicalize to same key)
con.execute("""
    UPDATE ecdysis_data.occurrences
    SET canonical_name = 'lasioglossum zonulum'
    WHERE id = '5594569'
""")  # or insert a new specimen row with scientific_name='Lasioglossum (Dialictus) zonulum'

# Extended lineage seed
con.execute("""
    INSERT INTO inaturalist_data.taxon_lineage_extended VALUES
        (100001, 'Apidae', 'Apinae', 'Eucerini', 'Eucera', NULL),
        (100002, 'Megachilidae', 'Megachilinae', 'Osmiini', 'Osmia', NULL)
""")
```

The pre-existing narrow `inaturalist_waba_data.taxon_lineage` block at lines 222-227 is the structural model.

---

### `data/tests/test_checklist_pipeline.py` (NEW — integration test)

**Primary analog:** `data/tests/test_export.py` (lines 38-69) — uses session-scoped `fixture_con` from conftest, asserts on table contents.

**Test function shape** (`data/tests/test_export.py:38-50`):
```python
def test_occurrences_parquet_schema(fixture_con, export_dir, monkeypatch):
    """export_occurrences_parquet writes file with all expected columns."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_OCCURRENCES_COLS:
        assert col in actual_cols, f"Missing column in occurrences.parquet: {col}"
```

Mirror this shape for checklist tests:
- `monkeypatch.setattr(checklist_mod, 'CHECKLIST_PATH', tmp_path / 'fake.tsv')` to point at a tiny fake TSV.
- `monkeypatch.setattr(checklist_mod, 'SYNONYMS_PATH', …)` and `UNMATCHED_PATH` similarly.
- Set `DB_PATH` env-var to the fixture DB path before calling `load_checklist()`.
- Assert on table contents: row count, that `canonical_name` is populated, that disagreement fixtures join via canonical_name, that `unmatched.csv` is written and has expected rows.

**Cases to cover (from TAX-04 + CONTEXT.md):**
1. `Lasioglossum (Dialictus) zonulum` (occurrence) ↔ `Lasioglossum zonulum` (checklist) — must produce identical `canonical_name = 'lasioglossum zonulum'`.
2. Authority-bearing input `Andrena fulva (Müller, 1766)` → `'andrena fulva'`.
3. Synonyms.csv override path: a checklist row whose canonical_name does NOT match any occurrence; synonyms.csv contains an override row; verify the override is honored.
4. Unmatched sidecar: a checklist row that joins to nothing AND has no synonyms entry; verify it lands in `checklist_unmatched.csv` AND the pipeline does NOT raise.

---

### `data/tests/test_canonical_name.py` (NEW recommended split — pure-function unit tests)

**Primary analog:** `data/tests/test_transforms.py` (lines 1-44) — unit tests for pure functions (`_transform`, `_extract_inat_id`); no DB, no fixture.

**Test shape** (`data/tests/test_transforms.py:15-23`):
```python
def test_transform_with_geojson():
    """Happy path: geojson coordinates are extracted into longitude/latitude."""
    item = {"geojson": {"coordinates": [-120.5, 47.5]}, "project_ids": [101], "uuid": "abc"}
    result = _transform(item.copy())
    assert result["longitude"] == -120.5
```

Mirror per-step coverage of `canonicalize()`:
```python
def test_canonicalize_strips_authority_paren_year():
    assert canonicalize("Andrena fulva (Müller, 1766)") == "andrena fulva"

def test_canonicalize_strips_subgenus_parens():
    assert canonicalize("Lasioglossum (Dialictus) zonulum") == "lasioglossum zonulum"

def test_canonicalize_strips_infraspecific():
    assert canonicalize("Bombus huntii ssp. occidentalis") == "bombus huntii"

def test_canonicalize_lowercase_and_whitespace():
    assert canonicalize("  Apis  Mellifera  ") == "apis mellifera"

def test_canonicalize_idempotent():
    name = "Lasioglossum (Dialictus) zonulum (Smith, 1853)"
    assert canonicalize(canonicalize(name)) == canonicalize(name)
```

---

### `data/tests/test_taxon_lineage.py` (NEW — integration test with mocked HTTP)

**Primary analog (DB fixture side):** `data/tests/test_export.py` (uses `fixture_con`).
**HTTP-mock primitive:** no existing test in the repo mocks `requests.get`. Use `monkeypatch.setattr(requests, 'get', fake_get)` where `fake_get` returns a stub response with `.json()` and `.raise_for_status()`. (`pytest-mock` is NOT in dev deps; stick with stdlib `monkeypatch`.)

**Cases:**
1. With seeded `taxon__id` values across both `inaturalist_data.observations` and `inaturalist_waba_data.observations` (the conftest fixtures already have `100001` in waba — extend to add the same to inaturalist_data so the union is non-trivial).
2. Stub the iNat v2 `/v2/taxa/{ids}` response to return a payload that exercises ALL five rank harvests (family / subfamily / tribe / genus / subgenus).
3. After calling `enrich_taxon_lineage_extended(DB_PATH)`, assert `inaturalist_data.taxon_lineage_extended` row count and per-column values.
4. Verify NULL is emitted (not a sentinel) when a rank is absent — TAX-03 guard.

---

### `data/checklists/wa_bee_checklist.tsv`, `data/checklists/README.md`, `data/checklist_synonyms.csv`, `data/checklist_unmatched.csv` (NEW data assets)

No existing-code analogs — these are committed source/sidecar files, not Python modules. Provenance write-up in `data/checklists/README.md` should mirror the top-of-file docstring style used in every pipeline module (e.g. `data/geographies_pipeline.py:1-14` lists each source's URL + provider). The README must include: paper citation (Bartholomew et al. 2024, JHR 97; DOI 10.3897/jhr.97.129013), the manual extraction step from the supplement PDF, the two-column TSV shape (`species\tcounty`), row count (2,862) and unique species count (527, 39 counties).

`checklist_synonyms.csv` initial commit: header row only — `checklist_name,canonical_name,source\n`.

`checklist_unmatched.csv` initial commit: regenerated by the first pipeline run; the planner should run the pipeline once to produce the snapshot, then commit that output. Header: `checklist_name,canonical_name,reason`.

---

### `.planning/REQUIREMENTS.md` (MODIFIED — CHECK-01 + CHECK-03 amendments per CONTEXT D-01/D-02)

**Edit 1** (line 12): replace `wa_bee_checklist.csv` with `wa_bee_checklist.tsv`.

**Edit 2** (line 14): add a footnote on CHECK-03's status enum to capture D-02:
> v3.2 populates only `verified`; `likely-to-occur` is reserved for v3.3+ when a curated "expected but not yet found" set is introduced.

These edits land in the same commit as the planner's first plan output (per CONTEXT.md `<deferred>` line 130).

---

## Shared Patterns

### Connection lifecycle (every DuckDB-touching module)
**Source:** `data/geographies_pipeline.py:79-143` and `data/waba_pipeline.py:115-160`.
**Apply to:** `data/checklist_pipeline.py`, `data/inaturalist_pipeline.py:enrich_taxon_lineage_extended`.

```python
con = duckdb.connect(DB_PATH)
try:
    # work …
finally:
    con.close()
```

The waba file uses the bare `con.close()` style without `try/finally` (lines 124, 160) — both are accepted in the codebase. Prefer `try/finally` in new code for safety on partial failures.

### Module entry point
**Source:** `data/geographies_pipeline.py:146-148`, `data/waba_pipeline.py:187-189`, `data/inaturalist_pipeline.py:139-141`.
**Apply to:** `data/checklist_pipeline.py`.

```python
if __name__ == "__main__":
    load_checklist()
```

### Print logging style
**Source:** every pipeline module — terse, single-line, ALWAYS ending with `# noqa: T201`.
**Apply to:** all new prints.

```python
print(f"checklist: {len(species_rows)} species, {len(species_counties)} county records")  # noqa: T201
print(f"checklist: {len(unmatched)} unmatched (warn-only; see checklist_unmatched.csv)")  # noqa: T201
```

### iNat v2 `/v2/taxa/{ids}` endpoint shape
**Source:** `data/waba_pipeline.py:131-136`.
**Apply to:** `enrich_taxon_lineage_extended`.

```python
resp = requests.get(
    f"https://api.inaturalist.org/v2/taxa/{ids_path}",
    params={"fields": "id,name,rank,ancestors.name,ancestors.rank"},
    timeout=30,
)
resp.raise_for_status()
```

Reuse `batch_size = 30` exactly — the precedent has been validated against the iNat URL-length cap.

### `CREATE OR REPLACE TABLE` + `executemany INSERT`
**Source:** `data/waba_pipeline.py:147-157`.
**Apply to:** every new table in this phase (`checklist_data.species`, `checklist_data.species_counties`, `inaturalist_data.taxon_lineage_extended`).

### Pytest fixture seed pattern
**Source:** `data/tests/conftest.py:_seed_data` (lines 114-227).
**Apply to:** disagreement-fixture additions for `test_checklist_pipeline.py` and `test_taxon_lineage.py`.

### Path resolution
**Source:** `data/geographies_pipeline.py:23` + `data/feeds.py:26-28` + `data/run.py:53`.
**Apply to:** `data/checklist_pipeline.py`.

```python
DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
```

Use the same env-var name. Tests already inject `DB_PATH` via monkeypatch on the fixture.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| HTTP mocking inside `test_taxon_lineage.py` | test setup | mock external HTTP | No prior `requests.get` mock exists in `data/tests/`. Use `monkeypatch.setattr(requests, 'get', stub)` — straightforward stdlib pattern, but no in-repo precedent. |
| Sidecar CSV writeback under `data/` (committed each run) | pipeline-step output | file-I/O write to repo-tracked path | Closest behavior is `data/feeds.py` writing to `public/data/feeds/*.xml`, but those are gitignored build artifacts. `checklist_unmatched.csv` is unique in being a per-run regenerated file that IS committed. Pattern is straightforward (`csv.writer` to a `Path`); the novelty is the commit policy, not the code. |

## Metadata

**Analog search scope:** `data/`, `data/tests/`, `.planning/`.
**Files scanned:**
- `data/run.py` (full)
- `data/geographies_pipeline.py` (full)
- `data/waba_pipeline.py` (full)
- `data/inaturalist_pipeline.py` (full)
- `data/anti_entropy_pipeline.py` (lines 1-80)
- `data/feeds.py` (lines 1-160)
- `data/export.py` (lines 100-140)
- `data/tests/conftest.py` (full)
- `data/tests/test_export.py` (lines 1-120)
- `data/tests/test_transforms.py` (lines 1-80)
- `.planning/REQUIREMENTS.md` (CHECK + TAX block)
- `.planning/phases/076-data-foundation/076-CONTEXT.md` (full)
- `.planning/phases/076-data-foundation/076-RESEARCH.md` (lines 1-300)

**Pattern extraction date:** 2026-05-02
