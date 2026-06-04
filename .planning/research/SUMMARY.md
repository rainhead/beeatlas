# Project Research Summary

**Project:** BeeAtlas v4.7 — Checklist Records as Point Data
**Domain:** Historical museum occurrence records — pipeline promotion + taxonomic reconciliation + cross-dataset dedup
**Researched:** 2026-06-03
**Confidence:** HIGH (all findings from direct codebase inspection + confirmed source data)

---

## Executive Summary

v4.7 promotes 50,646 Bartholomew et al. 2024 WA bee checklist records from a county-fill
presence layer to a full `source='checklist'` peer in `occurrences.parquet`, rendering
coord-bearing records as distinct map points. The prerequisite full-fidelity CSV is
**confirmed present** at `/home/peter/final_checklist_records.csv` (50,646 rows; columns:
ObjectID, Family, Genus, Scientific Name with authority, Locality, Latitude, Longitude, Date,
recordedBy, County_join, x, y). This eliminates the Phase-1 blocker all four researchers
anticipated. The only remaining task before implementation begins is committing this file into
`data/checklists/`. Key constraints: no `coordinateUncertaintyInMeters` (rules out ALA-style
uncertainty circles — confirmed anti-feature), no `catalogNumber` (dedup cannot use catalog
number and must rely on fuzzy collector+date+coords).

The recommended build-time stack requires exactly three new pip packages: `pygbif>=0.6.6`
(GBIF name_backbone() API for synonym resolution, cached; never called at nightly build time),
`rapidfuzz>=3.14.5` (misspelling-candidate generation for human review only, not auto-applied),
and `dateparser>=1.4.0` (ambiguous historical date parsing). Everything else — name parsing,
coordinate validation, dedup — is handled by existing `canonical_name.py`, Python stdlib bbox
checks, and DuckDB `jaro_winkler_similarity()` SQL. Do NOT add Splink, gnverifier, gnparser,
taxize/taxizedb, recordlinkage, dedupe, CoordinateCleaner, or Catalogue of Life. ITIS is used
offline via its downloadable SQLite (stdlib `sqlite3`; stored at `data/raw/itisSqlite.db`,
gitignored) as a fallback tier, never via its SOAP API.

The two credibility-critical risks are taxonomic over-matching (silently resolving a checklist
name to the wrong accepted taxon_id) and dedup false-merge (suppressing a distinct specimen as a
duplicate). Both require human-in-the-loop audit CSV mitigations: external authority matches
must be written to `checklist_name_resolution_audit.csv` and promoted by a human before entering
any seed; dedup candidate pairs must be written to `dedup_candidate_pairs.csv` with the match
criteria satisfied before any record is suppressed. The build-order DAG flows A (full-fidelity
CSV ingest) -> B (dbt staging + name reconciliation) -> C (dedup + int_combined ARM 4) ->
D (sqlite_export.py + features.ts atomic deploy, the highest-risk integration point) ->
E (source toggle + detail card).

---

## Key Findings

### Recommended Stack

The new library additions are minimal by design. Three pip packages replace a much longer list
of plausible alternatives that were all explicitly rejected by the stack researcher.

**New pip additions:**
- `pygbif>=0.6.6`: GBIF `species.name_backbone()` for accepted-name normalization of the ~178
  names that fail the existing iNat bridge. Called once per name, cached in
  `checklist_data.gbif_resolution_cache`; never called at nightly build time. Results committed
  to git for offline reproducibility.
- `rapidfuzz>=3.14.5`: Jaro-Winkler / token-sort-ratio misspelling candidate generation. Used
  ONLY to populate a curator-review sidecar when GBIF returns `matchType='NONE'` and ITIS exact
  match fails. Never auto-applied to resolve names.
- `dateparser>=1.4.0`: Handles the ~15% of dates that fail Python stdlib `strptime` with an
  explicit format list (year-only, text seasons, date ranges, pre-1900 to 1812). Store as
  `year INTEGER, month INTEGER, day INTEGER` — three nullable columns, not a single DATE.

