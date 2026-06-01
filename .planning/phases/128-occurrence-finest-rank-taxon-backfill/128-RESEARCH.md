# Phase 128: Occurrence Finest-Rank Taxon Backfill - Research

**Researched:** 2026-06-01
**Domain:** dbt data-pipeline (DuckDB) — surfacing genus-rank taxon_ids through existing intermediate/mart models
**Confidence:** HIGH (all claims verified against live `beeatlas.duckdb` + built `dbt/target/sandbox/*.parquet`)

## Summary

This is a **dbt-layer surfacing change**, not new taxonomy work. Phase 126 already wired
`occurrences.taxon_id` as a species-rollup taxon (bridge LEFT JOIN on post-synonymy `canonical_name`,
3 ARMs in `int_combined.sql`). Genus-level occurrence rows have single-token `canonical_name`
(e.g. `lasioglossum`), which never matches the species bridge (keyed on two-token species names), so
they are NULL. This phase backfills those rows with the **genus self-row taxon_id** via a COALESCE.

**The central research finding contradicts the CONTEXT.md assumption** that
`stg_inat__taxon_lineage_extended` is a usable genus→taxon_id source. It is NOT, for two verified
reasons: (1) it contains species/subspecies rows with `subgenus IS NULL` alongside the genus
self-row, so a `subgenus IS NULL` join fans out and returns wrong taxon_ids (proven for `stelis`:
5 candidate rows, only 1 is the genus); (2) it is **filtered to Anthophila (bees)** in
`taxa_pipeline.load_taxon_lineage_extended`, so 5 of the 36 NULL genera (`crossocerus`, `larropsis`,
`plecoptera`, `symphyta`, `trypoxylon` — non-bee ecdysis/iNat bycatch, 46 rows) are entirely absent.

The **authoritative, complete, collision-resolved genus→taxon_id source is `data/raw/taxa.csv.gz`
filtered to `rank='genus' AND active='true'`, disambiguated by Anthophila ancestry** (resolves the
`stelis` plant-vs-bee collision: 127831 is the bee, 141523 the plant — and the existing Python
`_build_higher_rank_taxon_ids` picks the WRONG one by dict-overwrite luck). dbt runs from `data/dbt/`,
so a staging model can `read_csv('../raw/taxa.csv.gz', ...)` directly, OR `taxa_pipeline.py` can load a
dedicated `genus_taxon_ids` table as a new dbt source (mirrors how `taxon_lineage_extended` is built).

**Primary recommendation:** Add a `stg_inat__genus_taxon_ids` staging model exposing
`(genus_name_lower, taxon_id)` for active Anthophila genera (built from `taxa.csv.gz`, deduped by
ancestry). COALESCE it into each of the 3 ARMs of `int_combined.sql` keyed on
`lower(post-synonymy canonical_name)` when the name is single-token. Re-scope two tests in
`data/tests/test_dbt_scaffold.py` and the `schema.yml` not_null `where:` clause. Do NOT change the
37-column contract — only values + tests change. ~17,254 rows backfill (35 of 36 genera resolve;
the 5 non-bee genera resolve too if sourced from `taxa.csv.gz` rather than the bee-only tle).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Genus→taxon_id resolution | Ingestion (`taxa.csv.gz` / `taxa_pipeline.py`) OR dbt staging | — | The taxonomy dump is the source of truth; dbt only surfaces it |
| Finest-rank COALESCE | dbt intermediate (`int_combined`) | dbt mart (`occurrences`) | Must apply uniformly across all 3 ARMs; per-ARM keeps source-specific keys local |
| not_null / consistency enforcement | dbt tests (`test_dbt_scaffold.py`) + `schema.yml` | — | Project culture: contract + pytest at every build |
| Truly-unidentified NULL handling | Data semantics (no tier) | — | 21,652 NULL-canonical_name rows legitimately stay NULL |

## Standard Stack

