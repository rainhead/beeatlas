# Pitfalls Research: Unified Occurrence Model (v2.7)

**Domain:** Collapsing ecdysis.parquet + samples.parquet into occurrences.parquet; replacing two frontend layers with one unified layer.
**Researched:** 2026-04-16
**Confidence:** HIGH — all pitfalls grounded in the specific current codebase.

---

## Pitfall Summary Table

| # | Pitfall | Risk | Phase |
|---|---------|------|-------|
| 1 | host_observation_id NULL breaks join key uniqueness | CRITICAL | Pipeline: outer join |
| 2 | Row duplication when one specimen matches multiple samples | CRITICAL | Pipeline: outer join |
| 3 | Column name collisions between ecdysis and samples schemas | HIGH | Pipeline: outer join |
| 4 | filter.ts breaks when column names or table name changes | HIGH | Frontend: filter SQL |
| 5 | OL feature ID prefix contract (ecdysis:/inat:) broken during layer consolidation | HIGH | Frontend: layer replacement |
| 6 | Selection state / URL restore silently clears on reload | HIGH | Frontend: layer replacement |
| 7 | Cluster style bypasses cache for wrong reason after layer merge | HIGH | Frontend: style/clustering |
| 8 | Schema gate validated against wrong file names | HIGH | Schema gate migration |
| 9 | hyparquet loading wider schema — missing column or wrong order | MEDIUM | Frontend: data loading |
| 10 | Date column type divergence causes hyparquet type mismatch | MEDIUM | Frontend: data loading |
| 11 | Sidebar detail rendering assumes source-specific column presence | MEDIUM | Frontend: sidebar |
| 12 | Collector filter breaks — recordedBy vs observer column semantics change | MEDIUM | Frontend: filter SQL |
| 13 | validate-schema.mjs ships before nightly produces occurrences.parquet | MEDIUM | Schema gate migration |
| 14 | buildFilterSQL two-table split becomes stale dead code | LOW | Frontend: filter SQL |

---

## Critical Pitfalls

### Pitfall 1: NULL host_observation_id Breaks the Full Outer Join

**What goes wrong:** The join between ecdysis and samples uses `host_observation_id` (ecdysis side) matched to `observation_id` (samples side). In ecdysis.parquet, `host_observation_id` is nullable — approximately 46k − number_linked rows have it NULL. A naive `FULL OUTER JOIN ecdysis ON ecdysis.host_observation_id = samples.observation_id` will not match those rows to any sample. That is correct behavior, BUT: if the join is written carelessly as `WHERE ecdysis.host_observation_id = samples.observation_id` or as an `INNER JOIN`, those ~80-90% of unlinked specimens disappear entirely.

**Why it happens:** NULL = NULL is false in SQL. `FULL OUTER JOIN ... ON a.col = b.col` handles NULL correctly on the join condition (unmatched rows appear with NULLs on the other side), but any subsequent WHERE clause filtering on either side will drop the unmatched rows.

**Consequences:** Silently losing 80-90% of specimens. The output row count will look superficially reasonable (9.5k sample rows visible), masking the data loss.

**Prevention:**
1. Write the FULL OUTER JOIN and immediately assert the output row count: `SELECT COUNT(*) FROM occurrences` must be ≥ max(COUNT(ecdysis), COUNT(samples)), not less.
2. Assert `COUNT(*) FILTER (WHERE ecdysis_id IS NULL AND observation_id IS NULL) = 0` — every row must have at least one source side populated.
3. Add a post-export check: `COUNT(*) FILTER (WHERE ecdysis_id IS NOT NULL)` must equal the pre-join ecdysis row count.

**Warning signs:** occurrences.parquet row count equals approximately 9.5k (only samples) or equals linked ecdysis count (~1,374). Either means the join is not FULL OUTER.

**Phase to address:** Pipeline: outer join (the DuckDB SQL in export.py).

---

### Pitfall 2: Row Duplication When One Specimen Links to Multiple Samples

**What goes wrong:** The `occurrence_links` table pairs ecdysis `occurrence_id` → `host_observation_id`. If a single specimen's `host_observation_id` appears in the samples table more than once (which should be impossible given samples are unique iNat observations, but could happen from data bugs or future pipeline changes), the FULL OUTER JOIN produces duplicate specimen rows.

