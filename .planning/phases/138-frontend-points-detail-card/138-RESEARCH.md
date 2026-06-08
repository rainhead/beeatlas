# Phase 138: Frontend Points & Detail Card — Research

**Researched:** 2026-06-08
**Domain:** Lit/TypeScript frontend + Mapbox GL JS + dbt data pipeline
**Confidence:** HIGH (all critical questions resolved against live data and source code)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Checklist points use flat green, overriding recency scheme
- D-02: Green = `#2c7a2c`; solid/opaque circle fill
- D-03: Checklist clusters with other sources; green only at unclustered level
- D-04: Selected checklist points keep green fill + standard white stroke
- D-05: Verbatim-vs-accepted inline det. annotation; accepted alone if same/missing
- D-06: Attribution = plain muted text `Bartholomew et al. 2024` (no link)
- D-07: "Represents N collapsed records" when `collapsed_count > 1`; omit when 1
- D-08: Dates rendered Roman-numeral, precision inferred from `date` string length; no `date_quality` column plumbing
- D-09: `_renderChecklist(row)` branch in `render()` dispatch
- D-10: Promote `verbatim_name`, `locality`, `collapsed_count` into `occurrences` contract; contract 34 → 37; ARMs 1–3 emit typed NULLs
- D-11: Add `checklist` to `VALID_SOURCES`; source-set "no sources selected" logic counts it
- D-12: Keep "Checklist records" as source toggle label; remove `_showChecklist` chain; fold into `hiddenSources` path

### Claude's Discretion
- Exact green shade and circle radius (D-02 fixes hex; planner picks if visual review needed)
- Source ordering within toggle list
- Whether to keep thin checklist green outline/stroke for contrast

### Deferred Ideas (OUT OF SCOPE)
- Map legend for source/recency colors
- Renaming checklist source label
- Linked/DOI attribution for Bartholomew et al. 2024
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UIX-01 | Checklist points render as map points in distinct color, share clustering and taxon filter | D-01..D-04; `source` feature property confirmed present; `_occurrencePointPaint` pattern confirmed |
| UIX-02 | County-fill layer removed; checklist becomes real entry in source-selection set | `checklistCountyFillLayerSpec` confirmed at style.ts line 224; `VALID_SOURCES` confirmed at url-state.ts line 34; `_showChecklist` chain identified throughout bee-map/bee-pane/bee-atlas |
| UIX-03 | Detail card shows collector, date (date_quality), locality, attribution, verbatim+accepted name | All three promoted columns confirmed in `int_checklist_dedup_status`; only `full`/`none` date_quality values exist (no month-precision) |
| UIX-04 | Per-source checklist counts equal deduped record count, no double-counting | `checklist_count` reads OLD mart (42,218 county-rows); promoted occurrences = 19,929 point-rows; these are different source datasets; counts must be re-sourced; `_query_counts` in places_export.py is clean (ecdysis_id predicate) |
</phase_requirements>

---

## Summary

Phase 138 is a well-bounded frontend + data-pipeline task with no ambiguity about what to build. The CONTEXT.md, UI-SPEC.md, and upstream Phase 137 work collectively specify every decision. Two technical questions were flagged for research investigation; both are now resolved:

**UIX-04 (double-count):** `checklist_count` on species/taxon pages is currently aggregated from the OLD `checklist` mart (`int_species_universe.checklist_count_agg` reads `ref('checklist')` = county-level `checklist.parquet`, 42,218 rows). The NEW promoted occurrences arm has 19,929 deduped, coord-bearing point rows — a different source dataset entirely. These counts are materially different: for *Bombus mixtus*, the old mart gives 4,095 vs the new arm's 1,413. The count must be re-sourced. The concrete fix is a new CTE in `int_species_universe.sql` that reads from `occurrences` (or directly from `int_checklist_dedup_status` to avoid a circular DAG) instead of from `ref('checklist')`. The `places_export.py _query_counts` function is clean — it counts only `ecdysis_id IS NOT NULL` rows, so checklist point rows contribute nothing to it.

