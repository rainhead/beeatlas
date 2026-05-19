---
gsd_state_version: 1.0
milestone: v3.8
milestone_name: Conceptual Tidying
status: executing
stopped_at: Phase 102 complete — Python Slug Module & Dead Constant verified
last_updated: "2026-05-19T00:00:00.000Z"
last_activity: 2026-05-19 -- Phase 102 complete (verified)
progress:
  total_phases: 9
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 22
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-18 — v3.7 Places milestone complete)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 103 — dbt iNat Field ID Constants & Plantae Macro

## Current Position

Phase: 103 (dbt iNat Field ID Constants & Plantae Macro) — NEXT
Plan: —
Status: Phase 102 verified; ready for Phase 103
Last activity: 2026-05-19 -- Phase 102 execution started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

(decisions log cleared at v3.7 close — full history in .planning/PROJECT.md Key Decisions table)

### Key Guardrails for v3.8

- `dbt build` required after ANY `.sql` change under `data/dbt/` — pytest does not run dbt
- Scope creep: any noticed behavior gap gets a TODO comment, not a fix in the same commit
- `OccurrenceRow` (in `filter.ts`) is the authoritative TypeScript type; `occurrence.ts` re-exports it, not redefines it
- Phase 104 (SEM-01) should run after 101-103: all call sites are visible once named predicates exist

### Pending Todos

None for v3.8.

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
| 260518-phr | Add `<bee-header>` to places pages; add map-pin nav icon in header linking to /places.html | 2026-05-18 | d6eddf7 | [260518-phr-places-header-and-nav-icon](./quick/260518-phr-places-header-and-nav-icon/) |

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

Items acknowledged and deferred at v3.7 milestone close on 2026-05-18:
Known deferred items at close: 5

| Category | Item | Status |
|----------|------|--------|
| verification_gap | 98-VERIFICATION.md | missing — all code verified via SUMMARY + code inspection |
| tech_debt | W-02: PLC-02 permit field validation not runtime-enforced | places_validation.py does not check issuing_authority/type |
| tech_debt | W-03: run.py module docstring stale | omits places-load, places-export, places-maps, topology-postprocess |
| nyquist_gap | phases 97, 98, 100 VALIDATION.md missing/incomplete | run /gsd-validate-phase retroactively |
| nyquist_gap | Phase 98 Wave 0 RED tests never written | Nyquist protocol bypassed |

## Session Continuity

Last session: 2026-05-18
Stopped at: Roadmap created for v3.8 — 4 phases (101-104), 8 requirements mapped
Resume file: None
