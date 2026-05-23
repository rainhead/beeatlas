# Pitfalls Research

**Domain:** v4.0 Washington Checklist Records — 3rd occurrence source, DwC-A taxonomy, dbt contract expansion, Eleventy species page expansion
**Researched:** 2026-05-23
**Overall confidence:** HIGH — all findings drawn from direct code inspection of the existing pipeline

---

## Scientific Name Parsing

The WA checklist TSV (`wa_bee_checklist.tsv`) already uses bare binomials (no authority strings), so `canonical_name.py::canonicalize()` handles it cleanly today. The pitfalls here apply to the **iNat DwC-A Taxon.tsv** and to any raw museum data that does embed author+year in the `scientificName` field.

### Pitfall: Authority-paren regex false-positives on subgenus parens

**What goes wrong:** The `_AUTHORITY_RE` pattern in `canonical_name.py` requires `(<Author>, <4-digit-year>)` inside trailing parens to avoid consuming subgenus parens like `(Dialictus)`. That guard is documented in the source. But the DwC-A `scientificName` field uses the format `"Agapostemon angelicus Cockerell, 1924"` — comma+year as a bare suffix (not in parens). Step 1's `,\s*\d{4}.*` branch handles this correctly.

**Hidden trap:** If `scientificName` in Taxon.tsv has year-only authority without a comma — e.g., `"Apis mellifera Linnaeus 1758"` (no comma) — neither branch of `_AUTHORITY_RE` matches and the author token (`Linnaeus`) falls through into the canonical name. Result: `canonicalize("Apis mellifera Linnaeus 1758")` → `"apis mellifera"` (correct only because step 3 folds to 2 tokens). But a name like `"Apis mellifera mellifera Linnaeus 1758"` with 4 tokens becomes `"apis mellifera"` (also correct). Test this assumption against actual Taxon.tsv samples before treating the regex as complete coverage.

**Prevention:** Run `canonicalize()` against a sample of 200 Taxon.tsv `scientificName` values from bee families and spot-check that no authority leaks into the output. Add regression test cases for no-comma authority format.

**Phase:** Scientific name parsing must be validated in the DwC-A ingestion phase before the bridge table is populated from Taxon.tsv names.

---

### Pitfall: The `_INFRA_MARKERS` list is locked by design

**What goes wrong:** `canonical_name.py` explicitly states that `_INFRA_MARKERS` is locked to exactly 5 markers (`ssp.`, `var.`, `aff.`, `cf.`, `nr.`) and any addition requires a CONTEXT.md amendment. Museum records and DwC-A data introduce `subsp.` (not `ssp.`), `f.` (form), `x` (hybrid markers), and `sensu` qualifiers. If any of these appear in checklist or Taxon.tsv names and are not in the marker list, they will leak into the binomial.

**Example:** `"Bombus occidentalis subsp. mckayi"` → canonicalize strips nothing at step 3 (no marker match) → output is `"bombus occidentalis"` (two tokens, fold is correct because step 3 folds any trinomial). `"Bombus occidentalis f. pallida"` → `"bombus occidentalis"` (correct — `f.` not a marker but trinomial fold applies). The risk is only if a marker appears as token 2 (the epithet position), which would be malformed data.

**Prevention:** Low risk in practice. Document in the DwC-A ingestion code that `subsp.` variants are folded by the trinomial rule, not by the marker list.

**Phase:** Low risk; document rather than fix.

---

### Pitfall: Author+year parsing assumes the year is 4-digit

**What goes wrong:** `_AUTHORITY_RE` uses `\d{4}` for the year pattern. The checklist covers species first collected as far back as 1812; all have 4-digit years. DwC-A Taxon.tsv entries for very old synonyms sometimes have 3-digit years in medieval classification schemes (rare for bees). Not a practical risk for Anthophila, but document the assumption.

**Prevention:** None needed for bee data; document the assumption in `canonical_name.py`.

---

## DwC-A Taxonomy at Scale

The current live API approach (`resolve_taxon_ids.py` + `enrich_taxon_lineage_extended`) hits `https://api.inaturalist.org/v1/taxa` and `/v2/taxa` respectively. TAX-01/TAX-02 replace this with an offline DwC-A `Taxon.tsv` walk. The existing code provides a useful model but has failure modes the offline approach does not share — and introduces new ones.

