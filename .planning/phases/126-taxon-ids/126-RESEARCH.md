# Phase 126: Taxon IDs - Research

**Researched:** 2026-05-31
**Domain:** dbt intermediate/mart SQL, Python export pipeline, Eleventy frontend data cascade
**Confidence:** HIGH (all critical questions answered from live codebase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `taxon_id` declared `NOT NULL` in dbt contract on BOTH marts. Build hard-fails on any unresolved row.
- **D-02:** Pre-build resolution gate: verify every name in the resolution union resolves before dbt build. Unresolved names written to `data/lineage_unresolved.csv`; step exits non-zero with actionable message.
- **D-03:** `occurrences.taxon_id` is the species-rollup taxon — `taxon_id` of the species the occurrence rolls up to via its (synonymized) `canonical_name`. Guarantees `occurrences.taxon_id == species.taxon_id` for the same species.
- **D-04:** WABA arm (`source = waba_sample`, 37 rows) must derive a `canonical_name` from its taxon name and resolve through the SAME bridge — NOT use `waba.taxon__id` directly.
- **D-05:** Link label verbatim: **"View on iNaturalist →"**, sibling action to existing "View N records on the atlas →" in `_pages/species-detail.njk`.
- **D-06:** Scope expanded: link added to genus, subgenus, and tribe pages too, using each rank's self-row `taxon_id` from `taxon_lineage_extended`.
- **D-07:** Adding `taxon_id` bumps enforced column counts. (Corrected below from CONTEXT.md: actual pre-phase counts are species=20 SQL cols, occurrences=36.)
- **D-08:** CLAUDE.md "30-column contract" note is stale. Correct to 37 (occurrences post-phase) as doc hygiene.

### Claude's Discretion
- Exact placement of `taxon_id` column within each mart's SELECT/schema.
- Whether the pre-build gate (D-02) lives inside `resolve_taxon_ids.py`, `run.py`, or a dedicated dbt pre-hook.
- `taxon_id` column type is `INTEGER` (iNat IDs are well within INT32); `taxon_lineage_extended` stores BIGINT internally — a cast is needed at the mart boundary.

### Deferred Ideas (OUT OF SCOPE)
None — all scope is locked or discretion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TID-01 | `species.parquet` includes a non-null `taxon_id INTEGER` column for every species row | `int_species_universe` already has `ctt.taxon_id` in scope (LEFT JOIN exists); add to SELECT and schema.yml |
| TID-02 | `occurrences.parquet` includes a non-null `taxon_id INTEGER` column for every occurrence row | Requires new bridge JOIN in `int_combined` on post-synonymy `canonical_name`; WABA derivation needed |
| TID-03 | Species pages link to `https://www.inaturalist.org/taxa/{taxon_id}` | Add link in `species-detail.njk`; `taxon_id` must flow through `species_export.py` → `species.json` → `_data/species.js` |
</phase_requirements>

---

## Summary

Phase 126 threads an already-resolved `taxon_id` through six layers: two dbt intermediate models → two mart SQL files → dbt contract schema → Python export → JSON data file → four Eleventy page templates. No new resolution machinery is needed; the bridge `canonical_to_taxon_id` has 0 currently unresolved entries.

The three critical research questions (RD-01 synonymy consistency, RD-02 higher-rank self-row availability, RD-03 WABA derivation feasibility) have been resolved with definitive verdicts. One finding surfaces a structural risk not explicitly addressed in CONTEXT.md: the `resolve_taxon_ids.py` union queries RAW (pre-synonymy) source names; the mart joins on POST-synonymy names. The two sides are currently consistent only because `agapostemon subtilior` (the accepted name) happens to appear in `inat_expert_obs.csv`. A new synonym where the accepted name has no iNat expert obs would produce a NULL taxon_id that the D-01 contract would reject.

A second finding: 4 of 37 WABA provisional rows carry non-bee taxa (`Cicindela pugetana` ×2, `Cleridae` ×1, `Encopognathus` ×1). These will not resolve through the bridge (which covers only Anthophila). The pre-build gate must handle this explicitly — either filtering them out or documenting them as expected non-resolvable rows.

**Primary recommendation:** Implement in two plans: (1) dbt + Python data layer (int_combined WABA derivation, int_species_universe SELECT, both mart SQLs, schema.yml, species_export.py, higher-rank taxon_id export); (2) frontend layer (species-detail.njk, genus/subgenus/tribe.njk, _data/species.js).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| taxon_id resolution (already built) | Database / Storage | — | `canonical_to_taxon_id` bridge in DuckDB; Python iNat API calls |
| taxon_id surfacing in species mart | Database / Storage | — | dbt `int_species_universe` + `species.sql` |
| taxon_id surfacing in occurrences mart | Database / Storage | — | dbt `int_combined` + `occurrences.sql`; WABA canonical_name derivation |
| Pre-build resolution gate (D-02) | Database / Storage | — | Python step in `run.py` STEPS, between `resolve-taxon-ids` and `dbt-build` |
| Higher-rank taxon_ids export (D-06) | Database / Storage | — | `species_export.py` reads `taxa.csv.gz` to build lookup by (name, rank) |
| Species page iNat link | Frontend Server (SSR) | — | Eleventy `_pages/species-detail.njk`; `taxon_id` from `species.js` |
| Genus/subgenus/tribe iNat links | Frontend Server (SSR) | — | Eleventy `_pages/{genus,subgenus,tribe}.njk`; higher-rank taxon_id lookup from supplementary export |
| Contract enforcement | Database / Storage | — | `schema.yml` `contract.enforced: true`; dbt build fails if column is absent or nullable |

---

## Critical Research Question Verdicts

### RD-01 (Synonymy / Join Consistency) — FEASIBLE WITH STRUCTURAL CAVEAT

**Verdict: FEASIBLE in the current state; structural risk requires explicit fix.**

**Evidence:**

`resolve_taxon_ids.py` lines 59–73 read **RAW** (pre-synonymy) canonical names from three sources:
- `checklist_data.species` — raw names, e.g. `agapostemon texanus`
- `ecdysis_data.occurrences` — raw names, e.g. `agapostemon texanus`
- `inat_obs_data.observations` — names from the iNat expert CSV export

`stg_checklist__species.sql` applies `occurrence_synonyms` to checklist names, outputting `canonical_name = 'agapostemon subtilior'` (accepted name). `int_combined` ARM 1 does `COALESCE(syn_e.accepted_name, e.canonical_name)` (line 43) and ARM 3 does the same (line 136). Both marts' join key is therefore the **post-synonymy** `canonical_name`.

The bridge `canonical_to_taxon_id` must have an entry keyed `agapostemon subtilior`. It does — because `inat_expert_obs.csv` contains `Agapostemon subtilior` (iNat uses the current accepted name in CSV exports), so the `inat_obs_data.observations` union arm supplies it to the bridge.

**The structural risk:** If a future synonym's `accepted_name` has NO iNat expert obs, that name would be absent from the bridge union, causing a NULL taxon_id in both marts. The D-01 NOT NULL contract would then hard-fail the dbt build.

**Required fix:** The `resolve_taxon_ids.py` union (or the pre-build gate) must **also** include `occurrence_synonyms.accepted_name` in the set of names it verifies against the bridge. Specifically, after Phase 123 moved `occurrence_synonyms.csv` to `data/dbt/seeds/`, the gate should check:

```python
# In addition to the three existing source tables, also verify:
SELECT DISTINCT accepted_name FROM main.occurrence_synonyms  -- dbt seeds table
```

or equivalently read `data/dbt/seeds/occurrence_synonyms.csv` directly and include accepted names in the verification loop.

**Current state:** 0 unresolved, gate is safe today. Fix is forward-looking but needed before Phase 127 adds more synonyms.

### RD-02 (Higher-Rank Self-Row Availability) — CONFIRMED FEASIBLE

**Verdict: CONFIRMED FEASIBLE for all four ranks (genus, subgenus, tribe, subfamily).**

**Evidence:**

`taxa_pipeline.py` lines 142–151:
```python
self_rows AS (
    SELECT taxon_id AS target_taxon_id, rank, name
    FROM all_active_bees
    WHERE rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus')
),
```

This explicitly includes subgenus and tribe ranks in `self_rows`. Verified with live data from `taxa.csv.gz`:

| Taxon | Rank | taxon_id |
|-------|------|----------|
| Bombus | genus | 52775 |
| Bombus | subgenus | 538903 |
| Bombini | tribe | 538883 |
| Halictini | tribe | 335597 |

The `stg_inat__taxon_lineage_extended` view passes through all rows from `inaturalist_data.taxon_lineage_extended`. Self-rows for genus/subgenus/tribe taxa ARE present.

**Complication for D-06:** `taxon_lineage_extended` does NOT retain the `rank` column after the pivot. A genus self-row `(taxon_id=52775, genus='Bombus', subgenus=NULL)` is indistinguishable from a species row with no subgenus using `taxon_lineage_extended` alone. To extract genus/tribe/subgenus taxon_ids, `species_export.py` must query `taxa.csv.gz` directly:
```python
SELECT taxon_id, name, rank
FROM read_csv('data/raw/taxa.csv.gz', ...)
WHERE name = ? AND rank IN ('genus', 'subgenus', 'tribe') AND active = 'true'
```
This is the correct data source. The planner should add a step to `species_export.py` that builds a `higher_rank_taxon_ids.json` lookup (or equivalent in-memory dict passed to `_data/species.js`) keyed by rank+name.

### RD-03 (WABA Derivation Feasibility) — FEASIBLE WITH CAVEAT (4 non-bee rows block gate)

**Verdict: FEASIBLE for 33 of 37 WABA rows. 4 rows carry non-bee taxa and CANNOT resolve through the bridge.**

**Evidence from `data/dbt/target/sandbox/occurrences.parquet`:**

```
All 37 waba_sample rows have canonical_name = NULL (confirmed).
```

`int_specimen_obs_base.sql` line 7: `waba.taxon__name AS specimen_inat_taxon_name`. This field IS populated for all 37 rows. Actual values:

| specimen_inat_taxon_name | Count | Bee? |
|--------------------------|-------|------|
| Melissodes | 6 | YES (genus-only) |
| Melissodes bimatris | 3 | YES |
| Megachile nevadensis | 3 | YES |
| Anthophora urbana | 3 | YES |
| Megachile onobrychidis | 3 | YES |
| Anthophora pacifica | 2 | YES |
| **Cicindela pugetana** | **2** | **NO — tiger beetle** |
| Perdita oregonensis | 2 | YES |
| Coelioxys grindeliae | 2 | YES |
| Andrena | 1 | YES (genus-only) |
| Osmia | 1 | YES (genus-only) |
| Anthophora crotchii | 1 | YES |
| Megachile | 1 | YES (genus-only) |
| Melissodes semilupinus | 1 | YES |
| Megachile perihirta | 1 | YES |
| Agapostemon femoratus | 1 | YES |
| **Cleridae** | **1** | **NO — beetle family** |
| **Encopognathus** | **1** | **NO — ichneumon wasp** |
| Epimelissodes obliquus | 1 | YES |
| Xylocopa virginica | 1 | YES |

**Verified in `taxa.csv.gz`:** Cicindela pugetana (216942), Cleridae (55051), and Encopognathus (574323) have NO 630955 (Anthophila) in their ancestry path. They cannot be resolved through the `canonical_to_taxon_id` bridge, which covers only Anthophila taxa.

**Derivation approach for bee rows:** `normalize_scientific_name` in `canonical_name.py` (lines 73–104) primarily does: strip authority, strip subgenus parens, fold to binomial, lowercase. For clean iNat taxon names (which iNat outputs as undecorated binomials), this reduces to `lower(trim(first_two_tokens))`. A DuckDB SQL approximation is safe:
```sql
lower(trim(
    CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
         THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1) || ' '
              || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
         ELSE trim(sob.specimen_inat_taxon_name)
    END
))
```

**The 4 non-bee rows require explicit handling.** Options for the planner:
1. **Preferred:** Derive `canonical_name` for ALL WABA rows; the pre-build gate excludes rows where the derived `canonical_name` appears in a "known non-bee" list (seed CSV or family-based check).
2. Only derive `canonical_name` where the taxon is Anthophila (join `taxon_lineage_extended` on `waba.taxon__id` to check ancestry — but this uses `taxon__id` directly, violating D-04 spirit).
3. **Simplest:** Derive for all WABA rows. For the gate: non-bee taxon names will fail resolution (absent from bridge); these 4 rows should be listed as acceptable "out-of-scope" entries. The gate should skip names that fail because they are non-bee (use an allowlist or check the taxa.csv.gz family filter).

Recommendation: In `int_combined` ARM 2, derive `canonical_name` using the SQL approximation above. The pre-build gate allows names that fail resolution only if they come from non-Anthophila WABA rows (verifiable via `waba.taxon__id` cross-ref with `taxon_lineage_extended`). Alternatively, the gate can write them to `lineage_unresolved.csv` but NOT treat them as blocking failures, since these represent misidentified specimens already in the dataset.

---

## Standard Stack

No new packages. All work is in existing stack:

| Component | Version | Purpose |
|-----------|---------|---------|
| dbt-duckdb | existing | Mart SQL transforms |
| DuckDB | existing | Query engine |
| pytest | 9.0.3 | Test assertions |
| pyarrow | existing | Parquet schema in species_export.py |
| Eleventy | existing | Static site templates |

**Installation:** None required.

---

## Package Legitimacy Audit

Not applicable — no new packages installed in this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
resolve_taxon_ids.py
  └─ bridge: canonical_to_taxon_id (PK: canonical_name)
       │
       ├─ int_species_universe.sql (LEFT JOIN already wired on ctt.taxon_id)
       │    └─ species.sql (ADD ctt.taxon_id::INTEGER to SELECT)
       │         └─ species_export.py (ADD taxon_id to SPECIES_COLUMNS + pyarrow schema)
       │              └─ species.json (taxon_id per species row)
       │                   └─ _data/species.js (taxon_id in speciesList → species-detail.njk)
       │
       ├─ int_combined.sql (ADD bridge JOIN on post-synonymy canonical_name)
       │    ├─ ARM 1/3: JOIN ctt ON ctt.canonical_name = COALESCE(syn.accepted_name, raw_name)
       │    └─ ARM 2 WABA: DERIVE canonical_name from sob.specimen_inat_taxon_name, THEN JOIN
       │         └─ occurrences.sql (ADD taxon_id to SELECT)
       │
taxa.csv.gz ──────────────────────────────────────────────────────────────────────────────
       └─ species_export.py (new step: build higher_rank_taxon_ids lookup by name+rank)
            └─ higher_rank_taxon_ids.json (or in-memory dict passed to _data/species.js)
                 └─ genusList[x].taxon_id, subgenusList[x].taxon_id, tribeList[x].taxon_id
                      └─ genus.njk / subgenus.njk / tribe.njk iNat links

schema.yml ─ NOT NULL contract on both marts (D-01)
run.py STEPS ─ new "resolution-gate" step between "resolve-taxon-ids" and "dbt-build"
```

### Project Structure (files modified)

```
data/
├── run.py                              # Add "resolution-gate" step
├── resolve_taxon_ids.py                # Extend union to include occurrence_synonyms.accepted_name
├── species_export.py                   # Add taxon_id to SPECIES_COLUMNS + pyarrow schema
│                                       # Add higher-rank taxon_id lookup step (taxa.csv.gz)
├── dbt/seeds/occurrence_synonyms.csv   # Read-only reference
├── dbt/models/
│   ├── intermediate/
│   │   ├── int_species_universe.sql    # Add ctt.taxon_id::INTEGER to final SELECT
│   │   └── int_combined.sql            # Add bridge JOIN (ARMs 1+3); WABA derivation (ARM 2)
│   ├── marts/
│   │   ├── species.sql                 # Add taxon_id column to SELECT
│   │   ├── occurrences.sql             # Add taxon_id column to final SELECT
│   │   └── schema.yml                  # Add taxon_id NOT NULL to both marts
│   └── staging/
│       └── stg_inat__canonical_to_taxon_id.sql   # Already correct, no change needed
└── tests/
    └── test_dbt_scaffold.py            # New TID-01/TID-02 non-null assertions (under _SPECIES_GUARD)
_pages/
├── species-detail.njk                  # Add "View on iNaturalist →" link (D-05)
├── genus.njk                           # Add genus taxon_id iNat link (D-06)
├── subgenus.njk                        # Add subgenus taxon_id iNat link (D-06)
└── tribe.njk                           # Add tribe taxon_id iNat link (D-06)
_data/
└── species.js                          # Pass taxon_id to speciesList; add taxon_id to genusList/subgenusList/tribeList
CLAUDE.md                               # Update "30-column contract" note to 37 (D-08)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| canonical_name → taxon_id resolution | Custom API integration | Existing `canonical_to_taxon_id` bridge | Already built, 0 unresolved, tested |
| Genus/tribe taxon_id lookup | Separate API calls | Query `taxa.csv.gz` directly in `species_export.py` | Already downloaded nightly; `duckdb.execute` reads gzip directly |
| SQL canonical name normalization | Complex regex macro | `lower(trim(split_part(...)))` for clean iNat names | iNat API outputs clean binomials; full Python normalize only needed at ingestion |
| Non-null enforcement | Python assertions | dbt `NOT NULL` constraint in `schema.yml` | Contract enforcement at build time is the project pattern |

---

## Concrete Implementation Details

### int_species_universe.sql — one-line change

The bridge JOIN already exists (line 130–131). Add `ctt.taxon_id::INTEGER` to the `species_universe` CTE SELECT:

```sql
-- In species_universe CTE SELECT, after inat_obs_count:
ctt.taxon_id::INTEGER AS taxon_id
```

And in the final `SELECT DISTINCT ON (canonical_name) *` — no change needed, `*` picks it up.

### int_combined.sql — two changes

**ARMs 1 and 3 (ecdysis and inat_obs):** Add a LEFT JOIN to the bridge and SELECT `ctt.taxon_id::INTEGER`:

```sql
-- In ARM 1 FROM clause (after existing LEFT JOIN occurrence_synonyms):
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn_e.accepted_name, e.canonical_name)

-- In ARM 1 SELECT, add:
ctt.taxon_id::INTEGER   AS taxon_id
```

Similarly for ARM 3:
```sql
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn_io.accepted_name, io.canonical_name)
-- SELECT: ctt.taxon_id::INTEGER AS taxon_id
```

**ARM 2 (WABA):** Derive `canonical_name` and JOIN bridge:

```sql
-- In ARM 2 FROM clause:
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt_w
    ON ctt_w.canonical_name = lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))

-- In ARM 2 SELECT:
-- canonical_name: change NULL to derived value:
lower(trim(
    CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
         THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
              || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
         ELSE trim(sob.specimen_inat_taxon_name)
    END
))::VARCHAR                             AS canonical_name,
ctt_w.taxon_id::INTEGER                 AS taxon_id,
```

### schema.yml — add to both marts

```yaml
# In occurrences mart (after license column):
- name: taxon_id
  data_type: integer
  constraints:
    - type: not_null

# In species mart (after inat_obs_count column):
- name: taxon_id
  data_type: integer
  constraints:
    - type: not_null
```

### Pre-build resolution gate (D-02)

Add a new `run.py` STEPS entry between `resolve-taxon-ids` and `dbt-build`:

```python
("resolution-gate", check_resolution_gate),
```

`check_resolution_gate` reads `data/lineage_unresolved.csv`, checks if any non-empty rows exist (excluding known non-bee WABA rows), and raises `SystemExit(1)` with an actionable message if unresolved bees are found. The gate should also verify that all `occurrence_synonyms.accepted_name` values are present in the bridge:

```python
def check_resolution_gate() -> None:
    """Fail fast if any bee canonical_name is unresolved before dbt build."""
    import csv, sys
    from pathlib import Path
    
    csv_path = Path(__file__).parent / "lineage_unresolved.csv"
    rows = list(csv.DictReader(csv_path.open(newline="")))
    # Filter out known non-bee WABA misidentifications (expected failures)
    KNOWN_NON_BEES = {"cicindela pugetana", "cleridae", "encopognathus"}
    blocking = [r for r in rows if r["canonical_name"] not in KNOWN_NON_BEES]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking)
        sys.exit(f"resolution-gate: {len(blocking)} bee name(s) unresolved "
                 f"before dbt build. Fix with: uv run python resolve_taxon_ids.py "
                 f"--refresh-lineage\nOffenders: {names}")
    print(f"resolution-gate: OK ({len(rows)} known non-bee rows excluded)")
```

### species_export.py — taxon_id column

Add `taxon_id` to `SPECIES_COLUMNS` (between `inat_obs_count` and `slug`):

```python
SPECIES_COLUMNS = [
    ..., 'inat_obs_count', 'taxon_id', 'slug',
]
```

Add to pyarrow schema:
```python
('taxon_id', pa.int32()),
```

### Higher-rank taxon_id export for D-06

Add a step in `species_export.py` that queries `taxa.csv.gz` to build a lookup dict:

```python
def _build_higher_rank_taxon_ids(con, taxa_csv_path: str) -> dict:
    """Query taxa.csv.gz for genus/subgenus/tribe taxon_ids by name."""
    rows = con.execute(
        "SELECT name, rank, taxon_id "
        "FROM read_csv(?, delim=chr(9), header=true, compression='gzip', "
        "             columns={'taxon_id':'BIGINT','ancestry':'VARCHAR',"
        "                      'rank_level':'INTEGER','rank':'VARCHAR',"
        "                      'name':'VARCHAR','active':'VARCHAR'}) "
        "WHERE rank IN ('genus', 'subgenus', 'tribe') AND active = 'true'",
        [taxa_csv_path]
    ).fetchall()
    result = {"genus": {}, "subgenus": {}, "tribe": {}}
    for name, rank, tid in rows:
        if rank in result:
            # For subgenus: key as "Genus::Subgenus" to disambiguate (e.g. Bombus::Bombus)
            result[rank][name] = int(tid)
    return result
```

This dict (or a JSON export `higher_rank_taxon_ids.json`) is consumed by `_data/species.js` to add `taxon_id` to each `genusList`, `subgenusList`, and `tribeList` entry.

**Note on subgenus disambiguation:** When genus name == subgenus name (e.g. Bombus subgenus Bombus), the subgenus key `"Bombus"` in `taxa.csv.gz` returns two rows (genus rank 52775, subgenus rank 538903). The `_data/species.js` lookup for subgenus pages must use the subgenus-rank taxon_id, not the genus-rank one. If taxa.csv.gz has multiple active rows for the same name at subgenus rank, `first()` will pick one — verify the priority policy.

---

## Contract Column Count Corrections

The CONTEXT.md D-07 says "species 19→20" but the actual pre-phase state is:

| Mart | Schema.yml cols | SQL SELECT cols | Verified from |
|------|----------------|-----------------|---------------|
| `species` | 20 | 20 | `DESCRIBE` on `data/dbt/target/sandbox/species.parquet` |
| `occurrences` | 36 | 36 | `DESCRIBE` on `data/dbt/target/sandbox/occurrences.parquet` |
| `species` post-slug (public) | 21 | 21 | `species_export.py SPECIES_COLUMNS` = 21 entries |

**After phase 126:**
- `species.sql` SELECT: 20 → 21 columns
- `schema.yml` species: 20 → 21 entries
- `occurrences.sql` SELECT: 36 → 37 columns
- `schema.yml` occurrences: 36 → 37 entries
- `species_export.py SPECIES_COLUMNS`: 21 → 22 entries (taxon_id between inat_obs_count and slug)
- `public/data/species.parquet`: 21 → 22 columns

The `species.sql` header comment (`-- Species mart: 19-column`) is internally inconsistent (line 7 already says "20 SQL columns + 1 Python-added slug = 21 final columns"). Update the comment header to "21-column" when adding taxon_id.

`test_dbt_diff.py` `test_occurrences_schema_matches` docstring says "36 cols" — update to "37 cols" when adding taxon_id. The test CODE uses `p_cols[:-1] == s_cols` which does not hardcode a count, so no logic change needed.

`test_dbt_diff.py` `test_species_parquet_schema_matches` docstring says "18 sandbox cols" — currently stale (actual: 20). Update to 21 when adding taxon_id.

---

## Common Pitfalls

### Pitfall 1: BIGINT/INTEGER type mismatch at mart boundary
**What goes wrong:** `taxon_lineage_extended` stores `taxon_id` as BIGINT (from taxa.csv.gz schema). dbt contract requires `integer`. Without an explicit `::INTEGER` cast, dbt enforces the contract and the build fails.
**How to avoid:** Always cast `ctt.taxon_id::INTEGER` in the mart SELECT. Use `pa.int32()` in the pyarrow schema in `species_export.py`.
**Warning signs:** dbt build error: "data type mismatch: expected integer, got bigint".

### Pitfall 2: WABA ARM 2 canonical_name change widens int_combined schema
**What goes wrong:** Changing `NULL AS canonical_name` to a derived expression in ARM 2 changes the column type. The `NULL` literal defaults to VARCHAR in DuckDB; the derived expression must also produce VARCHAR (it does via the `::VARCHAR` cast).
**How to avoid:** Explicitly cast the derived expression: `lower(...)::VARCHAR AS canonical_name`.
**Warning signs:** dbt contract type error or UNION ALL type mismatch.

### Pitfall 3: WABA canonical_name derivation adds 37 rows to the "known names" set
**What goes wrong:** After the phase, `resolve_taxon_ids.py` will encounter these 37 derived WABA canonical_names when it next runs (since they'll now appear in `int_combined.canonical_name` — but wait, the resolution union queries RAW source tables, not int_combined). Actually: the WABA names come from `inat_waba_data.observations.taxon__name` which is NOT in the resolution union (the union queries `ecdysis_data.occurrences`, not `inat_waba_data`). The derived names for WABA would NOT be automatically added to the bridge.
**Critical:** The pre-build gate must either (a) ensure WABA-derived canonical_names are in the bridge, OR (b) extend `resolve_taxon_ids.py` union to also resolve `specimen_inat_taxon_name` values from WABA. Most WABA bee species ARE already in the bridge via inat_obs or ecdysis, but genus-only names (`Melissodes`, `Andrena`, etc.) need verification.
**How to avoid:** Add WABA derived names to the resolution union in `resolve_taxon_ids.py`.

### Pitfall 4: Non-bee WABA rows cause gate hard-failure on first run
**What goes wrong:** `Cicindela pugetana`, `Cleridae`, `Encopognathus` produce canonical_names that the resolution step cannot resolve (they're not bees; `taxa_pipeline` skips them). The gate hard-fails.
**How to avoid:** Either add these to the gate's `KNOWN_NON_BEES` exclusion set, or filter WABA ARM 2 to exclude non-Anthophila rows (check `specimen_inat_family NOT IN bee_families`).

### Pitfall 5: species.js genusList taxon_id lookup collision (genus=subgenus name)
**What goes wrong:** For taxa like Bombus where the subgenus name equals the genus name, the `higher_rank_taxon_ids.json` genus lookup returns genus taxon_id 52775 but the subgenus lookup for `Bombus::Bombus` must return 538903, not 52775.
**How to avoid:** In `_data/species.js`, use `genus::subgenus` compound key for subgenus lookups, not just the subgenus name alone.

---

## Runtime State Inventory

Not applicable — this is a data-column surfacing phase with no renaming/refactoring of stored identifiers. No stored data keys, live service configs, OS registrations, secrets, or build artifacts carry names that need updating.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB Python | `species_export.py` taxa lookup | ✓ | existing | — |
| `data/raw/taxa.csv.gz` | Higher-rank taxon_id export | ✓ | present on disk | taxa-download step fetches it |
| pytest | test assertions | ✓ | 9.0.3 | — |
| pyarrow | `species_export.py` parquet schema | ✓ | existing | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 |
| Config file | `data/pyproject.toml` |
| Quick run command | `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` |
| Full suite command | `uv run --project data pytest data/tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TID-01 | `species.parquet` has non-null taxon_id for all rows | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_species_taxon_id -x` | ❌ Wave 0 |
| TID-02 | `occurrences.parquet` has non-null taxon_id for all rows | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_occurrences_taxon_id -x` | ❌ Wave 0 |
| TID-02 | `occurrences.taxon_id == species.taxon_id` for matching canonical_names (D-03) | unit | `uv run --project data pytest data/tests/test_dbt_scaffold.py -k test_taxon_id_consistency -x` | ❌ Wave 0 |
| TID-03 | `species.json` includes `taxon_id` field per species | unit | `uv run --project data pytest data/tests/test_species_export.py -k test_taxon_id -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run --project data pytest data/tests/test_dbt_scaffold.py -x`
- **Per wave merge:** `uv run --project data pytest data/tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps (new test functions to create)

Following `_SPECIES_GUARD` pattern established in Phase 125:

```python
# In data/tests/test_dbt_scaffold.py, append after existing _SPECIES_GUARD tests:

@_SPECIES_GUARD
def test_species_taxon_id_non_null():
    """species.parquet: zero rows with null taxon_id (TID-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE taxon_id IS NULL"
    ).fetchone()[0]
    assert n == 0, f"Expected 0 null taxon_id rows in species.parquet, got {n}"

_OCCURRENCES_GUARD = pytest.mark.skipif(...)  # already exists

@_OCCURRENCES_GUARD
def test_occurrences_taxon_id_non_null():
    """occurrences.parquet: zero rows with null taxon_id (TID-02)."""
    parquet_path = str(SANDBOX / "occurrences.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE taxon_id IS NULL"
    ).fetchone()[0]
    assert n == 0, f"Expected 0 null taxon_id rows in occurrences.parquet, got {n}"
```

---

## Security Domain

Not applicable to this phase — no new authentication, session management, access control, cryptography, or network endpoints. The iNat link is a standard outbound `<a href>` using a known-safe integer ID with no user-controlled input in the URL.

---

## Open Questions

1. **Non-bee WABA rows — gate policy**
   - What we know: 4 of 37 WABA provisional rows carry non-bee taxa (confirmed by taxa.csv.gz ancestry check).
   - What's unclear: Should the planner hard-exclude these rows from the occurrences mart (via a family filter), or maintain them in occurrences with NULL taxon_id (requiring relaxation of D-01 for NULL-canonical rows), or add them to a `KNOWN_NON_BEES` gate exclusion set?
   - Recommendation: Add a `KNOWN_NON_BEES` constant to the gate module. The 4 rows stay in occurrences.parquet (they are real collection events, even if misidentified). Set `taxon_id = NULL` for these rows and relax D-01 to: "NOT NULL WHERE canonical_name IS NOT NULL". Document in schema.yml via a constraint comment. This matches the existing pattern where non-null `canonical_name` is already not guaranteed for WABA rows.
   - **Note:** This requires updating D-01 in the plan. The current CONTEXT D-01 says "NOT NULL for every row" — the planner must decide: is D-01 relaxed, or are these 4 rows excluded?

2. **WABA derived canonical_names in the resolution union**
   - What we know: `resolve_taxon_ids.py` union does not include WABA `taxon__name` values.
   - What's unclear: Are all 33 bee WABA taxa names already covered by the existing union (via inat_obs or ecdysis)?
   - Recommendation: Cross-check the 33 bee WABA names against the bridge at build time. The gate should verify them. Most species are likely covered by inat_obs (confirmed for Melissodes bimatris: 3 inat_obs rows; Coelioxys grindeliae: 2; etc.). Genus-only names like `melissodes`, `andrena`, `osmia` may not be independently resolved — verify in `lineage_unresolved.csv` after first gate run.

3. **Higher-rank taxon_id frontend delivery mechanism**
   - What we know: `taxa.csv.gz` has genus/subgenus/tribe taxon_ids; `taxon_lineage_extended` does not retain rank.
   - What's unclear: Should D-06 be implemented via (a) a new `higher_rank_taxon_ids.json` file exported by `species_export.py`, or (b) embedding genus/tribe taxon_id columns directly in `species.json` rows (redundant but no extra file)?
   - Recommendation: Option (b) is simpler — add `genus_taxon_id`, `tribe_taxon_id`, `subgenus_taxon_id` columns to `species.parquet` and `species.json`. Then `_data/species.js` can derive `genusList[x].taxon_id` from `g.allMembers[0].genus_taxon_id`. Requires adding these columns to `int_species_universe.sql` via a join to taxa.csv.gz, or a post-dbt Python join in `species_export.py`.

---

## Sources

### Primary (HIGH confidence)
- `data/dbt/models/intermediate/int_combined.sql` — ARM 1/2/3 structure, synonymy application (lines 43, 136)
- `data/dbt/models/intermediate/int_species_universe.sql` — existing bridge LEFT JOIN (lines 130–133), canonical_name join key
- `data/dbt/seeds/occurrence_synonyms.csv` — single synonym: `agapostemon texanus → agapostemon subtilior`
- `data/dbt/models/staging/stg_checklist__species.sql` — applies synonymy to checklist canonical_names before int_species_universe join
- `data/taxa_pipeline.py` lines 142–151 — self_rows arm confirmed for tribe/subgenus/genus
- `data/dbt/models/marts/schema.yml` — verified: occurrences=36 columns, species=20 columns
- `data/dbt/models/marts/species.sql` — 20-column SELECT confirmed
- `data/dbt/models/marts/occurrences.sql` — 36-column SELECT confirmed
- `data/dbt/target/sandbox/species.parquet` — DESCRIBE: 20 columns
- `data/dbt/target/sandbox/occurrences.parquet` — DESCRIBE: 36 columns; waba_sample=37 rows ALL with canonical_name=NULL
- `data/resolve_taxon_ids.py` lines 59–73 — resolution union reads RAW source names only
- `data/raw/inat_expert_obs.csv` — verified `Agapostemon subtilior` present (multiple rows); confirmed 33 WABA bee species have inat_obs coverage
- `data/raw/taxa.csv.gz` — verified tribe/subgenus self-rows; confirmed Cicindela pugetana/Cleridae/Encopognathus are non-Anthophila
- `data/run.py` STEPS list — ordering: resolve-taxon-ids → taxa-download → taxon-lineage-extended → dbt-build
- `data/species_export.py` — SPECIES_COLUMNS list, pyarrow schema, 21-column output
- `_data/species.js` — genusList/subgenusList/tribeList construction pattern
- `_pages/species-detail.njk` — existing atlas action link for D-05 placement reference
- `_pages/genus.njk`, `subgenus.njk`, `tribe.njk` — confirmed no taxon_id field currently
- `data/tests/test_dbt_scaffold.py` — `_SPECIES_GUARD` and `_OCCURRENCES_GUARD` patterns
- `data/tests/test_dbt_diff.py` — schema match tests (adapt docstrings for 37-col assertion)
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` — `waba.taxon__name AS specimen_inat_taxon_name` (line 7)
- `data/canonical_name.py` lines 73–104 — `normalize_scientific_name` implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from live files
- Architecture: HIGH — all data paths traced to source
- Pitfalls: HIGH for known; MEDIUM for non-bee gate policy (open question)
- RD-01: HIGH — traced through actual source code and live CSV data
- RD-02: HIGH — verified from taxa_pipeline.py code + live taxa.csv.gz query
- RD-03: HIGH — verified from actual occurrences.parquet sandbox + taxa.csv.gz

**Research date:** 2026-05-31
**Valid until:** 2026-07-01 (stable pipeline; only invalidated if occurrence_synonyms.csv gains new entries or WABA data refreshes)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WABA `taxon__name` for bees is a clean binomial matching iNat accepted names | RD-03 | If some WABA bee names have authority suffixes, the SQL lower(trim) derivation could produce a non-matching canonical_name → NULL taxon_id → gate fails |
| A2 | Genus-only WABA rows (`Melissodes`, `Andrena`, `Osmia`) are already in the bridge via inat_obs | Open Questions #2 | If not, the gate will fail on the first build; fix: add them to resolution union |
| A3 | `higher_rank_taxon_ids` lookup approach (new JSON or columns) is acceptable cost | Open Questions #3 | Low risk either way — both approaches are feasible |

**If this table is empty, no user confirmation is needed. The three items above are LOW risk and will be caught by the resolution gate on first run.**
