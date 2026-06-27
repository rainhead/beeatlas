# Phase 170: Source → Provenance Facets Rebuild - Research

**Researched:** 2026-06-26
**Domain:** Brownfield schema/UI refactor — decompose an overloaded `source` enum into orthogonal `tier` + `record_type` facets across a dbt contract and three coupled Lit frontend consumers
**Confidence:** HIGH (all findings verified against the live codebase; no external library research required)

## Summary

This is a **pure refactor of existing, well-understood code** — there is no library/ecosystem research to do. Every claim below is `[VERIFIED: codebase]` against the current tree at commit `7a7d671b`. The work decomposes the `source` enum (`ecdysis` / `waba_sample` / `waba_specimen` / `inat_obs` / `checklist`) into two materialized columns on `marts/occurrences`: `tier` (`atlas` / `other`) and `record_type` (renamed per-arm vocabulary, with `inat_obs` → `inat_expert`). The filter's organizing primitive becomes `tier`; map symbology becomes `tier`-driven; the detail card stays `record_type`-driven (orthogonal — D-09/D-10).

The dominant risk is **not** code complexity — the changes are mechanical — it is the **release choreography**. Dropping `source` and adding `tier`+`record_type` is an occurrences-contract change, which deadlocks two ship gates against stale S3 (`project_occurrences_contract_release_sequence`). The data leg must ship FIRST via a one-time `SKIP_INTEGRATION_GATE=1` nightly, then the frontend deploys. The second risk is the **positional-coupling chain**: `source` rides the browser via a positional `_GEO_COLS` array (`sqlite_export.py` ↔ `features.ts`), and the occ_id CASE order is triplicated across `occurrence.ts` / `filter.ts` / `occurrence_places.sql` — PROV-03 adds a test asserting the latter.

**Primary recommendation:** Plan two waves. **Wave A (data leg, ships + publishes alone):** `int_combined.sql` projects `tier`+`record_type` and drops `source`; `occurrences.sql`, `schema.yml`, `collectors_export.py`, and the `sqlite_export.py` `_GEO_COLS` array update; run the one-time `SKIP_INTEGRATION_GATE=1` nightly. **Wave B (frontend, one atomic commit):** `filter.ts`, `features.ts`, `bee-map.ts`, `style.ts`, `bee-occurrence-detail.ts`, `bee-pane.ts`, `url-state.ts`, `bee-atlas.ts`, the occ_id-coupling Vitest test, and `docs/domain-model.md`. `tsc --noEmit` is the post-merge gate (the `hiddenSources`→`hiddenTiers` rename touches every `FilterState` literal).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project `tier`/`record_type`, drop `source` | Database / dbt (`int_combined.sql`, `occurrences.sql`, `schema.yml`) | — | The arm→tier mapping is materialized so SQL/URL never compute it (D-05) |
| Carry facets to browser | Build / export (`sqlite_export.py` `_GEO_COLS`, `occurrences.db`) | — | `tier` (+ optional `record_type`) rides the positional geo_blob to the map |
| Tier filter (WHERE clause + URL) | Browser / Client (`filter.ts`, `url-state.ts`) | — | `hiddenTiers` is a `FilterState` field; `tier=`/`src=` serialization is client-side |
| Map symbology by tier | Browser / Client (`style.ts`, `bee-map.ts`) | — | Mapbox paint expression reads `properties.tier` |
| Detail card by record_type | Browser / Client (`bee-occurrence-detail.ts`) | — | 5 card variants need the 5-value `record_type`, not the 2-value `tier` (D-09) |
| occ_id identity coupling | Database (`occurrence_places.sql`) + Client (`occurrence.ts`, `filter.ts`) | — | Triplicated CASE; PROV-03 asserts it (unchanged by this phase, D-07) |

## Standard Stack

No new dependencies. This phase touches only existing code. The relevant stack is the in-repo toolchain:

| Tool | Role | Why |
|------|------|-----|
| dbt + DuckDB | `marts/occurrences` contract enforcement | `bash data/dbt/run.sh build` fails at compile time (`Binder Error`) on contract drift `[VERIFIED: project_schema_validation]` |
| TypeScript `tsc --noEmit` | Required-field contract gate | A required `FilterState` field rename fails `tsc` on every stale literal `[VERIFIED: project_filterstate_required_field_contract]` |
| Vitest | Unit tests incl. new occ_id-coupling assertion (PROV-03) | Existing `src/tests/occurrence.test.ts` is the home for the new test `[VERIFIED: codebase]` |
| mapbox-gl | `match`/`case` paint expressions for tier symbology | `style.ts` already uses `['match', ['get', 'source'], …]` `[VERIFIED: codebase]` |

**Installation:** None. No `npm install` / `pip install` / `uv add`.

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. All work is edits to existing files.

## Architecture Patterns

### Data flow (what `source` touches end-to-end)

