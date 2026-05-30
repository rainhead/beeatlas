# Phase 124: Pre-Work & Contract Cleanup - Research

**Researched:** 2026-05-29
**Domain:** Python data pipeline, dbt contract, iNat API, DuckDB
**Confidence:** HIGH

## Summary

Phase 124 has three tightly scoped tasks with no new dependencies. All work is surgical: one docstring update, one SQL extension, and one enumeration query. Each task is well-understood from direct source inspection.

**PWK-01** is a one-line docstring fix. `test_dbt_diff.py:test_occurrences_schema_matches` says "30 cols" but the actual `occurrences` contract has 36 columns. The schema.yml contract has been verified to contain exactly 36 column entries.

**PWK-02** extends `_names_to_resolve()` in `resolve_taxon_ids.py`. The current SQL UNION only covers `checklist_data.species` and `ecdysis_data.occurrences`. ARM 3 canonical names live in `inat_obs_data.observations`, which was added in Phase 117 after the resolver was written. At research time, 56 inat_obs canonical names are absent from `inaturalist_data.canonical_to_taxon_id`: 42 single-token (genus/subgenus) and 14 two-token (species). The fix is adding a third `UNION` branch to the SQL in `_names_to_resolve()`.

**PWK-03** enumerates inactive taxon IDs. The mechanism is: LEFT JOIN `inaturalist_data.canonical_to_taxon_id` against `taxa.csv.gz` (already present at `data/raw/taxa.csv.gz`) on `taxon_id`, filtering for `active = false`. At research time, 0 inactive IDs exist in the bridge table (all 736 entries are active per the 2026-05-28 taxa.csv.gz). The count (0 or N) is output as a printed summary and/or committed note to scope Phase 127 work.

**Primary recommendation:** All three tasks are independent and can be implemented as a single wave. No new tests are required for PWK-01 or PWK-03. PWK-02 requires a test update to `test_resolve_taxon_ids.py` (the `resolver_db` fixture seeds only checklist and ecdysis schemas — the new branch needs an `inat_obs_data.observations` table to be present in the fixture).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWK-01 | `test_dbt_diff.py` docstring updated to reflect actual 36-column `occurrences` contract (not stale "30 cols") | Contract verified: schema.yml has exactly 36 columns; test docstring at line 54 says "30 cols" |
| PWK-02 | `resolve_taxon_ids.py` extended to cover iNat ARM 3 canonical names not yet in `canonical_to_taxon_id`; count of newly-resolved names documented | Gap confirmed: 56 inat_obs names absent from bridge table; `_names_to_resolve()` SQL must add `inat_obs_data.observations` UNION branch |
| PWK-03 | Inactive taxon IDs in current `canonical_to_taxon_id` enumerated and count documented to scope Phase 128 work | taxa.csv.gz available at `data/raw/taxa.csv.gz`; `active` column is BOOLEAN; 0 inactive at research time |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Docstring accuracy in test file | Python test layer | — | Test file is the only artifact; no runtime impact |
| Bridge table coverage (canonical name → taxon_id) | Python pipeline (resolve_taxon_ids.py) | — | Ingestion step owns the iNat API calls and bridge writes |
| Inactive taxon enumeration | Python pipeline (query against DuckDB + taxa.csv.gz) | — | Both data sources (bridge + taxa archive) are in the pipeline layer |

## Standard Stack

### Core

No new packages. All work uses existing infrastructure.

| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.14+ | resolve_taxon_ids.py modification |
| DuckDB | existing (data/pyproject.toml) | Bridge table and taxa.csv.gz queries |
| pytest | existing | Test fixture extension for PWK-02 |

[VERIFIED: data/pyproject.toml — all tools already present]

## Package Legitimacy Audit

No external packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
PWK-01: test_dbt_diff.py
    test_occurrences_schema_matches()
    docstring: "30 cols" → "36 cols"

