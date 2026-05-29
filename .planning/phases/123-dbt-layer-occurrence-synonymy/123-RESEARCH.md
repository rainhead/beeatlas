# Phase 123: dbt-Layer Occurrence Synonymy - Research

**Researched:** 2026-05-29
**Domain:** dbt-duckdb, Python data pipeline refactoring, CSV seed/source loading
**Confidence:** HIGH

## Summary

Phase 123 moves occurrence synonymy application from ingest-time Python (`apply_synonym()` in `checklist_pipeline.py` and `inat_obs_pipeline.py`) into the dbt layer. Currently, two pipelines stamp synonymized `canonical_name` values directly into DuckDB staging tables before dbt runs; the WABA source gets no synonymy at all. The fix is: (1) change both Python pipelines to write only `normalize_scientific_name()` output to their staging tables, and (2) load `occurrence_synonyms.csv` into DuckDB and apply it via LEFT JOIN in dbt staging or `int_combined`.

The key architectural decision is **where in dbt** to join the synonymy table. Two credible options exist: join in each individual staging model (stg_ecdysis__occurrences, any inat_obs staging) so the synonym is applied early, or join once in `int_combined` so a single JOIN covers all three arms. The single-JOIN approach in `int_combined` is simpler and prevents the WABA arm (ARM 2) from remaining unresolved — currently ARM 2's `canonical_name` is always NULL anyway, but the join placement must handle all future sources uniformly.

The second decision is **how to load `occurrence_synonyms.csv` into DuckDB**. The two options are a dbt seed (CSV file in `data/dbt/seeds/`, loaded by `dbt seed`) and a Python-loaded DuckDB source table registered in `sources.yml`. The dbt seed approach is cleaner: it makes the synonymy table a first-class dbt artifact, it is automatically re-run as part of `dbt build`, and it keeps the CSV as the single source of truth without requiring a new Python loading step. There is no existing `seeds/` directory — it would need to be created.

**Primary recommendation:** Use a dbt seed for `occurrence_synonyms.csv`. Apply the LEFT JOIN in `int_combined` (once, on all three arms) rather than in individual staging models, so every source gets identical treatment with a single code location.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Store raw scientific names pre-synonymy | Python ingest (DuckDB staging) | — | Python pipelines own raw data loading; canonical_name column should hold normalize_scientific_name() only |
| Synonymy table management | dbt seed | — | Seed is the canonical dbt mechanism for small reference CSVs checked into source control |
| Apply synonymy at query time | dbt intermediate (int_combined) | — | Single application point covers all three UNION ALL arms uniformly |
| Parquet artifact output | dbt mart (occurrences.sql) | — | Already reads from int_combined; no change needed here |
| Test coverage of synonymy mapping | pytest (Python) + dbt test | — | Python unit tests cover apply_synonym function; dbt test covers seed not_null + a custom assertion |

## Standard Stack

### Core

No new packages. The phase uses existing infrastructure exclusively.

| Component | Version | Purpose |
|-----------|---------|---------|
| dbt-duckdb | 1.10.1 (pinned in run.sh) | dbt seed + LEFT JOIN in SQL models |
| DuckDB | runtime via dbt profile | Underlying storage for seed table |
| Python | 3.14+ (uv env) | Modify checklist_pipeline.py + inat_obs_pipeline.py |
| pytest | existing | Update test assertions for new column semantics |

[VERIFIED: official dbt docs — dbt seeds are standard dbt functionality; no new packages required]

### No New Packages Required

This phase installs nothing new. All tooling is already present.

## Package Legitimacy Audit

No external packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
occurrence_synonyms.csv
        |
   [dbt seed]
        |
        v
dbt_sandbox.occurrence_synonyms (DuckDB table)
        |
        | LEFT JOIN on canonical_name
        v
int_combined.sql  (UNION ALL of 3 arms)
   ARM 1: int_ecdysis_base  → canonical_name = normalize_scientific_name() output
   ARM 2: WABA provisional  → canonical_name = NULL (unchanged; synonymy N/A for ARM 2)
   ARM 3: inat_obs_data     → canonical_name = normalize_scientific_name() output
        |
        | COALESCE(syn.accepted_name, c.canonical_name) AS canonical_name
        v