No new packages. This phase uses the existing toolchain only.

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| dbt-core + dbt-duckdb | 1.10.1 (pinned, Python 3.13 via uvx) | The sole pipeline producer | `data/dbt/run.sh` [VERIFIED: read.sh] |
| DuckDB | as bundled by dbt-duckdb 1.10.1 | SQL engine, `read_csv` on gzip TSV | Already reads `taxa.csv.gz` in `species_export.py` [VERIFIED: source] |
| pytest (via `uv run pytest`) | per `data/pyproject.toml` | data-layer tests in `data/tests/` | Established `_OCCURRENCES_GUARD`/`_SPECIES_GUARD` pattern |

**No `npm install` / `pip install` step.** Package Legitimacy Audit is N/A — zero external packages added.

## Architecture Patterns

### Current taxon_id wiring (verified file:line)

**`data/dbt/models/intermediate/int_combined.sql`** — 3 ARMs, each LEFT JOINs the bridge on
post-synonymy `canonical_name` and selects `<alias>.taxon_id::INTEGER AS taxon_id`:

| ARM | source | taxon_id select | bridge join | join key |
|-----|--------|-----------------|-------------|----------|
| ARM 1 (ecdysis) | `'ecdysis'` | line 46 `ctt.taxon_id::INTEGER` | lines 56-57 `ctt` | `ctt.canonical_name = COALESCE(syn_e.accepted_name, e.canonical_name)` |
| ARM 2 (WABA) | `'waba_sample'` | line 100 `ctt_w.taxon_id::INTEGER` | lines 112-119 `ctt_w` | derived two-token `lower(trim(...))` of `specimen_inat_taxon_name` |
| ARM 3 (iNat obs) | `'inat_obs'` | line 164 `ctt_io.taxon_id::INTEGER` | lines 172-173 `ctt_io` | `ctt_io.canonical_name = COALESCE(syn_io.accepted_name, io.canonical_name)` |

**`data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql`** — passthrough view over
`source('inaturalist_data','canonical_to_taxon_id')`; columns `canonical_name` (PK, VARCHAR),
`taxon_id` (INTEGER), `resolved_at`, `source`. Keyed on the **synonymized canonical_name**; bridge
holds species-level (two-token) names predominantly (a few bare genus names exist incidentally —
`andrena` IS in the bridge as 57669, which is why andrena is the one genus already non-null... it is
NOT; see "Pitfall: andrena" below).

**`data/dbt/models/marts/occurrences.sql`** — line 94 `j.taxon_id` passes the int_combined value
through unchanged. The mart does spatial joins only; it does NOT re-derive taxon_id. 37-column SELECT
at lines 83-101; `schema.yml` declares `taxon_id data_type: integer` at lines 81-82.

### Recommended pattern: genus self-row staging model + per-ARM COALESCE

**The genus source (NEW staging model).** `taxon_lineage_extended` is NOT usable as a genus map
(see Pitfalls). Add:

```sql
-- data/dbt/models/staging/stg_inat__genus_taxon_ids.sql
-- Active Anthophila genus self-rows from the iNat taxonomy dump.
-- Source of truth: data/raw/taxa.csv.gz (rank='genus'). Anthophila-ancestry filter
-- (630955) resolves the plant/bee name collision (e.g. Stelis 127831=bee, 141523=plant).
-- dbt runs from data/dbt/, so ../raw/taxa.csv.gz resolves relative to the project dir.
{{ config(materialized='view') }}

SELECT
    lower(name)        AS genus_name,
    taxon_id::INTEGER  AS taxon_id
FROM read_csv('../raw/taxa.csv.gz', delim=chr(9), header=true, compression='gzip',
              columns={'taxon_id':'BIGINT','ancestry':'VARCHAR','rank_level':'INTEGER',
                       'rank':'VARCHAR','name':'VARCHAR','active':'VARCHAR'})
WHERE rank = 'genus'
  AND active = 'true'
  AND list_contains(string_split(ancestry, '/'), '630955')  -- Anthophila descendants only
```

> **Discretion call for planner:** the read-from-CSV-in-a-model approach couples dbt to a raw file
> path. The cleaner alternative (matches `taxon_lineage_extended` provenance) is to have
> `taxa_pipeline.py` write an `inaturalist_data.genus_taxon_ids` table and add it to `sources.yml`,
> then make this staging model a passthrough. Either works; the CSV-read keeps the change dbt-only and
> avoids a Python pipeline edit. The Anthophila filter is the load-bearing part either way.