### Pitfall: Taxon.tsv is ~1.5M rows — full-table scans are slow in Python

**What goes wrong:** The iNat DwC-A taxonomy archive (`https://www.inaturalist.org/taxa/inaturalist-taxonomy.dwca.zip`) is around 350 MB compressed. `Taxon.tsv` uncompressed is several GB. Walking the parent chain recursively in Python with dict lookups is O(depth) per taxon but the dataset must all be in memory first. A naive `csv.DictReader` pass to build a `taxon_id -> row` dict is feasible (~2 GB RAM), but a row-by-row recursive parent walk will be slow if called for each of the few thousand bee species.

**Prevention:** Load Taxon.tsv into DuckDB once as a staging table (`dwca_data.taxon`). Use a recursive CTE or iterative self-join to walk ancestors, filtered to `kingdom = 'Animalia'` up front. DuckDB handles the join efficiently; Python never needs to hold the full table. The existing `data/gbif-backbone/taxon.sql` demonstrates exactly this pattern — it uses `read_csv('/dev/stdin')` and filters by kingdom before writing to parquet. Use DuckDB for the walk, not Python dicts.

**Detection:** Pipeline taking >5 minutes on the taxon-lineage step. The existing live API step (`enrich_taxon_lineage_extended`) runs in ~30 seconds on a warm cache.

**Phase:** Architecture decision must be made before implementation. Recommend DuckDB recursive CTE approach.

---

### Pitfall: Duplicate taxonID rows in Taxon.tsv (synonyms share accepted taxon IDs)

**What goes wrong:** iNat DwC-A encodes synonyms as rows where `taxonomicStatus = 'synonym'` and `acceptedNameUsageID` points to the accepted taxon. If the staging table uses `taxon_id` as a primary key without filtering out synonyms first, the `CREATE TABLE ... PRIMARY KEY` will fail on duplicate `taxonID` values. Even without a PK constraint, the lineage walk will produce duplicate rows per species if synonyms are included.

**Prevention:** Filter `WHERE taxonomicStatus = 'accepted'` (or the equivalent active-status string for iNat DwC-A) before inserting into the staging table. The existing `gbif-backbone/taxon.sql` filters `WHERE taxonomicStatus != 'doubtful'` — not sufficient for DwC-A because DwC-A uses `'synonym'` (not `'doubtful'`) for invalid names. Verify the correct status field value against the actual archive before writing the staging model.

**Detection:** `INSERT ... PRIMARY KEY violation` on the taxon table, or `COUNT(DISTINCT taxon_id) < COUNT(*)` after insert.

**Phase:** Data loading phase. Add a pytest assertion: `COUNT(DISTINCT taxon_id) == COUNT(*)` after staging load.

---

### Pitfall: Missing parents in the ancestor chain for recently-added taxa

**What goes wrong:** iNat taxonomy evolves; a taxon may have a `parentNameUsageID` that does not appear in the same Taxon.tsv export (e.g., if the parent was added after the archive was cut, or if the archive has internal consistency issues). A recursive CTE with `LEFT JOIN` will stop at the broken link and emit NULL for ranks above it. The existing live API approach never has this problem because `/v2/taxa/{id}` returns the full ancestor array in one response.

**Prevention:** After the recursive CTE walk, assert that `COUNT(*) WHERE family IS NULL AND kingdom = 'Animalia'` is below some threshold (say, < 50 rows). Write the broken-parent taxon IDs to a `lineage_broken_parents.csv` for inspection.

**Detection:** Species pages showing null family values; `test_lin05_lineage_coverage.sql` failing.

**Phase:** DwC-A ingestion phase. Add coverage assertion to the existing `test_lin05_lineage_coverage.sql` dbt test.

---

### Pitfall: ETag/Last-Modified caching — the archive changes monthly but the URL is stable

**What goes wrong:** The DwC-A archive URL (`inaturalist-taxonomy.dwca.zip`) does not change when iNat updates it. Without ETag or `Last-Modified` checking, the pipeline will re-download the full ~350 MB archive on every nightly run. This is ~2-5 minutes of download time and unnecessary churn.

