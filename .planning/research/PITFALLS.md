# Pitfalls Research

**Domain:** v4.5 iNat Taxonomy & Species Completeness — adding specific_epithet backfill, taxon_id propagation, inactive-taxon remapping, and ancestor chain materialization to an existing dbt+DuckDB+Eleventy pipeline.
**Researched:** 2026-05-29
**Confidence:** HIGH — all findings from direct code inspection of the current system.

---

## Critical Pitfalls

### Pitfall 1: `specific_epithet` backfill silently breaks slug generation for non-checklist species

**What goes wrong:**
`specific_epithet` is currently only populated from the checklist arm of the FULL OUTER JOIN in `int_species_universe.sql` (line 90: `c.specific_epithet AS specific_epithet`). The ecdysis/iNat observation arm produces NULL. The `species_export.py` slug builder at line 135-139 uses `genus and epithet` to form `Genus/specificEpithet` slugs: if either is missing, it falls back to a genus-only slug or `slugify(scientificName)`. Non-checklist species (the 65 currently invisible ones) therefore get genus-only slugs today.

When you backfill `specific_epithet` from iNat lineage data for non-checklist species — so they get proper `Genus/epithet` slugs — any species that *already has* a genus-only page at `/species/{Genus}/` will now generate a new species page at `/species/{Genus}/{epithet}/`. That is correct. But if a species was already getting an `epithet` from some other path (e.g., manual entry, a prior pipeline step), and the new backfill produces a different value, Eleventy will generate pages at both the old and new slugs, and the old static page file will persist in `public/` until a clean build.

**Why it happens:**
The slug is built in Python from the `specific_epithet` column. The FULL OUTER JOIN produces NULL on the observation side, and nobody previously needed to fill it for observation-only species. Changing the COALESCE logic adds the new value, but old deployed pages are not automatically removed.

**How to avoid:**
In the same phase that backfills `specific_epithet`, verify via `test_dbt_diff.py`'s `test_species_canonical_name_key_set_matches` that the species set matches — this will catch unexpected new rows but not slug mutations on existing rows. Also: run `species_export.py` against the new `species.parquet` and diff the `slug` column against the previously-deployed `public/data/species.parquet` to catch any species whose slug changes. Any changed slug means its old Eleventy-generated HTML file persists as a stale page.

A clean Eleventy build (deleting `_site/` before build) removes stale pages, but the nightly pipeline does an incremental Eleventy build. Document and enforce a clean build for any milestone that changes slug values.

**Warning signs:**
- A species appears twice in the species index (once via the old slug route, once via the new)
- `test_species_canonical_name_key_set_matches` passes but specific species pages return 404
- `slug` diff between sandbox and public shows species with changed slug values

**Phase to address:**
The phase that backfills `specific_epithet` for non-checklist species. Add a slug-diff step to the verification checklist.

---

### Pitfall 2: Adding `taxon_id` to the `occurrences` mart breaks the 36-column dbt contract and the `test_dbt_diff.py` baseline

**What goes wrong:**
The `occurrences` mart has `contract: enforced: true` in `schema.yml` with 36 columns. `test_dbt_diff.py::test_occurrences_schema_matches` asserts that `sandbox` and `public/data/` parquets have identical ordered column lists. Adding `taxon_id` to `int_combined` (and therefore to `occurrences.sql`) requires:
1. Adding `taxon_id` to `schema.yml` with the correct `data_type`
2. Updating the docstring in `test_occurrences_schema_matches` (currently says "30 cols" — already stale at 36 cols)
3. Running a full pipeline to update `public/data/occurrences.parquet` so the diff test can pass

If step 1 is omitted, dbt build succeeds (contract only validates declared columns) but the column is untyped and the contract no longer covers it. If step 3 is not done before pushing to main, CI's `test_dbt_diff.py` will fail because sandbox (37 cols) != public (36 cols).

