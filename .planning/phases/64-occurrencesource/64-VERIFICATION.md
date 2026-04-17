---
phase: 64-occurrencesource
verified: 2026-04-17T11:26:00Z
status: passed
score: 11/11
overrides_applied: 0
re_verification: false
---

# Phase 64: OccurrenceSource Verification Report

**Phase Goal:** Unified occurrence model — replace dual EcdysisSource/SampleSource with a single OccurrenceSource, introduce SelectionState discriminated union with cluster URL encoding, enforce 44px minimum tap target, wire into bee-map and bee-atlas.
**Verified:** 2026-04-17T11:26:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A single OL vector source (OccurrenceSource) replaces EcdysisSource and SampleSource; both old source classes are deleted | VERIFIED | `features.ts` exports only `OccurrenceSource`; grep for `EcdysisSource`/`SampleSource` across `features.ts`, `bee-map.ts`, `bee-atlas.ts` returns empty |
| 2 | Specimen-backed features carry IDs `ecdysis:<int>`; sample-only features carry IDs `inat:<int>` | VERIFIED | `features.ts` lines 27-29: branches on `obj.ecdysis_id` nullability to assign `ecdysis:` or `inat:` prefix |
| 3 | All occurrences appear on the map with correct coordinates and recency-based cluster coloring | VERIFIED | `bee-map.ts` creates `OccurrenceSource -> Cluster (distance:20) -> VectorLayer`; `makeClusterStyleFn` retained; `fromLonLat` used for coordinates |
| 4 | Clicking an occurrence cluster opens the sidebar detail panel with the correct record | VERIFIED | `bee-map.ts` unified click handler emits `map-click-occurrence` with `occIds`/`centroid`/`radiusM`; `bee-atlas.ts` `_onOccurrenceClick` and `_restoreClusterSelection` handle both variants |
| 5 | SelectionState is a discriminated union with 'ids' and 'cluster' variants | VERIFIED | `url-state.ts` lines 9-11: `type SelectionState = \| { type: 'ids'; ids: string[] } \| { type: 'cluster'; lon: number; lat: number; radiusM: number }` |
| 6 | parseParams accepts both ecdysis: and inat: prefixed IDs in the o= param | VERIFIED | `url-state.ts` line 160: `filter(s => (s.startsWith('ecdysis:') \| \| s.startsWith('inat:')) && s.length > 5)` |
| 7 | Cluster centroid @lon,lat,r format round-trips through buildParams/parseParams | VERIFIED | `url-state.ts` lines 47-48 encode; lines 146-157 decode with range validation; 8 new url-state tests cover this including fractional radiusM rounding |
| 8 | Cluster dots have minimum 22px radius (44px tap target) | VERIFIED | `style.ts` line 99: `displayCount <= 1 ? 22 : Math.max(22, 6 + Math.log2(...) * 3)` |
| 9 | layerMode visibility gating removed from bee-map | VERIFIED | No `setVisible.*layerMode` calls in `bee-map.ts`; property still declared but unused for visibility (deferred full removal to Phase 65 per OCC-09 scope) |
| 10 | data-loaded event carries both summary/taxaOptions and recentEvents | VERIFIED | `bee-map.ts` line 411-415: single `once('change')` handler emits `{ summary, taxaOptions, recentEvents }`; separate `sample-data-loaded` event eliminated |
| 11 | All test files mock OccurrenceSource instead of EcdysisSource/SampleSource | VERIFIED | All 5 test files (`bee-atlas`, `bee-header`, `bee-filter-toolbar`, `bee-sidebar`, `bee-table`) contain `OccurrenceSource: vi.fn().mockImplementation(...)` with no references to old source classes |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/features.ts` | OccurrenceSource class | VERIFIED | Contains `export class OccurrenceSource extends VectorSource`; 49 lines, substantive implementation |
| `frontend/src/url-state.ts` | SelectionState discriminated union, @lon,lat,r encoding | VERIFIED | Contains `SelectionState` type, `buildParams`, `parseParams`; full cluster URL encoding |
| `frontend/src/style.ts` | Minimum tap target enforcement | VERIFIED | Contains `Math.max(22,` in radius formula at line 99 |
| `frontend/src/bee-map.ts` | Single OccurrenceSource + Cluster layer, unified click handler | VERIFIED | Contains `OccurrenceSource`, `occurrenceLayer`, `clusterCentroid`, `maxRadiusMetres`, unified `map-click-occurrence` emit |
| `frontend/src/bee-atlas.ts` | SelectionState discriminated union handling, spatial restore | VERIFIED | Contains `_restoreClusterSelection` with bounding-box SQL + haversine post-filter |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `features.ts` | `sqlite.ts` | `SELECT * FROM occurrences` | VERIFIED | Line 17: `sqlite3.exec(db, \`SELECT * FROM occurrences\`, ...)` |
| `url-state.ts` | `bee-atlas.ts` | SelectionState type usage | VERIFIED | `bee-atlas.ts` uses discriminated union shape throughout (`type === 'ids'`, `type === 'cluster'`) |
| `bee-map.ts` | `features.ts` | `import OccurrenceSource` | VERIFIED | Line 6: `import { OccurrenceSource } from "./features.ts"` |
| `bee-atlas.ts` | `url-state.ts` | `buildParams`/`parseParams` | VERIFIED | Line 4: `import { buildParams, parseParams } from './url-state.ts'` |
| `bee-map.ts` | `bee-atlas.ts` | `map-click-occurrence` custom event | VERIFIED | `bee-map.ts` emits `map-click-occurrence`; `bee-atlas.ts` template binds `@map-click-occurrence=${this._onOccurrenceClick}` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `features.ts` | `features` (OL Feature array) | `SELECT * FROM occurrences` via `tablesReady/getDB()` | Yes — live SQLite query | FLOWING |
| `bee-atlas.ts` | `_selectedSamples` for cluster restore | `_restoreClusterSelection` queries `occurrences WHERE lat BETWEEN ... AND lon BETWEEN ...` + haversine post-filter | Yes — live SQLite query | FLOWING |
| `url-state.ts` | `selection` | `parseParams` from `window.location.search` | Yes — parses real URL params | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 175 tests pass | `npm test -- --run` | 175 passed (175), 7 test files | PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | No output (0 errors) | PASS |
| `features.ts` exports correct class | Node static analysis | `OccurrenceSource: true`, `No EcdysisSource: true`, `No SampleSource: true` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OCC-07 | 64-01, 64-02 | `OccurrenceSource` replaces `EcdysisSource` and `SampleSource`; OL feature IDs follow convention | SATISFIED | `features.ts` exports only `OccurrenceSource`; IDs branch on `ecdysis_id` nullability; both old source classes deleted from all production files and test mocks |

### Anti-Patterns Found

No TODO/FIXME/placeholder comments found in modified files. No empty implementations detected.

One minor residue: `bee-map.ts` retains a `layerMode: 'specimens' | 'samples'` property declaration (line 135) that is no longer used for visibility gating. This is an orphaned property rather than a stub — the visibility-gating behavior is correctly removed. Full `layerMode` removal is Phase 65 scope (OCC-09).

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `bee-map.ts` | 135 | Unused `@property layerMode` declaration | Info | No functional impact — visibility gating removed; full removal deferred to Phase 65 |

### Human Verification Required

None. All must-haves verified programmatically.

### Gaps Summary

No gaps. All 11 observable truths verified, all artifacts pass Level 1-4 checks, all key links wired, full test suite green (175/175), TypeScript compiles clean.

---

_Verified: 2026-04-17T11:26:00Z_
_Verifier: Claude (gsd-verifier)_