PWK-02: resolve_taxon_ids._names_to_resolve() SQL
    Current UNION:
        checklist_data.species.canonical_name
        ecdysis_data.occurrences.canonical_name
    Extended UNION (add):
        inat_obs_data.observations.canonical_name
    → feeds into iNat /v1/taxa API resolution → inaturalist_data.canonical_to_taxon_id

PWK-03: inactive taxon enumeration (script or inline query)
    inaturalist_data.canonical_to_taxon_id (736 rows, all non-null taxon_id)
    LEFT JOIN read_csv('data/raw/taxa.csv.gz')  (active BOOLEAN column)
    WHERE active = false
    → count printed/documented
```

### Recommended Project Structure

No structural changes. All modifications are within existing files:

```
data/
├── resolve_taxon_ids.py          # extend _names_to_resolve() SQL (PWK-02)
└── tests/
    ├── test_dbt_diff.py          # update docstring (PWK-01)
    └── test_resolve_taxon_ids.py # extend resolver_db fixture + new test (PWK-02)
```

### Pattern 1: Extending _names_to_resolve() SQL

**What:** Add a third UNION branch for `inat_obs_data.observations.canonical_name`.

**Exact change to `_names_to_resolve()` in resolve_taxon_ids.py:**

```python
# Source: direct inspection of data/resolve_taxon_ids.py
sql = """
    WITH u AS (
        SELECT DISTINCT canonical_name FROM checklist_data.species
        WHERE canonical_name IS NOT NULL
        UNION
        SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
        WHERE canonical_name IS NOT NULL
        UNION
        SELECT DISTINCT canonical_name FROM inat_obs_data.observations
        WHERE canonical_name IS NOT NULL
    )
    SELECT u.canonical_name
    FROM u
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
    WHERE b.canonical_name IS NULL
    ORDER BY u.canonical_name
"""
```

[VERIFIED: data/resolve_taxon_ids.py — existing SQL structure confirmed; DuckDB UNION (dedup) is the correct operator since duplicate names across sources should be resolved only once]

### Pattern 2: PWK-03 Inactive Taxon Query

**What:** Query `inaturalist_data.canonical_to_taxon_id` LEFT JOIN `taxa.csv.gz` to find inactive IDs.

```python
# Source: data/taxa_pipeline.py (active column is BOOLEAN when auto-inferred)
# Source: direct DuckDB inspection confirming active = False is BOOLEAN