Additionally, the spatial join in export.py can produce multiple county rows per specimen (eco_dedup uses `DISTINCT ON` to prevent this for ecoregions, but the county dedup path relies on `final_county` also being distinct). If the unified join is rewritten and these dedup CTEs are inadvertently dropped or altered, duplicate rows re-emerge.

**Why it happens:** FULL OUTER JOIN fanout: if ecdysis row A matches N sample rows, the output has N rows for specimen A. The `MIN(waba.id)` dedup for specimen_observation_id (v2.3 decision) is a precedent showing this problem already occurred once.

**Consequences:** Row count inflated; specimens appear multiple times in the map as clustered points; table view shows duplicate rows; CSV export double-counts; filter counts are wrong.

**Prevention:**
1. Assert after export: `SELECT COUNT(*) FROM occurrences` equals `COUNT(DISTINCT ecdysis_id) WHERE ecdysis_id IS NOT NULL` plus `COUNT(*) WHERE ecdysis_id IS NULL`. Exact equality required.
2. If any ecdysis_id appears more than once, the outer join has a fanout bug. Add a GROUP BY + aggregation step if needed.
3. Preserve the `DISTINCT ON` or equivalent dedup logic from the existing county/ecoregion CTEs in the new unified export.

**Warning signs:** `SELECT ecdysis_id, COUNT(*) FROM occurrences GROUP BY ecdysis_id HAVING COUNT(*) > 1` returns any rows.

**Phase to address:** Pipeline: outer join (add post-export dedup assertion).

---

## High Risk Pitfalls

### Pitfall 3: Column Name Collisions Between ecdysis and samples Schemas

**What goes wrong:** Both parquets share several column names with the same meaning (`county`, `ecoregion_l3`, `elevation_m`, `date`). They also have columns that look similar but mean different things: ecdysis has `latitude`/`longitude`, samples has `lat`/`lon`. After a FULL OUTER JOIN, a unified schema must pick one canonical name for each concept. If `COALESCE(ecdysis.latitude, samples.lat)` is used without renaming, the output column is called `latitude` on one side and `lat` on the other — or the join SQL uses both names and the frontend must know which to read.

Similarly: ecdysis has `recordedBy` (DarwinCore camelCase), samples has `observer` (iNat login). These are parallel concepts. In a unified row, a specimen-only occurrence has `recordedBy` non-null and `observer` null; a sample-only occurrence has the reverse. The frontend must handle both nullability patterns.

**Consequences:** Frontend code referencing `lat`/`lon` (sample geometry columns) will return null for specimen-only rows that use `latitude`/`longitude`. Geometry will be missing for specimen-only occurrences, and they will not appear on the map.

**Prevention:**
1. Audit all column names in both schemas before writing the outer join SQL. Produce a column-by-column mapping table before coding.
2. Use `COALESCE(ecdysis.latitude, samples.lat) AS latitude` for shared-concept columns; canonicalize to one name.
3. Keep source-specific columns (recordedBy, observer, specimen_count, scientificName, etc.) with their original names — nullability conveys which source contributed.
4. Document the canonical column name decisions in a comment at the top of export.py.

**Warning signs:** Frontend shows no geometry (all NULLs) for one category of occurrences; check which geometry column name was used in the SELECT.

**Phase to address:** Pipeline: column schema design (before writing the outer join SQL).

---

### Pitfall 4: filter.ts Breaks When Column Names or Table Name Changes

**What goes wrong:** `buildFilterSQL()` currently emits SQL targeting two tables: `ecdysis` (for specimen clauses) and `samples` (for sample clauses), with hardcoded column names like `scientificName`, `recordedBy`, `year`, `month`, `observer`. These are the SQLite table names created in `sqlite.ts` `loadAllTables()`.

After the migration, the SQLite layer will have a single `occurrences` table with a unified schema. Every place in filter.ts that references `ecdysis` or `samples` as table names will be wrong. Every column reference to `year`, `month` (which in samples is derived via `strftime`) will need to be unified.

Critically, `buildFilterSQL()` currently returns `{ ecdysisWhere, samplesWhere }` — two separate WHERE clauses for two queries. In the unified model this API must change to return a single WHERE clause or the callers (queryVisibleIds, queryTablePage, queryAllFiltered, queryFilteredCounts) must all be updated.