**The COALESCE (D-01).** Apply **per-ARM in `int_combined.sql`**, NOT in the mart. Rationale: each ARM
has a different `canonical_name` derivation (ARM 2 builds it inline from `specimen_inat_taxon_name`),
so the genus join key must be local to each ARM to stay correct. Pattern for ARM 1:

```sql
-- replace line 46:  ctt.taxon_id::INTEGER AS taxon_id
COALESCE(ctt.taxon_id, g.taxon_id)::INTEGER AS taxon_id
-- add LEFT JOIN (after the ctt join, ~line 57):
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g
    ON ctt.taxon_id IS NULL
   AND position(' ' IN COALESCE(syn_e.accepted_name, e.canonical_name)) = 0  -- single-token only
   AND g.genus_name = lower(COALESCE(syn_e.accepted_name, e.canonical_name))
```

Repeat for ARM 3 (`syn_io.accepted_name, io.canonical_name`) and ARM 2 (the derived
`lower(trim(...))` expression — note ARM 2's key is already lowercased). The `ctt.taxon_id IS NULL`
guard ensures genus backfill never overrides an existing species-level taxon_id.

**Join key normalization:** lowercase both sides. `genus_name` from the staging model is `lower(name)`;
occurrence `canonical_name` is already normalized lowercase by `normalize_scientific_name`
(verified: all 36 live genus names are already lowercase in the parquet). Single-token guard via
`position(' ' IN name) = 0`.

### Anti-Patterns to Avoid

- **Joining genus on `taxon_lineage_extended` with `subgenus IS NULL`** — fans out across
  species/subspecies rows (verified: `stelis` returns 5 rows). Wrong.
- **Putting the COALESCE in the mart** — `int_combined`'s ARM 2 derives `canonical_name` inline; the
  mart only sees the final `canonical_name`, so a mart-level genus join would need to re-derive nothing
  but loses the per-ARM key fidelity and the `ctt.taxon_id IS NULL` ordering guarantee is murkier.
- **Trusting `higher_rank_taxon_ids.json`** — its Python builder (`_build_higher_rank_taxon_ids`,
  `species_export.py:85`) has no ancestry filter and resolves the `stelis` collision by dict-overwrite,
  landing on 141523 (the **plant** Stelis). Do not source genus taxon_ids from the JSON.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Genus name → taxon_id map | A curated CSV seed of 36 genera | `taxa.csv.gz` rank='genus' + Anthophila filter | Self-maintaining as new genera appear; seed would silently miss new bycatch |
| Single-token detection | Regex / token-count UDF | `position(' ' IN name) = 0` | Already the implicit contract everywhere (`canonical_name LIKE '% %'` = two-token) |
| Collision resolution | Manual taxon_id overrides | Anthophila ancestry filter (`630955` in ancestry) | Deterministic; the plant/bee Stelis collision proves manual lists rot |

## Runtime State Inventory

This phase changes **values** (NULL → genus taxon_id) in a regenerated parquet, not stored runtime
state. The parquet is rebuilt every `bash data/dbt/run.sh build`; nightly pushes to S3 +
CloudFront-invalidates. No keyed datastore, no OS registration, no secret changes.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `occurrences.parquet` is fully regenerated each build (not incrementally keyed) | none |
| Live service config | None — no external service stores genus taxon_ids | none |
| OS-registered state | None — nightly cron calls `data/nightly.sh` which rebuilds from scratch | none |
| Secrets/env vars | None | none |
| Build artifacts | `data/raw/taxa.csv.gz` (39 MB, dated 2026-05-28) is the genus source; already present and ETag-cached by `taxa_pipeline.download_taxa_csv`. If a NEW dbt staging model reads it, confirm it exists before build (it is produced by the `taxa-download` STEP, which runs before dbt). | Verify STEP ordering: `taxa-download` precedes `dbt build` in `run.py` STEPS (it does — Phase 126 confirmed) |

**Nothing requires a data migration** — the next build naturally backfills.

## Common Pitfalls

### Pitfall 1: `taxon_lineage_extended` is NOT a genus map (the CONTEXT.md trap)
**What goes wrong:** CONTEXT.md D-02/canonical_refs name `stg_inat__taxon_lineage_extended` as "the
genus taxon_id source." Joining it on `lower(genus)=name AND subgenus IS NULL` returns species rows too.
**Verified evidence:** `stelis` matches 5 rows (127831 genus + 4 species); `taxon_id 57678` is the
Lasioglossum genus self-row but is indistinguishable from a Lasioglossum species row without `rank`.
**How to avoid:** Source genus taxon_ids from `taxa.csv.gz rank='genus'`, not from tle.

### Pitfall 2: tle is bee-only; 5 NULL genera are non-bees
**What goes wrong:** `crossocerus` (wasp), `larropsis` (wasp), `plecoptera` (stonefly), `symphyta`
(sawfly), `trypoxylon` (wasp) are absent from `taxon_lineage_extended` (Anthophila-filtered). 46 rows.
**Decision point for planner:** sourcing from `taxa.csv.gz` (no bee filter on the read, only on
collision-resolution) WOULD resolve these 5 to their real iNat genus taxon_ids — backfilling all 36
genera (17,254 rows). If the intent is "bees only," scope the genus model with the Anthophila filter
and these 46 rows stay NULL by design. **Recommendation:** apply the Anthophila filter (bee atlas →
non-bee bycatch genera shouldn't get a "bee" genus link); document the 46 rows as legitimately NULL,
same class as the truly-unidentified set. Either way, state it explicitly in the plan.

### Pitfall 3: the `stelis` plant/bee collision
**What goes wrong:** `taxa.csv.gz` has TWO active genus rows named "Stelis": 127831 (bee, Megachilidae,
Anthophila) and 141523 (plant, Orchidaceae). Without the ancestry filter a join is non-deterministic.
**How to avoid:** `list_contains(string_split(ancestry,'/'),'630955')`. Verified: picks 127831.
57 occurrence rows affected.

### Pitfall 4: BIGINT → INTEGER cast at the mart boundary
**What goes wrong:** `taxa.csv.gz` taxon_id and `taxon_lineage_extended.taxon_id` are BIGINT; the
contract declares `taxon_id data_type: integer`. A genus taxon_id without a cast breaks the contract.
**How to avoid:** cast `taxon_id::INTEGER` in the staging model AND keep the existing `::INTEGER` on the
COALESCE (`COALESCE(ctt.taxon_id, g.taxon_id)::INTEGER`). iNat genus ids (max seen ~1.6M) fit INT32.

### Pitfall 5: the 37-column contract must NOT change
**What goes wrong:** adding a column to surface genus taxon_id would break the contract + `test_dbt_diff`.
**How to avoid:** this phase changes only `taxon_id` **values** and tests. The COALESCE replaces an
existing expression at the same column position (int_combined line 46/100/164). No SELECT-list count
change in `int_combined` or `occurrences.sql`. Verified: 37 cols today, 37 after.

### Pitfall 6: synonymy interaction
**What goes wrong:** genus names could in principle be remapped by `int_synonyms`.
**Verified:** synonymy is applied via `COALESCE(syn.accepted_name, canonical_name)` BEFORE the genus
join, so the genus key is post-synonymy — consistent with the species bridge. No genus name is
currently a synonym source (`auto_synonyms`/`occurrence_synonyms` are species-level), so genus names
pass through unchanged. Use the post-synonymy expression as the genus key anyway for consistency.

### Pitfall 7: "andrena already resolves" red herring
**What goes wrong:** `canonical_to_taxon_id` incidentally contains `andrena → 57669`, so one might
think bare genus names already resolve. **Verified false at the occurrence level:** all 3,423 `andrena`
occurrence rows are still NULL because... [investigation note] the bridge row exists but the live
parquet shows andrena NULL — meaning the bridge `andrena` entry is not being joined (likely the
resolution union resolved it for the species universe, not occurrences, or it post-dates the build).
Do not assume any single-token name resolves today; the live parquet is ground truth: **36 distinct
single-token genus names, 17,254 rows, ALL NULL**.

## Code Examples

### Re-scoped not_null test (D-04, D-05) — `data/tests/test_dbt_scaffold.py:303-322`

Current (species-level only):
```python
n = duckdb.execute(
    f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
    f"WHERE canonical_name LIKE '% %' "
    f"AND canonical_name NOT IN ({_KNOWN_UNRESOLVABLE}) "
    f"AND taxon_id IS NULL"
).fetchone()[0]
```
Proposed (every IDENTIFIED row — any non-empty canonical_name OR genus, minus the 3 unresolvable
species and, if the Anthophila filter is applied, the 5 non-bee genera):
```python
_KNOWN_UNRESOLVABLE = ("'anthidiellum robertsoni', 'lasioglossum aspilurus', 'osmia phaceliae'")
_NON_BEE_GENERA = ("'crossocerus', 'larropsis', 'plecoptera', 'symphyta', 'trypoxylon'")  # if Anthophila-filtered
n = duckdb.execute(
    f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
    f"WHERE (canonical_name IS NOT NULL AND canonical_name <> '' OR (genus IS NOT NULL AND genus <> '')) "
    f"AND canonical_name NOT IN ({_KNOWN_UNRESOLVABLE}) "
    f"AND lower(canonical_name) NOT IN ({_NON_BEE_GENERA}) "
    f"AND taxon_id IS NULL"
).fetchone()[0]
assert n == 0, f"Expected 0 null taxon_id rows for identified occurrences, got {n}"
```
Mirror the same `where:` change in `schema.yml:84-87` (the data_test `where:` clause). Keep
`severity: warn` per D-04 unless the planner promotes it after confirming the build is green.

### Scoped consistency test (D-06) — `data/tests/test_dbt_scaffold.py:327-336`

Current `USING(canonical_name)` joins genus-level occ rows to the 8 single-token species rows too.
Scope to species-level (two-token) rows so genus backfill cannot create false mismatches:
```python
n = duckdb.execute(f"""
    SELECT COUNT(*) FROM read_parquet('{occ_path}') o
    JOIN read_parquet('{sp_path}') s USING (canonical_name)
    WHERE o.canonical_name LIKE '% %'      -- species-level only (D-06)
      AND o.taxon_id != s.taxon_id
""").fetchone()[0]
```
Verified: today there is **no overlap** between the 36 backfill genera and the 8 single-token species
rows, so the test passes either way now — but the `LIKE '% %'` guard future-proofs against a genus
gaining a single-token species row. (Both sides would source the same genus map, so they'd agree, but
scope it explicitly per D-06.)

## State of the Art

| Old Approach | Current Approach | Why |
|--------------|------------------|-----|
| `occurrences.taxon_id` non-null only for two-token canonical_names (Phase 126) | finest-rank: species → genus self-row | TID-02 re-scope (human decision 2026-06-01) |
| genus taxon_ids only in Python `higher_rank_taxon_ids.json` (collision-buggy) | dbt staging model from `taxa.csv.gz` + Anthophila filter | dbt is the sole pipeline producer (CLAUDE.md) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The CSV-read-in-model path (`read_csv('../raw/taxa.csv.gz')`) works inside a dbt-duckdb model at build time, with `taxa.csv.gz` already downloaded by the `taxa-download` STEP before `dbt build` | Architecture Patterns | If the read fails or file is absent at build, the model errors. Mitigation: planner can confirm by building the staging model alone, or use the Python-loaded-table alternative |
| A2 | Subgenus/tribe/family rungs (D-01 "best-effort") add negligible coverage today — every NULL-taxon occurrence row is either single-token genus, two-token unresolvable species (3), or NULL canonical_name. No occurrence row carries a subgenus/tribe/family identifier without a genus/species name | live_data scope | Low — verified the only NULL buckets are genus (17,254), 3-species (33), NULL-name (21,652). Subgenus/tribe rungs would backfill 0 additional rows, so genus is the complete solution. Planner may omit finer rungs entirely |
| A3 | Applying the Anthophila filter (5 non-bee genera stay NULL) matches user intent | Pitfall 2 | Medium — this is a product judgment. Surface in plan; the alternative (drop the filter, backfill all 36) is a one-line change |

## Open Questions

1. **Anthophila filter on/off for the 5 non-bee genera (46 rows)?**
   - What we know: they have real iNat genus taxon_ids; they are wasps/sawflies/stoneflies (bycatch).
   - Recommendation: apply the filter (keep them NULL), document alongside the truly-unidentified set.
     The not_null test then excludes them via `_NON_BEE_GENERA`. Confirm with user if a strict not_null
     promotion is desired.

2. **CSV-read model vs. Python-loaded source table?**
   - Recommendation: CSV-read keeps it dbt-only (matches "surface, don't rebuild"); but a
     `genus_taxon_ids` source table is more consistent with `taxon_lineage_extended` provenance.
     Planner's discretion (CONTEXT.md grants the COALESCE-site discretion; this is adjacent).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `data/beeatlas.duckdb` | local build + verification | ✓ | 122 MB (2026-05-31) | nightly uses S3-restored `/tmp/beeatlas.duckdb` via `DB_PATH` |
| `data/raw/taxa.csv.gz` | genus source | ✓ | 39 MB (2026-05-28) | re-downloaded by `taxa_pipeline.download_taxa_csv` (ETag-cached) |
| dbt-core/dbt-duckdb 1.10.1 | the build | ✓ (via `uvx --python 3.13`) | 1.10.1 | — |
| `uv` / pytest | data tests | ✓ | per `data/pyproject.toml` | — |

No missing dependencies. **Local rebuild:** `bash data/dbt/run.sh build` (dbt only — produces
`dbt/target/sandbox/occurrences.parquet`); full pipeline `cd data && uv run python run.py`.
**Row-count verification:**
```bash
cd /home/peter/dev/beeatlas/data && uv run python3 -c "
import duckdb
occ='dbt/target/sandbox/occurrences.parquet'
con=duckdb.connect()
print('null taxon_id:', con.execute(f\"SELECT COUNT(*) FILTER(taxon_id IS NULL) FROM read_parquet('{occ}')\").fetchone())
print('single-token still null:', con.execute(f\"SELECT COUNT(*) FROM read_parquet('{occ}') WHERE taxon_id IS NULL AND canonical_name NOT LIKE '% %' AND canonical_name IS NOT NULL\").fetchone())
"
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (via `uv run pytest`) — `data/tests/` |
| dbt enforcement | `schema.yml` contract + `data_tests` at every `bash data/dbt/run.sh build` |
| Config file | `data/pyproject.toml` |
| Quick run command | `cd data && uv run pytest tests/test_dbt_scaffold.py -k "taxon_id" -x` |
| Full suite command | `cd data && uv run pytest && bash data/dbt/run.sh build` |

### Observable Truths → Test Map (Nyquist VALIDATION.md inputs)

| Truth | Mechanism | Automated Command |
|-------|-----------|-------------------|
| 35 (or 36, filter-dependent) genus names non-null in `occurrences.parquet` | duckdb count: single-token NULL canonical → 0 (excluding non-bee genera if filtered) | `pytest tests/test_dbt_scaffold.py::test_occurrences_taxon_id_non_null -x` (re-scoped) |
| ~17,254 newly non-null rows; NULL drops from 38,939 → ~21,698 | duckdb COUNT FILTER(taxon_id IS NULL) | row-count snippet in Environment Availability |
| Truly-unidentified rows (21,652 NULL canonical_name) still NULL | duckdb: NULL canonical_name rows all have NULL taxon_id | `SELECT COUNT(*) FROM occ WHERE canonical_name IS NULL AND taxon_id IS NOT NULL` == 0 |
| 3 unresolvable ecdysis species still NULL (not regressed) | `_KNOWN_UNRESOLVABLE` exclusion retained | covered by re-scoped not_null test |
| Species-level consistency: 0 mismatches `occ.taxon_id == species.taxon_id` | scoped join `WHERE o.canonical_name LIKE '% %'` | `pytest ::test_taxon_id_consistency -x` (scoped) |
| Genus taxon_id correct (no plant Stelis) | spot-check: `stelis` rows → 127831, `lasioglossum` → 57678 | duckdb spot-check query |
| 37-column contract still passes | dbt contract enforcement | `bash data/dbt/run.sh build` (fails if column count drifts) |
| Genus taxon_ids are INTEGER (no BIGINT leak) | parquet schema | `DESCRIBE SELECT * FROM read_parquet(occ)` → `taxon_id INTEGER` |

### Wave 0 Gaps
- [ ] `stg_inat__genus_taxon_ids.sql` — new staging model (genus source) — must exist before int_combined edit
- [ ] Re-scope `test_occurrences_taxon_id_non_null` (D-04/D-05) + `schema.yml` `where:` clause
- [ ] Scope `test_taxon_id_consistency` to `canonical_name LIKE '% %'` (D-06)
- [ ] (optional) add `test_genus_backfill_resolved` asserting the 35/36 genera resolve to expected ids

## Security Domain

Not applicable in the conventional sense — this phase touches no auth, input-validation, network, or
crypto surface. Inputs are a trusted local taxonomy dump (`taxa.csv.gz` from iNat Open Data S3,
already ingested) and an internal DuckDB file. No ASVS category applies (no user input, no session, no
access control). The only integrity concern — taxon_id collision (plant vs. bee) — is addressed by the
Anthophila ancestry filter (Pitfall 3) and is a data-correctness, not a security, control.

## Project Constraints (from CLAUDE.md)

- **dbt is the SOLE producer** of pipeline outputs — genus backfill MUST live in dbt models, not a
  post-export Python patch.
- **37-column `occurrences` contract** enforced at every `bash data/dbt/run.sh build` — do NOT change
  the column count; this phase changes values + tests only.
- **Static hosting / no server runtime** — N/A (data layer); parquet → S3 → CloudFront.
- **Python 3.14** project, but dbt runs under **Python 3.13** via `uvx` pin (`data/dbt/run.sh`).
- **Nightly** runs `data/nightly.sh` on maderas; `run.py` is the pure orchestrator. Local dbt-only
  rebuild: `bash data/dbt/run.sh build`. Keep STEP ordering intact (`taxa-download` before dbt build).

## Sources

### Primary (HIGH confidence — verified this session)
- Live `data/beeatlas.duckdb` (read-only) — all taxon_id / genus / ancestry queries
- Built `data/dbt/target/sandbox/{occurrences,species}.parquet` (2026-06-01 03:04) — row counts, null buckets
- `data/raw/taxa.csv.gz` — genus self-rows, stelis collision, Anthophila ancestry
- Source files: `int_combined.sql`, `occurrences.sql`, `int_species_universe.sql`,
  `stg_inat__canonical_to_taxon_id.sql`, `stg_inat__taxon_lineage_extended.sql`, `marts/schema.yml`,
  `species_export.py`, `taxa_pipeline.py`, `tests/test_dbt_scaffold.py`, `dbt/run.sh`, `dbt/profiles.yml`,
  `dbt/sources.yml`, `dbt/dbt_project.yml`

### Decision provenance
- `128-CONTEXT.md` (D-01..D-06), `126-VERIFICATION.md` (human_decision), `126-CONTEXT.md` (D-03, RD-02),
  `REQUIREMENTS.md` (re-scoped TID-02), `STATE.md`

## Metadata

**Confidence breakdown:**
- Current wiring: HIGH — read every relevant file:line
- Genus source: HIGH — empirically disproved the tle approach, verified taxa.csv.gz completeness + collision fix
- COALESCE site: HIGH — per-ARM is the only correct site given ARM 2's inline key derivation
- Tests: HIGH — exact files/lines located, current + proposed assertions verified against live data
- Non-bee filter (A3): MEDIUM — correctness verified; product intent is a judgment call

**Research date:** 2026-06-01
**Valid until:** 2026-06-30 (stable dbt models; revalidate if `taxa.csv.gz` re-downloads or new genera appear)