The `sqlite_export.py` that builds `occurrences.db` (the prebuilt SQLite) uses `CREATE TABLE AS SELECT * FROM read_parquet(...)` — it derives schema from the parquet at export time. Adding a column to the parquet automatically adds it to the SQLite, which is safe but means `occurrences.db` on the CDN also changes. The frontend wa-sqlite queries must be audited to ensure they do not assume a fixed column set.

**Why it happens:**
The test compares sandbox vs. the last deployed public artifact, which lags behind during development. Developers naturally run dbt build before pushing, but forget to regenerate `public/data/` artifacts.

**How to avoid:**
The step sequence for any column addition to `occurrences`:
1. Add column to `int_combined` (or upstream model) + to `occurrences.sql` SELECT
2. Add column to `schema.yml` in the same commit
3. Run `bash data/dbt/run.sh build` to produce sandbox artifacts
4. Run the full pipeline (`uv run python run.py`) to update `public/data/`
5. Run `uv run pytest data/tests/test_dbt_diff.py` to verify 0 failures
6. Audit `buildFilterSQL()` and any other frontend SQL that touches `occurrences` columns

**Warning signs:**
- `test_occurrences_schema_matches` fails with "Sandbox only: [('taxon_id', 'INTEGER')]"
- dbt build exits 0 but `taxon_id` absent from `schema.yml`
- Frontend filter producing unexpected results on a column that moved position

**Phase to address:**
The phase that introduces `taxon_id` to the occurrences mart. Must be treated as a breaking schema change with the full step sequence above.

---

### Pitfall 3: Inactive taxon remapping collides with the manual `occurrence_synonyms.csv` mechanism — they operate on different tables at different times

**What goes wrong:**
The current synonym mechanism (`occurrence_synonyms.csv`) is applied at the `int_combined` layer: `COALESCE(syn.accepted_name, canonical_name)`. Inactive taxon remapping via `is_active` / `current_taxon_id` in `taxa.csv.gz` is a different mechanism that would operate at the `resolve_taxon_ids.py` / `canonical_to_taxon_id` layer or in a new pipeline step.

If both mechanisms try to remap the same name, the order of application determines which wins. Concretely: if `occurrence_synonyms.csv` maps `Agapostemon texanus → subtilior`, but `taxa.csv.gz` says `texanus` is inactive with `current_taxon_id` pointing to a *different* accepted name, the two mechanisms produce conflicting canonical names. The species universe will have both `subtilior` (from manual synonym) and whatever iNat considers current — two rows for what should be one species.

**Why it happens:**
The manual CSV was designed for controlled, explicit curation of WABA-specific taxonomy decisions (e.g., applying a recent paper not yet in iNat). Automated inactive-taxon remapping from iNat status is a separate concern that operates at ingestion time, not at dbt transform time. When a name appears in both, there is no single authority.

**How to avoid:**
Define a clear precedence hierarchy before implementation:
- Manual `occurrence_synonyms.csv` wins over automated inactive-taxon remapping (manual curation supersedes automated source)
- OR: automated remapping wins, and manual CSV is reserved for cases where iNat has NOT yet updated

Document the chosen policy in a comment in `occurrence_synonyms.csv` and in the dbt model. When implementing inactive-taxon remapping, add a check: if a name is already in `occurrence_synonyms.csv`, skip automated remapping for that name and emit a warning to `lineage_unresolved.csv` (or a dedicated file) flagging the conflict.

Also: `stg_checklist__species.sql` applies synonymy by rewriting `canonical_name` AND `specific_epithet`. If an inactive taxon remapping changes a name at the data-source level (before dbt staging), the staging model must also remap `specific_epithet` — otherwise the canonical_name says `subtilior` but `specific_epithet` still says `texanus`, producing a broken slug `Agapostemon/texanus` for a species named `subtilior`.