**Month-precision dates:** Confirmed: the `int_checklist_collapsed` / `int_checklist_dedup_status` data has only two `date_quality` values — `full` (17,754 rows) and `none` (2,175 rows, year/month/day all NULL). There are **zero** `year_only` records and zero month-precision (`YYYY-MM`, length 7) records. The ARM 4 `CASE` in `int_combined.sql` correctly handles this: `full` → `YYYY-MM-DD`, `year_only` → `YYYY`, else NULL. The UI-SPEC's `formatRomanDate` extension for length-7 strings is correct defensive coding (protects against future upstream data changes) but is currently exercised by no live data.

**Primary recommendation:** Implement the pipeline contract bump (34 → 37 cols), fix `checklist_count` source, then the frontend changes following the UI-SPEC paint contract and component inventory exactly.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Point rendering (color override) | Frontend — `src/style.ts` | — | Mapbox paint expression, client-side layer spec |
| Source toggling / `hiddenSources` state | Frontend — `src/bee-atlas.ts` | `src/bee-pane.ts` (presenter) | Architecture invariant: `<bee-atlas>` owns reactive state |
| URL round-trip (`src=checklist`) | Frontend — `src/url-state.ts` | — | `VALID_SOURCES` set, serialize/parse |
| County-fill layer removal | Frontend — `src/bee-map.ts` | `src/style.ts` | Layer add/update in bee-map; spec in style.ts |
| Detail card rendering | Frontend — `src/bee-occurrence-detail.ts` | — | Source dispatch + `_renderChecklist` |
| Promoted contract columns | Data — `data/dbt/models/intermediate/int_combined.sql` | `data/dbt/models/marts/schema.yml` | ARM 4 select + schema enforcement |
| `checklist_count` fix (UIX-04) | Data — `data/dbt/models/intermediate/int_species_universe.sql` | — | Re-source CTE from promoted occurrences |
| `OccurrenceRow` + `OCCURRENCE_COLUMNS` | Frontend — `src/filter.ts` | — | Interface + column list for SQL select |

---

## Findings: Two Flagged Technical Questions

### 1. UIX-04 Double-Count Source of Truth

**What `checklist_count_agg` currently reads:**

`int_species_universe.sql` lines 44–51 (`checklist_count_agg` CTE) reads:
```sql
SELECT canonical_name, COUNT(*) AS checklist_count
FROM {{ ref('checklist') }}
WHERE canonical_name IS NOT NULL
GROUP BY canonical_name
```

`ref('checklist')` is `data/dbt/models/marts/checklist.sql` — the OLD county-level mart built from `wa_bee_checklist_records.tsv` (plus species-county pairs), **not** from the new full-fidelity CSV. It contains **42,218 rows** of county-range assertions where `lat`/`lon` are both NULL. This is a completely different dataset from the 19,929 deduped, coord-bearing records that Phase 137 promoted into `occurrences` via `int_checklist_collapsed`.

**Are the counts different?** Yes, materially:

| Species | Old mart count | New promoted count |
|---------|---------------|-------------------|
| *Bombus mixtus* | 4,095 | 1,413 |
| Total (all species) | 42,218 | 19,929 |

The old mart includes: (a) duplicate county-year-month rows from the raw TSV, (b) unmatched species+county pairs with NULL year, and (c) records without coordinates that were excluded from the new arm. The new arm is deduped (19,929 collapsed from pre-collapse ~50K rows) and coord-bearing only.

**The correct fix:**

Replace the `checklist_count_agg` CTE in `int_species_universe.sql` to read from `int_checklist_dedup_status` (which avoids a circular DAG through the `occurrences` mart external parquet):

```sql
checklist_count_agg AS (
    -- UIX-04: Re-sourced from int_checklist_dedup_status (deduped, promoted arm)
    -- so checklist_count equals the actual point record count in occurrences.parquet.
    -- Previously read ref('checklist') (county-level mart, 42k rows) — wrong post-Phase-137.
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('int_checklist_dedup_status') }}
    WHERE canonical_name IS NOT NULL
      AND dedup_status IS DISTINCT FROM 'confirmed'
      AND lat IS NOT NULL AND lon IS NOT NULL
    GROUP BY canonical_name
),
```

This uses the same filter as ARM 4, so `checklist_count` = count of rows that actually appear as points in `occurrences.parquet`. [VERIFIED: direct DuckDB query against dbt_sandbox]

**Does `places_export.py _query_counts` double-count checklist?**

No. The query at lines 50–65 counts only `ecdysis_id IS NOT NULL` (specimen count) and `DISTINCT sample_id IS NOT NULL` (sample count). Checklist rows have `ecdysis_id IS NULL` and `sample_id IS NULL`, so they contribute nothing to either counter. No double-counting concern here. [VERIFIED: source code read]