```
int_combined.sql (5 arms, each SELECT projects 'ecdysis'/'waba_sample'/… AS source)
        │  ← REPLACE: each arm projects  '<tier>' AS tier,  '<record_type>' AS record_type
        ▼
occurrences.sql  (SELECT j.source, …)              ← REPLACE: j.tier, j.record_type
        │
        ▼
schema.yml contract  (- name: source / data_type: varchar)  ← drop source row; add tier + record_type rows
        │  (+ the two not_null tests on collector_inat_login use  where: "source in ('waba_sample','waba_specimen')")
        │     ← rewrite predicates to record_type IN (...) or tier='atlas'
        ▼
occurrences.parquet  →  sqlite_export.py
        │   _GEO_COLS = [lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, source, checklist_id]
        │       ← REPLACE 'source' at index 6 with 'tier' (and/or append 'record_type')
        ▼
geo_blob (positional JSON array)  →  browser  →  features.ts _buildGeoJSONFromRaw
        │   const source = row[6]   ← becomes  const tier = row[6]  (+ record_type if appended at row[8])
        │   properties: { occId, recencyTier, source }   ← { occId, recencyTier, tier, record_type? }
        ▼
bee-map.ts _visibleBySource → filters f.properties.source   ← becomes f.properties.tier (rename → _visibleByTier)
        │
        ▼
style.ts _occurrencePointPaint  ['match', ['get','source'], 'checklist', green, <recency>]
            ← ['match', ['get','tier'], 'other', <muted>, <recency-for-atlas>]
```

Separately, the wa-sqlite query path (`filter.ts` `buildFilterSQL`) reads `o.source` for the source filter and projects `source` in `queryVisibleGeoJSON` — both update to `o.tier`. And the detail card reads `row.source` for variant dispatch — updates to `row.record_type`.

### Pattern: Materialize the coarser facet (D-05)

`tier = f(record_type)` but `tier` is its own column so the filter SQL and URL never know the arm→tier mapping. Each `int_combined.sql` arm hardcodes both literals. This mirrors the existing `is_provisional` / `source` pattern where each arm sets its own constant `[VERIFIED: int_combined.sql:47,54,116,123,167,180,254,261,317,324]`.

### Pattern: Positional coupling ships atomically

Two positional couplings exist and both are documented inline:
1. **geo_blob ↔ features.ts** — `_GEO_COLS` order in `sqlite_export.py:477-480` must match `features.ts` `row[N]` indices (`features.ts:14-17`). `source` is at **index 6**. `[VERIFIED: codebase]`
2. **occ_id CASE** — triplicated across `occurrence.ts:23-30`, `filter.ts:108-114`, `occurrence_places.sql` (the `CASE … END AS occ_id`). Priority order: `ecdysis → inat → inat_obs → checklist`. **NOT changing in this phase (D-07)** — only asserted. `[VERIFIED: codebase]`

### Anti-Patterns to Avoid