**Why it happens:** The two-table split is structural throughout filter.ts. It was designed this way and every caller uses both fields. The migration touches a load-bearing abstraction, not just constants.

**Consequences:** Filter queries return empty results or SQL errors; no visible errors in the UI if errors are swallowed; incorrect filter behavior produces wrong occurrence counts.

**Prevention:**
1. Before changing filter.ts, audit every caller of `buildFilterSQL()` and document which field (`ecdysisWhere` vs `samplesWhere`) each caller uses and why.
2. Define the new API signature first (`buildFilterSQL` → `string` single WHERE clause), update all callers, then rewrite the clause-building logic.
3. All existing filter.test.ts tests must pass with the new unified schema before any frontend layer changes.
4. Add a new test verifying that a collector filter correctly handles both `recordedBy` (specimen-only) and `observer` (sample-only) in a single WHERE clause.

**Warning signs:** Existing filter tests compile but start testing unreachable code paths (dead `ecdysisWhere` / `samplesWhere` branches); `npm test` passes but filter behavior in browser is wrong.

**Phase to address:** Frontend: filter SQL (must precede frontend layer replacement).

---

### Pitfall 5: OL Feature ID Prefix Contract Broken During Layer Consolidation

**What goes wrong:** Feature IDs are currently `ecdysis:<integer>` and `inat:<integer>`. These ID formats are load-bearing in at least four places:
- `queryVisibleIds()` constructs IDs as `` `ecdysis:${Number(rowValues[0])}` `` and `` `inat:${Number(rowValues[0])}` ``
- OL style callbacks call `f.getId()` and check Set membership using these IDs
- URL state encodes selected occurrence IDs in the `o=` parameter as comma-separated prefixed strings
- Click handler in bee-map.ts reads feature IDs to route to the correct sidebar detail (ecdysis vs iNat)

If the unified layer assigns a different ID scheme (e.g., just integers, or `occ:<integer>`), all four subsystems break simultaneously.

**Why it happens:** Refactoring a layer means rewriting the feature-creation code; the ID format is easy to inadvertently change during a rewrite of features.ts.

**Consequences:** Selection state lost on reload; style callback Set lookups miss all features (nothing filtered correctly); click handler cannot distinguish specimen from sample occurrence rows; URL sharing broken.

**Prevention:**
1. For unified occurrences, define the ID scheme before writing any code: specimen-only rows retain `ecdysis:<ecdysis_id>`, sample-only rows retain `inat:<observation_id>`, matched rows that have both sources need a policy (use `ecdysis:<ecdysis_id>` as primary since the specimen is the domain object).
2. Verify the ID scheme decision covers URL restore: if a URL was shared with `o=ecdysis:12345`, it must still resolve after the migration.
3. Write a test asserting the feature ID format produced by the new OccurrenceSource matches the expected prefix pattern.

**Warning signs:** Selecting an occurrence and copying the URL; after reload, sidebar is blank (restore not finding the feature by ID).

**Phase to address:** Frontend: layer replacement (plan ID scheme before coding).

---

### Pitfall 6: Selection State / URL Restore Silently Clears on Reload

**What goes wrong:** `bee-atlas.ts` encodes selected occurrence IDs in the `o=` URL parameter. On restore, it reads IDs from the URL and calls into bee-map to restore selection. If the unified OL source loads features with different IDs than what was stored in the URL, the restore lookup silently finds nothing and selection is cleared without error.

This is a silent failure — no exception is thrown, the user just sees an empty sidebar on page load from a shared URL.

**Why it happens:** The restore code does `source.getFeatureById(id)` and returns null without error when the feature is not found.

**Consequences:** All shared URLs containing `o=` parameters stop working after the migration. This is a user-facing regression for any URL shared before or during the migration window.

**Prevention:**
1. Keep the `ecdysis:`/`inat:` ID prefix convention exactly as-is for feature IDs in the unified layer.
2. Add a regression test: construct a URL with `o=ecdysis:12345`, load it into a mock environment, verify the restore code can look up that ID.
3. If the ID scheme must change (unlikely), write a URL migration shim in `parseParams` that rewrites old ID formats to new ones.

**Warning signs:** CI test for URL round-trip with `o=` param fails; or manual test of saved URL shows blank sidebar.

