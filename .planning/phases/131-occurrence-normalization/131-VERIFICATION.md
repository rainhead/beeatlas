---
phase: 131-occurrence-normalization
verified: 2026-06-03T20:46:00Z
status: passed
score: 7/7 must-haves verified
requirement: NORM-01, NORM-02, NORM-03
human_verify_verdict: APPROVED
human_verify_date: 2026-06-03
created: 2026-06-02
measurement_date: 2026-06-02
---

# Phase 131 — Verification Record

> D-05: record-only size measurement. No automated size gate added.

---

## Goal Achievement

**Phase Goal:** Denormalized rank string columns are dropped from the occurrences mart and `geo_blob` is rewritten; this is safe now that the frontend (Phase 130) no longer reads the removed columns; a measurable DB-size and transfer-weight reduction is recorded.

**Verified:** 2026-06-03T20:46:00Z
**Status:** passed

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | NORM-01: occurrences.sql mart SELECT no longer contains scientificName/genus/family/specimen_inat_taxon_name; canonical_name + taxon_id retained | VERIFIED | occurrences.sql SELECT lists 33 columns: none of the 4 dropped names present; canonical_name (L93) and taxon_id (L94) present |
| 2 | NORM-01: schema.yml enforced contract has 33 columns; dropped columns absent | VERIFIED | schema.yml occurrences section: 33 columns confirmed by parse; scientificName/genus/family/specimen_inat_taxon_name absent from occurrences section (present in species section only — correct) |
| 3 | NORM-01: dead intermediate columns specimen_inat_genus/specimen_inat_family removed from int_specimen_obs_base.sql; stg_waba__taxon_lineage LEFT JOIN removed | VERIFIED | int_specimen_obs_base.sql is 8-column SELECT with no genus/family aliases; no tl JOIN; phase header comment confirms removal |
| 4 | NORM-02: geo_blob is 7-field layout [lat,lon,ecdysis_id,observation_id,specimen_observation_id,year,source] in sqlite_export.py _GEO_COLS; features.ts decode has source at row[6] | VERIFIED | sqlite_export.py lines 459-462: _GEO_COLS = ["lat","lon","ecdysis_id","observation_id","specimen_observation_id","year","source"]; features.ts L32: `const source = row[6] as string | null` |
| 5 | NORM-02: _buildGeoJSONFromRaw returns { geojson } only — no summary, no taxaOptions | VERIFIED | features.ts return type (L18-20): `{ geojson: FeatureCollection<Point, OccurrenceProperties> }`; no Sets, no summary build, no taxaOptions; return statement (L47): `return { geojson: { type: 'FeatureCollection', features } }` |
| 6 | NORM-02: measurable DB-size and transfer-weight reduction recorded | VERIFIED | Measurement table below: −14.2% raw bytes (26.7→22.9 MB), −9.5% gzip (4.3→3.9 MB); human-verified APPROVED |
| 7 | NORM-03: no remaining live (non-test) src/ readers of dropped columns against occurrences mart; Species column reads display_name; bee-occurrence-detail _renderProvisional reads row.display_name; taxa JOIN in all three page queries | VERIFIED | Grep audit clean (see below); bee-table.ts L43 dataField='display_name'; bee-occurrence-detail.ts L236-237 row.display_name; filter.ts has 3x LEFT JOIN taxa t ON t.taxon_id = o.taxon_id; o.taxon_id qualified throughout |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/models/marts/occurrences.sql` | 33-col SELECT, no dropped names | VERIFIED | 33 columns; scientificName/genus/family/specimen_inat_taxon_name absent |
| `data/dbt/models/marts/schema.yml` | 33-col enforced contract | VERIFIED | 33 columns in occurrences section, `enforced: true` |
| `data/dbt/models/intermediate/int_specimen_obs_base.sql` | Dead cols removed | VERIFIED | 8-col SELECT, tl JOIN removed |
| `data/sqlite_export.py` | 7-field _GEO_COLS | VERIFIED | ["lat","lon","ecdysis_id","observation_id","specimen_observation_id","year","source"] |
| `src/features.ts` | 7-field decode, {geojson} return | VERIFIED | source at row[6]; return type and value are { geojson } only |
| `src/filter.ts` | display_name + LEFT JOIN taxa x3; OCCURRENCE_COLUMNS 32 entries; DataSummary 3 fields; queryFilteredCounts deleted | VERIFIED | 32-entry OCCURRENCE_COLUMNS; 3x LEFT JOIN; display_name in OccurrenceRow; DataSummary has only totalSpecimens/earliestYear/latestYear; queryFilteredCounts/FilteredCounts absent |
| `src/bee-table.ts` | Species column dataField = 'display_name' | VERIFIED | L43: `dataField: 'display_name'` |
| `src/bee-occurrence-detail.ts` | _renderProvisional uses row.display_name | VERIFIED | L236-237: `row.display_name` |
| `src/bee-map.ts` | data-loaded emit bare signal {}; { geojson } destructure | VERIFIED | L467: `this._emit('data-loaded', {})` |
| `src/bee-atlas.ts` | _loadSummaryFromSQLite sole owner; COUNT(DISTINCT …) query deleted; _summary not set from event | VERIFIED | _onDataLoaded (L1013) calls `_loadSummaryFromSQLite()` only; no `this._summary = e.detail.summary`; no COUNT(DISTINCT scientificName/genus/family) |
| `src/tests/filter-join-execution.test.ts` | Regression test for ambiguous-column bug | VERIFIED | File exists; uses node:sqlite DatabaseSync; exercises queryTablePage/queryListPage/queryAllFiltered against real two-table schema with taxon filter active |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sqlite_export.py _GEO_COLS` | `features.ts _buildGeoJSONFromRaw` | source at index 6 | VERIFIED | Both files: source is element index 6; updated atomically per Pitfall 1 |
| `filter.ts queryTablePage` | `taxa` table | `LEFT JOIN taxa t ON t.taxon_id = o.taxon_id` | VERIFIED | grep confirms 3 occurrences in filter.ts (queryTablePage, queryListPage, queryAllFiltered) |
| `bee-table.ts Species column` | `OccurrenceRow.display_name` | `dataField: 'display_name'` | VERIFIED | L43 confirmed |
| `bee-occurrence-detail.ts _renderProvisional` | `OccurrenceRow.display_name` | `row.display_name` | VERIFIED | L236-237 confirmed |
| `bee-atlas.ts _onDataLoaded` | `_loadSummaryFromSQLite` | sole owner; event not used for _summary | VERIFIED | No `this._summary = e.detail` assignment; `_loadSummaryFromSQLite()` called directly |

