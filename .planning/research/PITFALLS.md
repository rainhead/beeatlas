# Pitfalls Research

**Domain:** Historical museum occurrence records — taxonomic reconciliation + cross-dataset dedup + static pipeline promotion (v4.7 Checklist Records as Point Data)
**Researched:** 2026-06-03
**Confidence:** HIGH (grounded entirely in this codebase's existing patterns, the Bartholomew et al. 2024 dataset structure, and the dbt/DuckDB pipeline as-built)

---

## Critical Pitfalls

### Pitfall 1: Taxonomic Over-Matching — Silent Mis-Resolution to the Wrong Accepted Name

**What goes wrong:**
The reconciliation step maps a checklist name to an accepted `canonical_name` / `taxon_id` that is wrong but plausible. The result is rendered on the map and species pages under the incorrect taxon. This is the inverse of the Phase 76 texanus/subtilior problem: instead of failing to merge a synonym, you silently merge two distinct taxa. For bee names specifically: homonyms across subgenera, gender-agreement variants (*Andrena nivalis* vs *Andrena nivale*), and fuzzy-match false merges (*Lasioglossum incompletum* vs *Lasioglossum inconditum*) all happen in Apoidea checklists. The existing `stg_inat__genus_taxon_ids` already guards against cross-kingdom genus homonyms with `HAVING COUNT(*)=1`, but a species-level bridge would need equivalent protection.

**Why it happens:**
The current checklist-to-taxon bridge goes: checklist name → `normalize_scientific_name()` (lowercase, authority-stripped, paren-stripped) → LEFT JOIN on `stg_inat__canonical_to_taxon_id` (the iNat taxa.csv.gz bridge). If ITIS or GBIF is called as an external adjudicator and returns a match above some threshold, that match will be accepted as authoritative even if wrong. Fuzzy matching (Levenshtein / Jaro-Winkler) silently accepts near-misses. Gender-agreement normalization that flattens masculine/feminine/neuter endings before the bridge lookup will incorrectly collapse genuinely different species.

**How to avoid:**
- Build a two-tier resolution: (1) exact canonical match wins, (2) synonym-seed wins (curated `occurrence_synonyms.csv` or `checklist_synonyms.csv`), (3) external-authority match requires a confidence column and human review gate before being committed to any seed.
- Never auto-commit a fuzzy or external-authority match to a seed CSV. Write it to a `checklist_review.csv` sidecar; require a human to promote entries from that file to `checklist_synonyms.csv`.
- For ITIS/GBIF calls: store the raw API response (TSN/usageKey, match confidence score, accepted name, match type) in a `checklist_name_resolution_audit.csv` committed to the repo. Every name→taxon_id decision is then auditable in git history.
- Guard against gender-agreement false merges by requiring the exact specific epithet match; normalize only authority strings, not inflected endings.
- Run a dbt test after promotion: assert that no two distinct checklist scientificNames resolve to the same taxon_id unless that mapping is explicitly in `checklist_synonyms.csv`.

**Warning signs:**
- A species that appears in Ecdysis under one name but in the checklist under another suddenly collapses to a single entry that looks plausible but is wrong.
- `checklist_unmatched.csv` shrinks too fast after adding GBIF/ITIS calls — legitimate unmatched species get silently mapped.
- A species page shows a count that cannot be explained by either dataset alone.
- Duplicate `canonical_name` values in the resolution audit CSV that point to the same `taxon_id` from different checklist names that were not previously synonyms.

**Phase to address:**
The phase that implements ITIS/GBIF build-time calls and populates `taxon_id` for checklist records. Before any checklist rows enter `int_combined`, this phase must land a passing dbt test asserting no unapproved many-to-one name→taxon_id collapses and a committed audit CSV.

---

### Pitfall 2: Dedup False Merge — Collapsing Two Different Specimens into One

**What goes wrong:**
The cross-source dedup between checklist records and Ecdysis specimens produces a false merge: two distinct physical bees are treated as duplicates and only one occurrence appears on the map. This is the worse error for a credibility-focused scientific atlas. A false split (failing to merge a true duplicate) results in double-counting, which is bad; a false merge silently destroys a data point that a researcher relied on and may not notice until much later.

The specific risk: both the checklist records and Ecdysis carry museum specimen data. The checklist has `recordedBy`, `locality`, `date`, and `lat/lon`. Ecdysis has its own collector/date/location fields. Matching on (name + date + collector_normalized + rounded_coordinates) will generate false merges when:
- Two different collectors sampled the same location on the same day (joint collecting events are common in WABA fieldwork and in historical museum surveys).
- Coordinate rounding places two specimens from different localities into the same grid cell.
- Collector name normalization collapses "C.S. Bartholomew" and "Bartholomew, C." as the same and they happen to share a date and rough location.

**Why it happens:**
Without a shared specimen ID, there is no ground truth. Any composite key (name + date + collector + location) is approximate and will have collisions in high-density sampling areas or at sites sampled by the same collector on multiple dates. The checklist dates back to 1812 — pre-GPS locality strings describe the same region at wildly varying precision.

**How to avoid:**
- Default to no dedup unless there is a high-confidence shared key. Accept double-counting as the lesser error for a scientific audience (they can identify a double-count; they cannot recover a false merge).
- If dedup is attempted, require all three of: (a) exact `canonical_name` match after reconciliation, (b) exact date match (not year-only), (c) coordinate match within a tighter threshold than the coordinate precision of either source.
- Never dedup on collector name alone without date + coordinates. Collector normalization should be logged and auditable, not applied silently in SQL.
- Treat records with NULL date or NULL coordinates as ineligible for dedup (cannot confirm they are the same physical specimen).
- Add a `dedup_candidate_pairs.csv` output from the pipeline run listing every candidate pair with the matching criteria satisfied — require human sign-off before any pair is suppressed.

**Warning signs:**
- Per-species counts in `species.json` drop more than the ~9% no-coordinate exclusion rate would predict.
- A known collector's records in a known date range appear in Ecdysis but not in the map after checklist promotion.
- `checklist_unmatched.csv` shows no unmatched records even for species that are checklist-only (every record found a dedup partner).

**Phase to address:**
The phase that designs the dedup/provenance strategy. This decision should be made explicitly before any SQL is written. The phase requirement should state the accepted error direction and document the dedup key definition.

---

### Pitfall 3: Coordinate Quality — Datum Mismatch, Locality Centroids Presented as Precise Points, Off-WA Points

**What goes wrong:**
Museum records from 1812–1990 carry coordinates derived from historical georeferencing: county centroids, town centroids, or coordinates transformed from older datums (NAD27, Clark 1866) without re-projection to WGS84. These appear on the map as precise points but are actually imprecise centroids or shifted by up to 200m (NAD27→WGS84 in Washington State). In the worst case:
- A county centroid for a rural WA county plots in a lake or off a road.
- A NAD27 coordinate that was not re-projected looks geometrically valid but is offset.
- Swapped lat/lon places a WA bee record somewhere in the ocean or in another continent.
- Zero coordinates (0.0, 0.0) plot in the Gulf of Guinea and pass an `IS NOT NULL` check.
- Records from Oregon or Idaho border areas appear in WA due to county centroid placement.

The `occurrences.sql` spatial-join uses `ST_Within` with a nearest-neighbor fallback. A point outside all WA counties will get assigned to the nearest county via fallback — silently accepting the bad coordinate rather than flagging it.

**How to avoid:**
- Filter out coordinates where `lat = 0 AND lon = 0` as a separate guard before the NULL check.
- Add a WA bounding box prefilter: `lat BETWEEN 45.5 AND 49.1 AND lon BETWEEN -124.8 AND -116.9` — records outside this box should be logged and dropped, not silently fallback-joined.
- Surface a `coordinate_precision` metadata field on checklist records if the source provides it (e.g. "county centroid" vs "GPS"). Expose this in the sidebar detail card so users know to treat low-precision points as approximate.
- Add a dbt test: count of checklist rows with `lat=0 OR lon=0 = 0`.
- If datum information is available in the original CSV, run re-projection at ingest time and record the source datum in a column.

**Warning signs:**
- The map shows a cluster of checklist points at a location that is obviously wrong (lake center, state border, round-number coordinates like 47.0/-120.0 indicating a rough centroid).
- More checklist points appear in coastal counties than the source data would predict for historically collected specimens.
- County assignment for a checklist record differs from the county field in the source data.

**Phase to address:**
The phase that extracts the full-fidelity source CSV and ingests coordinates. Bounding box validation and zero-coordinate guard belong in the `checklist_pipeline.py` ingest step (Python), not in dbt, so invalid rows never enter the DB.

---

### Pitfall 4: Mixed / Missing Date Parsing — Silent NULL Propagation into Year/Month Filters

**What goes wrong:**
The checklist has ~13% NULL dates and mixed formats (ISO `YYYY-MM-DD`, US `m/d/yyyy`, year-only `YYYY`, year-range `1989-1991`). The current `_load_checklist_records` uses `int(yr_str) if yr_str.isdigit()` — this correctly drops non-digit year strings to NULL but silently drops year-range entries (e.g. "1989-1991" is not isdigit). Pre-1900 dates (records going back to 1812) may have been flagged as out-of-range or rejected by some parsers. If NULL-date rows flow into `int_combined` and the year filter does a `year >= lower AND year <= upper` comparison, NULL rows pass the filter (SQL NULL comparison semantics), which means they appear on the map when a year filter is active that should exclude them.

**Why it happens:**
The current year/month filter logic uses `year IS NULL OR (year >= ? AND year <= ?)` or similar — NULL rows pass through permissively. This was intentional for the county-fill checklist mart (unmatched species-county pairs with NULL year should appear when no year filter is active), but for point records with actual NULL dates from failed parsing, the same permissive NULL treatment will show them at wrong times.

**How to avoid:**
- Log every date parse failure with the raw value so the failure mode is visible (not silently dropped to NULL).
- Separate "genuinely undated record" (NULL in source) from "date parse failure" (non-NULL in source but could not be parsed) using a `date_quality` enum: `'dated'|'undated'|'parse_error'`.
- Year-range entries should use the midpoint year, or better, produce two rows (start year and end year) — document the decision.
- Pre-1900 dates are valid and should parse correctly; add a pytest parametrize test for `year=1812`.
- The year/month filter SQL should treat `date_quality='parse_error'` rows as excluded from year-filtered views, not included.

**Warning signs:**
- The `year` column in checklist records contains NULL for rows where the source plainly has a date string.
- Specimen counts on species pages increase when a year filter is added (NULL rows passing through when they should not).
- `year = 0` or implausible years (< 1800 or > current year) appearing in the mart.

**Phase to address:**
The phase that extracts and normalizes the full-fidelity source CSV. Date parsing and quality-flagging belong in the Python ingest step. The dbt mart can assert `date_quality IN ('dated', 'undated', 'parse_error')` and the downstream filter can use it.

---

### Pitfall 5: Contract Drift — Reverting a Locked Decision Breaks the dbt 33-Column Contract and Double-Counts Species Pages

**What goes wrong:**
Adding `source='checklist'` rows to `int_combined` and therefore to `occurrences.parquet` changes every downstream consumer that assumes the 33-column contract. The current contract (Phase 131) includes `source`, but that column currently only carries `'ecdysis'`, `'waba_sample'`, or `'inat_obs'`. Adding `'checklist'` is additive to the discriminator but:
1. Species page per-source counts in `species.json` must be updated to include a `checklist_count` field.
2. The isolation pytest that currently asserts `occurrences.parquet row count unchanged` when checklist.sql is built will now fail — that test was the guard for the Phase 111 locked decision and must be explicitly retired or updated.
3. The `geo_blob` layout in `sqlite_export.py` is derived from `occurrences.parquet` schema at runtime — if any checklist-specific column is added (e.g. `locality`, `coordinate_precision`), `geo_blob` must be updated or it will silently drop the new column.
4. `checklist.parquet` remains for the county-fill layer. If checklist rows are now also in `occurrences.parquet`, the county-fill layer will double-count species in the seasonality histogram (one count from the point layer, one from the county-fill layer).

**How to avoid:**
- Explicitly retire the Phase 111 isolation test with a comment explaining that the locked decision is being reversed in v4.7 and why (the stated rationale was wrong).
- Add a test that asserts `occurrences.parquet` contains rows where `source='checklist'` after the promotion, replacing the old exclusion assertion.
- Update `species.json` export and species page templates to show `checklist_count` separately from `ecdysis_count`.
- The seasonality histogram and the county-fill layer must source from different data — either the county-fill layer reads `checklist.parquet` (unchanged) and the point layer reads the new `occurrences.parquet` checklist rows, or the county-fill layer filters to records with no coordinates.
- Run the full dbt column-count assertion after the change.

**Warning signs:**
- The Phase 111 isolation pytest passes when it should fail (test was not updated to match new expectation).
- Species pages show counts higher than expected for checklist-only species (double-counting from both layers).
- `geo_blob` table in `occurrences.db` is missing columns that are in `occurrences.parquet`.
- The 33-column assertion in `test_dbt_diff.py` fails if column count changes.

**Phase to address:**
The phase that adds `source='checklist'` ARM to `int_combined`. This is the architectural inflection point; all downstream contract updates must be included in scope, not deferred.

---

### Pitfall 6: Build-Time External Authority Calls — Nondeterministic Builds and Rate Limits on the Nightly Host

**What goes wrong:**
ITIS and GBIF are consulted at pipeline build time. The nightly cron on maderas runs `data/nightly.sh`, which calls `uv run python run.py`. If ITIS/GBIF calls are made inside `run.py` steps (not cached), then:
1. A network failure on maderas causes the pipeline to fail partway through, leaving `beeatlas.duckdb` in a partially-updated state.
2. ITIS returns different results on different nights (taxonomy changes, API updates) — the same name resolves to a different TSN, producing a nondeterministic build. This breaks the git-committable audit CSV.
3. GBIF rate limits (100 req/sec unauthenticated) are irrelevant for 50K records if batched, but are a failure mode if queries are issued individually per row.
4. GBIF data redistribution: the GBIF backbone is CC BY 4.0. Using it as a build-time adjudicator is fine for data pipeline use, but GBIF taxonomic opinions should not be treated as authoritative for scientific publication without citation.

**How to avoid:**
- Call ITIS/GBIF exactly once per name (not per row) and cache results in a committed `checklist_name_resolution_audit.csv`. On subsequent runs, read from the cache; only query for names not already in the cache.
- Make the external call a one-time seeding step that is run manually, not as part of the nightly cron. The nightly cron should only read from the committed cache, never hit the network for taxonomy.
- Use the iNat `taxa.csv.gz` (already in the pipeline, already cached) as the primary authority since `taxon_id` is the iNat taxon_id throughout the system. ITIS/GBIF should only be a secondary adjudicator for names that fail the iNat bridge.
- Add an `--offline` flag to any taxonomy resolution step so the nightly run never makes external calls.

**Warning signs:**
- The nightly pipeline log shows HTTP calls to `www.itis.gov` or `api.gbif.org`.
- Two consecutive nightly runs produce different `checklist_name_resolution_audit.csv` content for the same input name.
- Pipeline failure mid-run leaves `checklist_data.checklist_records` populated but `int_combined` not rebuilt.

**Phase to address:**
The phase that designs the taxonomy resolution approach. The decision to use iNat `taxa.csv.gz` as primary (already offline) and ITIS/GBIF only as a one-time manual seeding step should be made before any code is written.

---

### Pitfall 7: Homonyms Across Kingdoms / Subgenera in the Name Bridge

**What goes wrong:**
The existing `stg_inat__genus_taxon_ids` guards genus homonyms with `HAVING COUNT(*) = 1` (Phase 128 — disambiguates Stelis-the-bee from Stelis-the-orchid). But species-level homonyms also exist in bee taxonomy — the same epithet under the same genus used in different subgenera by different authors, or a valid bee species name that is also a valid plant species name. The current `stg_inat__canonical_to_taxon_id` bridge does a direct JOIN on lowercase binomial; if the taxa.csv.gz contains two rows with identical lowercase binomials (different taxon_id, different kingdom), the JOIN fans out and produces two taxon_id values per occurrence.

Additionally: checklist names written with subgenus (e.g. `Lasioglossum (Dialictus) zonulum`) are stripped to `lasioglossum zonulum` by `normalize_scientific_name()`. This is correct for the bridge, but if there is also a `Lasioglossum (Lasioglossum) zonulum` with the same binomial, the bridge cannot distinguish them from the canonical_name alone.

**How to avoid:**
- Add a test: `SELECT canonical_name, COUNT(DISTINCT taxon_id) FROM stg_inat__canonical_to_taxon_id WHERE is_anthophila = TRUE GROUP BY canonical_name HAVING COUNT(*) > 1` — assert zero rows.
- For names that do fan out, require the resolution to be explicit in `checklist_synonyms.csv` with the target `taxon_id`, not just the accepted name string.
- For the specific case of subgenus-bearing names, strip the subgenus paren at ingest (already done by `normalize_scientific_name`) but log the original form so it is recoverable.

**Warning signs:**
- A species occurrence count is double the expected value for a specific checklist name.
- A checklist species resolves to a taxon page for a plant or non-bee insect.
- The taxon hierarchy zero-orphan assertion fires on checklist records.

**Phase to address:**
The phase that builds the species-level name bridge for checklist records. The homonym test should be a required passing dbt test before any checklist rows enter `int_combined`.

---

### Pitfall 8: The `checklist_unmatched.csv` Reconcile Path Lags the dbt Synonym Path

**What goes wrong:**
The existing pipeline has two synonym resolution systems that can drift:
1. `data/dbt/seeds/occurrence_synonyms.csv` + `int_synonyms.sql` — the dbt-side synonym JOIN applied to Ecdysis and iNat arms of `int_combined`.
2. `data/checklist_synonyms.csv` + `checklist_pipeline.py::reconcile()` — the Python-side `UPDATE checklist_data.species SET canonical_name = ?` applied before dbt runs.

If a synonym is added to `occurrence_synonyms.csv` but not to `checklist_synonyms.csv`, the same species will have its Ecdysis occurrences merged under the accepted name while the checklist records remain under the old name — they appear as separate entries on species pages and in taxon filtering. The PROJECT.md v4.7 context note confirms this: "the checklist_unmatched.csv reconcile path lags the dbt one."

Note that `stg_checklist__species.sql` already JOINs `int_synonyms` — so the dbt synonym path does apply to checklist species. The risk is the Python-side `reconcile()` UPDATE running before dbt, potentially overwriting the dbt synonym path with a different mapping from `checklist_synonyms.csv`.

**How to avoid:**
- Consolidate to a single synonym source. The `occurrence_synonyms.csv` dbt seed is the canonical list (already applies to Ecdysis + iNat arms and to checklist via `stg_checklist__species`). The Python-side `reconcile()` UPDATE should be removed or replaced with a validation step that checks `checklist_synonyms.csv` agrees with `occurrence_synonyms.csv`.
- At minimum: add a post-run assertion that every entry in `checklist_synonyms.csv` also appears in `occurrence_synonyms.csv` (same synonym, same accepted name). If they diverge, the build should warn.

**Warning signs:**
- A species appears twice in the species index — once with its old name and once with its accepted name — when a synonym is active.
- `checklist_unmatched.csv` contains names that are already in `occurrence_synonyms.csv` as synonyms.
- The `texanus→subtilior` resolution applies to Ecdysis records but checklist records for the same species still appear under `agapostemon texanus`.

**Phase to address:**
The phase that integrates checklist records into `int_combined`. The synonym unification audit should be a required deliverable of that phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One-time manual ITIS/GBIF seeding, result committed to CSV | Avoids build-time network dependency | Taxonomy updates require manual refresh; curator burden | Acceptable indefinitely for museum records; taxonomy changes slowly |
| Defaulting to no-dedup (accept double-counting) | Avoids false merges; simpler | Some specimens counted twice; inflated per-species totals | Acceptable as v4.7 initial approach with a `dedup_status='unreviewed'` column for future passes |
| `coordinate_precision` flag rather than full georeferencing audit | Ships faster | Low-precision centroids appear as points; misleads users about data quality | Only acceptable if the flag is surfaced in the UI (sidebar card detail) |
| Using iNat `taxa.csv.gz` as sole external authority | Already in pipeline, offline, no rate limits | iNat taxonomy ≠ ITIS/GBIF; some names may not resolve | Acceptable; iNat is the taxon_id source throughout the system |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ITIS API | Querying per-row at nightly build time | One-time seed run; cache in committed CSV; nightly reads from cache |
| GBIF species match API | Using fuzzy match (`matchType=FUZZY`) and accepting all results | Require `matchType=EXACT` and `status=ACCEPTED`; flag `SYNONYM` and `DOUBTFUL` for human review |
| iNat `taxa.csv.gz` (already present) | Re-downloading on every run | Already cached with ETag (TAX-01); use the existing `stg_inat__canonical_to_taxon_id` bridge |
| DuckDB `ST_Point(lon, lat)` | Swapping lat/lon order | DuckDB and WKT convention is `ST_Point(x, y)` = `ST_Point(lon, lat)` — already correct in `occurrences.sql`; verify checklist coordinates match this convention |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Adding 50K checklist rows to `int_combined` (currently ~95K rows) increases table by ~53% | `dbt build` time increases; `occurrences.db` size grows | `int_combined` is already `materialized='table'` — this is the correct guard | Acceptable at this scale; revisit if > 500K rows |
| Spatial join for 50K new checklist points in `occurrences.sql` | `dbt build` slow; nightly overruns cron window | `int_combined` materialization prevents re-evaluation; spatial joins are already batched via CTEs | Should remain within nightly budget; benchmark before shipping |
| `geo_blob` pre-serialization in `sqlite_export.py` grows with new rows | `occurrences.db` file grows; CloudFront transfer increases | Already 7-field layout (Phase 131); checklist rows with NULL locality can omit optional fields | Monitor `occurrences.db` size post-promotion against the current 22.9 MB baseline |

---

## "Looks Done But Isn't" Checklist

- [ ] **Taxonomy resolution:** `checklist_name_resolution_audit.csv` committed to repo with source authority, confidence, and match type for every non-exact resolution — verify git contains this file before merging.
- [ ] **Dedup decision:** A written decision in the phase REQUIREMENTS.md stating the accepted error direction (false merge vs false split) and the exact dedup key definition — verify this exists, not just implied by code.
- [ ] **Coordinate validation:** dbt test asserts zero rows with `lat=0 OR lon=0`, and zero rows outside WA bounding box — verify tests pass.
- [ ] **Contract update:** Phase 111 isolation pytest explicitly retired with a comment; new assertion added for `source='checklist'` in `occurrences.parquet` — verify the old test is gone, not just skipped.
- [ ] **Synonym unification:** `checklist_synonyms.csv` content agrees with `occurrence_synonyms.csv`; no divergent mappings — verify with a post-run diff.
- [ ] **Double-count audit:** County-fill layer still reads from `checklist.parquet` (or coord-null subset); point layer reads from `occurrences.parquet` checklist rows — verify species page counts equal point-layer count, not point + county-fill combined.
- [ ] **Per-source counts:** `species.json` includes `checklist_count` as a distinct field; species page Nunjucks template renders it — verify on a checklist-only species page.
- [ ] **Build-time network calls:** Nightly log does not contain HTTP calls to `itis.gov` or `gbif.org` — verify after first cron run post-deploy.
- [ ] **Pre-1900 dates:** pytest parametrize test for year=1812 parsing — verify test exists and passes.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Taxonomic over-match discovered post-ship | HIGH | Identify wrong taxon_id assignments in audit CSV; add corrected entries to `checklist_synonyms.csv`; re-run pipeline; re-deploy |
| False dedup merge discovered | MEDIUM | Remove the dedup rule that caused the merge; re-run pipeline; both records reappear |
| Contract drift (33-col broken) | MEDIUM | Identify added/removed column; update `sqlite_export.py` schema derivation (already dynamic); update species.json export; re-run |
| Build-time network failure mid-run | LOW | nightly.sh exits non-zero; DuckDB state is stale; next nightly re-runs from scratch via `CREATE OR REPLACE TABLE` pattern already in checklist_pipeline.py |
| Double-counting on species pages | LOW | Fix the data source for the county-fill layer; re-run pipeline; re-deploy |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Taxonomic over-matching | Phase: name bridge + ITIS/GBIF seeding | Audit CSV committed; dbt test no-duplicate-taxon_id-from-distinct-names passes |
| False dedup merge | Phase: dedup strategy design | Written decision in REQUIREMENTS.md; no per-species count drop unexplained by coord exclusion |
| Coordinate quality | Phase: full-fidelity CSV ingest | dbt test zero-coord rows = 0; bounding-box filter in Python ingest; pytest for WA bbox guard |
| Date parsing | Phase: full-fidelity CSV ingest | pytest parametrize covering ISO/US/year-only/range/pre-1900/NULL formats; `date_quality` column present |
| Contract drift + double-counting | Phase: `int_combined` ARM addition | Phase 111 test retired; new assertion added; species page counts verified per-source |
| External authority nondeterminism | Phase: taxonomy resolution design | `--offline` mode tested; nightly log clean of external HTTP calls |
| Homonym false merge | Phase: name bridge | dbt test zero multi-taxon_id canonical names within Anthophila |
| Synonym path divergence | Phase: `int_combined` ARM addition | Diff between `checklist_synonyms.csv` and `occurrence_synonyms.csv` = empty |

---

## Sources

- This codebase: `data/checklist_pipeline.py`, `data/dbt/models/marts/checklist.sql`, `data/dbt/models/intermediate/int_combined.sql`, `data/dbt/models/staging/stg_checklist__species.sql`, `data/dbt/models/marts/occurrences.sql`
- Project history: `.planning/PROJECT.md` Key Decisions table (Phase 111, Phase 128, Phase 131)
- Known issues documented in PROJECT.md: "the checklist_unmatched.csv reconcile path lags the dbt one" (v4.7 context note); TID-02 re-scoping lesson; Phase 133 default-tree-broken-by-display-none gap (source-grep tests can pass while features are broken)
- GBIF Species Matching API: confidence scoring, matchType semantics (gbif.org/developer/species)
- ITIS API: TSN-based lookups, name change tracking (itis.gov/ws_description.html)

---
*Pitfalls research for: BeeAtlas v4.7 — Checklist Records as Point Data (museum-record import + taxonomic reconciliation + cross-dataset dedup)*
*Researched: 2026-06-03*