import duckdb
con = duckdb.connect(DB_PATH)
results = con.execute("""
    SELECT b.canonical_name, b.taxon_id, t.name AS inat_name, t.active
    FROM inaturalist_data.canonical_to_taxon_id b
    LEFT JOIN read_csv('raw/taxa.csv.gz', header=True) t
        ON CAST(t.taxon_id AS INTEGER) = b.taxon_id
    WHERE t.active = false
    ORDER BY b.canonical_name
""").fetchall()
print(f"Inactive taxon IDs in bridge: {len(results)}")
```

**Important:** `taxa_pipeline.py` uses `active = 'true'` (string comparison) because it passes `column_types={'active':'VARCHAR'}` explicitly. Without that override, DuckDB auto-infers `active` as BOOLEAN. For the enumeration query, use `active = false` (BOOLEAN) or cast explicitly to be safe — verify against the DuckDB result. [VERIFIED: direct DuckDB inspection shows BOOLEAN auto-inference for read_csv without column_types override]

### Pattern 3: PWK-01 Docstring Fix

**Exact location:** `data/tests/test_dbt_diff.py` line 54, function `test_occurrences_schema_matches`.

**Current text:** `"Column names AND types from DESCRIBE match exactly between sandbox and public (30 cols)."`
and `"Verified baseline: 30 columns with identical names and types in both files."`

**Target text:** Replace both `30 cols` / `30 columns` references with `36 cols` / `36 columns`.

[VERIFIED: test_dbt_diff.py line 54–57; schema.yml confirmed 36-column occurrences contract]

### The 36 Columns in occurrences Contract

For reference (from `data/dbt/models/marts/schema.yml`, all 36 verified):

```
ecdysis_id, catalog_number, lon, lat, date, year, month,
scientificName, recordedBy, fieldNumber, genus, family,
floralHost, host_observation_id, inat_host, inat_quality_grade,
modified, specimen_observation_id, elevation_m, observation_id,
host_inat_login, specimen_count, sample_id, sample_host,
specimen_inat_taxon_name, specimen_inat_quality_grade, is_provisional,
canonical_name, county, ecoregion_l3, place_slug, source,
image_url, obs_url, user_login, license
```

[VERIFIED: data/dbt/models/marts/schema.yml — 36 entries counted via Python script]

### Anti-Patterns to Avoid

- **Using `active = 'true'` in the PWK-03 query:** `taxa_pipeline.py` explicitly passes `column_types={'active':'VARCHAR'}` so it needs string comparison. The ad-hoc enumeration query without that override auto-infers BOOLEAN. Use `active = false` (BOOLEAN) in the ad-hoc query.
- **Adding `inat_obs_data.observations` to the bridge using UNION ALL instead of UNION:** The existing SQL uses `UNION` (dedup). Using `UNION ALL` would produce duplicate canonical names if they appear in multiple sources, causing redundant iNat API calls. Keep `UNION`.
- **Updating `_names_to_resolve` docstring without updating the module docstring:** The module-level docstring says `Source SQL: FULL OUTER union of checklist + ecdysis canonical_name LEFT JOIN bridge.` Update this to mention inat_obs as the third source.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Checking which taxon IDs are inactive | iNat API calls for each of 736 IDs | LEFT JOIN taxa.csv.gz (already downloaded) | taxa.csv.gz is the offline source with active column; already present at data/raw/ |
| Cross-referencing bridge against taxa offline archive | New download step | Read existing `data/raw/taxa.csv.gz` directly via DuckDB read_csv | File exists; ETag-cached download happens in taxa-download pipeline step |

**Key insight:** taxa.csv.gz is already present from Phase 110 and refreshed nightly. It is the authoritative offline source for taxon activity status — no iNat API calls needed for PWK-03.

## Current State (Measured at Research Time)

All numbers from direct DuckDB query against `data/beeatlas.duckdb` (2026-05-29):

| Metric | Value |
|--------|-------|
| `canonical_to_taxon_id` total rows | 736 |
| `canonical_to_taxon_id` rows with non-null `taxon_id` | 736 |
| `inat_obs_data.observations` distinct `canonical_name` | 298 |
| inat_obs names already in bridge table | 242 |
| inat_obs names NOT in bridge table (ARM 3 gap) | **56** |
| Inactive taxon IDs in bridge (per taxa.csv.gz 2026-05-28) | **0** |
| `lineage_unresolved.csv` rows | 0 |

The 56 missing ARM 3 names break down as:
- 42 single-token (genus/subgenus names like `psithyrus`, `dialictus`, `pyrobombus`)
- 14 two-token species names (like `bombus californicus`, `andrena helianthi`)

[VERIFIED: direct DuckDB queries on data/beeatlas.duckdb]

## Common Pitfalls

### Pitfall 1: resolver_db Fixture Missing inat_obs Schema

**What goes wrong:** The existing `resolver_db` pytest fixture in `test_resolve_taxon_ids.py` creates `checklist_data.species` and `ecdysis_data.occurrences` tables, but NOT `inat_obs_data.observations`. After adding the third UNION branch, `_names_to_resolve()` will fail in tests because `inat_obs_data.observations` doesn't exist in the test DB.

**How to avoid:** Add to the `resolver_db` fixture:
```python
con.execute("CREATE SCHEMA inat_obs_data")
con.execute("CREATE TABLE inat_obs_data.observations (canonical_name TEXT)")
```

**Warning signs:** `CatalogError: Table with name observations does not exist` in tests.

### Pitfall 2: PWK-03 Active Column Type Mismatch

**What goes wrong:** `taxa_pipeline.load_taxon_lineage_extended()` uses `read_csv(..., column_types={..., 'active':'VARCHAR'})` and compares with `active = 'true'`. An ad-hoc query WITHOUT the `column_types` override will auto-infer `active` as BOOLEAN. Mixing string and boolean comparisons will silently return wrong results or error.

**How to avoid:** Either use `active = false` (BOOLEAN) in the enumeration query, or explicitly pass `column_types={'active':'VARCHAR'}` and use `active = 'false'`. The simpler path is to rely on auto-inference (BOOLEAN) and use `active = false`.

[VERIFIED: direct DuckDB inspection — `read_csv('taxa.csv.gz', header=True)` auto-infers `active` as BOOLEAN]

### Pitfall 3: `_names_to_resolve` Docstring Staleness

**What goes wrong:** The module-level docstring of `resolve_taxon_ids.py` says `Source SQL: FULL OUTER union of checklist + ecdysis canonical_name LEFT JOIN bridge.` This is now incorrect after adding inat_obs. A future developer relying on the docstring to understand the union scope will miss the third source.

**How to avoid:** Update both the module docstring AND the inline comment in `_names_to_resolve()`.

### Pitfall 4: inat_obs Canonical Names Include Subgenus-Level Names

**What goes wrong:** The 42 single-token missing names include subgenus names (`dialictus`, `evylaeus`, `seladonia`) that are iNat subgenera. The existing rank-ladder logic for 1-token names queries without rank constraint and records whatever rank iNat returns (`source = 'inat_genus'`, `'inat_subgenus'`, etc.). This is correct behavior — no change needed. But `_pick_match` may return ambiguous results for common subgenus names that also appear as genus names in other insect orders.

**How to avoid:** The existing `_pick_match` filter ladder already handles this: `iconic_taxon_name == 'Insecta'` is step 3 in the filter. Names in other orders are excluded before uniqueness check. No change needed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest |
| Config file | `data/pyproject.toml` |
| Quick run command | `cd data && uv run pytest tests/test_dbt_diff.py tests/test_resolve_taxon_ids.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWK-01 | Docstring in `test_occurrences_schema_matches` says 36 cols | inline docstring | N/A (docstring only; test logic unchanged) | ✅ (test exists; docstring edit only) |
| PWK-02 | `_names_to_resolve()` includes inat_obs canonical names in union | unit | `cd data && uv run pytest tests/test_resolve_taxon_ids.py -x` | ✅ (test file exists; new fixture + test needed) |
| PWK-03 | Inactive taxon ID count printed/documented | manual verification | `cd data && uv run python resolve_taxon_ids.py --enumerate-inactive` OR inline query | ❌ Wave 0 — no existing test; enumeration is documentary |