**Does the old county-fill surface create double-counting?**

The old county-fill reads `checklist.parquet` via `bee-map.ts _checklistAllRows` query against the Parquet file directly — it does not touch `occurrences.db`. Once the county-fill layer is removed and `_checklistAllRows` plumbing is deleted, there is no code path that reads the old mart for display purposes. The `checklist_count` column fix above ensures the species page count also switches to the deduped set.

**Conclusion for UIX-04:** Two changes needed:
1. `int_species_universe.sql`: replace `ref('checklist')` CTE with `ref('int_checklist_dedup_status')` CTE (SQL above)
2. Delete `bee-map.ts` county-fill plumbing (removes the old read path entirely)

No change needed to `places_export.py`.

---

### 2. Month-Precision Dates

**Data verified against `dbt_sandbox.int_checklist_collapsed` and `int_checklist_dedup_status`:**

```
date_quality distribution:
  'full'  → 17,754 rows  (YYYY-MM-DD: year, month, day all non-NULL)
  'none'  → 2,175 rows   (year=NULL, month=NULL, day=NULL)
  (no 'year_only' rows, no month-precision rows)
```

[VERIFIED: `SELECT date_quality, COUNT(*) FROM dbt_sandbox.int_checklist_dedup_status GROUP BY date_quality`]

**Conclusion:** No month-precision (`YYYY-MM`, length 7) records exist in the live dataset. The `CASE cl.date_quality WHEN 'full' ... WHEN 'year_only' ... ELSE NULL END` in ARM 4 of `int_combined.sql` is correct as-is: full-quality records get `YYYY-MM-DD` dates; none-quality records get NULL date (card omits date line). The `year_only` branch in ARM 4 is currently dead code but harmless.

**For `formatRomanDate`:** The UI-SPEC extension that handles length-7 strings (`VI 2019` format) is correct defensive coding and matches the general contract for future data. The null-guard addition (`if (!dateStr) return ''`) is essential because `none`-quality checklist rows have `date = NULL`, and the current implementation (`new Date(dateStr + 'T00:00:00')`) would throw on null input.

**Simplification:** No ARM 4 change is needed for date handling. The only `formatRomanDate` changes needed are:
- Add null guard at top
- Add length-4 branch (year-only; currently dead for checklist but correct for completeness)
- Add length-7 branch (month-precision; currently dead but correct defensive coding)

---

## Verification Findings (Lower Priority)

### Does `features.ts` emit `source` as a GeoJSON feature property?

**Yes, confirmed.** `src/features.ts` line 45:
```typescript
properties: { occId, recencyTier: _recencyTier(year), source: source ?? '' },
```

The `source` field was appended to `_GEO_COLS` as index 6 in Phase 131 (NORM-02) and is decoded at `row[6]`. Checklist rows have `source = 'checklist'`. The `_occurrencePointPaint` `match`/`case` expression in the UI-SPEC is correctly keyed on `['get', 'source']`. No prerequisite task needed here. [VERIFIED: source code read]

### Are `verbatim_name`, `locality`, `collapsed_count` available in `int_checklist_dedup_status`?

**Yes, confirmed.** `dbt_sandbox.int_checklist_dedup_status` columns (from DESCRIBE):
- `verbatim_name VARCHAR`
- `locality VARCHAR`
- `collapsed_count BIGINT`

Sample data confirms non-null values: e.g., `verbatim_name = 'Agapostemon angelicus Cockerell, 1924'`, `locality = 'Walla Walla, Veterans Golf Course'`, `collapsed_count = 2`. The `int_checklist_collapsed.sql` selects these directly from `stg_checklist__records_full`. ARM 4 can select them as D-10 specifies. [VERIFIED: DuckDB query]

### Actual column count in `data/dbt/models/marts/schema.yml`

**34 columns today**, confirmed by count:
```
ecdysis_id, catalog_number, lon, lat, date, year, month, recordedBy, fieldNumber, floralHost,
host_observation_id, inat_host, inat_quality_grade, modified, specimen_observation_id, elevation_m,
observation_id, host_inat_login, specimen_count, sample_id, sample_host, specimen_inat_quality_grade,
is_provisional, canonical_name, county, ecoregion_l3, place_slug, source, image_url, obs_url,
user_login, license, checklist_id, taxon_id
```

