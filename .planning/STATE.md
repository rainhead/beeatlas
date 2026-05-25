---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: Validation & Code Quality
status: executing
stopped_at: Phase 114 complete — v3.5 Nyquist Validation verified
last_updated: "2026-05-25T21:19:02.194Z"
last_activity: 2026-05-25 -- Phase 115 planning complete
progress:
  total_phases: 12
  completed_phases: 5
  total_plans: 22
  completed_plans: 17
  percent: 42
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25 after v4.1 roadmap creation)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 115 — v3.7 and v4.0 Nyquist Validation (next)

## Current Position

Phase: 2 of 3 (Phase 115: v3.7 and v4.0 Nyquist Validation)
Plan: —
Status: Ready to execute
Last activity: 2026-05-25 -- Phase 115 planning complete

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 4 (this milestone, Phase 114)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

- Checklist records are county-range assertions, NOT point occurrences — they must NOT enter occurrences.parquet or int_combined. checklist.parquet is a separate dbt mart.
- Checklist map layer uses Mapbox county-fill on the existing counties GeoJSON source, not a new point cluster layer.
- iNat taxonomy source is AWS Open Data taxa.csv.gz (NOT the DwC-A zip archive) — has ancestry column.
- Checklist county-fill responds to taxon AND year filters; does NOT respond to collector filter. (Phase 112 UAT confirmed year filter narrowing is desired)
- [Phase 114]: Phase 114: v3.5 milestone audit updated to status: passed — all three phases (89, 90, 91) now nyquist compliant

### Pending Todos

None.

### Blockers/Concerns

- Phase 116 CODE-03: `test_dbt_diff.py` failures are described as requiring a "full nightly pipeline run" — investigate whether a fixture or stub can resolve them without a live pipeline run; confirm scope before planning.
- Phase 115 VAL-06: Phase 98 Wave 0 RED tests must be written retroactively; inspect Phase 98 code and SUMMARY files first to understand what tests would have been written at the time.

## Deferred Items

Items deferred at v3.5 milestone close (2026-05-15) — resolved in Phase 114:

| Category | Item | Status |
|----------|------|--------|
| nyquist_gap | Phase 89 VALIDATION.md | RESOLVED Phase 114 |
| nyquist_gap | Phase 90 VALIDATION.md (was false) | RESOLVED Phase 114 |
| nyquist_gap | Phase 91 VALIDATION.md missing | RESOLVED Phase 114 |
| frontmatter | Phases 89–91 SUMMARY.md requirements-completed | RESOLVED Phase 114 |

Items deferred at v3.7 milestone close (2026-05-18) — being addressed in v4.1:

| Category | Item | Status |
|----------|------|--------|
| verification_gap | 98-VERIFICATION.md | Phase 115 |
| tech_debt | W-02: PLC-02 permit field validation | Phase 116 |
| tech_debt | W-03: run.py module docstring stale | Phase 116 |
| nyquist_gap | phases 97, 98, 100 VALIDATION.md | Phase 115 |

Items deferred at v4.0 milestone close (2026-05-25) — being addressed in v4.1:

| Category | Item | Status |
|----------|------|--------|
| verification_gap | Phase 112 VERIFICATION.md missing | Phase 115 |
| test_failure | test_dbt_diff.py 3 pre-existing failures | Phase 116 |

## Session Continuity

Last session: 2026-05-25T21:00:00.000Z
Stopped at: Phase 114 complete — v3.5 Nyquist Validation verified
Resume file: None