**Phase to address:** Frontend: layer replacement (must preserve ID format).

---

### Pitfall 7: Cluster Style Cache Bypassed for Wrong Reason

**What goes wrong:** The OL cluster style function currently uses a cache keyed on `count:tier`. The cache is bypassed when `filterState` is active or `selectedOccIds` is non-empty (see CLAUDE.md invariant). After the layer merge, there is one `clusterSource` instead of two. The style function currently lives in `style.ts` and is called separately for specimen clusters and sample dots.

If the unified layer uses a single cluster source, the style function must distinguish "specimen-only cluster", "sample-only cluster", and "mixed cluster" within the same style function call. The cache key must include this new dimension or the style will return wrong styling for mixed-content clusters.

**Why it happens:** The cache key `count:tier` does not encode the source composition of the cluster. Adding a new dimension (mix type) requires updating the cache key and potentially the recency-tier calculation (which uses `year` from ecdysis but sample-only clusters have no year field).

**Consequences:** Mixed clusters display with specimen color scheme even when they contain only iNat samples; or vice versa. Recency coloring is incorrect for sample-only clusters.

**Prevention:**
1. Audit style.ts before starting layer work. Understand how `makeClusterStyleFn` uses feature properties to compute tier/color.
2. Decide the coloring policy for mixed clusters before writing code: e.g., color by the most recent specimen year if any specimen is present; fall back to sample date if specimen-only null.
3. Update the cache key to include cluster composition type if needed.
4. The "bypass cache when filter active" invariant must still hold in the unified layer.

**Warning signs:** Clusters flash incorrect colors when filter is toggled; or all clusters render the same color regardless of recency.

**Phase to address:** Frontend: style/clustering (audit before layer merge).

---

### Pitfall 8: Schema Gate Validated Against Wrong File Names

**What goes wrong:** `validate-schema.mjs` currently checks two filenames: `ecdysis.parquet` and `samples.parquet`. After the migration the file is `occurrences.parquet`. If the schema gate is updated to check `occurrences.parquet` but the pipeline still outputs `ecdysis.parquet` + `samples.parquet`, CI will fail on the local path check. If the schema gate is not updated, it will check the old files (which may still be present on CloudFront) and pass, giving false confidence.

The CloudFront mode checks the live production URL. If `occurrences.parquet` is not yet deployed but the schema gate checks it, CI fails in CloudFront mode for all PRs after the schema gate update until nightly runs.

**Why it happens:** The schema gate has two modes (local and CloudFront) with different failure modes. The transition window between schema gate update, pipeline change, and nightly deployment is a fragile period.

**Consequences:** CI is broken for all PRs during the transition window (could be 12-24 hours).

**Prevention:**
1. Ship pipeline change (export.py produces occurrences.parquet) and schema gate change (validate-schema.mjs checks occurrences.parquet) in the same commit.
2. The nightly.sh must also be updated to upload `occurrences.parquet` and stop uploading `ecdysis.parquet` + `samples.parquet` in the same pipeline change.
3. Keep old file names in validate-schema.mjs until after the first successful nightly run, then remove them in a follow-up commit.
4. The schema gate CloudFront-miss path (`403|404`) is handled gracefully with a warning not an error — so checking `occurrences.parquet` before it exists on CloudFront will warn, not fail. Verify this path before relying on it.

**Warning signs:** CI fails on schema validation immediately after the PR merges; check whether the failure is local-mode or CloudFront-mode.

**Phase to address:** Schema gate migration (ship atomically with pipeline change).

---

## Moderate Pitfalls

### Pitfall 9: hyparquet Loading Wider Schema — Column Order Dependency

**What goes wrong:** `sqlite.ts` uses `parquetReadObjects()` which returns column values as a JS object keyed by column name. The `_insertRows` function then derives the column list from `Object.keys(rows[0])` and builds an INSERT statement. This is order-dependent: if the Parquet file has a different column order than the CREATE TABLE statement in `loadAllTables()`, the INSERT will succeed but bind wrong values to wrong columns.

For the unified `occurrences.parquet`, the schema will be wider (20+ columns from two sources). If any column name in the Parquet differs from the CREATE TABLE declaration (e.g., `lat` in samples becomes `latitude` in occurrences, or `lon` becomes `longitude`), the INSERT will silently store NULL for that column.