### Requirements Coverage

| Requirement | Phase | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| NORM-01 | 131 | Denormalized rank columns dropped from occurrences mart; 33-col contract enforced | SATISFIED | occurrences.sql 33-col SELECT; schema.yml 33-col enforced contract; int_specimen_obs_base dead cols removed |
| NORM-02 | 131 | geo_blob rewritten; measurable size reduction recorded | SATISFIED | 7-field _GEO_COLS + features.ts decode; size table below (−14.2% raw, −9.5% gzip) |
| NORM-03 | 131 | All downstream consumers migrated; species mart untouched | SATISFIED | Grep audit clean; display_name JOIN in filter.ts; bee-table/bee-occurrence-detail migrated; checklist.parquet reads in bee-map.ts documented out-of-scope; species/checklist mats untouched |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX markers found in any phase-modified file |

---

## Before/After `occurrences.db` Size Measurement

### Baseline Method

**How obtained:** The pre-change `occurrences.db` was present in `public/data/` at the time of
measurement (modified 2026-06-02 12:50 PDT). It was generated by the pipeline *before* the
Phase 131 dbt column-drop commits (which landed at 18:33 PDT on the same date). The pre-change
file retains the 37-column schema with `scientificName`, `genus`, `family`, and
`specimen_inat_taxon_name` in both the `occurrences` table and the `geo_blob` TEXT column.

**Verification:** `PRAGMA table_info(occurrences)` on the pre-change file returns 37 rows
(37 columns). The `geo_blob` first-row sample shows 10-field arrays: `[lat, lon, ecdysis_id,
observation_id, specimen_observation_id, year, scientificName, genus, family, source]`.

The post-change artifact was generated by running `bash data/dbt/run.sh build` (PASS=61
WARN=1 ERROR=0) followed by `uv run python -c "from sqlite_export import generate_sqlite; ..."`.
The new `occurrences` table has 33 columns; the `geo_blob` arrays are 7-field:
`[lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, source]`.