### Wave 0 Gaps

- [ ] Add `inat_obs_data.observations` table to `resolver_db` fixture in `data/tests/test_resolve_taxon_ids.py`
- [ ] Add one test asserting that inat_obs canonical names appear in the names-to-resolve set when the bridge is empty (mirrors `test_names_to_resolve_unions_both_sources`)

*(Existing test infrastructure covers PWK-01 with no new tests needed. PWK-03 count is documentary output, not a pytest assertion.)*

## Security Domain

Phase 124 is a data pipeline cleanup. No authentication, session management, access control, cryptography, or user input validation is involved. Security domain is not applicable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB (Python) | All three tasks | ✓ | existing in pyproject.toml | — |
| `data/raw/taxa.csv.gz` | PWK-03 inactive enumeration | ✓ | Downloaded 2026-05-28 | Re-run `python taxa_pipeline.py` |
| `data/beeatlas.duckdb` | PWK-02 gap measurement, PWK-03 | ✓ | Present at `data/beeatlas.duckdb` | — |
| pytest | PWK-02 test extension | ✓ | existing | — |

**Missing dependencies with no fallback:** none

## State of the Art

| Old State | Current State After Phase 124 | Impact |
|-----------|-------------------------------|--------|
| `test_occurrences_schema_matches` claims 30 cols | Claims 36 cols (matches contract) | Docstring accuracy; no runtime impact |
| `_names_to_resolve` covers 2 sources (checklist, ecdysis) | Covers 3 sources (+ inat_obs) | 56 new names eligible for API resolution; Phase 126 taxon_id completeness depends on this |
| Inactive taxon ID count: unknown | Count documented at 0 (as of 2026-05-28) | Scopes Phase 127 ITR work; count may differ after nightly taxa refresh |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `inat_obs_data.observations` is always populated before `resolve_taxon_ids` runs (per STEPS order in run.py) | Architecture | If inat-obs step runs AFTER resolve-taxon-ids, the new branch would find 0 names; inspect STEPS order to confirm | 