**Warning signs:**
- `DISTINCT ON (canonical_name)` in `int_species_universe` collapses rows — if two rows survive for the same species (one from each mechanism), the `on_checklist DESC` tiebreak silently picks one
- `lineage_unresolved.csv` gaining entries that were previously resolved
- Species page count decreasing unexpectedly after adding remapping

**Phase to address:**
The phase that implements inactive-taxon remapping. Must define precedence before writing any code; add a conflict-detection step.

---

### Pitfall 4: DuckDB INTEGER[] arrays in ancestor chains carry the same corruption risk as `month_histogram`

**What goes wrong:**
The existing `month_histogram` column (INTEGER[12]) had a documented DuckDB 1.5.2 materialization bug: when a CASE expression produced INTEGER[] arrays on both branches (both non-NULL), the materialized table stored garbage values. The fix was to use element-wise COALESCE arithmetic instead of array-level CASE branching.

An ancestor chain materialized as `INTEGER[]` (e.g., `ancestry_ids INTEGER[]`) faces the same risk if it is produced by a CASE or COALESCE on arrays in a `materialized='table'` model. The risk is higher here because ancestor chains have variable lengths and DuckDB's list operations involve more complex internal representations than a fixed-length 12-element array.

**Why it happens:**
DuckDB's materialization of `LIST` type expressions in TABLE models has historically been inconsistent. The `list_value(...)::INTEGER[12]` workaround in `int_species_universe.sql` is already documented with a comment explaining the bug. Any new INTEGER[] column in a TABLE-materialized model is a candidate for the same issue.

**How to avoid:**
If ancestor chains are stored as arrays, use the explicit `list_value(a, b, c, ...)` form rather than array-producing CASE expressions or list concatenation operators. If the chain length is variable, consider storing the ancestor IDs as a VARCHAR (slash-separated, mirroring the taxa.csv.gz `ancestry` column format) instead of INTEGER[]. VARCHAR is immune to array materialization bugs.

After producing the table, immediately run a sanity check: select a known deep-taxonomy species (e.g., a species in a tribe), inspect its ancestor array directly from the materialized table, and verify the IDs are valid taxon IDs (not garbage floats or truncated integers).

**Warning signs:**
- Ancestor arrays containing values like `3.14e+8` or negative numbers
- Species with tribes showing NULL tribe despite the taxa.csv.gz file having the correct entry
- DuckDB `DESCRIBE` showing the column as `BIGINT[]` when INTEGER[] was specified (type widening during materialization)

**Phase to address:**
The phase that materializes ancestor chains. Validate the output immediately after the first `dbt build`.

---

### Pitfall 5: `specific_epithet` backfill from iNat lineage changes which species get pages — `species.js` `specific_epithet !== null` gate has cascading effects

**What goes wrong:**
`_data/species.js` line 97 uses `specific_epithet !== null` as the gate for `speciesList` (which species get pages). Currently, 65 non-checklist species have `specific_epithet = NULL` in `species.parquet` — they are invisible to the site entirely.

When backfill makes them non-NULL, they enter `speciesList`. Each of them triggers Eleventy pagination to generate a species page at `/species/{Genus}/{epithet}/`. That's the desired outcome. But it also triggers:
- `species_maps.py` to generate an SVG occurrence map for each new species
- The species index at `/species/` to include them in the genus-grouped list
- Genus pages to list them as members with occurrence counts and colored dots
- `seasonality.json` to include their bucket data (they already appear there if they have occurrences)

The SVG map generation is gated on `occurrence_count > 0` in `species_maps.py` (confirmed pattern from prior milestone). The 65 currently-invisible species have occurrence records (they appear in `occurrences.parquet` but have no species page). So all 65 will trigger SVG generation. If `species_maps.py` is not run before the Eleventy build, the pages will generate but the `<img src=".../species-maps/{slug}.svg">` tags will 404.