CLAUDE.md says "33 → 34" (Phase 131 dropped 4 columns; Phase 137 added `checklist_id` bringing it to 34). **Bump target: 34 → 37** (add `verbatim_name VARCHAR`, `locality VARCHAR`, `collapsed_count INTEGER`). [VERIFIED: python3 yaml parse of schema.yml]

### `SourceKey` type and existing URL-state tests

`src/url-state.ts` line 32-34:
```typescript
export type SourceKey = 'ecdysis' | 'waba_sample' | 'inat_obs';
const VALID_SOURCES = new Set<SourceKey>(['ecdysis', 'waba_sample', 'inat_obs']);
```

`src/tests/url-state.test.ts` already has `describe('MAP-03: source filter URL param (src=)')` tests covering hidden-source round-trips with the current 3-source set. Adding `checklist` to `SourceKey` and `VALID_SOURCES` will:
1. Break the `SourceKey` type (must add `'checklist'`to the union)
2. Change the `hiddenSources` semantics: `parseParams('src=ecdysis')` will now produce `hiddenSources = new Set(['inat_obs', 'waba_sample', 'checklist'])` instead of `new Set(['inat_obs', 'waba_sample'])` — the existing test at line 417 will fail and must be updated
3. The "no sources selected" guard in `bee-pane.ts` must change from `this._hiddenSources.size === 3` to `=== 4`

The `cl=` URL param tests (lines 272–306) cover the legacy `checklistVisible` field. Those tests remain valid but the `cl=` encoding in `url-state.ts` (lines ~90–100) should be considered for removal or preservation as a no-op legacy parse (the CONTEXT defers this to planner judgment). [VERIFIED: source code read]

### `specimen_inat_login` and `specimen_inat_taxon_name` not in `OCCURRENCE_COLUMNS`

Confirmed: `filter.ts` `OCCURRENCE_COLUMNS` (lines 81–90) does not include `specimen_inat_login` or `specimen_inat_taxon_name`. These are in `int_combined` ARMs 1–2 but not surfaced to the frontend. This is pre-existing and not relevant to Phase 138. ARM 4 for checklist emits NULL for both, consistent with the rest. [VERIFIED: source code read]

---

## Standard Stack

No new packages are required. This phase touches only:

| Layer | Tech | Version | Status |
|-------|------|---------|--------|
| Frontend | Lit + TypeScript | already installed | no change |
| Mapbox GL JS | paint expressions | already installed | no change |
| dbt (DuckDB) | SQL model changes | already installed | no change |

**Package Legitimacy Audit:** N/A — zero new packages installed in this phase.

---

## Architecture Patterns

### Paint Override Pattern (UIX-01)

Extend `_occurrencePointPaint` in `src/style.ts` to wrap the recency match in a source-keyed outer `match`:

```javascript
// Source: 138-UI-SPEC.md §Mapbox Paint Contract
'circle-color': [
  'match', ['get', 'source'],
  'checklist', '#2c7a2c',
  // fallback: existing recency-tier match
  ['match', ['get', 'recencyTier'],
    'thisYear', colors.thisYear,
    'lastYear', colors.lastYear,
    colors.earlier]
]
```

This is the canonical pattern from the UI-SPEC. The `source` feature property is already emitted by `features.ts`. Both `unclusteredPointLayerSpec` and `selectedOccurrencesLayerSpec` call `_occurrencePointPaint`, so both pick up the override automatically.

### NULL-Cast Pattern for ARM 1–3 (D-10)

Follow the existing ARM 4 pattern already used for `checklist_id` in ARMs 1–3:
```sql
-- Add to all three existing ARMs:
NULL::VARCHAR    AS verbatim_name,
NULL::VARCHAR    AS locality,
NULL::INTEGER    AS collapsed_count,
```

ARM 4 selects the real values: `cl.verbatim_name`, `cl.locality`, `cl.collapsed_count::INTEGER`.

### Source-Toggle Migration (UIX-02)

The `_showChecklist` / `checklistVisible` / `_checklistVisible` chain spans four files:
- `src/bee-map.ts` lines 59, 67–69, 345, 437–439, 706–762 (county-fill layer add/update/click paths)
- `src/bee-pane.ts` lines 84 (property), 115, 513–514, 620, 1134 (toggle)
- `src/bee-atlas.ts` lines 41, 178, 214, 252, 608, 670, 1055 (state prop + wiring)
- `src/url-state.ts` `checklistVisible?` field in `UiState`; `cl=` parse/serialize