**Prevention:** Store the `ETag` or `Last-Modified` response header from the last download in S3 alongside the archive (or in a small metadata file). On the next run, send `If-None-Match` / `If-Modified-Since`; on 304 response, skip extraction and re-use the cached parquet. The existing `last_fetch.txt` pattern in the iNat observations pipeline (`CACHE-01/02/03`) is the exact template.

**Detection:** Nightly pipeline consistently taking 5+ minutes on the taxon step.

**Phase:** DwC-A download phase. Mirror the `last_fetch.txt` + S3 cache pattern.

---

### Pitfall: iNat DwC-A uses non-standard rank vocabulary at intermediate levels

**What goes wrong:** The existing `enrich_taxon_lineage_extended` extracts exactly `{family, subfamily, tribe, genus, subgenus}` from the ancestor chain. For some taxa (tribe-less genera, genus-level records without subgenus), intermediate ranks are NULL, which is correct. The DwC-A archive may surface taxa where iNat's rank vocabulary includes additional intermediate ranks — for example, iNat uses `'epifamily'` and `'supertribe'` as ranks that sit between the expected 5. A recursive CTE that walks ALL ancestors will encounter these.

**Prevention:** When walking ancestors in the recursive CTE, filter to only `rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus')`. Any ancestor with an intermediate rank like `epifamily` is silently skipped. Verify by spot-checking that `Bombus` gets `family=Apidae`, `tribe=Bombini`, `genus=Bombus`.

**Phase:** DwC-A ingestion phase. Spot-check at least one tribe-bearing genus after migration.

---

## dbt Contract Changes

The current `occurrences` mart has a 31-column dbt contract enforced in `data/dbt/models/marts/schema.yml`. The milestone adds a `source` column (EXT-01), making it 32 columns. Several downstream consumers depend on this contract.

### Pitfall: Column added in dbt model but not in schema.yml — contract silently unenforced

**What goes wrong:** dbt's `contract: enforced: true` only validates columns that appear in `schema.yml`. If a developer adds `source` to `occurrences.sql` SELECT but forgets to add it to `schema.yml`, dbt build succeeds (no violation), the column appears in the parquet, but the contract is not enforced. Future changes to `source`'s type will not be caught by dbt.

**Prevention:** Add the `source` column entry to `schema.yml` in the same commit as the model change. The existing `test_occurrences_schema_matches` in `test_dbt_diff.py` will catch schema drift against `public/data/occurrences.parquet` — but only after a full pipeline run. Update the test's docstring baseline count comment (currently "30 columns") to "32 columns" to make the expected count visible.

**Detection:** `test_occurrences_schema_matches` fails in CI after next deploy. Or: `DESCRIBE` the sandbox parquet and count columns manually.

**Phase:** Any phase that adds `source` to `occurrences`. Must update schema.yml atomically.

---

### Pitfall: `species_export.py` reads `occurrences.parquet` for `seasonality.json` — additive columns are safe, but renames break it

**What goes wrong:** `species_export.py` reads `DBT_SANDBOX_DIR/occurrences.parquet` with a SELECT for `canonical_name, county, ecoregion_l3, TRY_CAST(month AS INT) - 1`. It does not SELECT `source`, so the new column is invisible and harmless. But if any of the four columns it does reference are renamed (e.g., `county` -> `county_name` as part of a broader renaming sweep), `species_export.py` fails with a DuckDB `Binder Error`.

**Prevention:** The `SPECIES_COLUMNS` list in `species_export.py` is the canonical reference — check it against any column rename. The `test_species_export.py` pytest suite will catch this at test time but only if the fixture includes the renamed column.

**Detection:** `uv run pytest data/tests/test_species_export.py` failing with `Binder Error`.

**Phase:** Safe for EXT-01 (`source` is additive). Risk only on future column renames.

---

### Pitfall: `test_dbt_diff.py` baseline counts will be wrong during development

**What goes wrong:** `test_occurrences_row_count_matches` asserts `sandbox == public` row counts (both currently 47,883). These are sandbox-vs-public diff tests, not fixed-number assertions — they will pass once `public/data/` is updated by a full pipeline run. The failure during development (when sandbox is ahead of public) is expected.