**Why it happens:**
The pipeline has a dependency: `species_maps.py` must run and upload to S3 (via nightly.sh) BEFORE the Eleventy build that generates the pages. This dependency exists today but is only triggered for the known species set. Expanding the set requires confirming the pipeline step order in `run.py` and `nightly.sh`.

**How to avoid:**
Before implementing backfill, verify the `run.py` STEPS ordering: `species-maps` must come before `eleventy-build`. Grep `nightly.sh` to confirm SVG files are uploaded to S3 before CloudFront invalidation. After the first pipeline run with backfilled species, check S3 for the 65 new SVG files.

Add an assertion to `species_maps.py` post-run: every `canonical_name` in `species.parquet` with `specific_epithet IS NOT NULL AND occurrence_count > 0` must have a corresponding `.svg` file generated.

**Warning signs:**
- 65 new species pages appearing in the Eleventy build but their SVG maps returning 404 on CloudFront
- `nightly.sh` completing without error but S3 missing the new SVG keys
- `species_maps.py` count output showing fewer species than expected

**Phase to address:**
The same phase as `specific_epithet` backfill. Verify pipeline step ordering before executing.

---

### Pitfall 6: The `test_dbt_diff.py` docstring baseline says "30 cols" but occurrences already has 36 — adding `taxon_id` will not trigger the comment update as a build failure

**What goes wrong:**
`test_occurrences_schema_matches` has a docstring saying "30 columns" that was last updated when the contract had 30 columns. The actual contract now has 36 columns (verified: 36 columns in `public/data/occurrences.parquet`). The docstring is documentation-only — it does not affect the test outcome. When a developer adds `taxon_id` (making it 37), they will update the comment to "37 columns" thinking the old count was 36, when actually the comment should have said 36 already. This creates false confidence that the docstring is always current.

More importantly: the test itself compares sandbox vs. public (not a fixed count). If a developer adds `taxon_id` to the dbt model and schema.yml, runs `dbt build`, but does NOT run the full pipeline to update `public/data/occurrences.parquet`, the test will FAIL with "Sandbox only: [('taxon_id', ...)]" — which is the correct failure. But if the developer then copies the sandbox file to `public/data/` manually (shortcutting the spatial join pipeline), they bypass the spatial assignment and `county`/`ecoregion_l3` will be NULL for all new rows.

**Why it happens:**
The shortcut path (copy sandbox parquet to public/) is tempting when you just want the schema test to pass. It corrupts the spatial data silently.

**How to avoid:**
Never copy sandbox parquet directly to `public/data/`. The full pipeline must run (`uv run python run.py` or at minimum the export steps) to produce correctly-joined output. Add a comment to `test_dbt_diff.py` explicitly warning against this shortcut.

Update the "30 cols" docstring to "36 cols" in the same commit that fixes the schema. Do not defer this cleanup.

**Warning signs:**
- `county` IS NULL for rows that clearly have valid coordinates in `occurrences.parquet`
- Row count in sandbox vs. public differs by the number of new species × their occurrence count
- `test_occurrences_county_spatial_diff` detecting 0 diff rows when it should detect new rows with NULL county