**Why it happens:** `parquetReadObjects` returns objects keyed by Parquet column name; `_insertRows` uses those keys to build the INSERT. Mismatches are silent because hyparquet returns the column values keyed by their Parquet name, but SQLite does not validate column names against the table schema in a dynamic INSERT.

Actually, re-reading `_insertRows`: it uses `cols.map(c => row[c])` where `cols = Object.keys(rows[0])`. So the insert columns come from the Parquet row, not the CREATE TABLE. SQLite will accept an INSERT with columns not declared in the CREATE TABLE and fail; but if a column is in CREATE TABLE but not in Parquet, it defaults to NULL without error.

**Prevention:**
1. After `loadAllTables()`, run a `PRAGMA table_info(occurrences)` check and compare against the expected column list.
2. Add a test that loads a minimal mock Parquet row and verifies each column is correctly mapped in the SQLite table.
3. Ensure the CREATE TABLE in `loadAllTables()` column list exactly matches the occurrences.parquet schema produced by export.py.

**Warning signs:** Geometry columns null for all rows (lat/lon/latitude/longitude mismatch); `SELECT COUNT(*) FROM occurrences WHERE latitude IS NULL` returns unexpectedly high count.

**Phase to address:** Frontend: data loading (loadAllTables rewrite).

---

### Pitfall 10: Date Column Type Divergence Between Sources

**What goes wrong:** ecdysis.parquet stores `date` as a Parquet DATE type. samples.parquet stores `observed_on` (renamed to `date`) as a TEXT ISO string. In the current `_insertRows`, there is a special case: `if (v instanceof Date) return v.toISOString().slice(0, 10)`. This handles hyparquet returning JS Date objects for DATE columns.

In the unified occurrences.parquet, the date field comes from two sources with potentially different Parquet encodings. If the ecdysis date column is a Parquet DATE (logical type) and the sample date column is Parquet UTF8, hyparquet returns Date for one and string for the other. In the unified schema, the column must be one type. The COALESCE in export.py must produce a consistent type.

**Why it happens:** DuckDB FULL OUTER JOIN with COALESCE on columns of different Parquet logical types (DATE vs UTF8) may produce a mixed-type output column. DuckDB will cast, but the resulting Parquet column type may be DATE or VARCHAR depending on the COALESCE argument order.

**Consequences:** If some rows have JS Date and others have string for the same `date` column, the ISO string conversion in `_insertRows` produces correct strings for some rows and leaves Date objects for others (though actually the code handles Date objects, so this may be benign). The safer concern is consistent SQLite column behavior for `strftime('%Y', date)` — this requires date to be stored as an ISO string, not a Unix timestamp.

**Prevention:**
1. In export.py, explicitly cast the unified date column: `COALESCE(o.event_date::VARCHAR, s.observed_on::VARCHAR) AS date`. Force VARCHAR output.
2. Verify the parquet column type using `parquetMetadataAsync` after export: `date` column should be Parquet UTF8, not DATE.
3. Test `strftime('%Y', date)` in SQLite against the actual loaded data.

**Warning signs:** Year/month filter returns 0 results; SQLite `strftime('%Y', date)` returns NULL for some rows.

**Phase to address:** Pipeline: outer join (type-cast explicitly) and Frontend: data loading (verify behavior).

---

### Pitfall 11: Sidebar Detail Rendering Assumes Source-Specific Column Presence

**What goes wrong:** `bee-specimen-detail.ts` renders ecdysis-specific columns (scientificName, recordedBy, fieldNumber, floralHost, etc.). `bee-sample-detail.ts` renders sample-specific columns (observer, specimen_count, sample_id). In the unified model, a single `OccurrenceDetail` component must render whatever columns are non-null.

If the component blindly renders all columns and some are null for a given occurrence type, it may render empty rows, broken links, or display "null" text. For example, if a sample-only occurrence has `scientificName = null`, a naive render of the specimen section will show a blank or the literal string "null".

**Why it happens:** The existing components are designed for non-null inputs. The spec says "column nullability conveys which sources contributed" — but the rendering components must explicitly check nullability before rendering each field.