More critically: `test_species_parquet_row_count_matches` asserts `sandbox == public` for species (currently 629 rows). After adding checklist-only species, the sandbox count will exceed the current public count. This test will FAIL when dbt sandbox is rebuilt before `public/data/species.parquet` is updated.

**Prevention:** Do not suppress these failures during development — use them as a "did you run the full pipeline?" signal. Update the docstring baseline comments after v4.0 full pipeline run.

**Detection:** These failures are expected and correct during development. Treat them as progress indicators.

**Phase:** Expected failure during development. After v4.0 full pipeline run, update baseline comments in `test_dbt_diff.py`.

---

### Pitfall: Checklist records must NOT enter `int_combined`

**What goes wrong:** `int_combined` is the occurrence-level UNION ALL (Ecdysis arm + provisional WABA arm). Checklist records in `checklist_data.species` are species presence/county records — they have no lat/lon, no date, no collector. If someone mistakenly adds a checklist ARM to `int_combined`, the spatial join in `occurrences.sql` will call `ST_Point(NULL, NULL)` producing NULL, and the fallback correlated subquery (`ORDER BY ST_Distance LIMIT 1`) will assign the nearest county/ecoregion — producing meaningless county assignments for historical records.

Checklist records belong only in `int_species_universe` (via the FULL OUTER JOIN on `stg_checklist__species`) — which already exists and works correctly.

**Prevention:** When implementing EXT-01, verify the `source` field logic: `'ecdysis'` for Ecdysis arm rows, `'inat'` for iNat arm rows. Checklist-only species have `occurrence_count = 0` in the species mart and no rows in `occurrences.parquet`. The `source` field does not apply to checklist records.

**Detection:** `occurrences.parquet` row count jumping from ~48K to ~95K+ would be the signal. Also: any checklist row with `lat IS NULL` in `occurrences.parquet`.

**Phase:** Architecture review in any phase that touches `int_combined`. The EXT-01 `source` column applies to Ecdysis and iNat arms only.

---

### Pitfall: Adding `source` to `occurrences.parquet` requires frontend `buildFilterSQL()` audit

**What goes wrong:** The frontend loads `occurrences.parquet` via hyparquet into wa-sqlite, then queries it with SQL. `buildFilterSQL()` in `filter.ts` generates SQL against the known column schema. Adding `source` is additive and does not break existing queries. But if the checklist layer needs `WHERE source != 'checklist'` to hide checklist-only occurrence rows from the main count — and if checklist records actually DO appear in `occurrences.parquet` — every SQL path that computes counts needs updating.

**Prevention:** Decide upfront whether checklist records appear in `occurrences.parquet` at all. If they do not (which is the correct architecture), the `source` field only distinguishes `'ecdysis'` vs. `'inat'` rows — simpler to filter.

**Phase:** Frontend query update phase. Scope is small if checklist rows are excluded from `occurrences.parquet`.

---

## Multi-Source Occurrence Data

### Pitfall: ~4,600 records without coordinates cannot be spatially joined

**What goes wrong:** The milestone context notes ~4,600 of 50,646 checklist records lack coordinates. If these are historical specimen records (not the current Bartholomew et al. county-presence checklist), they would need spatial handling. The `occurrences.sql` spatial join uses `ST_Point(lon, lat)` — if `lon` or `lat` is NULL, `ST_Point` returns NULL and the fallback correlated subquery assigns the nearest county/ecoregion, which is geographic nonsense for records from 1812 with no coordinates.

**Prevention:** Apply an explicit `WHERE lat IS NOT NULL AND lon IS NOT NULL` guard before `ST_Point`. Emit records with NULL coordinates as `county = NULL, ecoregion_l3 = NULL` rather than running the fallback. Add a `SELECT COUNT(*) WHERE lat IS NULL` assertion at load time and document the NULL-coordinate count explicitly.

**Detection:** Any checklist record in `occurrences.parquet` where `county IS NOT NULL` but `lat IS NULL` — that row got the fallback assigned, which is wrong.

**Phase:** Checklist ingestion phase. Decide and document the NULL-coordinate policy before writing the dbt model.