**Explicitly rejected:** Splink (overkill for 46K-row deterministic dedup), gnverifier/gnparser
(Go binary dependencies), taxize/taxizedb (R-only), recordlinkage/dedupe (probabilistic training
overhead), CoordinateCleaner (R-only), Catalogue of Life (extra indirection over ITIS), arrow/
pendulum (larger than dateparser without benefit), GBIF backbone DwC-A download (~300 MB).

**No new library for:** name parsing (`canonical_name.py` handles authority-stripping, subgenus
parens, infraspecific markers), dedup (DuckDB `jaro_winkler_similarity()` confirmed in >=1.1.0),
coordinate validation (Python stdlib bbox check + `coord_flag` column).

**ITIS offline:** Download `itisSqlite.zip` as a one-time setup step; store at
`data/raw/itisSqlite.db` (gitignored). Query via `sqlite3` stdlib. Fallback tier after GBIF;
used only for names where GBIF returns `matchType='NONE'`. Never the SOAP API.

See `.planning/research/STACK.md` for full resolution-chain tier table and pyproject.toml delta.

---

### Expected Features

**Must ship (table stakes):**
- Full-fidelity CSV ingest: lat/lon, date, recordedBy, locality, verbatim Scientific Name --
  the prerequisite for every other feature. Commit `final_checklist_records.csv` to
  `data/checklists/` first.
- ARM 4 in `int_combined` + `occurrences.parquet` with `source='checklist'`
- Checklist points on map with distinct 4th source color
- Source-selection toggle extended to include checklist
- `_renderChecklist` detail card branch: collector, date with verbatim_date fallback, locality,
  dataset attribution ("Bartholomew et al. 2024, JHR 97" + DOI)
- Verbatim-vs-accepted name note when they differ (checklist-specific differentiator)
- Dedup against Ecdysis: `dedup_status` column; suppress confirmed duplicates from point layer
- Per-source counts on species/taxon pages (checklist arm)
- dbt contract extended for `checklist_id` (33 -> 34 columns)
- Graceful null/partial date handling: year-only fallback, "date unknown" -- do NOT drop null-date rows from point layer

**Should ship (differentiators):**
- `coordinate_precision` enum note in detail card: derivable at pipeline time from coordinate
  profile. No uncertainty circles -- ruled out because `coordinateUncertaintyInMeters` is absent
  from the source CSV.
- Year-excluded-from-seasonality note on species pages (honest UX for date-resolution gaps)

**Defer:**
- Link from detail card to source collection catalog page (requires institution-URL mapping)
- County-fill layer retirement/consolidation (remains valid for ~9% no-coord records)

**Anti-features (do not build):**
- Coordinate uncertainty circles: source has no `coordinateUncertaintyInMeters`; rendering 46K
  county-centroid-radius circles is visually disastrous and informationally misleading
- Cross-dataset record merge: destroys audit trail; GBIF explicitly does not auto-merge for
  the same reason
- `coordinateUncertaintyInMeters` filter control: use CSV export for research-grade filtering

See `.planning/research/FEATURES.md` for full portal comparison and prioritization matrix.

---

### Architecture Approach

All findings are from direct codebase inspection (HIGH confidence). The build-order DAG is:
`checklist_pipeline.py` (full-fidelity ingest) -> `checklist_resolution.py` (on-demand GBIF/ITIS
name seeding) -> `resolve_taxon_ids.py` (unchanged; already UNIONs checklist_data.species) ->
`dbt build` (`stg_checklist__records_full` -> `int_checklist_dedup` -> `int_combined` ARM 4 ->
`occurrences.sql` unchanged -> `checklist.sql` unchanged) -> `sqlite_export.py` (_GEO_COLS + 1
slot) -> frontend (`features.ts` + `url-state.ts` + `filter.ts` + `occurrence.ts` + detail card).

**Major components and key decisions:**

1. **`stg_checklist__records_full.sql`** (new): Reads `checklist_data.checklist_records_full`,
   applies `int_synonyms` JOIN (same pattern as ARM 1/3), joins
   `stg_inat__canonical_to_taxon_id`, excludes NULL/zero coordinates. ARM 4 uses the dbt
   synonym path exclusively -- do NOT route through `checklist_synonyms.csv`/`reconcile()`.

