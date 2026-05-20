---
gsd_state_version: 1.0
milestone: v3.9
milestone_name: milestone
status: COMPLETE — milestone archived 2026-05-20
stopped_at: context exhaustion at 75% (2026-05-20)
last_updated: "2026-05-20T22:57:56.811Z"
last_activity: 2026-05-20 -- v3.9 milestone archived; REQUIREMENTS.md retired; git tag v3.9 created
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-20 after v3.9 milestone close)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Planning next milestone (v4.0 or v3.10)

## Current Position

v3.9 — COMPLETE (archived 2026-05-20)
All 5 phases (105–109), 12 plans complete.
Last activity: 2026-05-20 -- v3.9 milestone archived; REQUIREMENTS.md retired; git tag v3.9 created

Progress: [██████████] 100%

## Accumulated Context

### Decisions

(decisions log cleared at v3.9 close — full history in .planning/PROJECT.md Key Decisions table)

### Pending Todos

None.

### Blockers/Concerns

None.

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
| debug | nav-routes-to-atlas-instead-of-filter | diagnosed |
| debug | selection-ring-not-displaying | diagnosed |
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

Last session: 2026-05-20T22:57:56.807Z
Stopped at: context exhaustion at 75% (2026-05-20)
Resume file: None