**Consequences:** Sample-only occurrences render garbled specimen section; specimen-only occurrences render garbled sample section; UI looks broken for half the occurrences.

**Prevention:**
1. Design the unified detail component around null-conditional rendering from the start. Every field must be wrapped in an `if (value !== null)` guard.
2. Write Lit component tests with three fixture types: specimen-only (all sample columns null), sample-only (all specimen columns null), and matched (all non-null).
3. The existing two-component approach can be preserved during transition: conditionally render `bee-specimen-detail` if `ecdysis_id` is non-null, `bee-sample-detail` if `observation_id` is non-null, and both if matched.

**Warning signs:** Test with a sample-only occurrence; if the rendered output contains "null" as literal text or empty `<td>` elements, null guard is missing.

**Phase to address:** Frontend: sidebar (design null-conditional rendering before implementing).

---

### Pitfall 12: Collector Filter Breaks — recordedBy vs observer Column Semantics

**What goes wrong:** The current collector filter uses `CollectorEntry` with both `recordedBy` (ecdysis column) and `observer` (samples column). `buildFilterSQL` emits separate clauses per table: `recordedBy IN (...)` for ecdysis, `observer IN (...)` for samples.

In the unified `occurrences` table, both columns exist but are nullable by source. The WHERE clause for a collector filter in the unified table must be `(recordedBy IN (...) OR observer IN (...))` — an OR, not two separate queries. This is a semantic change: currently the filter is "ecdysis rows where recordedBy matches OR samples rows where observer matches, independently". In the unified model, the OR must be within a single query against a single table.

The subtle risk: a matched occurrence (both ecdysis_id and observation_id non-null) will have both `recordedBy` and `observer` set. If the filter says "show collector Alice", and Alice has both a recordedBy value and an observer value in the same unified row, the OR clause correctly includes it. But if the CollectorEntry is constructed with only `recordedBy` non-null (observer = null), the filter `(recordedBy IN ('Alice') OR observer IN ())` must not emit an empty IN clause — `IN ()` is a SQL error.

**Why it happens:** The empty IN clause guard already exists in the current code (`if (recordedBys.length > 0)` before emitting). But in the unified query, the overall structure changes and the guard logic must be re-verified.

**Prevention:**
1. When rewriting `buildFilterSQL` for the unified table, keep the guard: skip the `observer IN (...)` clause if `observers` array is empty.
2. Write a filter.test.ts test for a CollectorEntry with `observer = null` (recordedBy-only) to verify no SQL error.
3. Write a test for a CollectorEntry with `recordedBy = null` (observer-only) for the reverse case.

**Warning signs:** Collector filter throws a SQL error; or collector filter with only ecdysis-matched collectors stops matching any occurrences.

**Phase to address:** Frontend: filter SQL (collector filter rewrite).

---

### Pitfall 13: validate-schema.mjs Ships Before Nightly Produces occurrences.parquet

**What goes wrong:** If the schema gate is updated to expect `occurrences.parquet` columns, and that PR merges to main before the pipeline change that produces `occurrences.parquet`, CI on main will run the schema gate in CloudFront mode (no local file). The CloudFront check will 404 on `occurrences.parquet` — which the code handles as a warning, not a failure. So CI passes with a warning. But the gate now provides no value for the transition window.

The more dangerous version: if the schema gate PR ships on the same day as pipeline PR, but nightly.sh has not yet been updated to upload `occurrences.parquet`, production CloudFront still serves `ecdysis.parquet` + `samples.parquet`. All subsequent CI runs will see the CloudFront warning and silently pass schema validation with no useful signal.

**Why it happens:** The two-mode schema gate design (local vs CloudFront) was optimized for the steady-state case. During file name transitions, neither mode reliably catches regressions.

**Consequences:** A broken `occurrences.parquet` schema (missing column, wrong type) can reach production without CI catching it.

**Prevention:**
1. Pipeline change and schema gate change ship atomically in a single PR: export.py, nightly.sh, and validate-schema.mjs updated together.
2. Test locally: run export.py to produce `occurrences.parquet` in `frontend/public/data/`, then run `node scripts/validate-schema.mjs` to confirm local-mode check passes.
3. After nightly runs once with the new pipeline, verify CI enters local-mode on the next push (file will be present in the repo if it was committed, or CloudFront-mode if not).
4. Do not commit `occurrences.parquet` to the repo (it is gitignored); CI uses CloudFront mode for normal builds.

