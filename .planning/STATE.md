---
gsd_state_version: 1.0
milestone: v3.7
milestone_name: Places
status: Phase 100.1 complete
last_updated: "2026-05-18T16:02:48.273Z"
last_activity: 2026-05-18 -- Phase 100.1 marked complete
progress:
  total_phases: 10
  completed_phases: 5
  total_plans: 11
  completed_plans: 11
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17 — v3.7 Places milestone started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 100.1 — close-v3-7-gaps-nightly-sh-place-maps-upload-onboundarymodec

## Current Position

Phase: 100.1 — COMPLETE
Plan: 1 of 1
Next: Phase 100.1 — plan and execute gap closure
Last activity: 2026-05-18 -- Phase 100.1 marked complete

```
Progress: Phase 97 of 100 complete
```

## Accumulated Context

### Roadmap Evolution

- Phase 100.1 inserted after Phase 100: Close v3.7 gaps: nightly.sh place-maps upload + _onBoundaryModeChanged selectedPlace clear (URGENT)

### Decisions

(decisions log cleared at v3.6 close — full history in .planning/PROJECT.md Key Decisions table)

**97-01 (2026-05-18):**

- `land_owner` field name (not `owner`) per PLC-01 — avoids ambiguity between organizational and legal ownership
- `LOAD spatial` only in places_validation.py (not `INSTALL spatial`) — spatial extension already installed in pipeline DuckDB environment; INSTALL is a one-time setup step inappropriate for nightly pipeline modules

### Key Architecture Notes for v3.7

- **Phase ordering is fixed:** PLC (TOML + validation) → PPIPE (pipeline + dbt + exports) → PPAGE + PMAP (can overlap but PMAP has no PPAGE dependency)
- **No nearest-polygon fallback:** `place_slug IS NULL` is semantically correct — most occurrences are not at any named place. Do NOT copy the county nearest-polygon CTE.
- **promoteId: 'slug'** for places GeoJSON source in Mapbox (not generateId: true) — stable feature IDs across source reloads
- **Two export artifacts:** `places.geojson` (slim: slug + geometry, for Mapbox) and `places.json` (rich: all metadata + counts, no geometry, for Eleventy)
- **dbt contract: 31 columns** — `place_slug` added atomically to `occurrences.sql` + `schema.yml` per project_schema_validation.md procedure
- **CloudFront does not serve /foo/ → /foo/index.html** — Eleventy permalink config for place pages must produce direct-path URLs (e.g. `/places/slug.html` or `/places.html` for the index)
- **Slug policy:** slug is a curated TOML field, never auto-generated; uniqueness + `[a-z0-9-]` regex + overlap (ST_Intersects) validation in run.py (Phase 97)
- **SVG occurrence maps** generated at pipeline time following species_maps.py pattern (Phase 98, same phase as pipeline)
- **places.geojson + places.json committed to git** so CI frontend-only builds succeed without running the pipeline (PPIPE-05)
- **Geometry validation pitfall:** WA GIS portals default to State Plane CRS; `ST_Within` silently fails with wrong CRS. Pytest must assert `crs.to_epsg() == 4326` and `is_valid.all()`.