These are all deleted/replaced. The checklist source then flows through the standard `hiddenSources` path identically to `ecdysis`, `waba_sample`, and `inat_obs`.

### Recommended Project Structure

No structural changes — all modifications are in-place edits to existing files per the UI-SPEC Component Inventory.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mapbox source-keyed color override | Custom layer | `match` expression on `source` feature property | Mapbox evaluates paint expressions per-feature at render time |
| Dedup filter for `checklist_count` | Re-implement dedup logic | Re-use the `WHERE dedup_status IS DISTINCT FROM 'confirmed' AND lat IS NOT NULL` filter already in ARM 4 | Single source of truth; any drift causes count divergence |
| Date precision | Custom date parser | Length-check on the date string + existing `ROMAN_MONTHS` array | Already proven pattern; ARM 4 controls the string format |

---

## Common Pitfalls

### Pitfall 1: Circular DAG in `int_species_universe`
**What goes wrong:** `int_species_universe` already reads `ref('occurrences')` for `provisional_agg`. Adding a second read of `ref('occurrences')` for `checklist_count` would be fine, but since `occurrences` is a `materialized='external'` parquet file, any reference inside a dbt model that builds *before* `occurrences.parquet` exists will fail.
**Why it happens:** `int_species_universe` → `species` (the mart) → `occurrences` (external parquet dependency). Reading `ref('int_checklist_dedup_status')` directly (which is a table materialized before `occurrences`) is safe and avoids the DAG issue.
**How to avoid:** Use `ref('int_checklist_dedup_status')` in the new CTE, not `ref('occurrences')`.
**Warning signs:** dbt run error "Trying to read from ... before it is built."

### Pitfall 2: `SourceKey` union type mismatch
**What goes wrong:** After adding `'checklist'` to `VALID_SOURCES`, TypeScript will flag any place that uses the old 3-member `SourceKey` union that is now missing `'checklist'`. The `hiddenSources: Set<SourceKey>` property in bee-map.ts is already typed as `Set<string>` (line 60) so that's safe. The `url-state.ts` `SourceKey` export will need `| 'checklist'`.
**Why it happens:** The type is exported and used throughout the codebase.
**How to avoid:** Update `SourceKey` first, let TypeScript errors guide the remaining touch-points.

### Pitfall 3: Existing url-state MAP-03 tests break
**What goes wrong:** `parseParams('src=ecdysis')` with 4 sources now produces `hiddenSources = {inat_obs, waba_sample, checklist}` rather than `{inat_obs, waba_sample}`. The test at url-state.test.ts line 417 will fail.
**Why it happens:** `VALID_SOURCES` is used to compute the complement; more sources in the set = larger complement for the same visible set.
**How to avoid:** Update the MAP-03 test expectations when updating `VALID_SOURCES`. Also update the "two hidden sources" test at line 420.

### Pitfall 4: `formatRomanDate` called with null
**What goes wrong:** Checklist rows with `date_quality = 'none'` have `date = NULL` in the mart. The current `formatRomanDate` (`new Date(dateStr + 'T00:00:00')`) will throw if `dateStr` is null/undefined.
**Why it happens:** The function was written for non-null date strings from the other sources.
**How to avoid:** Add `if (!dateStr) return '';` as the first line of the extended function per the UI-SPEC.

### Pitfall 5: `collapsed_count` type mismatch
**What goes wrong:** `int_checklist_collapsed` defines `collapsed_count` as `COUNT(*) → BIGINT`. The schema.yml contract should declare it as `integer` per D-10. `COUNT(*)` in DuckDB returns BIGINT; the ARM 4 select must cast: `cl.collapsed_count::INTEGER AS collapsed_count`.
**Why it happens:** DuckDB COUNT aggregate returns BIGINT; the contract column type is `integer`.
**How to avoid:** Include `::INTEGER` cast in ARM 4. ARMs 1–3 use `NULL::INTEGER AS collapsed_count`.