occurrences.parquet (mart output — same schema, synonymized names)
```

**Data flow change:**

Before: `Python load_inat_obs()` → `apply_synonym(normalize_scientific_name(sci_name))` → `inat_obs_data.observations.canonical_name` (synonymized)

After: `Python load_inat_obs()` → `normalize_scientific_name(sci_name)` → `inat_obs_data.observations.canonical_name` (raw canonical) → dbt LEFT JOIN synonyms → `int_combined.canonical_name` (synonymized)

Before: `checklist_pipeline._update_occurrences_canonical_name()` → `apply_synonym(normalize_scientific_name(...))` → `ecdysis_data.occurrences.canonical_name` (synonymized)

After: `checklist_pipeline._update_occurrences_canonical_name()` → `normalize_scientific_name(...)` → `ecdysis_data.occurrences.canonical_name` (raw canonical) → dbt LEFT JOIN synonyms → `int_combined.canonical_name` (synonymized)

### Recommended Project Structure

```
data/dbt/
├── seeds/
│   └── occurrence_synonyms.csv     # moved/copied from data/occurrence_synonyms.csv
├── models/
│   └── intermediate/
│       └── int_combined.sql        # add LEFT JOIN on synonym seed; modify all 3 arms
data/
├── occurrence_synonyms.csv         # keep in place; also copy to seeds/ OR symlink
├── checklist_pipeline.py           # remove apply_synonym() from _update_occurrences_canonical_name
└── inat_obs_pipeline.py            # remove apply_synonym() from load_inat_obs()
```

**Critical: file placement decision.** There are two sub-options:
1. Keep `data/occurrence_synonyms.csv` as the canonical file AND copy it to `data/dbt/seeds/occurrence_synonyms.csv` — two files, must stay in sync, but Python tests can still reference the original path.
2. Move the file to `data/dbt/seeds/occurrence_synonyms.csv` and update `canonical_name.OCCURRENCE_SYNONYMS_PATH` to point there — one file, but changes the Python module's default path.

Option 2 is cleaner; the Python module's `OCCURRENCE_SYNONYMS_PATH` is a `Path` constant that can be updated.

### Pattern 1: dbt Seed Definition

**What:** A CSV file placed in `data/dbt/seeds/` is automatically loaded into DuckDB as a table by `dbt seed` (which is called as part of `dbt build`).
**When to use:** Small reference tables that change infrequently, checked into source control, no external API dependency.

```sql
-- data/dbt/seeds/occurrence_synonyms.csv
-- synonym,accepted_name,source
-- agapostemon texanus,agapostemon subtilior,Portman et al. 2024

-- In dbt_project.yml (add seeds section):
seeds:
  beeatlas:
    occurrence_synonyms:
      +column_types:
        synonym: varchar
        accepted_name: varchar
        source: varchar
```

[CITED: dbt Seeds documentation — https://docs.getdbt.com/docs/build/seeds]

### Pattern 2: LEFT JOIN Synonym in int_combined

**What:** Each arm of the UNION ALL in `int_combined.sql` JOINs the seed table, replacing `canonical_name` with `COALESCE(syn.accepted_name, c.canonical_name)`.
**When to use:** When synonymy must apply uniformly to all sources from a single code location.

```sql
-- int_combined.sql (with synonym join)
WITH synonyms AS (
    SELECT synonym, accepted_name FROM {{ ref('occurrence_synonyms') }}
)

-- ARM 1: Ecdysis
SELECT
    ...
    COALESCE(syn1.accepted_name, e.canonical_name) AS canonical_name,
    ...
FROM {{ ref('int_ecdysis_base') }} e
...
LEFT JOIN synonyms syn1 ON syn1.synonym = e.canonical_name

UNION ALL

-- ARM 2: WABA provisional — canonical_name is NULL, synonym join is a no-op
SELECT
    ...
    NULL AS canonical_name,  -- unchanged; no scientific name available
    ...

UNION ALL

-- ARM 3: iNat obs
SELECT
    ...
    COALESCE(syn3.accepted_name, io.canonical_name) AS canonical_name,
    ...