**Phase to address:**
The phase introducing any new column to `occurrences`. Fix the "30 cols" docstring comment at the start of the milestone.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Backfill `specific_epithet` only for non-checklist species | Simple — add COALESCE to one line | Any future rename of the lineage source column breaks the backfill silently | Never — add a dbt test covering both checklist and non-checklist arms |
| Store `taxon_id` only in `species.parquet`, not `occurrences.parquet` | Avoids occurrences contract change | Each occurrence must join species to get taxon_id — adds a JOIN in every downstream query | Acceptable in MVP if occurrences don't need taxon_id at query time |
| Skip conflict detection between `occurrence_synonyms.csv` and inactive-taxon remapping | Faster implementation | Ghost rows or wrong canonical_name for conflicted names; discovered only in UAT | Never — define precedence before writing code |
| Use VARCHAR slash-separated ancestor IDs instead of INTEGER[] | Immune to array materialization bug | String splitting needed at query time; less type-safe | Acceptable if ancestor queries are infrequent or in Python |
| Skip `test_dbt_diff.py` docstring update | Saves 2 minutes | Docstring rot makes the test harder to read; wrong column counts mislead future developers | Never — 2-minute fix, do it |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `specific_epithet` COALESCE in `int_species_universe.sql` | Adding `COALESCE(c.specific_epithet, tle.subgenus)` — subgenus is NOT the same as specific_epithet for species like `Agapostemon (Agapostemon) texanus` | Pull `specific_epithet` from `taxa.csv.gz` via the lineage table; it is the second token of `name` at `rank = 'species'` |
| `stg_inat__taxon_lineage_extended` LEFT JOIN in `int_species_universe` | The JOIN is `ON tle.taxon_id = ctt.taxon_id` — if `canonical_to_taxon_id` has no entry for a species, the JOIN produces NULL lineage, silently leaving family/genus NULL | Verify `canonical_to_taxon_id` coverage before relying on lineage backfill; check `lineage_unresolved.csv` |
| `canonical_to_taxon_id` bridge table | `resolve_taxon_ids.py` queries `ecdysis_data.occurrences` and `checklist_data.species` for names to resolve — it does NOT include iNat ARM 3 canonical names | New iNat obs species not in Ecdysis or checklist will have no `taxon_id` entry unless the query is extended |
| `taxa.csv.gz` `active = 'true'` string | `taxa_pipeline.py` already documents this — `active` is a string 'true'/'false', not a SQL boolean | Always use `active = 'true'` (string literal); any NEW code reading taxa.csv.gz must repeat this guard |
| `occurrence_synonyms.csv` + `stg_checklist__species.sql` | Synonymy rewrites `canonical_name` AND `specific_epithet` (using `split_part(syn.accepted_name, ' ', 2)`). If the accepted_name is a 1-token name (genus), `split_part` returns '' and `NULLIF(..., '')` yields NULL — producing a broken slug | Guard accepted_name synonym rewrites with `length(split_part(accepted_name, ' ', 2)) > 0` before applying |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Materializing ancestor chains in a `materialized='view'` instead of `materialized='table'` | Every downstream query re-evaluates the full ancestry walk; `int_species_universe` already does this walk and is TABLE-materialized for exactly this reason | Use `materialized='table'` for any model that produces ancestor chains via unnest/join | Immediate — the ancestry walk on taxa.csv.gz is O(species × depth); at ~5000 bee species × ~8 ancestor levels = ~40K join rows, re-evaluation is expensive |
| Running `resolve_taxon_ids.py` against ALL names including previously-unresolved ones on every nightly run | Each unresolved name costs one iNat API call (~0.5s with pacing); if 50 names fail every night, that is 25 seconds of wasted pacing per run | The existing `lineage_unresolved.csv` skip mechanism already handles this — do not break it when adding new name sources | Breaks at >60 unresolved names (the pacing would extend nightly runtime past acceptable) |
| Ancestor chain as full BIGINT[] in occurrences mart | Every row in occurrences.parquet carries the full ancestor array (8+ integers); at 50K rows × 8 × 8 bytes = 3.2 MB of ancestor data in what is currently a 36-column file | Store ancestor chains in `species.parquet` only (keyed by canonical_name); join at query time if needed | Immediate file size impact; frontend wa-sqlite load time increases |

---

## "Looks Done But Isn't" Checklist