Row count is identical (77,744) confirming no data loss.

---

### Measurement Table

| Metric | Pre-change (37 cols) | Post-change (33 cols) | Delta | Reduction |
|--------|---------------------|-----------------------|-------|-----------|
| `occurrences.db` byte size | 28,024,832 bytes (26.7 MB) | 24,043,520 bytes (22.9 MB) | −3,981,312 bytes | **14.2%** |
| Gzipped transfer weight | 4,494,687 bytes (4.3 MB) | 4,069,006 bytes (3.9 MB) | −425,681 bytes | **9.5%** |
| Table columns (`occurrences`) | 37 | 33 | −4 | — |
| `geo_blob` fields per row | 10 | 7 | −3 | — |
| Row count | 77,744 | 77,744 | 0 | — |

**Delta is negative (smaller) — size reduction confirmed.**

Note: The ~4 MB raw estimate in RESEARCH.md (90k rows × 3 strings × ~15 bytes) corresponds to
the raw string storage. The ~4 MB reduction in the raw DB aligns with the estimate; the smaller
gzip reduction (425 KB) reflects the high compressibility of repeated taxon name strings.

---

### `tablesReady` Browser Timing

| Metric | Baseline (v4.3 prod) | Post-change (observed, **dev**) | Status |
|--------|----------------------|---------------------------------|--------|
| worker boot / `tablesReady` (main-thread wall time) | ~250 ms (prod) | 658 ms (dev) | not comparable — see note |
| end-to-end `data-loaded` (loading screen lifted), warm | — | 1150 ms (dev) | observed full-load |

**Why dev-mode timing is NOT comparable to the ~250 ms v4.3 production baseline:** the observed
figures were captured against the Vite dev middleware build. Dev mode inflates load time via
(a) cold WASM compile on first request, (b) uncompressed serving (no gzip/brotli), and (c) the
Eleventy + Vite dev middleware request path. The ~250 ms v4.3 baseline was a production figure
(compiled WASM, compressed transfer). The two numbers measure different things and must not be
compared head-to-head.

**Why this change structurally cannot regress `tablesReady`:** the boot path is strictly lighter
after Phase 131 — the `occurrences.db` is smaller (26.7 → 22.9 MB raw), and per D-08 the taxa
JOIN and the taxa-cache are both lazy / off the boot path. There is no new work on the critical
load path; the only change is *less* data to transfer and parse. A regression is therefore not
mechanically possible from this change.

**Observed dev figures (for the record):**
- worker boot (main-thread wall time): **658 ms** (dev)
- end-to-end `data-loaded` (loading screen lifted), warm: **1150 ms** (dev)

**Optional follow-up:** the production apples-to-apples `tablesReady` number against the ~250 ms
v4.3 baseline was not captured during this verification. Capturing it against a production build
is an optional, non-blocking follow-up — it is not required for NORM-02 because the change cannot
mechanically regress the boot path (see above).

---

## Grep Audit Result

**Command run:**
```
grep -rn "scientificName\|specimen_inat_taxon_name" src/ --include="*.ts" | grep -v test
```

**Date:** 2026-06-02 (re-confirmed 2026-06-03)

**Result:** CLEAN — no live occurrences-mart readers remain.

### Matches Found and Classification

| File | Line | Match | Classification |
|------|------|-------|----------------|
| `src/features.ts:16` | Comment | `scientificName/genus/family` | Documentation comment describing the Phase 131 change — not a live reader |
| `src/bee-map.ts:68` | Type annotation | `scientificName: string; genus: string; family: string` | `checklist.parquet` row type — documented out-of-scope (separate artifact) |
| `src/bee-map.ts:733` | Column list | `'scientificName', 'genus', 'family'` | `checklist.parquet` read via hyparquet — documented out-of-scope |
| `src/bee-map.ts:734` | Type cast | `scientificName: string; genus: string; family: string` | Same checklist.parquet read — out-of-scope |
| `src/bee-map.ts:742` | Filter | `r.scientificName !== taxon` | checklist.parquet filter — out-of-scope |
| `src/bee-map.ts:743` | Filter | `r.genus !== taxon` | checklist.parquet filter — out-of-scope |
| `src/bee-map.ts:744` | Filter | `r.family !== taxon` | checklist.parquet filter — out-of-scope |
| `src/url-state.ts:7` | Comment | `?taxon=<scientificName>` | Comment documenting legacy URL format — not a live reader |
| `src/lib/spa-link.ts:17` | Function param | `scientificName: string` | Function parameter name for link generation — not an occurrences mart column read |
| `src/lib/spa-link.ts:25` | URL encoding | `encodeURIComponent(scientificName)` | URL parameter encoding using the param — not an occurrences mart column read |

