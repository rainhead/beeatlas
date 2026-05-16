---
gsd_state_version: 1.0
milestone: v3.6
milestone_name: Simpler Species Index
status: executing
last_updated: "2026-05-16T07:14:58.606Z"
last_activity: 2026-05-16 -- Phase 96 planning complete
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 13
  completed_plans: 10
  percent: 77
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-15 — v3.6 Simpler Species Index milestone started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 95 — subgenus-tribe-pages

## Current Position

Phase: 96
Plan: Not started
Status: Ready to execute
Last activity: 2026-05-16 -- Phase 96 planning complete

Progress: [██████████] 100%

## Accumulated Context

### Decisions

(decisions log cleared at v3.4 close — full history in .planning/PROJECT.md Key Decisions table)

- [91-02] `_selectionBounds && _sidebarOpen` takes precedence over cluster/ids in `_pushUrlState` ternary — when sidebar is closed (zero-rows selection) no `sel=` emitted
- [91-02] `_restoreBoundsSelection` opens sidebar synchronously before awaiting data (sidebarOpen-first pattern) so empty-state copy renders immediately
- [91-02] `_selectionDrawnGeneration` counter reused for bounds restore — any new draw/restore cancels prior in-flight query

### Key Constraints for v3.5

- Mapbox BoxZoomHandler handles shift-drag by default for zoom-to-box; must be explicitly disabled before the custom shift-drag selection handler can be installed
- Rectangle is ephemeral — it disappears on drag release; sidebar presence implies active selection
- Occurrence query uses bounds (west, south, east, north) intersected with the current active filter via the existing `queryVisibleIds` / `buildFilterSQL` infrastructure in `filter.ts`
- URL state integrates with the existing `url-state.ts` `buildParams`/`parseParams` pattern and the `bee-atlas.ts` URL round-trip; `sel=` param is 4 comma-separated decimals
- State ownership: `bee-atlas` owns `_selectionBounds`; `bee-map` is a pure presenter that emits a `selection-drawn` custom event with the bounds; sidebar opens via the existing `occurrence-clicked` path reusing `bee-occurrence-detail`

### Pending Todos

- Nightly run failure notification — `.planning/todos/pending/nightly-run-failure-notification.md`
- Hash-versioned URLs for `public/data/` artifacts — `.planning/todos/pending/hash-versioned-parquet-urls.md`

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
