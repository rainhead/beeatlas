---
phase: 03-core-map
plan: "02"
subsystem: ui
tags: [openlayers, lit, sidebar, click-handler, cluster, responsive]

# Dependency graph
requires:
  - phase: 03-core-map
    plan: "01"
    provides: ol/source/Cluster with specimenSource, VectorLayer, inner feature properties (year/month/scientificName/recordedBy/fieldNumber/genus/family)
provides:
  - bee-sidebar LitElement with summary stats view and specimen detail view
  - singleclick handler in bee-map.ts unwrapping cluster inner features
  - DataSummary computed from specimenSource.once('change') event
  - Responsive layout: 25rem right panel desktop, below-map panel portrait
affects:
  - 04-filter (sidebar panel-content wrapper ready for filter controls above specimen list)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "specimenSource.once('change') fires after addFeatures() — getFeatures() returns all records at that point"
    - "Cluster inner features unwrapped via hits[0].get('features') ?? [hits[0]] fallback"
    - "MapBrowserEvent imported as type for singleclick handler parameter under verbatimModuleSyntax"
    - "Custom event dispatched with bubbles:true, composed:true for cross-shadow-DOM propagation"
    - "Intl.DateTimeFormat for month name formatting avoids locale-fragile manual arrays"

key-files:
  created:
    - frontend/src/bee-sidebar.ts
  modified:
    - frontend/src/bee-map.ts

key-decisions:
  - "MapBrowserEvent type import required under strict + verbatimModuleSyntax — the OL Map.on() overload resolves to any without explicit typing"
  - "specimenSource.once('change') is the correct hook for summary computation — fires reliably after all features loaded via addFeatures() in ParquetSource"
  - "Single singleclick handler branches on hits.length to both open and dismiss sidebar — avoids ordering issues with separate handlers"

patterns-established:
  - "Cluster inner features always accessed via feature.get('features') — never read data props from the cluster wrapper feature directly"
  - "LitElement side panel components use @property({ attribute: false }) for complex object bindings (.samples, .summary)"

requirements-completed: [MAP-02]

# Metrics
duration: 1min
completed: 2026-02-21
---

# Phase 03 Plan 02: Click-to-Detail Sidebar Summary

**bee-sidebar LitElement with summary and specimen-detail views wired to OL singleclick handler via cluster inner feature unwrapping**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-21T03:23:26Z
- **Completed:** 2026-02-21T03:25:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `bee-sidebar.ts`: exports `Sample`, `DataSummary` interfaces and `BeeSidebar` `@customElement('bee-sidebar')`
- Summary view shows Washington Bee Atlas title + specimen/species/genera/families/year-range stats; loading state shown while `summary` is null
- Specimen detail view lists samples sorted most-recent-first; each sample shows full month name + year header, collector + fieldNumber meta, and italic species list
- Back button dispatches `new CustomEvent('close', { bubbles: true, composed: true })`
- `bee-map.ts` updated: `@state()` `selectedSamples` and `summary`; `buildSamples()` groups by date+collector+fieldNumber; `computeSummary()` counts unique sets
- `specimenSource.once('change')` triggers summary computation — confirmed this fires after `addFeatures()` completes so `getFeatures()` returns the full dataset
- Desktop layout: `bee-sidebar` 25rem fixed-width right panel with `border-left: 1px solid #cccccc`
- Portrait layout (`max-aspect-ratio: 1`): `#map` at `50svh`, `bee-sidebar` fills remaining height below
- TypeScript compiles cleanly; production build passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bee-sidebar LitElement** - `8bc647b` (feat)
2. **Task 2: Wire click handler, summary computation, sidebar layout** - `4fcca28` (feat)

## Files Created/Modified

- `frontend/src/bee-sidebar.ts` — New file: `Sample` and `DataSummary` interfaces; `BeeSidebar` LitElement; summary stats view with loading state; specimen detail view with back button and sample list; styles for desktop and mobile
- `frontend/src/bee-map.ts` — Added `state` decorator import; `Feature` from `ol/Feature.js`; `MapBrowserEvent` type import; `buildSamples()` and `computeSummary()` module-level functions; `@state()` `selectedSamples` and `summary` properties; `specimenSource.once('change')` handler; `singleclick` map event handler; `bee-sidebar` in render template with `.samples`/`.summary`/`@close` bindings; sidebar CSS layout rules including portrait media query

## Decisions Made

- `MapBrowserEvent` imported as `import type` to annotate the `singleclick` callback parameter — required because TypeScript strict mode cannot infer the parameter type from OL's `map.on()` overload resolution under `verbatimModuleSyntax`
- `specimenSource.once('change')` fires reliably after `addFeatures()` in `ParquetSource` loader — the `VectorSource` internal change event is dispatched synchronously after features are added, so `getFeatures()` returns all records at that point
- Single `singleclick` handler branches on `hits.length` (no feature at pixel → clear selection, has features → build samples) — cleaner than two handlers and avoids race conditions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added MapBrowserEvent type annotation for singleclick callback**
- **Found during:** Task 2 (TypeScript compile check)
- **Issue:** TypeScript error TS7006 — `event` parameter implicitly has `any` type. The plan snippet used `async (event) =>` without a type, which fails under `strict: true` + `noImplicitAny`
- **Fix:** Added `import type MapBrowserEvent from 'ol/MapBrowserEvent.js'` and typed the callback as `async (event: MapBrowserEvent) =>`
- **Files modified:** `frontend/src/bee-map.ts`
- **Verification:** `tsc --noEmit` exits 0; `npm run build` succeeds
- **Committed in:** `4fcca28` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing type annotation)
**Impact on plan:** Required for TypeScript strict compliance; no behavioral change.

## Issues Encountered

None beyond the type annotation fix above. `specimenSource.once('change')` behavior confirmed as expected — no issues with timing or feature availability.

## User Setup Required

None — verify interactively via `npm run dev`:
1. Map loads — sidebar shows "Loading data..." then populates with Washington Bee Atlas statistics
2. Click a cluster — sidebar switches to specimen detail list with date/collector/fieldNumber headers and species lists
3. Click empty map area — sidebar returns to summary statistics
4. Click "Back" button in specimen view — sidebar returns to summary statistics
5. Resize browser to portrait — map occupies top half, sidebar fills bottom

## Next Phase Readiness

- `bee-sidebar` `<div class="panel-content">` wrapper is in place — Phase 4 can insert filter controls above specimen list without restructuring the component
- `Sample` and `DataSummary` interfaces exported from `bee-sidebar.ts` for reuse in Phase 4
- Column set complete: `genus` and `family` loaded in plan 01 are used for summary genus/family counts

---
*Phase: 03-core-map*
*Completed: 2026-02-21*