- [ ] **`specific_epithet` backfill:** Verify BOTH arms of the FULL OUTER JOIN produce non-NULL `specific_epithet` for their respective species — check `SELECT COUNT(*) FROM species WHERE specific_epithet IS NULL AND occurrence_count > 0`
- [ ] **`taxon_id` in `occurrences` mart:** Verify `schema.yml` updated AND `public/data/occurrences.parquet` regenerated via full pipeline (not sandbox copy)
- [ ] **Inactive taxon remapping:** Verify that `occurrence_synonyms.csv` entries are not double-remapped — run `SELECT canonical_name FROM occurrence_synonyms WHERE canonical_name IN (SELECT synonym FROM occurrence_synonyms)` to detect any chain-synonymy
- [ ] **Ancestor chain materialization:** Spot-check a tribe-bearing species (e.g., Bombus) and a tribe-less species (e.g., Hylaeus) for correct ancestor array contents
- [ ] **`test_dbt_diff.py` docstrings:** All baseline column counts updated to actual current values before the milestone starts
- [ ] **`resolve_taxon_ids.py` name scope:** Confirms iNat ARM 3 canonical names are included in the names-to-resolve query (currently queries only `ecdysis_data.occurrences` and `checklist_data.species`)
- [ ] **Slug collision detection:** After backfill, run `SELECT slug, COUNT(*) FROM species GROUP BY slug HAVING COUNT(*) > 1` to detect any slug collisions introduced by new species
- [ ] **S3 SVG upload:** All 65+ newly-visible species have SVG maps uploaded to S3 before CloudFront invalidation
- [ ] **`stg_checklist__species.sql` synonym rewrite:** `specific_epithet` rewrite uses `NULLIF(split_part(..., ' ', 2), '')` — verify accepted_name synonyms that are binomials produce correct epithet

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `specific_epithet` backfill → stale slug for non-checklist species | Phase that adds lineage backfill to `int_species_universe` | Slug diff: `SELECT canonical_name, slug FROM species WHERE slug != old_slug` |
| `taxon_id` in occurrences mart → contract breakage | Phase that adds `taxon_id` column | `dbt build` exits 0; `test_dbt_diff.py` passes after full pipeline run |
| Inactive remapping vs. manual synonyms conflict | Phase that implements inactive-taxon remapping | Conflict detection script: names in both `occurrence_synonyms.csv` AND flagged inactive |
| INTEGER[] ancestor chain corruption | Phase that materializes ancestor chains | Post-build spot-check: `SELECT ancestor_ids FROM species WHERE canonical_name = 'Bombus vosnesenskii'` |
| 65 newly-visible species missing SVG maps | Same phase as `specific_epithet` backfill | `SELECT canonical_name FROM species WHERE specific_epithet IS NOT NULL AND occurrence_count > 0` vs. files in `public/data/species-maps/` |
| `test_dbt_diff.py` "30 cols" docstring rot | First phase of milestone (pre-work) | Grep test file for stale column count comments; fix before any new column work |
| `resolve_taxon_ids.py` missing iNat ARM 3 names | Phase that extends the names-to-resolve query | `SELECT COUNT(*) FROM int_combined WHERE source = 'inat_obs' AND canonical_name NOT IN (SELECT canonical_name FROM canonical_to_taxon_id)` |
| Manual pipeline shortcut: sandbox parquet copied to public/ | Any phase with schema contract change | `test_occurrences_county_spatial_diff` must show 0 NULL-county rows for rows with valid coordinates |

## Sources

All findings from direct code inspection of:
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_species_universe.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_combined.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/occurrences.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/schema.yml`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/species.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/staging/stg_checklist__species.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql`
- `/Users/rainhead/dev/beeatlas/data/resolve_taxon_ids.py`
- `/Users/rainhead/dev/beeatlas/data/species_export.py`
- `/Users/rainhead/dev/beeatlas/data/taxa_pipeline.py`
- `/Users/rainhead/dev/beeatlas/data/tests/test_dbt_diff.py`
- `/Users/rainhead/dev/beeatlas/_data/species.js`
- `/Users/rainhead/dev/beeatlas/.planning/PROJECT.md`
- Prior PITFALLS.md (v4.0 checklist milestone research)

---
*Pitfalls research for: v4.5 iNat Taxonomy & Species Completeness*
*Researched: 2026-05-29*