---

### Pitfall: Mixed date formats require explicit parsing before YEAR()/MONTH() extraction

**What goes wrong:** The milestone context notes two date format variants: ISO T00:00:00 (`"2019-07-15T00:00:00"`) and MM/DD/YYYY (`"07/15/2019"`). DuckDB's `YEAR()` and `MONTH()` functions work on DATE and TIMESTAMP types but not on unparsed VARCHAR. If the staging model casts the date column as VARCHAR (the current pattern for `ecdysis_date` and `sample_date`), `YEAR()` and `MONTH()` will return NULL for all rows.

The current `int_combined.sql` extracts YEAR/MONTH on typed columns before casting to VARCHAR for display. The same pattern must apply to checklist staging.

**Prevention:** In the checklist staging model, use `TRY_STRPTIME(date_col, '%Y-%m-%dT%H:%M:%S')` for ISO format and `TRY_STRPTIME(date_col, '%m/%d/%Y')` for MM/DD/YYYY. Use `COALESCE(attempt1, attempt2)` to handle both formats. Extract YEAR/MONTH from the parsed TIMESTAMP before casting to display VARCHAR.

**Detection:** `SELECT COUNT(*) FROM staging WHERE year IS NULL OR month IS NULL` after the staging model runs. If count > 0, date parsing failed for some rows.

**Phase:** Checklist ingestion phase. Write a unit test asserting both date format variants parse correctly.

---

### Pitfall: Trailing spaces in family names cause silent row exclusion from the species universe

**What goes wrong:** The milestone context explicitly notes trailing-space family names like `"Halictidae "` in the raw data. The `int_species_universe.sql` WHERE clause `WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae', 'Megachilidae', 'Melittidae', 'Stenotritidae')` will EXCLUDE rows with `"Halictidae "` (trailing space). Those rows are silently dropped from the species universe — no error, no warning.

**Prevention:** Apply `TRIM()` to all VARCHAR columns in staging models. Make it a rule: all string columns in `stg_checklist__*` models pass through `TRIM()`. Add a dbt test: `SELECT COUNT(*) WHERE family != TRIM(family)` returning 0.

**Detection:** Species with known Halictidae membership absent from the species universe after ingestion.

**Phase:** Checklist staging model. Add `TRIM()` as a lint-enforced rule in staging.

---

### Pitfall: Records with no `observation_id` and no `ecdysis_id` break frontend occurrence ID construction

**What goes wrong:** The frontend `occIdFromRow` in `src/occurrence.ts` uses `ecdysis_id` and `observation_id` to construct occurrence IDs and returns `null` if both are absent. If historical occurrence records (not the county-presence checklist) enter `occurrences.parquet` without either ID, `occIdFromRow` returns null for those rows. This breaks click-to-detail in the occurrence table and list, and produces null entries in CSV export.

**Prevention:** If historical records enter `occurrences.parquet`, they need a stable occurrence ID scheme — a `checklist:<row_number>` synthetic ID (parallel to `ecdysis:<id>` and `inat:<id>`). The `occurrence.ts` `occIdFromRow` function and its callers must be extended. The `source` field is needed to distinguish the new ID prefix.

**Detection:** `occIdFromRow` returning null for any row in the table; `bee-occurrence-detail` showing blank items.

**Phase:** Frontend integration phase. Must extend `src/occurrence.ts` if non-Ecdysis, non-iNat rows enter `occurrences.parquet`.

---

### Pitfall: Date range 1812-~1990s creates misleading recency signals in the map and year slider

**What goes wrong:** The year filter uses min/max of the `year` column to set the range slider bounds. If records with `year = 1812` enter `occurrences.parquet`, the year slider shows 1812 as the minimum — surprising for a WABA volunteer data site. The recency-coloring in the map layer also uses year — records from 1812 get the "oldest" color tier.

**Prevention:** The separate "Checklist records" layer toggle (CHECK-02) isolates these records visually. But if the year slider derives bounds from the combined `occurrences.parquet`, it needs either: (a) clamping to the WABA-relevant range, (b) dynamic exclusion of checklist-source rows from bounds computation, or (c) keeping historical records in a separate `checklist.parquet` that never affects the year slider. Decide this architecture before implementation.

