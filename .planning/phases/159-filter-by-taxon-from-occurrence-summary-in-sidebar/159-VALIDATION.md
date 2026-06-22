---
phase: 159
slug: filter-by-taxon-from-occurrence-summary-in-sidebar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 159 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (`environment: 'happy-dom'`) |
| **Config file** | `vite.config.ts` (`test` section) |
| **Quick run command** | `npm test` (`vitest run`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~existing suite (828 tests, fast) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** under a minute (whole suite)

---

## Per-Task Verification Map

| Behavior (CONTEXT decision) | Test Type | Automated Command | Status |
|------------------------------|-----------|-------------------|--------|
| D-01/D-02 — taxon name dispatches `filter-changed`; external record demoted to icon link | source-text (`bee-occurrence-detail.test.ts`) | `npm test` | ⬜ pending |
| D-03 — all changed render paths handle the affordance (`_renderCollectorGroup`, `_renderInatObs`, `_renderProvisional`, `_renderChecklist`) | source-text | `npm test` | ⬜ pending |
| D-04 — no filter affordance / no taxon link on "No determination" (null `taxon_id`) | source-text | `npm test` | ⬜ pending |
| D-05 — filter emits exact `row.taxon_id` (no species roll-up) | source-text | `npm test` | ⬜ pending |
| D-07 — emitted detail preserves non-taxon dimensions via `{...this.filterState}` spread | source-text | `npm test` | ⬜ pending |
| Event chain — occurrence-detail → bee-pane → bee-atlas (`bubbles:true, composed:true`) | source-text | `npm test` | ⬜ pending |
| D-08 — selection-clear behavior unchanged (no NEW clearing added; existing filter-change clear is shared) | no new test — existing behavior preserved | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/bee-occurrence-detail.test.ts` — expand beyond `formatRomanDate`; add source-text assertions for `filterState` property, `filter-changed` dispatch, `bubbles/composed` flags, `taxonId: row.taxon_id`, and dimension-preserving spread (per RESEARCH §Wave 0 Gaps).

*Existing Vitest infrastructure covers the framework; only new test cases are needed.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Clicking a taxon name in the sidebar list actually filters the map and the external icon still opens Ecdysis/iNat | Visual/interaction not covered by source-text assertions | Run `npm run dev`, click a point, click a taxon name in the occurrence list → map filters to that taxon, chip appears; click the external icon → opens the correct Ecdysis/iNat page |
| Repurposed name vs demoted icon reads as actionable, no new UI pattern introduced | Subjective visual judgment (operator UAT) | Confirm during `/gsd-verify-work` |

---

## Validation Sign-Off

- [ ] All behaviors have `npm test` source-text verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the new `bee-occurrence-detail.test.ts` cases
- [ ] No watch-mode flags (`vitest run`, not `vitest`)
- [ ] `nyquist_compliant: true` set in frontmatter once met

**Approval:** pending
