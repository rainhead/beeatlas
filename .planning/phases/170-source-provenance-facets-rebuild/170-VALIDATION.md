---
phase: 170
slug: source-provenance-facets-rebuild
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 170 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend), pytest (data) |
| **Config file** | `vitest.config.*` / `package.json`; `data/` via `uv run pytest` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npx tsc --noEmit` + `bash data/dbt/run.sh build` + `cd data && uv run pytest` |
| **Estimated runtime** | ~30–90 seconds (frontend); dbt build minutes |

---

## Sampling Rate

- **After every task commit:** `npm test` (frontend tasks); `bash data/dbt/run.sh build` (data tasks).
- **After every plan wave:** Wave A (data) → `bash data/dbt/run.sh build` + `cd data && uv run pytest`. Wave B (frontend) → `npm test && npx tsc --noEmit`.
- **Before `/gsd-verify-work`:** Full suite green AND the one-time data nightly published to S3 AND the frontend deploy green.
- **Max feedback latency:** ~90 seconds (frontend quick run).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 170-A-* | A | 1 | PROV-01 | — | N/A (static data pipeline) | contract | `bash data/dbt/run.sh build` | ✅ schema.yml | ⬜ pending |
| 170-A-* | A | 1 | PROV-01 | — | N/A | diff | `cd data && uv run pytest` | ✅ test_dbt_diff.py | ⬜ pending |
| 170-B-* | B | 2 | PROV-01/02 | — | N/A | unit | `npm test src/tests/filter.test.ts` | ✅ (update) | ⬜ pending |
| 170-B-* | B | 2 | PROV-02 | — | N/A | unit | `npm test src/tests/url-state.test.ts` | ✅ (update fixtures) | ⬜ pending |
| 170-B-* | B | 2 | PROV-03 | — | N/A | unit | `npm test src/tests/occurrence.test.ts` | ❌ W0 (add coupling test) | ⬜ pending |
| 170-B-* | B | 2 | PROV-01/02 | — | N/A | typecheck | `npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New PROV-03 occ_id-coupling assertion in `src/tests/occurrence.test.ts` — parses the CASE prefix order out of `OCC_ID_SQL_CASE` (`filter.ts`) and `occurrence_places.sql` and asserts equality with `occIdFromRow`'s order.
- [ ] Existing fixtures updated `source` → `tier`/`record_type` in `src/tests/url-state.test.ts`, `filter.test.ts`, `build-geojson.test.ts`, `bee-pane.test.ts`.

*No framework install needed — Vitest + pytest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tier filter visually splits Atlas vs Other on map; Atlas keeps recency gradient, Other muted | PROV-02 | Visual symbology (D-08) not asserted by unit tests | Load `/`, toggle the two tier checkboxes; confirm Atlas points recency-colored, Other muted, no green checklist |
| Legacy `?src=ecdysis,waba_sample` link still restores correct visible set | PROV-02 | Back-compat round-trip across reload | Open a legacy `src=` URL; confirm the map shows the mapped Atlas/Other tiers |

*Unit fixtures cover the `src=`→`tier=` parse; the manual check confirms end-to-end restore.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (PROV-03 coupling test)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
