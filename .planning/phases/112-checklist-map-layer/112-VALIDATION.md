---
phase: 112
slug: checklist-map-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
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
| MAP-01 toggle | 01 | 1 | MAP-01 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-pane.test.ts` | ✅ extend | ⬜ pending |
| MAP-01 event | 01 | 1 | MAP-01 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-pane.test.ts` | ✅ extend | ⬜ pending |
| MAP-02 layer | 01 | 1 | MAP-02 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-map.test.ts` | ❌ Wave 0 | ⬜ pending |
| MAP-03 filter | 01 | 1 | MAP-03 | — | N/A | unit (source text) | `npm test` → `src/tests/bee-atlas.test.ts` | ✅ extend | ⬜ pending |
| MAP-04 url-enc | 01 | 1 | MAP-04 | — | N/A | unit | `npm test` → `src/tests/url-state.test.ts` | ✅ extend | ⬜ pending |
| MAP-04 url-dec | 01 | 1 | MAP-04 | — | N/A | unit | `npm test` → `src/tests/url-state.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/bee-map.test.ts` — source-text assertions for MAP-02 (`checklist-county-fill` layer ID, `showChecklist` property, `checklistTaxon` property)
- [ ] Extend `src/tests/bee-pane.test.ts` with MAP-01 assertions (toggle label text, `checklist-layer-changed` event)
- [ ] Extend `src/tests/url-state.test.ts` with MAP-04 cl= round-trip tests
- [ ] Extend `src/tests/bee-atlas.test.ts` with MAP-03 assertions (taxon filter propagates to `checklistTaxon`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| County fill visually distinct from specimen dots | MAP-02 | Visual rendering cannot be automated in happy-dom | Toggle checklist layer; confirm green semi-transparent fill on counties, grey specimen dots remain visible on top |
| Counties update on taxon filter change | MAP-03 | Requires live parquet fetch + Mapbox layer update | Apply taxon filter; confirm county fill narrows to counties with matching checklist records |
| URL round-trip on page reload | MAP-04 | Requires browser navigation | Enable checklist, reload page; confirm cl=1 in URL and toggle pre-checked |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