- **Renaming the `inat_obs:` occ_id prefix literal.** D-07 is explicit: only the `record_type` *value* `inat_obs` → `inat_expert` changes; the occ_id prefix `inat_obs:` stays. The prefix is shared by `waba_specimen` and the expert-obs arm via `specimen_observation_id`; do not touch `occIdFromRow`, `parseOccId`, `OCC_ID_SQL_CASE`, or the `occurrence_places.sql` CASE. `[VERIFIED: CONTEXT D-07]`
- **A "byte-unchanged" plan check on `bee-map.ts`.** The `hiddenSources`→`hiddenTiers` rename adds/renames a required `FilterState` field; `bee-map.ts:44-58` constructs a default `FilterState` literal and MUST update or `tsc` fails. Express map-invariance as "the `_visibleBySource`/clustering/ghost *mechanism* is unchanged," not "file unchanged." `[VERIFIED: project_filterstate_required_field_contract]`
- **Shipping the frontend before the data publishes.** The deploy `validate-db` gate and nightly integration gate both deadlock against stale S3. `[VERIFIED: project_occurrences_contract_release_sequence]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Arm→tier mapping at query/URL time | A JS/SQL lookup table mapping each source token to a tier | A materialized `tier` column (D-05) | The mapping lives in one place (`int_combined.sql` arm literals); SQL/URL stay dumb |
| Contract validation | A bespoke parquet schema check | The dbt contract in `schema.yml` (`bash data/dbt/run.sh build`) | Compile-time `Binder Error`; `validate-schema.mjs` was retired v3.4 `[VERIFIED: project_schema_validation]` |
| Detecting stale FilterState literals | Manual grep for every literal | `tsc --noEmit` | A required-field change fails `tsc` on every miss `[VERIFIED: project_filterstate_required_field_contract]` |

**Key insight:** the facet decomposition is intentionally designed so the *only* place that knows the arm→tier mapping is the five `int_combined.sql` arm SELECTs. Everything downstream consumes the pre-computed `tier`/`record_type` columns.

## Common Pitfalls

### Pitfall 1: The two-gate release deadlock (HIGHEST RISK)
**What goes wrong:** Dropping `source` (1 column) and adding `tier`+`record_type` (2 columns) changes the occurrences contract (37→38 cols, or whatever the current count is — verify in `schema.yml`). The nightly publish gate (`data/tests/test_dbt_diff.py::test_occurrences_schema_matches`) compares fresh-sandbox-vs-live-S3 and aborts; the deploy gate (`scripts/validate-db.mjs`) reads stale S3 manifest and fails the build.
**How to avoid:** Ship DATA FIRST. Run the one-time override once:
```bash
SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
# if Ecdysis auth is down, reuse cached ZIP:
ECDYSIS_CACHE_TTL_SECONDS=99999999 SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
```
Confirm S3 updated (new `occurrences.parquet`/`occurrences.db`/`manifest.json`), THEN let the frontend deploy run (`gh run rerun <id> --failed`). Never leave `SKIP_INTEGRATION_GATE` set. `[VERIFIED: project_occurrences_contract_release_sequence]`
**Warning signs:** `INTEGRATION GATE FAILED — aborting publish`; `occurrences.db: missing tables` / column-count mismatch on deploy.

### Pitfall 2: Positional geo_blob index drift
**What goes wrong:** `_GEO_COLS` (`sqlite_export.py:477`) and `features.ts` `row[N]` decode are byte-coupled by position. If you replace `source` at index 6 with `tier` in one file but not the other, the map silently mis-colors (reads `year` as tier, etc.).
**How to avoid:** Edit both in the SAME commit. If `record_type` is also carried to the map (Claude's discretion — see Open Question 1), append it at a new index in both files together. `[VERIFIED: features.ts:14-17, sqlite_export.py:472-480]`
**Warning signs:** map points all render muted or all render recency; `build-geojson.test.ts` failures.

### Pitfall 3: Missing the non-frontend `source` consumers in the data leg
**What goes wrong:** Beyond the obvious `int_combined.sql`/`occurrences.sql`, three sites read `source`:
- `schema.yml` — the contract row AND two `not_null` tests with `where: "source in ('waba_sample','waba_specimen')"` and `where: "source = 'ecdysis'"` (`schema.yml:99,107`).
- `collectors_export.py:48-68` — five `CASE WHEN o.source = …` / `o.source IN (…)` predicates feeding sample/status counts.
- `sqlite_export.py:477` — the `_GEO_COLS` array.
**How to avoid:** Rewrite each predicate in `tier`/`record_type` terms. e.g. `o.source = 'waba_specimen'` → `o.record_type = '<waba_specimen record_type>'`; `o.source IN ('waba_specimen','waba_sample')` → `o.tier = 'atlas' AND o.record_type <> '<ecdysis record_type>'` (or keep listing record_types — planner picks for legibility). `[VERIFIED: codebase grep]`
**Warning signs:** `collectors.parquet` sample/status counts go to zero or wrong; contract test fails on the renamed `where` clause.

### Pitfall 4: `checklist.sql` and `int_synonyms.sql` are FALSE POSITIVES
**What goes wrong:** Grepping `source` in `data/dbt/models/` hits `checklist.sql` (a *separate* mart with its own `source='checklist'` constant that, per its own header, "MUST NOT appear in int_combined or occurrences.parquet") and `int_synonyms.sql` (a `source` column meaning synonym-provenance, unrelated). Editing these would be wrong.
**How to avoid:** Do NOT touch `checklist.sql` or `int_synonyms.sql`. Only `int_combined.sql`, `occurrences.sql`, `occurrence_places.sql` (CASE cross-check only), `schema.yml`, `collectors_export.py`, `sqlite_export.py` are in scope on the data leg. `[VERIFIED: checklist.sql:1-7, int_synonyms.sql:10-17]`

### Pitfall 5: `hiddenTiers` rename misses a FilterState literal
**What goes wrong:** `hiddenSources` appears as a required `FilterState` field and in `UiState`. Literals exist in `filter.ts` (interface + `isFilterActive`), `bee-map.ts:57` (default), `bee-atlas.ts` (several: :95, :645, :1304, :1542), `url-state.ts` (`result.filter` and `result.ui`), and test files.
**How to avoid:** Rename to `hiddenTiers: Set<TierKey>` everywhere; run `tsc --noEmit` (NOT just `npm test` — vitest can pass while `tsc` fails). `[VERIFIED: project_filterstate_required_field_contract, grep]`
**Warning signs:** `npm run build` (tsc) errors on object literals missing the field.

## Code Examples

### Current: `int_combined.sql` arm projection (one of five) — what changes
```sql
-- ARM 4 today (int_combined.sql:261):
    'inat_obs'                         AS source,
-- becomes (D-02/D-06): drop `source`, project two columns
    'other'                            AS tier,
    'inat_expert'                      AS record_type,
```
Apply per arm: ecdysis→`('atlas','<specimen>')`, waba_sample→`('atlas','<provisional_sample>')`, waba_specimen→`('atlas','<specimen pre-catalog>')`, inat_obs→`('other','inat_expert')`, checklist→`('other','<literature>')`. Exact `record_type` spellings are Claude's discretion (D-02 / Discretion). `[VERIFIED: int_combined.sql:54,123,180,261,324]`

### Current: occurrences.sql projection (occurrences.sql:86)
```sql
    j.source, j.image_url, j.obs_url, j.user_login, j.license,
-- becomes:
    j.tier, j.record_type, j.image_url, j.obs_url, j.user_login, j.license,
```

### Current: schema.yml contract row (schema.yml:58-59) — drop + add
```yaml
      - name: source
        data_type: varchar
# becomes:
      - name: tier
        data_type: varchar
      - name: record_type
        data_type: varchar