**Warning signs:** CI shows `! occurrences.parquet: not available on CloudFront yet -- skipping` for more than 24 hours after merge.

**Phase to address:** Schema gate migration (ship atomically; test locally before pushing).

---

### Pitfall 14: buildFilterSQL Two-Table Split Becomes Stale Dead Code

**What goes wrong:** After the unified migration, `buildFilterSQL()` may be partially updated — the table references changed to `occurrences`, but the function still returns `{ ecdysisWhere, samplesWhere }` with identical content in both fields. Callers continue to use `ecdysisWhere` (ignoring `samplesWhere`), and everything works. But `samplesWhere` is now dead code that diverges from `ecdysisWhere` over time as new filter conditions are added.

**Why it happens:** If the API is not explicitly changed (returning a single WHERE clause), callers do not need to be updated, and the dead field is not obviously broken.

**Consequences:** A future developer adds a filter condition to `ecdysisClauses` but not `samplesClauses` (or vice versa). In the two-table era this was correct; in the unified era, one branch is dead. The dead branch accumulates drift and becomes misleading.

**Prevention:**
1. Change `buildFilterSQL()` to return a single `where: string` field when the unified table lands. This forces all callers to be updated and makes the dead code impossible to miss.
2. Run TypeScript compilation — callers destructuring `{ ecdysisWhere, samplesWhere }` will produce type errors after the return type changes.
3. Remove `SPECIMEN_COLUMNS` / `SAMPLE_COLUMNS` from filter.ts and replace with a single `OCCURRENCE_COLUMNS` map.

**Warning signs:** `buildFilterSQL` still exports `{ ecdysisWhere, samplesWhere }` after the migration; grep for `samplesWhere` usages — if any survive unchanged they are likely dead.

**Phase to address:** Frontend: filter SQL (change return type simultaneously with rewrite).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `{ ecdysisWhere, samplesWhere }` API but make both fields identical | No caller changes needed | Dead `samplesWhere` field misleads future developers | Never — change the return type |
| Conditionally render old `bee-specimen-detail` / `bee-sample-detail` inside unified layer instead of writing a true unified component | Faster delivery | Two render paths diverge; unified "matched" rows display inconsistently | Only as a transition step within the same phase; remove before milestone close |
| Leave old `ecdysis.parquet` + `samples.parquet` on CloudFront alongside `occurrences.parquet` | No CloudFront invalidation needed | Storage cost; schema gate becomes ambiguous | Never — delete old files from S3 after cutover |
| Hardcode `occurrences` as table name in multiple places | Simple | Brittle if table is ever renamed | Acceptable; centralize to a constant if it appears in >3 files |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| DuckDB FULL OUTER JOIN | Forgetting NULL = NULL is false and adding a WHERE clause that drops unmatched rows | Use FULL OUTER JOIN with only the join condition in ON; keep WHERE only for source-side filtering (null checks on latitude, etc.) |
| hyparquet + wa-sqlite | Parquet DATE columns returned as JS Date objects; INSERT binds NULL | Always convert Date objects to ISO strings in `_insertRows`; verify with `typeof v === 'object' && v instanceof Date` |
| validate-schema.mjs local vs CloudFront mode | Testing schema gate locally with stale CloudFront file | Run `node scripts/validate-schema.mjs` only after `uv run python data/export.py` has produced local file |
| OL feature ID lookup | Using `source.getFeatureById()` with wrong prefix | Verify `f.getId()` in browser console against the ID stored in URL `o=` param |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Wider INSERT per row in _insertRows | loadAllTables takes longer; tablesReady delayed | SQLite bulk INSERT via single transaction is already in place; 20+ column row is still fast for 56k rows | Negligible at current scale; watch if row count grows 10× |
| Single cluster source with both specimen + sample features | Cluster computation must handle mixed-source feature sets; style function called more | Benchmark cluster render before and after; ensure style cache is hit correctly | Already handles ~55k features; unified ~56k (net) is similar |

## "Looks Done But Isn't" Checklist

