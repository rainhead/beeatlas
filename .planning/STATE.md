---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Washington Checklist Records
status: planning
stopped_at: Phase 113 context gathered
last_updated: "2026-05-25T01:37:41.097Z"
last_activity: 2026-05-25
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-23 after v4.0 milestone start)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 113 — species page expansion

## Current Position

Phase: 113
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-25

Progress: [██████████] 100%

## Accumulated Context

### Decisions

- Checklist records are county-range assertions, NOT point occurrences — they must NOT enter occurrences.parquet or int_combined. checklist.parquet is a separate dbt mart.
- Checklist map layer uses Mapbox county-fill on the existing counties GeoJSON source, not a new point cluster layer.
- iNat taxonomy source is AWS Open Data taxa.csv.gz (NOT the DwC-A zip archive) — has ancestry column; DwC-A disqualified: URL-form IDs, no subfamily/tribe, no ancestry column.
- source='checklist' constant lives in checklist.parquet only; occurrences.parquet schema is unchanged for v4.0.
- Year slider bounds remain scoped to occurrences.parquet only — no 1812 checklist dates bleeding into WABA filter UI.
- Checklist county-fill responds to taxon AND year filters; does NOT respond to collector filter. (Plan STATE.md said "taxon only" but UAT confirmed year filter narrowing is desired — Phase 112)

### Pending Todos

None.

### Blockers/Concerns

- Watch out: taxa.csv.gz structure (delimiter, ancestry column, active field type) should be verified with smoke test before Phase 110 implementation: `curl --range 0-512 <url> | gzip -dc | head -2`
- Watch out: checklist records must not appear in int_combined — assert occurrences.parquet row count doesn't increase after Phase 111.
- Watch out: trailing whitespace in family names in checklist CSV silently drops species from int_species_universe; apply TRIM() in staging.
- Watch out: duplicate taxon_id from inactive/synonym rows in taxa.csv.gz — filter WHERE active = true before staging load.
- Genus/subgenus page design for Phase 113: genusList currently filters occurrence_count > 0, which silently drops checklist-only species. Must be an explicit design decision before Phase 113 begins.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-t1a | Table mode improvements (filter button, selection highlight, links column, collector coalesce, field# fallback) | 2026-04-21 | c9c1b8c | [260421-t1a-table-mode-improvements](./quick/260421-t1a-table-mode-improvements/) |
| 260421-qk1 | Drop atom feeds for counties and ecoregions | 2026-04-21 | c1f196e | [260421-qk1-drop-county-ecoregion-feeds](./quick/260421-qk1-drop-county-ecoregion-feeds/) |
| 260422-sc1 | Fix specimen count mismatch between map filter panel and table view | 2026-04-22 | 78ccd3e | [260422-sc1-fix-specimen-count-mismatch](./quick/260422-sc1-fix-specimen-count-mismatch/) |
| 260514-f2z | Stale public/data artifact cleanup | 2026-05-14 | 36ce8bc | [260514-f2z-stale-public-data-cleanup-drop-samples-p](./quick/260514-f2z-stale-public-data-cleanup-drop-samples-p/) |
| 260514-fcq | Retire Lambda execution path | 2026-05-14 | b58b35b | [260514-fcq-retire-stub-handler-delete-data-stub-han](./quick/260514-fcq-retire-stub-handler-delete-data-stub-han/) |
| 260514-fp2 | Fix mobile sidebar close button obscured | 2026-05-14 | be01acb | [260514-fp2-fix-mobile-sidebar-close-button-obscured](./quick/260514-fp2-fix-mobile-sidebar-close-button-obscured/) |
| 260514-fp3 | Fix region boundary gaps/overlaps | 2026-05-14 | 62db87e | [260514-fp3-fix-region-boundary-gaps-overlaps](./quick/260514-fp3-fix-region-boundary-gaps-overlaps/) |
| 260514-ndp | Cluster selection visual feedback (halo overlay layer) | 2026-05-14 | c335135 | [260514-ndp-cluster-selection-visual-feedback-halo-o](./quick/260514-ndp-cluster-selection-visual-feedback-halo-o/) |
| 260516-p0i | Add grey "Genus sp." key entry on genus/subgenus pages | 2026-05-17 | a260df7 | [260516-p0i-genus-pages-show-specimens-identified-to](./quick/260516-p0i-genus-pages-show-specimens-identified-to/) |
| 260518-phr | Add bee-header to places pages; add map-pin nav icon | 2026-05-18 | d6eddf7 | [260518-phr-places-header-and-nav-icon](./quick/260518-phr-places-header-and-nav-icon/) |
| 260519-dzv | Add places to where filter in bee-filter-panel | 2026-05-19 | 76bca27 | [260519-dzv-add-places-to-where-filter-in-bee-filter](./quick/260519-dzv-add-places-to-where-filter-in-bee-filter/) |

## Deferred Items

Items acknowledged and deferred at v3.5 milestone close on 2026-05-15:

| Category | Item | Status |
|----------|------|--------|
| debug | nav-routes-to-atlas-instead-of-filter | resolved — architecture eliminated by v3.6 (994067c) |
| debug | selection-ring-not-displaying | resolved — guard already patched in c20c43a |
| uat_gap | 89-HUMAN-UAT.md | partial (5 pending browser scenarios) |
| uat_gap | 90-HUMAN-UAT.md | partial (4 pending browser scenarios) |
| verification_gap | 89-VERIFICATION.md | human_needed |
| verification_gap | 90-VERIFICATION.md | human_needed |
| todo | cluster-selection-visual-feedback.md | medium |
| todo | hash-versioned-parquet-urls.md | medium |
| todo | nightly-run-failure-notification.md | medium |

Items acknowledged and deferred at v3.7 milestone close on 2026-05-18:

| Category | Item | Status |
|----------|------|--------|
| verification_gap | 98-VERIFICATION.md | missing — all code verified via SUMMARY + code inspection |
| tech_debt | W-02: PLC-02 permit field validation not runtime-enforced | places_validation.py does not check issuing_authority/type |
| tech_debt | W-03: run.py module docstring stale | omits places-load, places-export, places-maps, topology-postprocess |
| nyquist_gap | phases 97, 98, 100 VALIDATION.md missing/incomplete | run /gsd-validate-phase retroactively |
| nyquist_gap | Phase 98 Wave 0 RED tests never written | Nyquist protocol bypassed |

## Session Continuity

Last session: 2026-05-25T01:37:41.090Z
Stopped at: Phase 113 context gathered
Resume file: .planning/phases/113-species-page-expansion/113-CONTEXT.md