**Detection:** Year slider showing 1812 as lower bound after ingestion. Also: WABA records from 2020 appearing with non-recent color styling because the color tier thresholds shift.

**Phase:** Frontend integration phase. Architectural decision (separate parquet vs. merged + `source` filter) must be made in design, not discovered during UAT.

---

## Eleventy Species Page Expansion

### Pitfall: Checklist-only species missing `specific_epithet` are silently excluded from `speciesList`

**What goes wrong:** `_data/species.js` line 97 filters `speciesList = flat.filter(s => s.specific_epithet !== null)`. Checklist-only species get their `specific_epithet` from `checklist_pipeline.py` as `parts[1] if len(parts) >= 2 else None`. For a standard binomial this is populated. But if any checklist entry has only 1 token (a genus-only name that slipped through data extraction), it will have `specific_epithet = NULL` and be silently excluded from `speciesList` — it appears in genus pages and the index but gets no species page.

**Prevention:** Add an assertion in `checklist_pipeline.py` that all inserted species have non-NULL `specific_epithet`:

```python
bad = [sci for sci, ep in zip(species_names, epithets) if ep is None]
if bad:
    raise ValueError(f"Checklist species missing epithet: {bad}")
```

**Detection:** Checklist species absent from `speciesList` but present in `flat`; species page 404s.

**Phase:** Checklist ingestion phase. Add assertion before INSERT.

---

### Pitfall: `species_maps.py` may error or produce empty SVGs for checklist-only species with `occurrence_count = 0`

**What goes wrong:** The `species-detail.njk` template already guards SVG map display with `{%- if sp.occurrence_count > 0 -%}`. But `species_maps.py` must also skip SVG generation for species with zero occurrences. If it attempts to generate an SVG for a species with no occurrence rows, it will either produce an empty file or error.

**Prevention:** Verify that `species_maps.py` already filters `WHERE occurrence_count > 0` before generating maps (inspection required). If it does not, add that filter. The template guard is correct UX; the pipeline guard prevents empty artifacts.

**Detection:** `species_maps.py` erroring on species with zero occurrences, or generating 0-byte SVGs for checklist-only species.

**Phase:** Species map generation phase. Verify `species_maps.py` filter before running against expanded species set.

---

### Pitfall: Checklist-only species are excluded from genus and subgenus pages due to `occurrence_count > 0` filter in `_data/species.js`

**What goes wrong:** `genusList` builds color indices and species lists over `withOcc = allMembers.filter(sp => sp.occurrence_count > 0)`. Checklist-only species (0 occurrences) are excluded. A user navigating the species index sees `Osmia aglaia` listed under _Osmia_, clicks through to the _Osmia_ genus page, and finds the species absent. Same problem for `subgenusList`.

This may be intentional (genus page is an occurrence-browsing surface), but it creates a confusing UX gap and must be a conscious design decision.

**Prevention:** Explicitly decide: do genus and subgenus pages list checklist-only species with a "no WABA records" indicator, or only species with occurrences? Either answer is valid. Document the decision. If checklist-only species should appear on genus pages, the `withOcc` filter in `_data/species.js` must be extended to include `on_checklist` species regardless of `occurrence_count`.

**Detection:** Checklist species appearing in species index but missing from corresponding genus page.

**Phase:** Design decision required before implementing genus/subgenus page changes. Flag in roadmap.

---

### Pitfall: New genera in the checklist need new genus SVG maps — missing maps produce 404s on genus pages

**What goes wrong:** Eleventy generates one genus page per entry in `genusList`. If the checklist adds species in genera not currently in the system, new genus pages are generated but `species_maps.py` may not generate the corresponding SVG maps for those genera if they have zero occurrence records (the map generation is gated on `occurrence_count > 0`).

**Prevention:** After integrating checklist species, verify that all genus names in the species index have corresponding SVG maps generated. Add an assertion in `species_maps.py`: all genera in `species.parquet` with `occurrence_count > 0` have a corresponding `.svg` file. For genera with zero occurrences, no SVG is needed (the genus page template can guard on `totalOccurrences > 0` like `species-detail.njk`).

