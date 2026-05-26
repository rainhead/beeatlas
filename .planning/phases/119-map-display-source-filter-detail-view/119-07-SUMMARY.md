---
phase: 119
plan: 07
status: complete
completed: 2026-05-26
requirements_closed: [MAP-01, MAP-02, MAP-03, DET-01]
---

# Plan 119-07 Summary — Visual UAT

## Operator Approval

Approved. All four requirements visually confirmed.

## UAT Findings

### Changes made during UAT

Three issues were discovered and resolved before approval:

**1. `src=` URL param polarity flip (MAP-03)**
The param was encoding *hidden* sources (e.g. `src=ecdysis` = Ecdysis hidden). Changed to encode *visible* sources (e.g. `src=inat_obs,waba_sample` = only those two shown). Absent param = all sources on (default). Changed `buildParams` and `parseParams` in `url-state.ts`; updated test expectations in `url-state.test.ts`.

**2. Merged Checklist records into Sources filter row (MAP-02 UX)**
The "Checklist records" toggle was a separate filter row with the same icon as Sources. Merged into a single unified row with four checkboxes: Ecdysis specimens / Provisional WABA / iNat expert obs / Checklist records. Removed `_renderShow()` method; `_renderSources()` now owns all four items. Internal event dispatch unchanged (`checklist-layer-changed` still fires for the checklist item).

**3. Labels, tooltips, and WABA rename (MAP-02 UX)**
- Renamed `'WABA samples'` → `'Provisional WABA'` (these are unmatched WABA specimen obs pending Ecdysis entry, not sample records).
- Added `title` tooltips on all four source labels:
  - Ecdysis specimens: "Physical bee specimens in the Ecdysis catalog"
  - Provisional WABA: "WABA field collections not yet entered in Ecdysis"
  - iNat expert obs: "iNaturalist observations identified by experts"
  - Checklist records: "County-level species presence from observation history"

**4. `inat_obs:` prefix missing from `o=` param allowlist (DET-01 / bug fix)**
`parseParams` filtered `o=` IDs to only `ecdysis:` and `inat:` prefixes — `inat_obs:` was excluded, silently dropping deep-links to iNat obs occurrences. Added `inat_obs:` to the allowlist. Added round-trip test.

### MAP-01 ✅
Amber `#e8a020` iNat obs points visible on the map at zoom 10+. 44,534 iNat obs rows in the live parquet; clearly distinguishable from grey Ecdysis clusters.

### MAP-02 ✅
Unified Sources filter row with four checkboxes. Toggling sources hides/shows corresponding points immediately (synchronous Mapbox `setFilter`). Tooltips render on hover. "No sources selected" empty state fires when all four are unchecked.

### MAP-03 ✅
URL encodes visible sources: `?src=inat_obs,waba_sample` when Ecdysis is hidden. Absent = all on. Copy/paste URL into new tab restores filter state. Browser back restores previous filter.

### DET-01 ✅
Clicking an iNat obs point opens the detail card: date (Roman numeral format), observer login, CC-licensed photo loaded from iNaturalist S3, "View on iNaturalist" link (target=_blank). Confirmed with obs 13098974 (wenatcheeb, 1 IV 2018, Andrena near Wenatchee).

## No Regressions

- Ecdysis cluster click and filter panel work normally.
- Checklist county-fill toggle works from the unified row.
- Year/taxon/elevation filters unaffected.