- [ ] **Outer join**: assert `COUNT(ecdysis_id IS NOT NULL) + COUNT(ecdysis_id IS NULL) = total rows` — verify no row duplication and no row loss
- [ ] **Schema gate**: run `node scripts/validate-schema.mjs` locally after `python data/export.py`; confirm `ok occurrences.parquet` in output
- [ ] **Filter**: run all 13+ filter.test.ts tests against unified schema; all must pass
- [ ] **URL restore**: share a URL with `o=ecdysis:NNNN`; reload; confirm sidebar shows the specimen
- [ ] **Collector filter**: filter by a collector with ecdysis-only link; verify iNat-only samples for same person are also shown if expected
- [ ] **Cluster style**: toggle filter on and off; verify cluster colors update correctly and cache bypass fires
- [ ] **Sample-only occurrences**: click an iNat-only occurrence (no ecdysis_id); verify sidebar renders correctly without null field values
- [ ] **Matched occurrences**: click an occurrence with both ecdysis_id and observation_id; verify both source sections render

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Row loss from wrong join type | MEDIUM | Fix export.py join; re-run pipeline; re-deploy parquet; CloudFront invalidation |
| Row duplication | MEDIUM | Add dedup GROUP BY in export.py; re-run pipeline; re-deploy |
| Filter SQL broken (empty results) | LOW | Revert filter.ts to last working state; fix single table reference; npm test |
| Feature ID format broken (restore fails) | LOW | Keep `ecdysis:`/`inat:` prefix in OccurrenceSource feature creation; no parquet change needed |
| Schema gate failing on CloudFront | LOW | Wait for nightly run (≤24h); or trigger nightly manually on maderas |
| Sidebar renders "null" text | LOW | Add null guards in unified detail component; npm test with null-field fixture |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| NULL join key drops unlinked specimens | Pipeline: outer join | Post-export assertion: COUNT(*) ≥ 46k |
| Row duplication from join fanout | Pipeline: outer join | `SELECT ecdysis_id, COUNT(*) GROUP BY ecdysis_id HAVING COUNT(*) > 1` returns 0 rows |
| Column name collisions | Pipeline: schema design | Audit before coding; canonical column name table in export.py comment |
| filter.ts two-table split | Frontend: filter SQL | All filter.test.ts pass; return type changed to single `where` string |
| OL feature ID prefix | Frontend: layer replacement | URL restore test passes; `o=ecdysis:NNNN` restores sidebar |
| Selection / URL restore | Frontend: layer replacement | Round-trip test in url-state.test.ts |
| Cluster style cache | Frontend: style/clustering | Visual regression test: filter toggle changes cluster colors |
| Schema gate file names | Schema gate migration | Local validate-schema.mjs passes after export.py run |
| hyparquet column order | Frontend: data loading | PRAGMA table_info assertion in loadAllTables |
| Date type divergence | Pipeline + frontend loading | strftime year/month filter returns expected results in browser |
| Sidebar null fields | Frontend: sidebar | Lit component test with null-column fixtures for all three occurrence types |
| Collector filter empty IN clause | Frontend: filter SQL | filter.test.ts test with observer=null CollectorEntry |
| Schema gate ships early | Schema gate migration | Atomic PR: export.py + nightly.sh + validate-schema.mjs |
| Dead samplesWhere code | Frontend: filter SQL | TypeScript compile error if callers not updated |

---

## Sources

- Current codebase: `data/export.py` (FULL OUTER JOIN structure, column names, spatial CTEs)
- Current codebase: `frontend/src/filter.ts` (buildFilterSQL two-table split, CollectorEntry, column name constants)
- Current codebase: `frontend/src/sqlite.ts` (loadAllTables CREATE TABLE, _insertRows, Date conversion)
- Current codebase: `frontend/src/features.ts` (EcdysisSource / SampleSource feature ID format, property names)
- Current codebase: `scripts/validate-schema.mjs` (EXPECTED column lists, local vs CloudFront mode)
- CLAUDE.md architecture invariants: style cache bypass rule, filter race guard, ID format spec
- PROJECT.md v2.3 Key Decision: `MIN(waba.id)` dedup per catalog suffix (precedent for join dedup)
- PROJECT.md v2.3 Key Decision: join key is numeric suffix via regexp_extract (precedent for nullable join key handling)

---
*Pitfalls research for: Unified Occurrence Model (v2.7)*
*Researched: 2026-04-16*
