---
phase: 067-provisional-row-display-in-sidebar
plan: "02"
subsystem: frontend-rendering
tags: [rendering, lit, provisional, sample-only, sidebar, tests]
dependency_graph:
  requires:
    - OccurrenceRow with is_provisional, specimen_inat_taxon_name, specimen_inat_quality_grade, host_inat_login (from 067-01)
  provides:
    - _renderProvisional method in bee-occurrence-detail.ts
    - Updated _renderSampleOnly with host_inat_login and "identification pending" copy
    - .inat-id-label CSS and _renderQualityBadge helper
    - SID-01 and SID-02 Vitest tests
  affects:
    - frontend/src/bee-occurrence-detail.ts
    - frontend/src/tests/bee-sidebar.test.ts
tech_stack:
  added: []
  patterns:
    - Lit html template literals for safe interpolation (T-067-02 mitigated)
    - Shadow DOM querying in Vitest tests via el.shadowRoot
key_files:
  created: []
  modified:
    - frontend/src/bee-occurrence-detail.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - "_renderQualityBadge added as private helper; _renderHostInfo kept using inline badge for backward compatibility (no refactor needed)"
  - "Sample-only null count renders 'identification pending' alone (no 'not recorded'); matches Copywriting Contract"
metrics:
  duration: "98 seconds"
  completed: "2026-04-20"
  tasks_completed: 2
  files_changed: 2
---

# Phase 067 Plan 02: Provisional and Sample-Only Row Rendering Summary

Provisional rows now display iNat community ID, italic taxon name, quality badge with aria-label, and a "View WABA observation" link; sample-only rows show "N specimens collected, identification pending" using `host_inat_login` for observer display.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update bee-occurrence-detail.ts — rendering logic and CSS | 53f4514 | frontend/src/bee-occurrence-detail.ts |
| 2 | Add two render tests to bee-sidebar.test.ts | 0842982 | frontend/src/tests/bee-sidebar.test.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. `grep -n "_renderProvisional" bee-occurrence-detail.ts` → lines 229 (definition) and 263 (call in render()) ✓
2. `grep -n "inat-id-label" bee-occurrence-detail.ts` → lines 138 (CSS) and 235 (template) ✓
3. `grep -n "host_inat_login" bee-occurrence-detail.ts` → lines 215 (_renderSampleOnly) and 237 (_renderProvisional) ✓
4. `grep "row.observer" bee-occurrence-detail.ts` → no matches ✓
5. `grep -n "identification pending" bee-occurrence-detail.ts` → lines 210-211 (_renderSampleOnly) and 232 (_renderProvisional fallback) ✓
6. `grep -n "View WABA observation" bee-occurrence-detail.ts` → line 247 ✓
7. `grep -n "SID-01\|SID-02" bee-sidebar.test.ts` → describe block at 233, tests at 272 and 292 ✓
8. `npm test -- --run` → 152 tests passed (150 existing + 2 new) ✓

## Known Stubs

None — provisional and sample-only rendering is fully wired to real OccurrenceRow fields.

## Threat Flags

None — Lit html template literals auto-escape all interpolated values (T-067-02 mitigated by design). WABA observation link points to public iNaturalist observations (T-067-03 accepted).

## Self-Check: PASSED

- frontend/src/bee-occurrence-detail.ts: modified, committed at 53f4514 ✓
- frontend/src/tests/bee-sidebar.test.ts: modified, committed at 0842982 ✓
- Commit 53f4514 exists ✓
- Commit 0842982 exists ✓