FROM {{ source('inat_obs_data', 'observations') }} io
...
LEFT JOIN synonyms syn3 ON syn3.synonym = io.canonical_name
```

[ASSUMED: specific SQL pattern — based on DuckDB + dbt LEFT JOIN semantics; standard SQL, verified to work with DuckDB's COALESCE on VARCHAR]

### Pattern 3: Update inat_obs_pipeline.py

Remove `apply_synonym()` wrapper; store only `normalize_scientific_name()` output:

```python
# Before:
apply_synonym(normalize_scientific_name(sci_name)),   # canonical_name

# After:
normalize_scientific_name(sci_name),                   # canonical_name — synonym applied by dbt
```

[VERIFIED: canonical_name.py source — normalize_scientific_name() is idempotent and returns lowercase binomial or None for None/empty input]

### Pattern 4: Update _update_occurrences_canonical_name in checklist_pipeline.py

```python
# Before:
mapping: list[tuple[str | None, str]] = [
    (apply_synonym(normalize_scientific_name(r[0])), r[0]) for r in rows
]

# After:
mapping: list[tuple[str | None, str]] = [
    (normalize_scientific_name(r[0]), r[0]) for r in rows
]
```

[VERIFIED: checklist_pipeline.py source — the function already iterates DISTINCT scientific_name values; only the mapping tuple changes]

### Anti-Patterns to Avoid

- **Applying synonym in both Python and dbt:** If synonym is applied at ingest AND in dbt, `agapostemon subtilior` would be passed to `COALESCE(syn.accepted_name, 'agapostemon subtilior')` — the JOIN finds no match (since the synonym table maps `texanus` → `subtilior`, not `subtilior` → `subtilior`), so the name passes through correctly. But this is confusing and violates the "raw canonical at ingest" invariant. Remove from Python entirely.

- **Applying synonym in individual staging views instead of int_combined:** Using `stg_ecdysis__occurrences` or a new `stg_inat_obs__observations` staging model would mean each staging view needs its own JOIN. The WABA arm would still be missed. One JOIN in `int_combined` is the correct single point of control.

- **Duplicating occurrence_synonyms.csv without updating the reference:** The Python module `canonical_name.py` has `OCCURRENCE_SYNONYMS_PATH` pointing at `data/occurrence_synonyms.csv`. If the file moves to `data/dbt/seeds/occurrence_synonyms.csv`, update this constant. Failing to do so means the Python unit tests in `test_canonical_name.py` that call `apply_synonym()` from disk will still pass (file still exists at old path) but be testing a stale copy — a silent divergence risk.

- **Not declaring the seed in sources.yml or schema.yml:** dbt seeds are accessible via `ref('occurrence_synonyms')` automatically once placed in the seeds directory. No `sources.yml` entry is needed (that's for external tables). However, adding a schema test (`not_null` on `synonym` and `accepted_name`) in a seed schema file is good practice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading CSV reference table into DuckDB | Python load step with DuckDB executemany | dbt seed | Seeds are re-run on every `dbt build`; no separate pipeline step needed; schema-testable |
| Two-step synonym file management (Python path + dbt path) | Symlink or dual-copy script | Move file to `seeds/`; update OCCURRENCE_SYNONYMS_PATH | One canonical location eliminates divergence |
| Per-source synonym application in 3+ models | Copy-paste JOIN in each staging view | Single JOIN in int_combined CTE | Guarantees uniform treatment; new sources get it for free |

**Key insight:** dbt seeds are purpose-built for exactly this use case: small, version-controlled reference CSVs consumed by dbt models. The synonymy table has 1 row today and may grow to ~10–20 rows. Treating it as a seed means adding a row + running `dbt build` is the entire workflow, exactly matching success criterion #3.

## Common Pitfalls

### Pitfall 1: WABA ARM 2 Already Has NULL canonical_name

**What goes wrong:** ARM 2 (provisional WABA rows) has `NULL AS canonical_name` hardcoded in `int_combined.sql`. A synonym JOIN on NULL produces NULL (not the synonym). This is correct — provisional rows have no scientific name to synonymize.
**Why it happens:** WABA provisional rows lack a determined scientific name; they carry `specimen_inat_taxon_name` instead.
**How to avoid:** Leave ARM 2's `canonical_name` as NULL. Do not attempt to resolve synonymy from `specimen_inat_taxon_name` — that is a different field serving a different purpose.
**Warning signs:** If ARM 2 rows suddenly have non-NULL canonical_name after the change, something went wrong.

### Pitfall 2: inat_obs_count_agg in int_species_universe.sql Reads Source Directly

**What goes wrong:** `int_species_universe.sql` has a CTE:
```sql
inat_obs_count_agg AS (
    SELECT canonical_name, COUNT(*) AS inat_obs_count
    FROM {{ source('inat_obs_data', 'observations') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
)
```
This reads the raw source table, which after Phase 123 will contain un-synonymized canonical names. The `inat_obs_count` column on the species mart will not reflect the synonymized name grouping.
**Why it happens:** This CTE was written before Phase 123; it intentionally bypasses the occurrences mart to avoid a circular DAG.
**How to avoid:** This CTE should also apply the synonym JOIN, or it should read from a view that applies synonymy. The planner must include a fix here, or explicitly call out that `inat_obs_count` groups by raw canonical names (acceptable if only one Agapostemon texanus record exists before the fix).
**Warning signs:** After Phase 123, `inat_obs_count` for `agapostemon subtilior` would undercount if any inat_obs rows had `agapostemon texanus` as their raw canonical_name.

### Pitfall 3: Test test_canonical_name.py Tests apply_synonym — These Must Be Preserved

**What goes wrong:** `test_canonical_name.py` tests `apply_synonym()` directly (including the Agapostemon disk-read integration test). Phase 123 does not remove `apply_synonym()` from `canonical_name.py` — the function still exists and is tested. But `test_canonical_name.py::test_apply_synonym_composed_with_normalize_scientific_name` asserts that the COMBINED Python call maps correctly. This test remains valid as a unit test of the function itself; it does not test pipeline behavior.
**How to avoid:** Do not delete `apply_synonym()` from `canonical_name.py`. The function is still useful as a Python utility and its tests remain green. Only the _callsites_ in `checklist_pipeline.py` and `inat_obs_pipeline.py` change.

### Pitfall 4: test_inat_obs_pipeline.py test_canonical_name_non_null Will Change Semantics

**What goes wrong:** `test_canonical_name_non_null` (PIPE-02) asserts that after `load_inat_obs()`, no row has `canonical_name IS NULL` when `scientific_name IS NOT NULL`. After Phase 123, the `canonical_name` column in the raw table stores `normalize_scientific_name()` output, not synonymized output — but the non-null invariant still holds (normalize_scientific_name returns non-null for non-null, non-empty input). The test should continue to pass without modification.
**Why it's a pitfall:** A future reader might expect the test to assert synonymy application, but it only asserts non-nullness. This is fine — synonymy correctness is tested at the dbt/parquet level (success criterion #4).
**How to avoid:** No action needed; document that PIPE-02 tests non-null, not synonymy.

### Pitfall 5: build-output.test.ts Uses KNOWN_CHECKLIST_ONLY_SLUG = 'Agapostemon/texanus'

**What goes wrong:** `build-output.test.ts` line 277 uses `'Agapostemon/texanus'` as the test slug for a checklist-only species. After Phase 123, if the synonymy is applied correctly in the checklist data path, `agapostemon texanus` in `checklist_data.species` would have its occurrence-side join succeed (because ecdysis now also stores un-synonymized `agapostemon texanus`), meaning it might no longer be "checklist-only."
**Why it's a pitfall:** The distinction between `agapostemon texanus` (checklist-only) and `agapostemon subtilior` (occurrence species) is preserved by the fact that `checklist_data.species.canonical_name` uses `normalize_scientific_name()` (no synonymy — see below). The checklist pipeline does NOT apply `apply_synonym()` to `checklist_data.species.canonical_name` — it uses `normalize_scientific_name(sci)` directly (line 200 of `checklist_pipeline.py`). So after Phase 123, ecdysis raw canonical_name is `agapostemon texanus`, checklist canonical_name is `agapostemon texanus`, and they JOIN. But `int_species_universe` uses the `stg_checklist__species` canonical_name for the FULL OUTER JOIN axis — if ecdysis records now carry `agapostemon texanus` (un-synonymized) AND the synonym is applied in int_combined, the COALESCE in int_species_universe sees `agapostemon subtilior` from occurrences but `agapostemon texanus` from the checklist. They won't match!
**Root cause:** This is a deeper issue: `int_species_universe` JOINs `stg_checklist__species` ON `oa.canonical_name = c.canonical_name`. If `oa.canonical_name` = `agapostemon subtilior` (from synonymized occurrences) and `c.canonical_name` = `agapostemon texanus` (from checklist), they will NOT join — leaving `agapostemon texanus` as checklist-only and `agapostemon subtilior` as occurrence-only.
**How to avoid:** This pre-existing situation is unchanged by Phase 123 — the synonymy table is explicitly for OCCURRENCE-side records only. The checklist reconcile mechanism uses a SEPARATE `checklist_synonyms.csv` (confirmed in `checklist_pipeline.py` line 27). Phase 123 does NOT change the checklist pipeline's synonym logic. The `KNOWN_CHECKLIST_ONLY_SLUG = 'Agapostemon/texanus'` test in build-output.test.ts should remain valid because `agapostemon texanus` remains a checklist-only entry — its occurrence records are reported under `agapostemon subtilior` (synonymized). The build-output test is actually testing the correct behavior.

### Pitfall 6: dbt seed Schema Must Match CSV Columns

**What goes wrong:** If the seed CSV has extra whitespace or different column names from what the SQL expects, the JOIN fails silently (returns no matches).
**How to avoid:** Verify the CSV header row exactly: `synonym,accepted_name,source`. Add a `seeds/schema.yml` with `not_null` tests on `synonym` and `accepted_name`.

### Pitfall 7: checklist_pipeline.reconcile() Still Uses ecdysis canonical_names

**What goes wrong:** `reconcile()` in `checklist_pipeline.py` (line 65–124) JOINs `checklist_data.species` against `ecdysis_data.occurrences` on `canonical_name`. After Phase 123, ecdysis canonical names are un-synonymized — `agapostemon texanus` in ecdysis, but the checklist lookup uses that same raw name. The reconcile step finds a match (texanus = texanus). This is actually fine — reconcile is a warn-only diagnostic step that checks whether checklist names appear in occurrence data; it doesn't gate pipeline correctness.
**Warning signs:** None expected. This is a neutral outcome.

## Code Examples

### Seed Schema File (new: data/dbt/seeds/schema.yml)

```yaml
# Source: dbt Seeds documentation — https://docs.getdbt.com/docs/build/seeds
version: 2

seeds:
  - name: occurrence_synonyms
    columns:
      - name: synonym
        data_tests:
          - not_null
          - unique
      - name: accepted_name
        data_tests:
          - not_null
      - name: source
        description: "Citation for the synonymy decision (e.g., 'Portman et al. 2024')"
```

### int_combined.sql Synonym Join (ARM 1 + ARM 3)

```sql
-- Add this CTE at the top of int_combined.sql:
WITH synonyms AS (
    SELECT synonym, accepted_name
    FROM {{ ref('occurrence_synonyms') }}
),

-- ARM 1: modify canonical_name expression:
COALESCE(syn_e.accepted_name, e.canonical_name) AS canonical_name,

-- Add to ARM 1's FROM clause:
LEFT JOIN synonyms syn_e ON syn_e.synonym = e.canonical_name

-- ARM 3: modify canonical_name expression:
COALESCE(syn_io.accepted_name, io.canonical_name) AS canonical_name,

-- Add to ARM 3's FROM clause:
LEFT JOIN synonyms syn_io ON syn_io.synonym = io.canonical_name
```

[ASSUMED: exact CTE scoping in DuckDB/dbt — standard SQL CTE; LEFT JOIN on VARCHAR is standard DuckDB behavior confirmed via codebase inspection]

### int_species_universe.sql Fix for inat_obs_count_agg

```sql
-- After Phase 123, inat_obs_count_agg must apply synonymy to count correctly.
-- Option A: join synonyms seed in this CTE
inat_obs_count_agg AS (
    SELECT
        COALESCE(syn.accepted_name, io.canonical_name) AS canonical_name,
        COUNT(*) AS inat_obs_count
    FROM {{ source('inat_obs_data', 'observations') }} io
    LEFT JOIN {{ ref('occurrence_synonyms') }} syn ON syn.synonym = io.canonical_name
    WHERE io.canonical_name IS NOT NULL
    GROUP BY 1
),
```

[ASSUMED: exact SQL syntax — standard DuckDB/dbt pattern]

## State of the Art

| Old Approach | Current Approach (after Phase 123) | Impact |
|---|---|---|
| apply_synonym() at Python ingest time | normalize_scientific_name() only at ingest; synonym applied in dbt int_combined | New synonyms take effect on next dbt build, no re-ingest required |
| WABA arm has no synonymy | WABA arm canonical_name=NULL (no change — provisional rows have no determined name) | Correct; no regression |
| occurrence_synonyms.csv loaded lazily by Python module | Same file used as dbt seed, loaded by dbt seed during dbt build | Single source of truth; dbt-managed lifecycle |

**Deprecated after this phase:**
- `apply_synonym()` callsite in `checklist_pipeline._update_occurrences_canonical_name` — remove
- `apply_synonym()` callsite in `inat_obs_pipeline.load_inat_obs` — remove
- `import apply_synonym` in both pipeline files (if no other usage in same file) — remove

Note: `apply_synonym()` function itself in `canonical_name.py` is NOT removed — it has Python-level unit tests and may be used elsewhere. Only the callsites in the pipeline ingestion functions are removed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `int_combined` CTE scope allows referencing a `synonyms` CTE from all three UNION ALL arms | Code Examples | If DuckDB/dbt doesn't allow CTE reference across UNION ALL arms, must use a subquery per arm — minor syntax change only |
| A2 | `inat_obs_count_agg` in `int_species_universe.sql` reads raw source and will undercount synonymized species | Pitfall 2 | If there are zero inat_obs rows with `agapostemon texanus` canonical name currently, the undercount is zero — test after implementation |
| A3 | Moving `occurrence_synonyms.csv` to `data/dbt/seeds/` and updating `OCCURRENCE_SYNONYMS_PATH` in `canonical_name.py` is safe for existing Python tests | Architecture Patterns | If tests use a monkeypatched path, the path constant change is harmless |

**All other claims in this research were verified against source files in the repository.**

## Open Questions (RESOLVED)

1. **RESOLVED — Does int_species_universe.sql need a synonym JOIN for inat_obs_count_agg?**
   - What we know: The CTE reads `inat_obs_data.observations` directly (to avoid circular DAG). After Phase 123, that table stores raw canonical names. For the one existing synonym (`agapostemon texanus` → `subtilior`), this means inat_obs records for texanus would be counted under `texanus` not `subtilior` in `inat_obs_count`.
   - What's unclear: How many inat_obs records actually carry `agapostemon texanus` as canonical_name currently? If zero, this is a latent bug with no current user impact.
   - Recommendation: Include the fix (join synonyms in inat_obs_count_agg) in scope. It's two lines of SQL and prevents future correctness issues.

2. **RESOLVED — Should dbt_project.yml get a `seeds:` section to specify column types?**
   - What we know: dbt infers column types from CSV content. The synonymy CSV has three VARCHAR columns; type inference should work correctly.
   - What's unclear: Whether dbt-duckdb 1.10.1 infers VARCHAR reliably for all-text CSVs.
   - Recommendation: Add explicit `+column_types` in `dbt_project.yml` as a defensive measure — minimal overhead.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dbt seed command | Load occurrence_synonyms into DuckDB | ✓ | dbt-duckdb 1.10.1 (via uvx in run.sh) | — |
| uv | Run Python tests | ✓ | (present per CLAUDE.md) | — |
| DuckDB | Pipeline DB | ✓ | (present in data/ pyproject.toml) | — |

`dbt seed` runs automatically as part of `dbt build`. No additional environment setup needed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (Python pipeline) + Vitest (frontend) |
| Config file | `data/pyproject.toml` |
| Quick run command | `cd data && uv run pytest tests/test_canonical_name.py tests/test_inat_obs_pipeline.py tests/test_checklist_pipeline.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYN-01 | apply_synonym() not called in checklist/inat_obs pipelines; raw canonical_name stored | unit | `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_inat_obs_pipeline.py -x` | ✅ (tests already exist; assertions need update) |
| SYN-02 | occurrence_synonyms.csv loaded as dbt seed; LEFT JOIN in staging produces synonymized canonical_name | integration (dbt) | `bash data/dbt/run.sh build && uv run pytest data/tests/test_dbt_diff.py -x` | ✅ (test_dbt_diff.py exists; row count should be unchanged) |
| SYN-03 | Adding entry to occurrence_synonyms.csv + dbt build propagates without re-ingest | integration (dbt) | manual verify: add row, run `bash data/dbt/run.sh build`, check parquet | manual |
| SYN-04 (implicit) | Agapostemon texanus → subtilior mapping correct in occurrences.parquet | integration | `cd data && uv run pytest tests/test_dbt_diff.py -k agapostemon` or new targeted test | ❌ Wave 0 — new test needed |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_canonical_name.py tests/test_inat_obs_pipeline.py tests/test_checklist_pipeline.py -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full pytest suite green + `bash data/dbt/run.sh build` succeeds before verify

### Wave 0 Gaps

- [ ] `data/tests/test_dbt_synonymy.py` — new test asserting that `occurrences.parquet` contains `agapostemon subtilior` not `agapostemon texanus` for synonymized records (SYN-02, SYN-04)

*(All other test infrastructure exists. The main change to existing tests is removing any assertion that `canonical_name` in the raw DuckDB tables equals the synonymized form.)*

## Security Domain

Phase 123 is a data pipeline refactoring. No authentication, session management, access control, cryptography, or user input validation is involved. Security domain is not applicable.

## Sources

### Primary (HIGH confidence)

- `data/canonical_name.py` — confirmed function signatures, apply_synonym() callsites, OCCURRENCE_SYNONYMS_PATH
- `data/checklist_pipeline.py` — confirmed _update_occurrences_canonical_name() applies apply_synonym(); reconcile() uses checklist_synonyms.csv (distinct from occurrence_synonyms.csv)
- `data/inat_obs_pipeline.py` — confirmed apply_synonym(normalize_scientific_name(...)) at load time
- `data/dbt/models/intermediate/int_combined.sql` — confirmed 3-arm structure; ARM 2 has hardcoded NULL canonical_name; ARM 3 reads inat_obs_data.observations.canonical_name directly
- `data/dbt/models/intermediate/int_species_universe.sql` — confirmed inat_obs_count_agg reads raw source (potential synonym gap)
- `data/dbt/dbt_project.yml` — confirmed no seeds section yet; no seeds/ directory exists
- `data/occurrence_synonyms.csv` — 1 row: agapostemon texanus → subtilior
- `data/tests/test_canonical_name.py` — confirmed apply_synonym tests; function must remain in place
- `data/tests/test_inat_obs_pipeline.py` — confirmed PIPE-02 tests non-null, not synonymy
- `src/tests/build-output.test.ts` — confirmed KNOWN_CHECKLIST_ONLY_SLUG = 'Agapostemon/texanus' (line 277)
- [dbt Seeds documentation](https://docs.getdbt.com/docs/build/seeds) — confirmed dbt seed mechanism is standard dbt functionality [CITED]

### Secondary (MEDIUM confidence)

- dbt-duckdb 1.10.1 seed support: standard dbt feature, should work identically with duckdb adapter [ASSUMED — not independently verified against dbt-duckdb 1.10.1 changelog]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing tooling confirmed from source
- Architecture: HIGH — patterns derived from direct source inspection; dbt seed mechanism is standard
- Pitfalls: HIGH — Pitfalls 1–4 verified from source; Pitfalls 5–7 derived from code inspection

**Research date:** 2026-05-29
**Valid until:** 2026-07-01 (stable domain — dbt seed semantics don't change between minor versions)