2. **`int_checklist_dedup.sql`** (new): LEFT JOIN against `int_ecdysis_base` on fuzzy key
   `(ROUND(lat,2), ROUND(lon,2), year, month, canonical_name, lower(trim(recordedBy)))`.
   Runs before `int_combined` to avoid deduping after expensive `ST_Within` spatial joins.
   NULL-collector rows are never deduplicated.

3. **`int_combined` ARM 4** (modified): UNION ALL from `int_checklist_dedup`. Must explicitly
   cast `NULL::INTEGER AS checklist_id` in ARMs 1-3 to avoid DuckDB UNION type errors.
   Contract bumps from 33 to 34 columns. Phase 111 isolation test must be explicitly retired
   with an explanatory comment.

4. **`sqlite_export.py` + `features.ts` atomic deploy** (highest integration risk): `_GEO_COLS`
   gains `checklist_id` at position 7. `_buildGeoJSONFromRaw` gains a `checklist:<N>` occId
   branch. These two files are positionally coupled and NOT type-checked -- a mismatch produces
   silent data corruption, not a thrown error. Must ship as a single commit. The existing
   comment in `features.ts` line 17 documents this pattern from Phase 131.

5. **County-fill mart** (`checklist.sql`): Unchanged. The two layers are complementary --
   `checklist.parquet` = county presence assertions (all 2,861 species); `occurrences.parquet`
   checklist rows = actual collection points (~46K coord-bearing records). Seasonality histogram
   and county-fill layer must source from different data to prevent double-counting.

6. **occId**: Do NOT reuse `specimen_observation_id` as the checklist synthetic ID -- it breaks
   iNat URL construction. Add explicit `checklist_id INTEGER` via `ROW_NUMBER() OVER ()`.

See `.planning/research/ARCHITECTURE.md` for full SQL sketches, column conformance table, and
anti-pattern documentation.

---

### Critical Pitfalls

1. **Taxonomic over-matching -- silent mis-resolution to wrong taxon_id.** Near-miss bee names
   (e.g. Lasioglossum incompletum vs Lasioglossum inconditum) and gender-agreement variants are
   not synonyms but will be collapsed by fuzzy matching. Mitigation: two-tier resolution (exact
   -> curated seed -> external authority); external authority results NEVER auto-committed; write
   raw GBIF/ITIS responses to `checklist_name_resolution_audit.csv`; require human promotion to
   `occurrence_synonyms.csv`; dbt test asserting no unapproved many-to-one name->taxon_id
   collapses within Anthophila.

2. **Dedup false-merge -- two distinct specimens suppressed as one.** Joint collecting events,
   coordinate rounding, and collector-name normalization collisions all produce false positives.
   False merge is the worse error for a scientific atlas (unrecoverable by users; false split is
   visible as double-count). Mitigation: require exact canonical_name + exact date (not
   year-only) + coordinate match within 1.1 km tolerance + exact lower(trim(recordedBy)) -- all
   four criteria AND; never dedup on NULL date or NULL coordinates; write
   `dedup_candidate_pairs.csv` for human sign-off before suppressing any record.

3. **`_GEO_COLS` / `_buildGeoJSONFromRaw` positional coupling -- silent corruption on mismatch.**
   A one-position shift puts `checklist_id` in the `source` slot (or vice versa) for every row
   in the database. No type-system check catches this. Mitigation: Phase D is a single atomic
   commit touching both `sqlite_export.py` and `src/features.ts`. Unit-test the `checklist:<N>`
   occId path before deployment.

4. **Double-counting with the county-fill layer.** Once checklist rows are in `occurrences.parquet`,
   species page counts that also draw from `checklist.parquet` will double-count. Mitigation:
   verify at Phase C that species page templates derive checklist counts from
   `occurrences.parquet source='checklist'` rows only, not from a union with `checklist.parquet`.