All remaining `genus`/`family` references in non-test source are rank label constants,
TypeScript union type literals, CSS class names, or checklist.parquet reads — none are
occurrences mart column reads.

**Conclusion:** Zero live occurrences-mart readers of the 4 dropped column names remain.
The checklist.parquet reads in `bee-map.ts` (lines 733–744) are documented as out-of-scope
per RESEARCH.md "Audited, Unaffected" table.

---

## Phase Gate Status

| Check | Command | Result |
|-------|---------|--------|
| `npm test` | `vitest run` | PASS — 574 tests passed (24 test files; +4 from the new filter-join-execution suite) |
| `npm run typecheck` | `tsc --noEmit` | PASS — exits 0 |
| `bash data/dbt/run.sh build` | dbt build | PASS — exits 0 |

**Phase gate: GREEN** (re-confirmed after the `01acf1e` ambiguous-column fix)

---

## Human Verification Outcome (Task 2)

**Verdict: APPROVED** by the human reviewer (2026-06-03).

In-browser verification items (all confirmed):

- [x] `occurrences.db` is measurably smaller — −14.2% bytes, −9.5% gzip (confirmed against the table above)
- [x] Boot/load timing recorded: worker boot 658 ms (dev), end-to-end `data-loaded` 1150 ms (dev). Dev-mode timing is NOT comparable to the ~250 ms v4.3 production baseline (see tablesReady section). The change structurally cannot regress the boot path (D-08).
- [x] **Table & list views render with a taxon filter active** — Species column shows resolved names / "No Determination" (never blank)
- [x] Provisional (WABA sample) occurrence detail card shows the taxon name (never blank)
- [x] Map renders points with correct recency styling + source badges — confirms geo_blob source-at-index-6 decode is correct (Pitfall 1, T-131-06 mitigated)

**Observed `tablesReady` value:** 658 ms worker boot (dev); 1150 ms end-to-end `data-loaded` (dev). Production apples-to-apples figure: optional follow-up (not captured).

---

## Bug Found & Fixed During Verification

The human-verify gate caught a runtime regression that the string-only unit tests missed:

```
List query failed: Error: ambiguous column name: taxon_id
```

**Root cause:** Plan 131-02's `LEFT JOIN taxa t` (added for `display_name` resolution) brought
`taxon_id` into scope from both the `occurrences` and `taxa` tables. The shared `buildFilterSQL`
clause emitted an unqualified `taxon_id`, which became ambiguous in the list/table/CSV queries
whenever a taxon filter was active. The string-only unit tests never executed against a two-table
schema, so they did not catch it.

**Why the gate caught it:** this is exactly the silent-at-build / breaks-at-runtime class of
defect the human-verify checkpoint exists to catch — the SQL is only ambiguous when executed
against the real JOINed schema with a taxon filter active.

**Fix (commit `01acf1e`):**
- `buildFilterSQL` now emits `o.taxon_id` and documents the "occurrences AS o" consumer invariant.
- The four non-JOIN consumers (list/table/CSV/etc.) now alias `occurrences o`.
- Added `src/tests/filter-join-execution.test.ts` — runs the **real** query functions against a
  `node:sqlite` engine seeded with both `occurrences` and `taxa` tables, reproducing the bug and
  proving the fix. This closes the gap the string-only tests left.

**Post-fix gates:**

| Check | Command | Result |
|-------|---------|--------|
| Unit tests | `npm test` | PASS — 574 tests |
| Type check | `npm run typecheck` | PASS — exits 0 |
| dbt build | `bash data/dbt/run.sh build` | PASS — exits 0 |

---

_Verified: 2026-06-03T20:46:00Z_
_Verifier: Claude (gsd-verifier)_