```
Plus the two `not_null` test `where:` clauses (schema.yml:99,107) rewritten in record_type/tier terms.

### Current: filter.ts source-filter SQL (filter.ts:397-407) — what changes
```typescript
// today:
if (f.hiddenSources.size > 0) {
  const VALID_SOURCES: SourceKey[] = ['ecdysis', 'waba_sample', 'waba_specimen', 'inat_obs', 'checklist'];
  const visibleSources = VALID_SOURCES.filter(s => !f.hiddenSources.has(s));
  if (visibleSources.length === 0) { occurrenceClauses.push('1 = 0'); }
  else { occurrenceClauses.push(`o.source IN (${visibleSources.map(s => `'${s}'`).join(',')})`); }
}
// becomes (tier vocabulary, only 2 valid values):
if (f.hiddenTiers.size > 0) {
  const VALID_TIERS: TierKey[] = ['atlas', 'other'];
  const visibleTiers = VALID_TIERS.filter(t => !f.hiddenTiers.has(t));
  if (visibleTiers.length === 0) { occurrenceClauses.push('1 = 0'); }
  else { occurrenceClauses.push(`o.tier IN (${visibleTiers.map(t => `'${t}'`).join(',')})`); }
}
```
Security note preserved: tokens come from the hardcoded `VALID_TIERS` allowlist, never user input (T-164-SQL). `[VERIFIED: filter.ts:393-407]`

### Current: style.ts symbology (style.ts:88-97) — D-08 tier-driven paint
```typescript
// today: checklist→green, else recency gradient
'circle-color': [
  'match', ['get', 'source'],
  'checklist', '#2c7a2c',
  ['match', ['get', 'recencyTier'], 'thisYear', colors.thisYear, 'lastYear', colors.lastYear, colors.earlier],
],
// becomes (D-08): atlas keeps recency gradient; other (incl. former checklist green) renders muted
'circle-color': [
  'match', ['get', 'tier'],
  'other', '<MUTED_COLOR>',          // checklist loses its green; folds into muted
  ['match', ['get', 'recencyTier'], 'thisYear', colors.thisYear, 'lastYear', colors.lastYear, colors.earlier],
],
```
Exact muted color/opacity is Claude's discretion (Discretion). The cluster paint (style.ts:40-85) keys on `thisYearCount`/`lastYearCount` aggregates and does NOT read source/tier — leave unchanged. `[VERIFIED: style.ts:40-102]`

### Current: detail card variant dispatch (bee-occurrence-detail.ts:465-475) — D-09 record_type-driven
```typescript
// today (source-driven):
isProvisional(row) ? this._renderProvisional(row)
  : row.source === 'checklist' ? this._renderChecklist(row)
  : row.source === 'waba_specimen' ? this._renderWabaSpecimen(row)
  : row.source === 'inat_obs' ? this._renderInatObs(row)
  : this._renderSampleOnly(row)
// becomes (record_type-driven; minimal rewrite = swap the literals):
isProvisional(row) ? this._renderProvisional(row)
  : row.record_type === '<checklist record_type>' ? this._renderChecklist(row)
  : row.record_type === '<waba_specimen record_type>' ? this._renderWabaSpecimen(row)
  : row.record_type === 'inat_expert' ? this._renderInatObs(row)   // was 'inat_obs'
  : this._renderSampleOnly(row)
```
The 5 variants map cleanly to 5 `record_type` values + the `isProvisional` predicate (which fires first for `waba_sample`). `isSpecimenBacked`/`isProvisional` predicates stay (they read `ecdysis_id`/`is_provisional`, not `source`). `[VERIFIED: bee-occurrence-detail.ts:453-477]`

### Proposed: PROV-03 occ_id-coupling Vitest assertion (new test in src/tests/occurrence.test.ts)
The three CASE definitions must share the priority order `ecdysis → inat → inat_obs → checklist`. Extract the order from each source as an array and assert equality:
```typescript
import { readFileSync } from 'node:fs';
import { OCC_ID_SQL_CASE } from '../filter.ts';

// Canonical priority order — occIdFromRow branches in src/occurrence.ts
const TS_ORDER = ['ecdysis', 'inat', 'inat_obs', 'checklist'];

function extractCaseOrder(sql: string): string[] {
  // pull the prefix literal from each "THEN 'prefix:' ||" branch
  return [...sql.matchAll(/THEN\s+'([a-z_]+):'/g)].map(m => m[1]!);
}

test('OCC_ID_SQL_CASE (filter.ts) matches occIdFromRow priority order', () => {
  expect(extractCaseOrder(OCC_ID_SQL_CASE)).toEqual(TS_ORDER);
});

test('occurrence_places.sql CASE matches occIdFromRow priority order', () => {
  const sql = readFileSync('data/dbt/models/marts/occurrence_places.sql', 'utf8');
  // isolate the occ_id CASE block to avoid matching unrelated SQL
  const caseBlock = sql.slice(sql.indexOf('CASE'), sql.indexOf('END AS occ_id'));
  expect(extractCaseOrder(caseBlock)).toEqual(TS_ORDER);
});
```
This asserts all three remain coupled WITHOUT changing them (D-07/D-11). `occIdFromRow` itself is covered by the existing `extractCaseOrder` equality plus its current behavioral tests (`occurrence.test.ts:60-87`). Planner may instead/also parse `occurrence.ts` source to make the `occurrence.ts` ↔ `filter.ts` comparison fully source-derived. `[VERIFIED: occurrence.ts:23-30, filter.ts:108-114, occurrence_places.sql, occurrence.test.ts]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `validate-schema.mjs` parquet check | dbt contract on `marts/occurrences` | v3.4 (CUTOVER-03) | Contract change = edit `schema.yml`, not a JS validator `[VERIFIED: project_schema_validation]` |
| Scalar `place_slug` on occurrences | `occurrence_places` many-to-many bridge | Phase 160 | The occ_id CASE in the bridge is the third coupling site `[VERIFIED: occurrence_places.sql]` |
| `source` enum (overloaded) | `tier` + `record_type` (this phase) | Phase 170 | The decomposition this phase delivers |