5. **Phase 111 isolation test retirement.** The existing pytest that asserts
   `occurrences.parquet row count unchanged when checklist.sql is built` will now fire as a
   true positive reversal. If not explicitly retired, it creates a confusing signal. Mitigation:
   retire it with a comment in Phase C, replace with an assertion that `occurrences.parquet`
   contains `source='checklist'` rows.

See `.planning/research/PITFALLS.md` for full mitigation checklists and recovery strategies.

---

## Implications for Roadmap

### Phase A: Full-Fidelity CSV Ingest
**Rationale:** Everything else in v4.7 depends on having `checklist_data.checklist_records_full`
populated from the confirmed source file. This is the only phase with no architecture-level risk
(pure data loading) and the only phase that can run without touching the dbt model layer. Do it
first, gate everything else on it.
**Delivers:** `checklist_data.checklist_records_full` (~50,646 rows, ~46K with coords); Python
coordinate validation (`coord_flag`, WA bbox, zero-coord guard); date normalization (stdlib +
dateparser fallback; `year/month/day` integers; `date_quality` enum); `verbatim_date` preserved.
**Addresses:** Coordinate quality pitfall, date parsing pitfall (both must be resolved at ingest,
not in dbt).
**Avoids:** Zero-coordinate rows entering `occurrences.sql` and breaking `ST_Point(lon, lat)`.
**Research flags:** None -- standard Python CSV ingest with well-understood tools. Skip
research-phase.
**Gate:** pytest: row count ~50,646; coord-bearing rows ~46,051; `lat=0 OR lon=0` count = 0;
`date_quality` column present; year=1812 parses correctly.

---

### Phase B: dbt Staging + Name Reconciliation
**Rationale:** Name reconciliation is a one-time human-in-the-loop step that gates ARM 4 quality.
It must be complete before Phase C adds checklist rows to `int_combined` -- once rows are in
`occurrences.parquet` with wrong taxon_ids, the error is live on the map. The audit CSV is the
credibility artifact.
**Delivers:** `stg_checklist__records_full.sql` (synonym JOIN via `int_synonyms`, taxon_id
bridge); `checklist_name_resolution_audit.csv` committed to git; `checklist_unmatched.csv`
updated with `fuzzy_candidate` column for curator review; GBIF resolution cache in DuckDB.
**Uses:** `pygbif`, `rapidfuzz`, ITIS SQLite offline, `checklist_resolution.py` (new on-demand
module -- NOT part of nightly run).
**Avoids:** Taxonomic over-matching (audit CSV + human review gate); nondeterministic nightly
builds (cache-only after first seeding run; nightly never hits ITIS/GBIF network).
**Research flags:** The GBIF fuzzy-match human-review workflow design needs a written procedure
in REQUIREMENTS.md before implementation. Skip deeper research-phase.
**Gate:** `dbt build --select stg_checklist__records_full` passes; NULL taxon_id rate documented;
dbt test: no `canonical_name` within Anthophila resolves to >1 distinct `taxon_id` without
explicit entry in `occurrence_synonyms.csv`.

---

### Phase C: Dedup + int_combined ARM 4
**Rationale:** Dedup must precede ARM 4 integration to avoid expensive post-join dedup and to
prevent the Phase 111 test confusion. ARM 4 is the architectural inflection point -- all contract
updates, synonym path unifications, and double-count guards belong in this phase's scope, not
deferred.
**Delivers:** `int_checklist_dedup.sql` (LEFT JOIN against `int_ecdysis_base`; NULL-collector
rows ineligible); `int_combined` ARM 4 UNION ALL (NULL::INTEGER casts on ARMs 1-3 for
`checklist_id`); dbt contract 33->34 columns; Phase 111 isolation test retired with comment;
new assertion that `source='checklist'` rows exist in `occurrences.parquet`;
`dedup_candidate_pairs.csv` for human review; synonym path unification audit
(`checklist_synonyms.csv` diff against `occurrence_synonyms.csv`).
**Avoids:** Dedup false-merge (exact 4-field AND key; NULL-date ineligible); double-counting
with county-fill layer (verify species page counts source from `occurrences.parquet` only);
contract drift (schema.yml updated; column-count assertion passing).
**Research flags:** The dedup key definition and accepted error direction (false split vs false
merge) must be stated explicitly in REQUIREMENTS.md before SQL is written. Recommendation:
prefer false split (double-count) as the lesser error for a scientific audience. Skip deeper
research-phase.
**Gate:** Full `dbt build` passes; `occurrences.parquet` row count increases by expected net
rows; `source='checklist'` rows verified; dedup-dropped count logged and sensible.