### Pending Todos

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-t1a | Table mode improvements (filter button, selection highlight, links column, collector coalesce, field# fallback) | 2026-04-21 | c9c1b8c | [260421-t1a-table-mode-improvements](./quick/260421-t1a-table-mode-improvements/) |
| 260421-qk1 | Drop atom feeds for counties and ecoregions | 2026-04-21 | c1f196e | [260421-qk1-drop-county-ecoregion-feeds](./quick/260421-qk1-drop-county-ecoregion-feeds/) |
| 260422-sc1 | Fix specimen count mismatch between map filter panel and table view | 2026-04-22 | 78ccd3e | [260422-sc1-fix-specimen-count-mismatch](./quick/260422-sc1-fix-specimen-count-mismatch/) |
| 260514-f2z | Stale public/data artifact cleanup (fetch-data.sh + BENCHMARK.md to canonical set; deleted samples.parquet/ecdysis.parquet from S3 + local) | 2026-05-14 | 36ce8bc | [260514-f2z-stale-public-data-cleanup-drop-samples-p](./quick/260514-f2z-stale-public-data-cleanup-drop-samples-p/) |
| 260514-f7c | dlt pipeline state housekeeping — audit only, no action (≤106 _dlt_* rows total over 58 days, <1% of 111 MB DB) | 2026-05-14 | — | [260514-f7c-dlt-pipeline-state-housekeeping-audit-dl](./quick/260514-f7c-dlt-pipeline-state-housekeeping-audit-dl/) |
| 260514-fcq | Retire Lambda execution path — removed PipelineFunction + EventBridge schedulers + Function URL from BeeAtlasStack via cdk deploy; deleted stub_handler.py + Dockerfile; CloudFront access logging activated as a side-effect (intentional pending change) | 2026-05-14 | b58b35b | [260514-fcq-retire-stub-handler-delete-data-stub-han](./quick/260514-fcq-retire-stub-handler-delete-data-stub-han/) |
| 260514-fp2 | Fix mobile sidebar close button obscured by Regions button (#12) — keep a sliver of map visible above the sidebar in narrow viewports so the Regions button has its own real estate | 2026-05-14 | be01acb | [260514-fp2-fix-mobile-sidebar-close-button-obscured](./quick/260514-fp2-fix-mobile-sidebar-close-button-obscured/) |
| 260514-fp3 | Fix region boundary gaps/overlaps (#14) — switch county source from TIGER tl_ to Census CB 5m (0 vs 192 km² of overlap); add mapshaper -clean -simplify post-process for EPA L3 ecoregions; clip ecoregions to WA in the dbt mart. Side benefit: 84 boundary-nondeterminism rows in occurrence→county assignment dropped to 0. | 2026-05-14 | 62db87e | [260514-fp3-fix-region-boundary-gaps-overlaps](./quick/260514-fp3-fix-region-boundary-gaps-overlaps/) |
| 260514-ndp | Cluster selection visual feedback (halo overlay layer) — yellow halo ring around any rendered cluster blob whose leaves intersect `selectedOccIds`; new GeoJSON source + circle layer in bee-map.ts; reactive recompute on selection change / moveend / sourcedata; `_haloGeneration` race guard mirrors `_filterQueryGeneration`; rAF-coalesced; 7 HALO-01 static-grep tests added | 2026-05-14 | c335135 | [260514-ndp-cluster-selection-visual-feedback-halo-o](./quick/260514-ndp-cluster-selection-visual-feedback-halo-o/) |
| 260516-p0i | Add grey "Genus sp." key entry on genus/subgenus pages for genus-level specimens | 2026-05-17 | a260df7 | [260516-p0i-genus-pages-show-specimens-identified-to](./quick/260516-p0i-genus-pages-show-specimens-identified-to/) |

## Deferred Items

Items acknowledged and deferred at v3.5 milestone close on 2026-05-15:
Known deferred items at close: 26 (see below)

| Category | Item | Status |
|----------|------|--------|
| debug | nav-routes-to-atlas-instead-of-filter | diagnosed |
| debug | selection-ring-not-displaying | diagnosed |
| uat_gap | 89-HUMAN-UAT.md | partial (5 pending browser scenarios) |
| uat_gap | 90-HUMAN-UAT.md | partial (4 pending browser scenarios) |
| verification_gap | 89-VERIFICATION.md | human_needed |
| verification_gap | 90-VERIFICATION.md | human_needed |
| quick_task | 1-store-full-observation-json-in-cache-wit | missing |
| quick_task | 260408-roy-move-region-overlay-control-from-sidebar | missing |
| quick_task | 260408-tkd-add-occurrence-observation-id-columns-to | missing |
| quick_task | 260408-tvl-show-recent-filters-when-filter-input-is | missing |
| quick_task | 260411-pru-unidentified-specimens-like-5611752-are- | missing |
| quick_task | 260412-dl6-in-the-frontend-in-the-specimen-table-vi | missing |
| quick_task | 260412-due-re-add-sort-controls-to-the-specimen-tab | missing |
| quick_task | 260412-kpe-schema-validation-is-failing-on-build-de | missing |
| quick_task | 260421-qk1-drop-county-ecoregion-feeds | missing |
| quick_task | 260421-t1a-table-mode-improvements | missing |
| quick_task | 260422-sc1-fix-specimen-count-mismatch | missing |
| quick_task | 260514-f2z-stale-public-data-cleanup-drop-samples-p | missing |
| quick_task | 260514-f7c-dlt-pipeline-state-housekeeping-audit-dl | missing |
| quick_task | 260514-fcq-retire-stub-handler-delete-data-stub-han | missing |
| quick_task | 260514-fp2-fix-mobile-sidebar-close-button-obscured | missing |
| quick_task | 260514-fp3-fix-region-boundary-gaps-overlaps | missing |
| quick_task | 260514-ndp-cluster-selection-visual-feedback-halo-o | missing |
| todo | cluster-selection-visual-feedback.md | medium |
| todo | hash-versioned-parquet-urls.md | medium |
| todo | nightly-run-failure-notification.md | medium |
