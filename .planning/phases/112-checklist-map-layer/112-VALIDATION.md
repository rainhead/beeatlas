---
phase: 112
slug: checklist-map-layer
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-24
approved: 2026-05-25
---

# Phase 112 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | `vite.config.ts` (`test` key, `environment: 'happy-dom'`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite (`npm test`) green + `npm run typecheck` clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| MAP-01 toggle | 01 | 1 | MAP-01 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-pane.test.ts` | ✅ extend | ✅ green |
| MAP-01 event | 01 | 1 | MAP-01 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-pane.test.ts` | ✅ extend | ✅ green |
| MAP-02 layer | 01 | 1 | MAP-02 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-map.test.ts` | ✅ new | ✅ green |
| MAP-03 filter | 01 | 1 | MAP-03 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-atlas.test.ts` | ✅ extend | ✅ green |
| MAP-04 url-enc | 01 | 1 | MAP-04 | — | N/A | unit | `npm test` → `src/tests/url-state.test.ts` | ✅ extend | ✅ green |
| MAP-04 url-dec | 01 | 1 | MAP-04 | — | N/A | unit | `npm test` → `src/tests/url-state.test.ts` | ✅ extend | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/tests/bee-map.test.ts` — source-text assertions for MAP-02 (`checklist-county-fill` layer ID, `showChecklist` property, `checklistTaxon` property)
- [x] Extend `src/tests/bee-pane.test.ts` with MAP-01 assertions (toggle label text, `checklist-layer-changed` event)
- [x] Extend `src/tests/url-state.test.ts` with MAP-04 cl= round-trip tests
- [x] Extend `src/tests/bee-atlas.test.ts` with MAP-03 assertions (taxon filter propagates to `checklistTaxon`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| County fill visually distinct from specimen dots | MAP-02 | Visual rendering cannot be automated in happy-dom | Toggle checklist layer; confirm green semi-transparent fill on counties, grey specimen dots remain visible on top |
| Counties update on taxon filter change | MAP-03 | Requires live parquet fetch + Mapbox layer update | Apply taxon filter; confirm county fill narrows to counties with matching checklist records |
| URL round-trip on page reload | MAP-04 | Requires browser navigation | Enable checklist, reload page; confirm cl=1 in URL and toggle pre-checked |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** retroactively approved 2026-05-25 (Phase 115)

---

## Historical Note

The `❌ W0` markers in the original VALIDATION.md reflected planning-time state — they indicated tests that did not yet exist at the time the validation plan was authored (2026-05-24). The `wave_0_complete: false` and `nyquist_compliant: false` fields were accurate at planning time.

The Wave 0 RED tests were written during execution across three commits:

- `e099939` — Wave 0 RED tests batch 1 (MAP-01 county fill contract)
- `70ef590` — Wave 0 RED tests batch 2 (MAP-02/03 filter contracts)
- `78c597c` — Wave 0 RED tests batch 3 (MAP-04 click contract)

These three commits produced 21 total RED gate tests, written before the corresponding implementation. The tests then passed after implementation was complete.

Verification was completed via browser UAT (112-UAT.md, 6/6 PASS, 2026-05-24) rather than a formal `/gsd-verify-work` pass. The UAT is the primary verification record for Phase 112. This VALIDATION.md is updated retroactively in Phase 115 (2026-05-25) to reflect the completed state.