**Detection:** 404 on genus page `<img>` tags for newly-added genera.

**Phase:** Post-pipeline verification phase. Include in UAT checklist.

---

### Pitfall: `tribeList` filters `totalOccurrences > 0` — a tribe with only checklist-only members disappears from the species index

**What goes wrong:** `tribeList` in `_data/species.js` filters `.filter(t => t.totalOccurrences > 0)`. If a tribe's only WA members are checklist-only species with 0 occurrences, the entire tribe page disappears from the species index. For the WA bee fauna this is unlikely but needs verification.

**Prevention:** After integrating checklist species, run: `SELECT tribe, COUNT(*) FROM checklist_data.species WHERE tribe IS NOT NULL GROUP BY tribe` vs. `SELECT tribe, SUM(occurrence_count) FROM species WHERE tribe IS NOT NULL GROUP BY tribe` and verify no tribe becomes occurrence_count=0 that wasn't already.

**Phase:** Species index verification phase. One-time data check after integration.

---

### Pitfall: HSL color indices in `_data/species.js` shift when new species with occurrences are added to a genus

**What goes wrong:** `_data/species.js` computes HSL color index `i` as position in `withOcc.sort((a,b) => a.canonical_name.localeCompare(b.canonical_name))`. Checklist-only species (0 occurrences) do NOT appear in `withOcc` and do not shift existing color indices. Safe.

BUT: if a historical checklist occurrence record with `occurrence_count > 0` is added to a genus (from the 3rd data source), it WILL appear in `withOcc` and its insertion shifts the color index of all subsequent alphabetical neighbors. This would mismatch the SVG maps generated by `species_maps.py` (which uses the same alphabetical sort).

**Prevention:** The Python `_group_colors` in `species_maps.py` and the JavaScript `hslToHex` in `_data/species.js` both use `occurrence_count > 0 ORDER BY canonical_name`. As long as both remain synchronized, new occurrences from any source produce consistent colors. The existing `test_dbt_diff.py` `test_species_canonical_name_key_set_matches` catches drift if the species mart gains unexpected entries.

**Phase:** No action needed if the sync between Python and JS is maintained. Verify by running the determinism test after adding checklist species.

---

## Prevention Checklist

**Checklist ingestion phase:**
- [ ] All string columns pass through `TRIM()` in `stg_checklist__*` staging models
- [ ] `TRIM(family)` matches exactly one of the 7 bee family values in `int_species_universe.sql`
- [ ] `specific_epithet IS NOT NULL` assertion for all checklist rows before INSERT
- [ ] `SELECT COUNT(*) WHERE lat IS NULL` documented and policy chosen (exclude vs. null-assign)
- [ ] Date format variants (ISO T00:00:00 and MM/DD/YYYY) both parse to typed date in staging
- [ ] NULL-coordinate policy: emit `county = NULL, ecoregion_l3 = NULL` rather than using fallback

**DwC-A taxonomy phase (TAX-01/TAX-02):**
- [ ] Taxon.tsv loaded into DuckDB staging table (not Python dict)
- [ ] `WHERE taxonomicStatus = 'accepted'` (verify exact string in archive) filters synonyms before PK insert
- [ ] `COUNT(DISTINCT taxon_id) == COUNT(*)` assertion after staging load
- [ ] Recursive CTE or iterative join for parent chain walk (not Python recursion)
- [ ] Filter ancestors to `rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus')`
- [ ] Coverage assertion: `COUNT(*) WHERE family IS NULL AND kingdom = 'Animalia'` below threshold
- [ ] ETag/Last-Modified caching mirrors `last_fetch.txt` + S3 pattern
- [ ] Spot-check: `Bombus` gets `family=Apidae`, `tribe=Bombini`, `genus=Bombus`
- [ ] `canonicalize()` spot-tested against 200 Taxon.tsv `scientificName` values

**dbt contract expansion (EXT-01 `source` column):**
- [ ] Column added to `schema.yml` in the same commit as the model change
- [ ] Schema baseline comment in `test_dbt_diff.py` updated ("32 columns")
- [ ] Verify checklist records do NOT appear in `int_combined` (species-level only)
- [ ] Frontend `buildFilterSQL()` and `occIdFromRow` audited for impact of new `source` column
- [ ] Architectural decision documented: do checklist records enter `occurrences.parquet` or not?