### Pitfall 6: `cl=` legacy URL param
**What goes wrong:** The `checklistVisible` flag is currently serialized as `cl=1` in the URL. After this phase, that flag has no meaning. If the old URL is preserved in users' bookmarks, it'll be silently ignored once the `cl=` parse is removed.
**Why it happens:** URL param has a different key from `src=` for historical reasons.
**How to avoid:** Either: (a) preserve the `cl=1` parse as a no-op (keep the field in UiState for back-compat but ignore its setter), or (b) remove the parse entirely (stale URLs just show checklist visible, which is the new default since it's in `VALID_SOURCES`). Option (b) is simpler. The CONTEXT does not prescribe this; planner's call.

---

## Code Examples

### ARM 4 additions for D-10 (promote verbatim_name/locality/collapsed_count)

```sql
-- Source: data/dbt/models/intermediate/int_combined.sql ARM 4 (~line 197)
-- Add after cl.canonical_name, before 'checklist'::VARCHAR AS source:
cl.verbatim_name,
cl.locality,
cl.collapsed_count::INTEGER AS collapsed_count,
```

ARMs 1–3 (three places each), add:
```sql
NULL::VARCHAR    AS verbatim_name,
NULL::VARCHAR    AS locality,
NULL::INTEGER    AS collapsed_count,
```

### `checklist_count_agg` CTE replacement

```sql
-- Source: data/dbt/models/intermediate/int_species_universe.sql (~line 44)
-- Replace the existing CTE body:
checklist_count_agg AS (
    -- UIX-04: Re-sourced from int_checklist_dedup_status (deduped promoted arm)
    -- so checklist_count == point record count in occurrences.parquet.
    -- Previously read ref('checklist') (old county-level mart, 42k rows).
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('int_checklist_dedup_status') }}
    WHERE canonical_name IS NOT NULL
      AND dedup_status IS DISTINCT FROM 'confirmed'
      AND lat IS NOT NULL AND lon IS NOT NULL
    GROUP BY canonical_name
),
```

### `VALID_SOURCES` extension

```typescript
// Source: src/url-state.ts line 32-34
export type SourceKey = 'ecdysis' | 'waba_sample' | 'inat_obs' | 'checklist';
const VALID_SOURCES = new Set<SourceKey>(['ecdysis', 'waba_sample', 'inat_obs', 'checklist']);
```

### `_occurrencePointPaint` green override

```typescript
// Source: src/style.ts — replace the 'circle-color' entry in _occurrencePointPaint
'circle-color': [
  'match', ['get', 'source'],
  'checklist', '#2c7a2c',
  ['match', ['get', 'recencyTier'],
    'thisYear', colors.thisYear,
    'lastYear', colors.lastYear,
    colors.earlier]
],
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run src/tests/url-state.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UIX-02 | `src=checklist` round-trips in URL | unit | `npm test -- --run src/tests/url-state.test.ts` | Yes (new tests needed in existing file) |
| UIX-02 | "no sources selected" fires at 4 hidden | unit | `npm test -- --run src/tests/bee-pane.test.ts` | Yes (existing tests; no-sources threshold update) |
| UIX-01 | `_buildGeoJSONFromRaw` emits `source` property | unit | `npm test -- --run src/tests/features.test.ts` | No — Wave 0 gap (but checklist_id decode already tested in occurrence.test.ts) |
| UIX-03 | `formatRomanDate` handles null, length-4, length-7 | unit | `npm test -- --run src/tests/bee-occurrence-detail.test.ts` | No — Wave 0 gap |
| UIX-04 | `checklist_count` equals deduped count | data integration | `cd data && uv run pytest tests/test_species_checklist_count.py -x` | No — Wave 0 gap |

### Sampling Rate
- Per task commit: `npm test -- --run src/tests/url-state.test.ts src/tests/occurrence.test.ts`
- Per wave merge: `npm test -- --run`
- Phase gate: full Vitest suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/tests/url-state.test.ts` — update MAP-03 tests for 4-source `VALID_SOURCES`; add `src=checklist` round-trip test
- [ ] `src/tests/bee-occurrence-detail.test.ts` — add `formatRomanDate` null/length-4/length-7 unit tests (new file or extend existing if present)
- [ ] `data/tests/test_species_checklist_count.py` — assert `checklist_count` in `species.parquet` equals count from `int_checklist_dedup_status` with dedup filter

*(Existing `src/tests/occurrence.test.ts` already tests `checklist:<N>` occId decode — no gap there.)*

---

## Environment Availability

Step 2.6 SKIPPED for the frontend changes (Lit/TypeScript/Mapbox — no external CLI deps beyond `npm` already verified operational). For the data pipeline:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB via `uv run python` | `int_species_universe` CTE fix | Yes | dbt_sandbox accessible | — |
| `bash data/dbt/run.sh build` | contract enforcement | Yes | enforces 34-col contract today | — |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| County-fill layer for checklist display | Point layer (source='checklist') in occurrences | Phase 138 (this phase) | Visual parity with other sources; interaction consistency |
| `_showChecklist` separate boolean | `hiddenSources` membership | Phase 138 (this phase) | URL-state simplification; "no sources" guard unified |
| `checklist_count` from county-level mart | `checklist_count` from deduped promoted arm | Phase 138 (this phase) | Accurate per-source count; ~50% fewer counted records for high-density species |

---

## Assumptions Log

All claims in this research were verified against source code or live DuckDB data. No unverified assumptions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | No `[ASSUMED]` claims | — | — |

**This table is empty** — all claims verified via direct code inspection and DuckDB queries against `data/beeatlas.duckdb`.

---

## Open Questions

1. **`cl=` legacy URL param handling**
   - What we know: `checklistVisible?` is in `UiState`; `cl=1` serializes it; removing the param silently makes stale bookmarks default to checklist visible (acceptable since it's now a standard source)
   - What's unclear: Whether to remove the `cl=` parse entirely or keep it as no-op for graceful back-compat
   - Recommendation: Remove the `cl=` parse path entirely. Any bookmark with `cl=1` will simply not affect state, which is fine because checklist is now always a real source (on by default). Cleaner code wins.

2. **`specimen_inat_login` / `specimen_inat_taxon_name` in `int_combined` ARM 4**
   - What we know: ARM 4 already emits NULL for both. They are not in `OCCURRENCE_COLUMNS`.
   - What's unclear: Do they belong there? They aren't used anywhere in the card.
   - Recommendation: No change. They are not part of Phase 138 scope.

---

## Sources

### Primary (HIGH confidence)
- Direct DuckDB queries against `data/beeatlas.duckdb` / `dbt_sandbox` — date_quality distribution, dedup_status distribution, column counts, row counts
- `data/dbt/models/intermediate/int_combined.sql` — ARM 4 implementation (lines 197–244), ARM 1–3 NULL cast pattern
- `data/dbt/models/intermediate/int_species_universe.sql` — `checklist_count_agg` CTE (lines 44–51)
- `data/dbt/models/marts/schema.yml` — confirmed 34 columns via yaml parse
- `data/dbt/models/intermediate/int_checklist_collapsed.sql` — column set confirmation
- `src/features.ts` — `source` property emission confirmed (line 45)
- `src/filter.ts` — `OccurrenceRow` interface, `OCCURRENCE_COLUMNS` list
- `src/style.ts` — `_occurrencePointPaint`, `checklistCountyFillLayerSpec` confirmed locations
- `src/url-state.ts` — `VALID_SOURCES` (line 34), `SourceKey` type (line 32)
- `src/bee-map.ts` — `showChecklist`/`_checklistAllRows`/`_checklistGeneration` locations confirmed
- `src/bee-atlas.ts` — `_checklistVisible` locations confirmed
- `src/bee-pane.ts` — `_showChecklist` locations confirmed
- `data/places_export.py` — `_query_counts` function (lines 40–66), `ecdysis_id IS NOT NULL` predicate confirmed
- `.planning/phases/138-frontend-points-detail-card/138-CONTEXT.md` — all decisions
- `.planning/phases/138-frontend-points-detail-card/138-UI-SPEC.md` — paint contract, component inventory

### Secondary (MEDIUM confidence)
- `.planning/phases/137-promotion-into-occurrences/137-CONTEXT.md` — upstream context

---

## Metadata

**Confidence breakdown:**
- UIX-04 double-count root cause: HIGH — traced full SQL chain; confirmed row counts from live data
- Month-precision question: HIGH — queried live dbt_sandbox directly
- ARM 4 / contract bump changes: HIGH — source code confirmed
- URL-state / source-toggle changes: HIGH — source code confirmed
- Frontend card rendering: HIGH — all fields confirmed present in int_checklist_dedup_status

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (data pipeline is stable; UI is a static frontend)