---

### Phase D: sqlite_export.py + geo_blob + Frontend occId (Atomic)
**Rationale:** The positional coupling between `_GEO_COLS` and `_buildGeoJSONFromRaw` makes
this the highest deployment risk. Splitting across commits is explicitly an anti-pattern
documented in `features.ts` line 17. Until this phase lands, checklist rows silently drop from
the map (the `if (occId == null) continue;` guard).
**Delivers:** `_GEO_COLS` extended to 8 slots (checklist_id at position 7);
`_buildGeoJSONFromRaw` emits `checklist:<N>` occIds; `parseOccId`/`occIdFromRow` recognize
`checklist:` prefix; `OccurrenceRow` type extended; zero-orphan assertion passes; Vitest unit
tests cover checklist occId path.
**Avoids:** Silent data corruption from positional mismatch (atomic commit); orphan taxon_id
false-fail (auto-handled by existing `_assert_no_orphan_taxon_ids`).
**Research flags:** None -- well-understood pattern documented in codebase. Skip research-phase.
**Gate:** `generate_sqlite` completes; zero-orphan assertion passes; browser shows checklist
point markers on map with correct occIds; `occurrences.db` size monitored against 22.9 MB baseline.

---

### Phase E: Source Toggle + Detail Card
**Rationale:** UI completeness. With checklist points rendering on the map (Phase D), the source
toggle and detail card are the remaining user-visible v4.7 payoff. Both are low-risk extensions
of existing Lit component patterns.
**Delivers:** `SourceKey` extended to `'checklist'`; `VALID_SOURCES` updated; fourth checklist
toggle in `bee-pane.ts`; `_renderChecklist` branch in `bee-occurrence-detail.ts` (collector,
date + verbatim_date, locality, attribution DOI line, verbatim-vs-accepted name note when names
differ); per-source checklist counts on species/taxon pages; `src=checklist` URL round-trip tested.
**Avoids:** Checklist points silently excluded from filter counts (VALID_SOURCES must match
`source='checklist'` rows in occurrences.db).
**Research flags:** None -- standard Lit component extension. Skip research-phase.
**Gate:** Vitest: `parseParams`/`buildParams` round-trip with `src=checklist`; manual toggle
on/off hides/shows checklist points; detail card renders collector, date, locality, attribution;
species page shows distinct checklist_count.

---

### Phase Ordering Rationale

- A before B: Name reconciliation needs rows loaded to know what to reconcile.
- B before C: ARM 4 quality is only as good as the taxon_id bridge; bad taxon_ids in
  `int_combined` propagate to every downstream consumer.
- C before D: `checklist_id` must exist in `occurrences.parquet` before it can be added to
  `_GEO_COLS`. D's atomic commit constraint requires C to already be complete.
- D before E: The detail card `_renderChecklist` branch fetches occurrence data via occIds --
  occIds must work before the card can render.
- Each phase has its own pytest/dbt gate before the next phase begins.

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase A:** Standard Python CSV ingest. All tools confirmed. No unknowns.
- **Phase D:** Established codebase pattern with documented atomic-deploy requirement.
- **Phase E:** Standard Lit component extension. Well-understood surface.

Needs deliberate decision in REQUIREMENTS.md before implementation (not deeper research):
- **Phase B:** The GBIF fuzzy-match human-review workflow -- what does "curator promotes to
  seed" look like operationally? Needs a written procedure in REQUIREMENTS.md.
- **Phase C:** Dedup key definition and accepted-error-direction decision must be explicit
  in REQUIREMENTS.md before SQL is written.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Three new packages confirmed against PyPI + Python 3.14 readiness; all alternatives explicitly rejected with reasoning. `dateparser` Python 3.14 confidence MEDIUM -- verify `uv add dateparser` before committing. |
