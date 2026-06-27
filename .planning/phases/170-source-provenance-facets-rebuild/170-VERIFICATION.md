---
phase: 170-source-provenance-facets-rebuild
verified: 2026-06-27T17:54:31Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open /app, toggle the two tier filters; confirm Atlas points keep the recency gradient and Other points render muted grey-blue (#7a8a99) with no green checklist points."
    expected: "Atlas work pops (recency-graded); Other records recede (uniform muted grey-blue). Checklist points are muted, not green."
    why_human: "Visual color/symbology rendering (D-08) cannot be verified programmatically — only the paint expression and color literal are machine-checkable, not how it looks on the map."
  - test: "Load a legacy link e.g. `/app?src=ecdysis,waba_sample` and reload; confirm the visible tier set restores correctly (Atlas visible, Other hidden)."
    expected: "The legacy src= link restores the correct visible tier set on reload; the map shows only Atlas-tier points."
    why_human: "End-to-end URL-restore-on-reload through the live app + map render is a runtime/visual flow; the fold logic is unit-tested but the full reload→map-state path is best confirmed in a browser."
---

# Phase 170: Source → Provenance Facets Rebuild Verification Report

**Phase Goal:** The `source` enum is replaced by orthogonal provenance-tier facets across all three coupled consumers, with `tier=` URL round-trip and `src=` back-compat, and the occ_id positional coupling is preserved and asserted.
**Verified:** 2026-06-27T17:54:31Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `source` removed from `marts/occurrences`; `tier` (atlas/other) + `record_type` added (D-04) | ✓ VERIFIED | Built parquet `data/dbt/target/sandbox/occurrences.parquet`: 39 cols, `source`=False, `tier`=True, `record_type`=True. schema.yml occurrences block counts 39 columns; `name: source` at line 218 belongs to the `checklist` mart (legitimately separate). |
| 2 | Each of 5 int_combined arms projects hardcoded tier+record_type literal (D-05); waba_sample→atlas (D-03); inat_obs→inat_expert (D-06) | ✓ VERIFIED | int_combined.sql:54-55 atlas/specimen, :124-125 atlas/provisional_sample, :182-183 atlas/waba_specimen, :264-265 other/inat_expert, :328-329 other/checklist. `AS tier`=5, `AS record_type`=5, `AS source`=0, `inat_expert`=1. |
| 3 | occ_id prefix `inat_obs:` and occurrence_places.sql untouched (D-07) | ✓ VERIFIED | occurrence_places.sql unchanged in phase commits (git log empty); prefix `inat_obs:` at :46; occIdFromRow/parseOccId in occurrence.ts untouched; `parsed.source` x9 in bee-atlas.ts. |
| 4 | Map filter, symbology, and map hidden-set are tier-driven, not raw source (PROV-02) | ✓ VERIFIED | filter.ts:413 `o.tier IN (...)` / :410 `1 = 0`; style.ts:95 `['get','tier']`, no `['get','source']`; bee-map.ts `_visibleByTier`=6, `properties.tier`=1, no `_visibleBySource`/`properties.source`. |
| 5 | Detail card is record_type-driven (D-09/D-10 documented deviation) — 5 variants | ✓ VERIFIED | bee-occurrence-detail.ts:472-478 dispatches on `row.record_type` (checklist/waba_specimen/inat_expert/else _renderSampleOnly), isProvisional first. No `row.source`. |
| 6 | FilterState carries `hiddenTiers` replacing `hiddenSources`; tsc green (PROV-02) | ✓ VERIFIED | `hiddenSources` live refs in src/=0 (only negative test assertions). `hiddenTiers` in filter.ts/url-state.ts/bee-atlas.ts/bee-map.ts/bee-pane.ts. `npx tsc --noEmit` exit 0. |
| 7 | `tier=` round-trips (none sentinel, anti-blank guard); legacy `src=` folds 5→2 (back-compat) | ✓ VERIFIED | url-state.ts:115-120 emit tier=/none; :262-292 parse with none sentinel, garbage→no-filter guard (:274-277), src= 5→2 TIER_OF fold (:286-291), tier= precedence. PROV-02 back-compat test suite in url-state.test.ts:463+. |
| 8 | PROV-03: occ_id CASE order asserted equal across 3 sites; ships as one atomic commit | ✓ VERIFIED | occurrence.test.ts:207-231 asserts OCC_ID_SQL_CASE (filter.ts) + occurrence_places.sql == `['ecdysis','inat','inat_obs','checklist']`. 3 named tests PASS. Commit `4513a170` carries all 8 src consumers + 10 tests + docs in one commit, no deletions. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `data/dbt/models/marts/schema.yml` | occurrences contract: tier+record_type, no source, 39 cols | ✓ VERIFIED | `name: tier`@61, `name: record_type`@63; occurrences block = 39 columns; no occurrences `source` row. |
| `data/dbt/models/intermediate/int_combined.sql` | 5 arms each project tier+record_type | ✓ VERIFIED | 5× `AS tier`, 5× `AS record_type`, 0× `AS source`. |
| `data/sqlite_export.py` | _GEO_COLS tier at index 6, no record_type | ✓ VERIFIED | _GEO_COLS:483-484 index 6 = `"tier"`; `record_type`=0 (only tier rides geo_blob). |
| `data/collectors_export.py` | source predicates rewritten as record_type | ✓ VERIFIED | `o.source`=0, `record_type`=6 (predicates rewritten). |
| `src/filter.ts` | hiddenTiers field, tier SQL, exported OCC_ID_SQL_CASE | ✓ VERIFIED | `export const OCC_ID_SQL_CASE`@115; `o.tier IN`@413; hiddenTiers present. |
| `src/url-state.ts` | TierKey, tier= serialize/parse, src= back-compat | ✓ VERIFIED | TierKey@40, VALID_TIERS@42, TIER_OF@47; tier=/src= parse logic @115-292. |
| `src/style.ts` | tier-driven symbology, atlas recency / other muted | ✓ VERIFIED | `['get','tier']`@95, `'other','#7a8a99'`@96, atlas falls through to recency gradient @97-101. Cluster paint/cache untouched. |
| `src/bee-occurrence-detail.ts` | record_type variant dispatch | ✓ VERIFIED | record_type dispatch @472-478 incl. `inat_expert`. |
| `src/tests/occurrence.test.ts` | PROV-03 coupling cross-file assertion | ✓ VERIFIED | extractCaseOrder + readFileSync occurrence_places.sql + OCC_ID_SQL_CASE import; 3 tests pass. |
| `docs/domain-model.md` | social-tier reframe + inat_expert | ✓ VERIFIED | Social-Provenance Facets section; inat_expert rename; occ_id prefix `inat_obs:` noted unchanged; arm→tier→record_type table. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| int_combined.sql | occurrences.sql | j.tier, j.record_type projection | ✓ WIRED | occurrences.sql:86 `j.tier, j.record_type`. |
| occurrences.sql | schema.yml | contract enforcement | ✓ WIRED | dbt build PASS=92 ERROR=0; contract holds at 39 cols (Binder Error would fire on drift). |
| sqlite_export.py _GEO_COLS[6] | features.ts row[6] | positional geo_blob index 6 (tier) | ✓ WIRED | _GEO_COLS[6]=`tier`; features.ts:36 `const tier = row[6]`. Positionally agree. |
| style.ts | feature properties.tier | mapbox match on ['get','tier'] | ✓ WIRED | style.ts:95. |
| bee-occurrence-detail.ts | OccurrenceRow.record_type | variant dispatch on row.record_type | ✓ WIRED | :472-478. |
| occurrence.test.ts | filter.ts OCC_ID_SQL_CASE + occurrence_places.sql | imported export + readFileSync | ✓ WIRED | Import @4, readFileSync @219/227. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| occurrences mart | tier, record_type | int_combined 5 arms → dbt build | ✓ Yes — all 5 arms non-zero: specimen 48801, provisional_sample 28, waba_specimen 33, checklist 19929, inat_expert 28884; tiered 3 atlas / 2 other | ✓ FLOWING |
| map symbology | properties.tier | geo_blob row[6] → features.ts | ✓ Yes — index-6 decode wired to live _GEO_COLS | ✓ FLOWING |
| detail card | row.record_type | full wa-sqlite row query (OCCURRENCE_COLUMNS) | ✓ Yes — record_type in OCCURRENCE_COLUMNS projection | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| tsc gate | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Full Vitest suite | `npm test -- --run` | 33 files, 877 passed | ✓ PASS |
| PROV-03 coupling tests | `vitest run occurrence.test.ts` | 31 passed incl. 3 named occ_id coupling tests | ✓ PASS |
| dbt contract build | `bash data/dbt/run.sh build` | PASS=92 WARN=3 ERROR=0 (warns pre-existing/unchanged) | ✓ PASS |
| occurrences arm coverage | duckdb GROUP BY tier,record_type | all 5 arms non-zero, no silent zero-out | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PROV-01 | 170-01, 170-02 | Orthogonal facets replace mutually-exclusive source enum as organizing primitive | ✓ SATISFIED | source removed from occurrences; tier facet is filter's organizing primitive (hiddenTiers); collector/place/taxon/time facets pre-existing. |
| PROV-02 | 170-02 | Filter/symbology/(card) driven by provenance tier; tier= round-trip + src= back-compat | ✓ SATISFIED | Filter+symbology+map hidden-set tier-driven; card record_type-driven per documented D-09/D-10 deviation; tier= round-trips; src= folds 5→2. |
| PROV-03 | 170-02 | occ_id coupling across 3 sites preserved+asserted; ships as one atomic commit | ✓ SATISFIED | 3-site CASE-order equality test passes; commit 4513a170 is atomic across all consumers. |

All three PROV requirement IDs accounted for; none orphaned. REQUIREMENTS.md lines 89-91 mark all three Complete for Phase 170.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER in any phase-modified file | — | Clean. |

### Documented Intentional Deviations (verified, NOT gaps)

1. **D-10 — card is record_type-driven, not tier-driven.** Roadmap SC#1 and PROV-02 literally say the detail card is "driven by provenance tier." The locked decision (CONTEXT D-09/D-10) makes the card **record_type-driven** because a 2-value tier cannot select 5 card variants. Verified: card dispatches on `row.record_type` (5 variants); filter+URL+symbology ARE tier-driven. Documented in plan success-criteria NOTE, SUMMARY, and docs/domain-model.md. **Accepted as intended decomposition.**

2. **Field name `hiddenTiers` vs roadmap SC#2's `hiddenProvenanceTiers`.** Roadmap SC#2 names the field `hiddenProvenanceTiers`; the implementation reifies `hiddenTiers` (and `tier`, not `provenanceTier`). This is consistent with the CONTEXT D-01/D-02 social reframe (the facet is `tier`, values `atlas`/`other`; "provenance" naming explicitly superseded). The criterion's intent — a tier-based hidden-set replacing `hiddenSources`, tier= round-trip, src= back-compat — is fully satisfied. Naming is documented Claude's-discretion (D-02 discretion clause). **Accepted as intended naming; not a gap.**

### Human Verification Required

Both items were explicitly deferred to UAT in the plans' "Manual-only" sections (D-08 visual symbology). No HUMAN-UAT artifact exists yet for Phase 170.

#### 1. Tier symbology renders correctly (D-08)

**Test:** Open /app, toggle the two tier filters; observe Atlas vs Other point colors.
**Expected:** Atlas points keep the recency gradient (fresh work pops); Other points render muted grey-blue (#7a8a99); former checklist green is gone (folded into muted Other).
**Why human:** Visual color/symbology rendering cannot be verified programmatically — only the paint expression and hex literal are machine-checkable.

#### 2. Legacy `src=` link restores visible tier set on reload

**Test:** Load `/app?src=ecdysis,waba_sample`, reload, observe the map.
**Expected:** The legacy link restores the correct visible tier set (Atlas visible, Other hidden) on reload.
**Why human:** The full reload→parse→map-state render path is a runtime/visual flow; the fold logic is unit-tested but the end-to-end browser behavior is best confirmed visually.

### Gaps Summary

No gaps. All 8 observable truths verified against the actual codebase and built data; all artifacts exist, are substantive, wired, and carry real data; all key links wired; all three PROV requirements satisfied; tsc/test/dbt gates green (verified independently in this run, not trusted from SUMMARY). The two documented intentional deviations (record_type-driven card per D-10; `hiddenTiers` naming) were verified as the intended decomposition rather than missed criteria.

Status is `human_needed` solely because the D-08 visual symbology and legacy-link visual restore require browser confirmation — these were deferred to UAT by design. Every structural/behavioral criterion is machine-verified and passing.

---

_Verified: 2026-06-27T17:54:31Z_
_Verifier: Claude (gsd-verifier)_