**Note on A1:** STEPS order in `run.py` places `inat-obs` (step 13) BEFORE `resolve-taxon-ids` (step 8) — wait, actually `resolve-taxon-ids` is step 8 and `inat-obs` is step 13. This means on a FULL pipeline run, `resolve_taxon_ids` runs BEFORE `inat-obs` loads. The new UNION branch would query an empty or stale `inat_obs_data.observations`. **This is a real ordering issue that must be resolved in planning.**

[VERIFIED: data/run.py STEPS list — `resolve-taxon-ids` is at index 7, `inat-obs` is at index 12]

## Open Questions

1. **STEPS ordering: resolve-taxon-ids runs BEFORE inat-obs**
   - What we know: In `run.py`, `resolve-taxon-ids` (step 8) precedes `inat-obs` (step 13). Adding `inat_obs_data.observations` to the union in `_names_to_resolve()` will find those names only when `inat_obs_data.observations` is already populated — from the PREVIOUS nightly run. On first run from a fresh DB, no inat_obs names will be found.
   - What's unclear: Whether this is acceptable (inat_obs names are resolved on the *second* nightly run after a fresh DB setup), or whether the inat-obs step should move earlier in STEPS.
   - Recommendation: For Phase 124 scope, the simplest fix is to move `inat-obs` in STEPS to run immediately before `resolve-taxon-ids`. Alternatively, accept the one-nightly-lag for a fresh-DB scenario. The planner should decide the ordering change scope.

## Sources

### Primary (HIGH confidence)

- `data/resolve_taxon_ids.py` — confirmed `_names_to_resolve()` SQL structure; 3-source extension pattern
- `data/tests/test_resolve_taxon_ids.py` — confirmed `resolver_db` fixture scope; missing inat_obs schema
- `data/tests/test_dbt_diff.py` — confirmed stale "30 cols" docstring at line 54
- `data/dbt/models/marts/schema.yml` — verified 36-column occurrences contract
- `data/raw/taxa.csv.gz` — confirmed `active` BOOLEAN column; all 736 bridge IDs active
- `data/run.py` STEPS list — confirmed step ordering issue
- Direct DuckDB queries on `data/beeatlas.duckdb` — all gap measurements verified

### Secondary (MEDIUM confidence)

- iNat Open Data S3 taxa.csv.gz `active` column semantics: known inactive taxa are absent from the downstream `taxon_lineage_extended` table (which filters `active = 'true'`), confirming the column is the authoritative activity flag.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing tooling confirmed from source
- Architecture: HIGH — all three tasks derived from direct source inspection with numeric verification
- Pitfalls: HIGH — confirmed via test fixture inspection and DuckDB type inference verification

**Research date:** 2026-05-29
**Valid until:** 2026-08-01 (stable domain; DuckDB CSV type inference is well-established)