| Features | HIGH | Grounded in codebase inspection + GBIF/ALA/Symbiota/Big-Bee portal comparison. Anti-feature status of uncertainty circles confirmed by absence of `coordinateUncertaintyInMeters` in source CSV. |
| Architecture | HIGH | All findings from direct codebase file inspection. Phase 111 test retirement, NULL::INTEGER UNION cast, positional coupling -- all verified against actual source files. |
| Pitfalls | HIGH | All eight pitfalls grounded in this codebase's existing patterns and the Bartholomew et al. 2024 dataset structure. No inferred pitfalls. |

**Overall confidence:** HIGH

### Gaps to Address

- **`dateparser` Python 3.14 compatibility:** Run `uv add dateparser` against Python 3.14
  before adding to `data/pyproject.toml`. Handle at Phase A start.

- **ITIS SQLite file size:** Actual size of `itisSqlite.zip` unknown at research time (estimated
  150-400 MB). Verify before deciding whether to cache on maderas. Determine at Phase B start.

- **DuckDB `jaro_winkler_similarity()` exact signature:** Confirm function name in DuckDB >=1.4
  documentation before writing `int_checklist_dedup.sql`. Low-effort; handle at Phase C start.

- **`locality` column in contract:** Decision to add `locality` as a 35th column (vs. serving
  via supplementary table lookup) is deferred to Phase E. Adding it bumps the contract.

- **Dedup accepted-error-direction:** Written decision must be in Phase C REQUIREMENTS.md before
  SQL is written. Recommendation: prefer false split (double-count) as the lesser error.

---

## Sources

### Primary (HIGH confidence -- direct codebase inspection)
- `data/dbt/models/intermediate/int_combined.sql` -- ARM 1/2/3 column types, UNION structure
- `data/dbt/models/intermediate/int_synonyms.sql` -- unified synonym JOIN pattern
- `data/sqlite_export.py` -- `_GEO_COLS`, positional coupling comment, taxa build
- `src/features.ts` -- `_buildGeoJSONFromRaw`, occId construction, Phase 131 positional coupling note
- `src/url-state.ts` -- `SourceKey`, `VALID_SOURCES`
- `src/filter.ts` -- `OccurrenceRow`, `OCCURRENCE_COLUMNS`
- `src/occurrence.ts` -- `parseOccId`, `occIdFromRow`
- `data/canonical_name.py` -- name normalization (authority-strip, subgenus, infraspecific)
- `data/checklist_pipeline.py` -- existing 4-col loader, `reconcile()`, `CHECKLIST_RECORDS_PATH`
- `data/resolve_taxon_ids.py` -- `_names_to_resolve()` UNION already includes `checklist_data.species`
- `.planning/PROJECT.md` -- v4.7 milestone scope, v4.6 contract history, Phase 111 locked decision

### Primary (HIGH confidence -- confirmed external)
- `/home/peter/final_checklist_records.csv` -- 50,646 rows confirmed; columns confirmed;
  `coordinateUncertaintyInMeters` absent confirmed; `catalogNumber` absent confirmed
- pygbif 0.6.6: https://pypi.org/project/pygbif/
- RapidFuzz 3.14.5: https://pypi.org/project/RapidFuzz/ -- Python 3.14 wheels confirmed
- dateparser 1.4.0: https://pypi.org/project/dateparser/
- ITIS SQLite downloads: https://www.itis.gov/downloads/
- DuckDB `jaro_winkler_similarity()`: https://duckdb.org/docs/sql/functions/char

### Secondary (MEDIUM confidence)
- GBIF backbone taxonomy WA bee coverage -- MEDIUM (Discover Life / ITIS sourced; historical
  name coverage uncertain)
- GBIF species/match rate limits -- MEDIUM (community guidance: 0.2-0.5s pause between calls)
- `dateparser` Python 3.14 support -- MEDIUM (pure Python; `regex` dependency needs wheel
  verification)

---
*Research completed: 2026-06-03*
*Ready for roadmap: yes*