**Deprecated/outdated:** none relevant.

## Runtime State Inventory

> This is a rename/contract-change phase. State explicitly checked across all five categories.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `marts/occurrences` parquet + `occurrences.db` (browser SQLite) carry a `source` column / geo_blob index-6 value. The `occ_id` strings (incl. `inat_obs:N`) are stored in `occurrence_places.occ_id` — **NOT changing** (D-07). | Data migration = the nightly republish (Wave A). `tier`/`record_type` are derived from arm constants, not migrated from old `source` values — a fresh rebuild produces them. `occurrence_places` rows unchanged. |
| Live service config | None. No external service stores the `source` enum (n8n/Datadog/etc. not in this project's path). | None — verified: `source` exists only in dbt models, exports, and frontend. |
| OS-registered state | The nightly cron on maderas runs `data/nightly.sh` unchanged. The ONE-TIME `SKIP_INTEGRATION_GATE=1` run is a manual invocation, not a cron change. | None to the crontab; one manual nightly run (Pitfall 1). `[VERIFIED: CLAUDE.md Known State]` |
| Secrets/env vars | `SKIP_INTEGRATION_GATE` / `ECDYSIS_CACHE_TTL_SECONDS` are transient one-shot env vars for the override run; never persisted. | None persistent. |
| Build artifacts | `public/data/occurrences.db` (gitignored) goes stale locally if `run.py` can't finish (Ecdysis auth gate). The `_GEO_COLS` change requires a fresh local rebuild for UAT. | Regenerate locally: `cd data && uv run python sqlite_export.py` (or full `uv run python run.py`). `[VERIFIED: project_local_uat_stale_occurrences_db]` |

**Nothing found in "Live service config" — verified by grep across `data/` and `src/`: `source` appears only in dbt models, `collectors_export.py`, `sqlite_export.py`, and `src/*.ts`.**

## Complete Consumer Inventory

### Data leg (must change — Wave A)
| File | Site | What it becomes |
|------|------|-----------------|
| `data/dbt/models/intermediate/int_combined.sql` | `'<arm>' AS source` ×5 (:54,123,180,261,324) | `'<tier>' AS tier, '<record_type>' AS record_type` per arm; `inat_obs`→`inat_expert` |
| `data/dbt/models/marts/occurrences.sql` | `j.source,` (:86) | `j.tier, j.record_type,` |
| `data/dbt/models/marts/schema.yml` | `- name: source` (:58); two `not_null` `where:` clauses (:99,107) | drop source row, add tier+record_type rows; rewrite `where:` predicates |
| `data/collectors_export.py` | 5 `o.source` predicates (:48,55,59,62,68) | rewrite in record_type/tier terms |
| `data/sqlite_export.py` | `_GEO_COLS` `"source"` at index 6 (:479); header comment | replace with `"tier"` (+ optional `"record_type"`); update comment |
| `data/dbt/models/marts/occurrence_places.sql` | occ_id CASE | **cross-check only** (D-07) — assert order, do not change |

### Frontend leg (must change — Wave B, one atomic commit)
| File | Site(s) | What it becomes |
|------|---------|-----------------|
| `src/url-state.ts` | `SourceKey` type (:31), `VALID_SOURCES` (:33), `UiState.hiddenSources` (:38), `buildParams` `src=` (:94-100), `parseParams` `src=` (:236-254, :276), `result.ui` (:319-320) | Add `TierKey`/`VALID_TIERS`; `hiddenTiers`; `tier=` serialize; `src=` back-compat parse → tier (see URL Contract below) |
| `src/filter.ts` | `FilterState.hiddenSources` (:27), `OccurrenceProperties.source` (:33), `OccurrenceRow.source` (:76), `OCCURRENCE_COLUMNS` (:98), `OCC_ID_SQL_CASE` (cross-check), `isFilterActive` (:264), source-filter SQL (:397-407), `queryVisibleGeoJSON` SELECT+properties (:433,443) | `hiddenTiers`; `tier` on properties; add `tier`/`record_type` to `OccurrenceRow`+`OCCURRENCE_COLUMNS`; tier SQL; SELECT `tier` not `source` |
| `src/features.ts` | `row[6] as source` (:32), properties (:45), header comment (:14-17) | `tier` at index 6 (+ `record_type` if appended) |
| `src/bee-map.ts` | `filterState` default literal (:57 `hiddenSources`), `hiddenSources` prop (:60), `_visibleBySource` (:588-592), init filter (:469) | `hiddenTiers`; rename `_visibleBySource`→`_visibleByTier`, filter `f.properties.tier` |
| `src/style.ts` | `_occurrencePointPaint` match on `['get','source']` (:88-97) | match on `['get','tier']`; D-08 atlas-recency / other-muted |
| `src/bee-occurrence-detail.ts` | variant dispatch on `row.source` (:468-473) | dispatch on `row.record_type`; `inat_obs`→`inat_expert` |
| `src/bee-pane.ts` | `hiddenSources` prop (:89), `_hiddenSources` state (:124,545), `_onSourceToggle` (:658-666), `_renderSources` 5 toggles (:1155-1209), all-hidden hint `=== 5` (:1239) | `hiddenTiers`; collapse 5 checkboxes → 2 tier toggles; all-hidden check `=== 2` |
| `src/bee-atlas.ts` | `hiddenSources` default+plumbing (:95,503,558,645,691,1096,1304,1542), `@source-filter-changed`/`_onSourceFilterChanged` (:560,1702-1704), `parsed.source` in occ_id dispatch (:982-984,1013-1015 — these read `parseOccId().source`, the occ_id prefix, **NOT the column** — DO NOT rename) | rename `hiddenSources`→`hiddenTiers` and `source-filter-changed`→`tier-filter-changed`; leave `parsed.source` occ_id dispatch alone |
| `src/tests/*` | `url-state.test.ts`, `filter.test.ts`, `occurrence.test.ts` (+ new coupling test), `build-geojson.test.ts`, `bee-pane.test.ts`, `bee-map.test.ts`, `bee-atlas.test.ts` | update fixtures `source`→`tier`/`record_type`; add PROV-03 test |
| `docs/domain-model.md` | "provenance" framing, `inat_obs` references | update to social framing + `inat_expert` (CONTEXT canonical_refs) |

**Critical disambiguation:** `bee-atlas.ts:982-984,1013-1015` and `url-state.ts` use `parsed.source` from `parseOccId()` — this is the **occ_id prefix** (`'ecdysis'|'inat'|'inat_obs'|'checklist'`), governed by D-07 and **NOT renamed**. Only the `marts/occurrences` *column* `source` and the `properties.source` *feature attribute* become tier/record_type. `[VERIFIED: bee-atlas.ts:982, occurrence.ts:39]`

## URL Contract

**Current `src=` (visible-subset encoding):** `buildParams` writes the *visible* sources (`VALID_SOURCES.filter(!hidden).sort()`), or the sentinel `src=none` when all 5 are hidden (`url-state.ts:94-100`). `parseParams` reads `src=` → if `none`, hide all; else `visible = tokens ∩ VALID_SOURCES`, `hidden = VALID_SOURCES \ visible` (`url-state.ts:239-254`). `[VERIFIED: url-state.ts]`

**New `tier=` (mirror the same encoding, 2 values):**
- `buildParams`: if `hiddenTiers.size > 0`, write `tier=` with visible tiers (`VALID_TIERS.filter(!hidden).sort()`), or `tier=none` when both hidden.
- `parseParams`: `tier=none` → both hidden; else `visible = tokens ∩ {atlas,other}`, `hidden = {atlas,other} \ visible`. Garbage tokens (visible=∅, not `none`) → no filter (preserves the anti-blank guard).

**`src=` back-compat parse (legacy → tier):** When `src=` is present (and `tier=` absent), map each legacy source token to its tier via the D-02 table, then compute `hiddenTiers`:
```
legacy src=  →  visibleSources (∩ old VALID_SOURCES, or all-but-hidden of src=none)
            →  visibleTiers = { tierOf(s) : s ∈ visibleSources }   // tierOf per D-02
            →  hiddenTiers  = {atlas,other} \ visibleTiers
```
Where `tierOf`: ecdysis/waba_sample/waba_specimen → `atlas`; inat_obs/checklist → `other`. **Edge case:** a legacy link showing only `ecdysis` (one atlas arm) maps to "atlas visible, other hidden" — it cannot reconstruct sub-tier granularity (expected; the facet is coarser now). `src=none` → both tiers hidden. A legacy link showing e.g. `ecdysis,inat_obs` → both tiers visible → `hiddenTiers=∅` (no filter). Mapping is lossy by design (5→2). `[CITED: CONTEXT D-02]`

Serialization format details (param name, sentinel spelling) are Claude's discretion — mirror the existing `src=` shape. The legacy `src=` token whitelist stays in `url-state.ts` for the back-compat parse only (no longer emitted).

## record_type → card variant mapping (D-09)

The 5 existing card renderers and their dispatch (`bee-occurrence-detail.ts:465-475`):

| Renderer | Current trigger | New trigger (record_type-driven) |
|----------|-----------------|----------------------------------|
| `_renderProvisional` | `isProvisional(row)` (fires first) | unchanged — `isProvisional` reads `is_provisional`, true for `waba_sample` |
| `_renderChecklist` | `row.source === 'checklist'` | `row.record_type === '<checklist value>'` |
| `_renderWabaSpecimen` | `row.source === 'waba_specimen'` | `row.record_type === '<waba_specimen value>'` |
| `_renderInatObs` | `row.source === 'inat_obs'` | `row.record_type === 'inat_expert'` |
| `_renderSampleOnly` | else (ecdysis non-specimen-backed sample rows) | else |

`isSpecimenBacked` partitions the card into specimen-grouped vs non-specimen rows (`:454-458`) and reads `ecdysis_id` — unchanged. The minimal rewrite is swapping 4 string literals. The 5 record_type values must be distinct and stable — exact spellings are Claude's discretion (D-02). `[VERIFIED: bee-occurrence-detail.ts]`

## Symbology (D-08)

`_occurrencePointPaint` (`style.ts:87-102`) is the only source-reading paint. New: `['match', ['get','tier'], 'other', <muted>, <recency-match-for-atlas>]`. Requires `properties.tier` on every map feature — supplied by `features.ts` (geo_blob path) AND `filter.ts queryVisibleGeoJSON` (the wa-sqlite path, `:443`). Both must set `tier`. Whether `record_type` also rides on map features is Claude's discretion (Open Question 1) — the map needs only `tier`; the detail card gets `record_type` from the full wa-sqlite row query (`OCCURRENCE_COLUMNS`), not from map feature properties. **Recommendation: carry only `tier` on map features** (keeps geo_blob weight down — `project_duckdb_wasm_direction` shows page weight is a watched budget); the card already queries full rows. The cluster paint (`style.ts:40-85`) is recency-aggregate-only and unchanged. `[VERIFIED: style.ts, filter.ts:443, features.ts:45]`

## Atomicity & Test Gates

- **Data leg gate:** `bash data/dbt/run.sh build` must exit 0 (contract `Binder Error` on regression) `[VERIFIED: project_schema_validation]`; `cd data && uv run pytest data/tests/test_dbt_diff.py -x` for byte-parity locally.
- **Frontend gate:** `npm test` (Vitest, incl. new PROV-03 test) AND `tsc --noEmit` (the latter is the required-field gate — vitest alone misses literal drift) `[VERIFIED: project_filterstate_required_field_contract]`.
- **Atomicity:** Wave B (all frontend files + test + doc) ships as ONE commit (PROV-03). Wave A (data) ships + publishes BEFORE Wave B deploys.
- **One-time nightly:** `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` exactly once after Wave A, before Wave B deploy (Pitfall 1).
- **CI-on-clean-checkout:** this phase touches `data/dbt`, `package.json`-adjacent build (no package.json change expected), and Eleventy-built `src/` — per `feedback_ci_is_verification_surface` confirm the deploy build is green on a clean checkout after the data publish.

## Open Questions

1. **Carry `record_type` on map features?**
   - Known: map symbology needs only `tier` (D-08). The detail card needs `record_type` but gets it from the full-row wa-sqlite query, not map feature properties.
   - Recommendation: carry only `tier` in `_GEO_COLS`/`properties` to keep geo_blob weight minimal; do NOT append `record_type` to the geo_blob. (Claude's discretion per CONTEXT.)

2. **Exact `record_type` spellings** (e.g. `specimen` vs `ecdysis_specimen`; `provisional_sample` vs `waba_sample`).
   - Known: must be 5 distinct values driving the card cleanly; `inat_expert` is fixed (D-06).
   - Recommendation: planner picks legible names; document them in `docs/domain-model.md` as part of Wave B.

3. **Current occurrences contract column count** (37 vs other).
   - Known: `schema.yml` is authoritative; do NOT trust the "36 as of v4.2" in memory (Phase 160 changed it).
   - Recommendation: count `schema.yml` rows at plan time; net change is −1 (`source`) +2 (`tier`,`record_type`) = +1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dbt + DuckDB | Wave A contract build | ✓ (repo standard) | per `data/pyproject.toml` (Python 3.14+) | none — required |
| uv | data pipeline + pytest | ✓ | — | none |
| Node + tsc + Vitest | Wave B gates | ✓ (`.nvmrc`) | — | none |
| S3 + nightly cron (maderas) | one-time publish | ✓ (host) | — | manual `SKIP_INTEGRATION_GATE=1` run |

**Missing dependencies with no fallback:** none — all tooling is the established repo toolchain.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend), pytest (data) |
| Config file | `vitest.config.*` / `package.json`; `data/` pytest via `uv run pytest` |
| Quick run command | `npm test` (frontend) |
| Full suite command | `npm test && npx tsc --noEmit` + `bash data/dbt/run.sh build` + `cd data && uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-01 | facets replace `source` enum; `tier` column drives filter | unit + contract | `npm test src/tests/filter.test.ts` + `bash data/dbt/run.sh build` | ✅ filter.test.ts (update); ✅ schema.yml |
| PROV-02 | filter + symbology tier-driven; `tier=`/`src=` round-trip | unit | `npm test src/tests/url-state.test.ts src/tests/build-geojson.test.ts` | ✅ (update fixtures) |
| PROV-03 | occ_id CASE order coupled across 3 sites; one atomic commit | unit | `npm test src/tests/occurrence.test.ts` | ✅ occurrence.test.ts (add coupling test — see Code Examples) |

### Sampling Rate
- **Per task commit:** `npm test` (quick) for frontend tasks; `bash data/dbt/run.sh build` for data tasks.
- **Per wave merge:** Wave A → `bash data/dbt/run.sh build` + `uv run pytest data/tests/test_dbt_diff.py -x`. Wave B → `npm test && npx tsc --noEmit`.
- **Phase gate:** full suite green + the one-time nightly published + deploy green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] New PROV-03 coupling test in `src/tests/occurrence.test.ts` (covers PROV-03) — see Code Examples for the assertion.
- [ ] Existing `src/tests/url-state.test.ts`, `filter.test.ts`, `build-geojson.test.ts`, `bee-pane.test.ts` fixtures updated `source`→`tier`/`record_type` (covers PROV-01/02).

*(No framework install needed — Vitest + pytest already configured.)*

## Security Domain

`security_enforcement` not set false; this phase's only injection surface is SQL string interpolation in `filter.ts`/`url-state.ts`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `tier=`/`src=` tokens validated against the hardcoded `VALID_TIERS`/legacy-token allowlist before any SQL interpolation (mirrors existing T-164-IV/T-164-SQL guards) |
| V6 Cryptography | no | — |
| V2/V3/V4 (auth/session/access) | no | static site, no auth (CONTEXT: "Mine"/auth explicitly deferred) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `tier=`/`src=` URL param | Tampering | Allowlist-filter tokens to compile-time literals before interpolation (existing pattern at `url-state.ts:246`, `filter.ts:398`) — preserve it for `VALID_TIERS` |
| Crafted `src=`/`tier=` blanking all rows | DoS-ish | Existing guard: garbage tokens (visible=∅, not the `none` sentinel) → treated as no-filter, never all-hidden (`url-state.ts:248-253`) — preserve for tier |

## Project Constraints (from CLAUDE.md)

- **Static hosting only** — no server runtime; the facet filter must remain client-side SQL over wa-sqlite. `[VERIFIED: CLAUDE.md Constraints]`
- **Domain vocabulary** — Specimen/Sample/Floral host/Observation/Occurrence record used precisely; the social-tier reframe (D-01) layers on top, doesn't replace these.
- **State ownership** — `<bee-atlas>` owns reactive state; `bee-map`/`bee-pane` are pure presenters. The `hiddenTiers` filter flows the same `.hiddenSources`→`.hiddenTiers` property-down / CustomEvent-up path. `[VERIFIED: CLAUDE.md, bee-atlas.ts]`
- **Style cache** — `style.ts` paint must bypass cache when filter/selection active (existing invariant; this phase only changes the paint *expression*, not the cache logic).
- **ID format** — occ_id prefixes load-bearing; D-07 keeps `inat_obs:` prefix literal.
- **dbt contract is the gate** — every `bash data/dbt/run.sh build` enforces `marts/occurrences`; data-before-code release sequence mandatory.
- **`feedback_ci_is_verification_surface`** — phases touching `data/dbt`/Eleventy build must verify CI builds on a clean checkout.

## Sources

### Primary (HIGH confidence — codebase, verified this session)
- `src/occurrence.ts`, `src/filter.ts`, `src/url-state.ts`, `src/style.ts`, `src/features.ts`, `src/bee-map.ts`, `src/bee-pane.ts`, `src/bee-atlas.ts`, `src/bee-occurrence-detail.ts` — all source consumers enumerated
- `data/dbt/models/intermediate/int_combined.sql`, `data/dbt/models/marts/occurrences.sql`, `data/dbt/models/marts/occurrence_places.sql`, `data/dbt/models/marts/schema.yml`, `data/dbt/models/marts/checklist.sql` — data leg
- `data/sqlite_export.py` (`_GEO_COLS`), `data/collectors_export.py` (source predicates)
- `src/tests/occurrence.test.ts` — existing test structure for PROV-03
- `.planning/phases/170-source-provenance-facets-rebuild/170-CONTEXT.md` — D-01..D-11 (AUTHORITATIVE)
- `.planning/REQUIREMENTS.md` — PROV-01/02/03
- Memory: `project_occurrences_contract_release_sequence`, `project_schema_validation`, `project_filterstate_required_field_contract`, `project_local_uat_stale_occurrences_db`, `project_duckdb_wasm_direction`
- `CLAUDE.md` — constraints, invariants, Known State

### Secondary / Tertiary
- None — no external research required.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Carrying only `tier` (not `record_type`) on map features is sufficient | Symbology / Open Q1 | If a future map feature needs record_type, add it to `_GEO_COLS` + `features.ts` together — low risk, isolated |
| A2 | `collectors_export.py` source predicates map cleanly to record_type/tier without changing its output counts | Pitfall 3 | If a predicate's semantics shift, collector sample/status counts drift — mitigated by re-running collectors export + visual check |
| A3 | The current occurrences contract net change is +1 column | Open Q3 | Verify exact count in `schema.yml` at plan time (do not trust memory) |

*Most claims are `[VERIFIED: codebase]`; the above are the only items needing planner/user confirmation. The exact `record_type` spellings and muted color are explicitly Claude's discretion per CONTEXT, not assumptions.*

## Metadata

**Confidence breakdown:**
- Consumer inventory: HIGH — every `source`/`hiddenSources` site grepped and read
- Release sequence: HIGH — `project_occurrences_contract_release_sequence` is explicit and battle-tested (Phase 160)
- occ_id coupling test: HIGH — all three CASE sites read; test is a straightforward source-parse equality
- URL back-compat mapping: HIGH — current `src=` logic fully traced; tier mapping is a deterministic 5→2 fold per D-02

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (stable internal refactor; only risk is the contract column count changing under a concurrent phase)
