---
phase: 138
slug: frontend-points-detail-card
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 138 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend) + pytest (data pipeline) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run src/tests/url-state.test.ts src/tests/occurrence.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~20s (Vitest); data pytest scoped per-file |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run src/tests/url-state.test.ts src/tests/occurrence.test.ts`
- **After every plan wave:** Run `npm test -- --run` (full Vitest suite)
- **Before `/gsd:verify-work`:** Full Vitest suite green; data count test passing
- **Max feedback latency:** ~20s

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| UIX-02 | `src=checklist` round-trips in URL; `VALID_SOURCES` has 4 entries | unit | `npm test -- --run src/tests/url-state.test.ts` | ✅ (new cases in existing file) | ⬜ pending |
| UIX-02 | "no sources selected" fires when all 4 hidden | unit | `npm test -- --run src/tests/bee-pane.test.ts` | ✅ (threshold update) | ⬜ pending |
| UIX-01 | point GeoJSON carries `source` property for checklist | unit | `npm test -- --run src/tests/features.test.ts` | ❌ W0 | ⬜ pending |
| UIX-03 | `formatRomanDate` handles null / length-4 / length-7 | unit | `npm test -- --run src/tests/bee-occurrence-detail.test.ts` | ❌ W0 | ⬜ pending |
| UIX-04 | `checklist_count` equals deduped count from `int_checklist_dedup_status` | data integration | `cd data && uv run pytest tests/test_species_checklist_count.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/url-state.test.ts` — update for 4-source `VALID_SOURCES`; add `src=checklist` round-trip test
- [ ] `src/tests/bee-occurrence-detail.test.ts` — add `formatRomanDate` null / length-4 / length-7 cases (extend if file exists, else create)
- [ ] `src/tests/features.test.ts` — assert checklist point GeoJSON carries `source` property
- [ ] `data/tests/test_species_checklist_count.py` — assert `checklist_count` in `species.parquet` equals deduped count from `int_checklist_dedup_status`

*(Existing `src/tests/occurrence.test.ts` already tests `checklist:<N>` occId decode — no gap there.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checklist points render in distinct green, cluster with other sources | UIX-01 | Visual paint values + clustering not unit-testable | Run `npm run dev`, zoom in on WA, confirm flat-green unclustered checklist points; zoom out, confirm they join recency-colored clusters |
| Detail card layout (det. annotation, attribution line, collapsed-count line) | UIX-03 | Rendered template appearance | Click a checklist point; confirm `{accepted} (det. as {verbatim})`, collector, Roman-numeral date, locality, "Bartholomew et al. 2024" muted line |
| County-fill layer fully gone from main map | UIX-02 | Visual absence | Confirm no translucent green county polygons remain at any zoom |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