**Eleventy species page expansion:**
- [ ] `species_maps.py` filters `WHERE occurrence_count > 0` before SVG generation
- [ ] All new genus/subgenus SVG maps generated before S3 upload
- [ ] Design decision documented: do checklist-only species appear on genus/subgenus pages?
- [ ] `tribeList` coverage check: no tribe becomes occurrence_count=0 unexpectedly
- [ ] Color index sync: `species_maps.py` and `_data/species.js` use identical sort/filter
- [ ] `test_dbt_diff.py` baseline comments updated after full pipeline run

**CI / nightly.sh:**
- [ ] `npm test` passes (Vitest + pytest) after each phase
- [ ] `bash data/dbt/run.sh build` exits 0 with new column in schema.yml
- [ ] Full pipeline run on maderas before declaring milestone complete
- [ ] Push main + tag per `feedback_push_every_milestone.md`

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| DwC-A staging load | Synonym rows cause duplicate taxon_id PK violations | Filter `taxonomicStatus = 'accepted'` before insert; verify exact string in archive |
| DwC-A archive download | ~350 MB re-downloaded nightly without caching | Implement ETag/Last-Modified caching from day 1 |
| DwC-A parent chain walk | Python recursion too slow on ~1.5M rows | Use DuckDB recursive CTE; filter to Animalia first |
| Checklist staging | Trailing spaces in family silently drop rows from species universe | TRIM() all VARCHAR columns; add dbt test |
| Checklist date parsing | Mixed formats produce NULL year/month | TRY_STRPTIME both variants; assert count > 0 after staging |
| NULL-coordinate records | Fallback spatial join assigns meaningless county to un-geolocated historical records | Explicit NULL guard before ST_Point; emit NULL county rather than fallback |
| `int_combined` expansion | Checklist rows accidentally added to UNION ALL (wrong) | Checklist rows are species-level; they belong in int_species_universe FULL OUTER JOIN, not int_combined |
| `source` column in schema.yml | Added to model but forgotten in schema.yml | Atomic commit: model + schema.yml together |
| `test_dbt_diff.py` during development | Expected failure: sandbox > public before pipeline runs | Do not suppress; use as progress indicator |
| SVG maps for new genera | Genus page img 404 for newly-added checklist genera | Verify species_maps.py generates all required SVGs before S3 upload |
| Genus/subgenus pages | Checklist-only species absent from genus pages | Explicit design decision required in roadmap |
| Tribe pages | Tribe disappears if all members are checklist-only (0 occurrences) | Verify against actual data after integration |
| Frontend occurrence ID | `occIdFromRow` returns null for rows with no ecdysis_id or observation_id | Extend `src/occurrence.ts` if any such rows enter `occurrences.parquet` |
| Year slider bounds | 1812 as minimum year surprises WABA users | Architecture decision: separate parquet or `source` filter on bounds computation |

## Sources

All findings from direct code inspection of:
- `/Users/rainhead/dev/beeatlas/data/canonical_name.py`
- `/Users/rainhead/dev/beeatlas/data/checklist_pipeline.py`
- `/Users/rainhead/dev/beeatlas/data/inaturalist_pipeline.py`
- `/Users/rainhead/dev/beeatlas/data/resolve_taxon_ids.py`
- `/Users/rainhead/dev/beeatlas/data/species_export.py`
- `/Users/rainhead/dev/beeatlas/data/run.py`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/occurrences.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/schema.yml`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_combined.sql`
- `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_species_universe.sql`
- `/Users/rainhead/dev/beeatlas/data/tests/test_dbt_diff.py`
- `/Users/rainhead/dev/beeatlas/_data/species.js`
- `/Users/rainhead/dev/beeatlas/_pages/species-detail.njk`
- `/Users/rainhead/dev/beeatlas/.planning/PROJECT.md`
- `/Users/rainhead/dev/beeatlas/data/gbif-backbone/taxon.sql`
- `/Users/rainhead/dev/beeatlas/data/checklists/README.md`
