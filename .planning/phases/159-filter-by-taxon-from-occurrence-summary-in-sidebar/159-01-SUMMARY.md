---
phase: 159-filter-by-taxon-from-occurrence-summary-in-sidebar
plan: 01
subsystem: frontend
tags: [filter, taxon, occurrence-detail, bee-pane, lit, typescript, tdd]
dependency_graph:
  requires: []
  provides:
    - BeeOccurrenceDetail.filterState property (FilterState | null)
    - BeeOccurrenceDetail._onTaxonClick dispatch method
    - .taxon-filter-link CSS class on bee-occurrence-detail
    - filterState threading in bee-pane <bee-occurrence-detail> template
  affects:
    - src/bee-occurrence-detail.ts
    - src/bee-pane.ts
tech_stack:
  added: []
  patterns:
    - source-text Vitest assertions (readFileSync + expect(src).toMatch)
    - composed:true CustomEvent bubbling through shadow DOM chain
    - @property({ attribute: false }) for Set-containing FilterState
key_files:
  created: []
  modified:
    - src/bee-occurrence-detail.ts
    - src/bee-pane.ts
    - src/tests/bee-occurrence-detail.test.ts
    - src/tests/bee-pane.test.ts
decisions:
  - noUnusedLocals strictness required combining TDD Tasks 2+3 into a single commit
  - D-05 test regex updated from /taxonId[^,\n]*taxon_id/ to /_onTaxonClick\(row\.taxon_id/ to match call-site dispatch pattern rather than detail shorthand
metrics:
  duration: ~15 minutes
  completed: 2026-06-22
  tasks_completed: 3
  files_modified: 4
---

# Phase 159 Plan 01: Filter by Taxon from Occurrence Summary in Sidebar Summary

**One-liner:** One-click taxon filter affordance in bee-occurrence-detail using composed CustomEvent dispatch with dimension-preserving FilterChangedEvent, demoting Ecdysis to icon link.

## What Was Built

Added a new taxon-filter entry point inside the sidebar occurrence list
(`src/bee-occurrence-detail.ts`). Clicking a taxon name now applies the
existing taxon filter to the map, saving the filter-panel round-trip. The
external record link (Ecdysis `<a>`) that previously wrapped the taxon name
in `_renderCollectorGroup` is demoted to a small icon link (`🔗` with
`aria-label="View on Ecdysis"`), following the existing `📷` icon-link
pattern. All other render paths (`_renderInatObs`, `_renderProvisional`,
`_renderChecklist`) received additive filter affordances on taxon names.

### New Symbols

- `BeeOccurrenceDetail.filterState: FilterState | null` — new `@property({
  attribute: false })` threaded from `bee-pane`.
- `BeeOccurrenceDetail._onTaxonClick(taxonId: number, displayName: string)`
  — dispatches `CustomEvent<FilterChangedEvent>('filter-changed', { bubbles:
  true, composed: true })` with dimension-preserving detail (D-07); does NOT
  include `bounds` (bee-atlas preserves it in `_onFilterChanged`).
- `.taxon-filter-link` CSS class — cursor:pointer + dotted underline that
  becomes solid on hover/focus; reuses existing component look without
  introducing a new chip/UI pattern.
- `.filterState=${this.filterState}` binding on `<bee-occurrence-detail>` in
  `bee-pane.ts:1232`.

### Render Path Coverage (D-03)

| Path | Change type | Taxon null branch (D-04) |
|------|-------------|--------------------------|
| `_renderCollectorGroup` | Demotion — Ecdysis link demoted to 🔗 icon; name→filter span | No determination → plain span, icon still present |
| `_renderInatObs` | Additive — taxon name wrapped in filter span | identification unknown → hint span (no affordance) |
| `_renderProvisional` | Additive — taxon name wrapped in filter span | identification pending → hint span (no affordance) |
| `_renderChecklist` | Additive — accepted branches only; verbatim-only and no-determination unchanged | verbatim-only/No determination → plain em/span (no affordance) |
| `_renderSampleOnly` | No change (no taxon present) | N/A |

## Tests

Appended `describe('bee-occurrence-detail.ts source structure', ...)` to
`src/tests/bee-occurrence-detail.test.ts` with 7 source-text assertions
covering: `filterState` property, `filter-changed` dispatch, `bubbles/composed`,
`row.taxon_id` call-site (D-05), `filterState` dimension preservation (D-07),
`_renderSampleOnly` exclusion (D-04), Ecdysis link demotion (D-02). One new
assertion added to `bee-pane.test.ts` for `filterState` threading.

Final test result: 836/836 pass. `npx tsc --noEmit` clean.

## Deviations from Plan

### Auto-combined Task 2 + Task 3 (Rule 3 — blocking issue)

- **Found during:** Task 2 implementation
- **Issue:** `noUnusedLocals: true` in tsconfig.json caused `npx tsc --noEmit`
  to fail with "TS6133: '_onTaxonClick' is declared but its value is never
  read." when the dispatch method was added without the markup call sites.
  Task 2's acceptance criterion required a clean type-check, which was
  impossible without at least one call site in Task 3.
- **Fix:** Combined Tasks 2 and 3 into a single GREEN commit. The TDD RED
  commit (Task 1) remains separate as intended.
- **Files modified:** no additional files beyond plan scope
- **Commit:** 2d158082

### D-05 test regex updated

- **Found during:** Task 2+3 integration run
- **Issue:** PLAN.md specified the regex `/taxonId[^,\n]*taxon_id/` to verify
  D-05 (exact taxon_id, no roll-up). The implementation uses a method parameter
  named `taxonId` and shorthand property syntax in the detail (`taxonId,`), so
  the regex didn't match. The actual source pattern that proves D-05 is the
  call-site: `this._onTaxonClick(row.taxon_id!, ...)`.
- **Fix:** Updated the test regex to `/_onTaxonClick\(row\.taxon_id/` which
  more directly verifies D-05 (the raw `row.taxon_id` is passed as the `taxonId`
  argument, not a rolled-up species ID).
- **Files modified:** src/tests/bee-occurrence-detail.test.ts
- **Commit:** 2d158082

## Known Stubs

None.

## Threat Flags

None — this plan adds no new attack surface. The `taxon_id` value flows from
the already-loaded occurrence dataset (trusted) through the existing integer
`taxonId` filter path unchanged. No network calls, no auth, no persisted
user input.

## TDD Gate Compliance

- RED gate: `test(159-01): add failing source-text tests...` (0c9131ef)
- GREEN gate: `feat(159-01): thread filterState + _onTaxonClick + taxon filter markup...` (2d158082)
- REFACTOR gate: not needed — implementation was clean on first pass.

## Self-Check: PASSED

Files exist:
- FOUND: src/bee-occurrence-detail.ts (modified)
- FOUND: src/bee-pane.ts (modified)
- FOUND: src/tests/bee-occurrence-detail.test.ts (modified)
- FOUND: src/tests/bee-pane.test.ts (modified)

Commits exist:
- FOUND: 0c9131ef (RED test scaffold)
- FOUND: 2d158082 (GREEN implementation)
