---
phase: 165
slug: duplicate-occurrence-rows-shared-occ-id
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 165 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (dbt)** | dbt-core 1.10.1 / dbt-duckdb 1.10.1 via `bash data/dbt/run.sh build` |
| **Framework (Python)** | pytest via `uv run pytest` in `data/` |
| **Framework (frontend)** | Vitest 4.1.8 via `npm test` |
| **Config file** | `data/dbt/`, `data/pyproject.toml`, `vitest.config.ts` |
| **Quick run command** | `bash data/dbt/run.sh build --select int_combined+ int_provisional_waba_ids int_waba_link int_matched_waba_ids` |
| **Full suite command** | `bash data/dbt/run.sh build && cd data && uv run pytest -x && cd .. && npm test` |
| **Estimated runtime** | dbt ~60s; pytest fast tier <5min; vitest ~30s |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (dbt build for data tasks, `npm test` for frontend tasks)
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green (dbt build + pytest + vitest)
- **Max feedback latency:** ~60s for the dbt quick run; ~30s for vitest

---

## Per-Task Verification Map

| Task | Wave | Decision | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|----------|-----------------|-----------|-------------------|-------------|--------|
| occ_id uniqueness guard (plan 165-01) | 1 | D-09 | N/A | dbt singular test | `bash data/dbt/run.sh test --select test_no_duplicate_occ_ids` | ❌ W0 | ⬜ pending |
| category-3 `inat:N` vitest case (plan 165-01) | 1 | D-11 | N/A | vitest unit | `npm test -- src/tests/occurrence.test.ts` | ✅ | ⬜ pending |
| `int_waba_link` MIN() removal (plan 165-02) | 2 | D-05 | N/A | dbt build + query 320276469 matched | `bash data/dbt/run.sh build --select int_waba_link+ && duckdb data/beeatlas.duckdb -c "SELECT * FROM dbt_sandbox.int_matched_waba_ids WHERE waba_obs_id=320276469"` | ✅ | ⬜ pending |
| Category-3 provisional arm, project 166376 anti-join (plan 165-02) | 2 | D-03/D-11 | N/A | dbt build + row assertion (~28 mappable) | `bash data/dbt/run.sh build --select int_combined` | ✅ | ⬜ pending |
| Category-2 `waba_specimen` arm — the 33 (plan 165-02) | 2 | D-10/D-12 | N/A | dbt build + assert 33 rows source='waba_specimen', is_provisional=FALSE | `bash data/dbt/run.sh build --select int_combined` | ✅ | ⬜ pending |
| No duplicate occ_ids after correction, Shapes A+B gone (plan 165-02) | 2 | D-01 | N/A | dbt singular test returns only Shape C (warn) | `bash data/dbt/run.sh test --select test_no_duplicate_occ_ids` | ❌ W0 | ⬜ pending |
| `marts/occurrences` 36-col contract still passes (plan 165-02) | 2 | — | N/A | dbt contract | `bash data/dbt/run.sh build` | ✅ | ⬜ pending |
| `waba_specimen` in SourceKey/VALID_SOURCES + toggle (plan 165-03) | 3 | D-13 | N/A | vitest unit (url-state round-trip, filter) | `npm test` | ✅/❌ | ⬜ pending |
| `occIdFromRow` priority unchanged (plan 165-03) | 3 | D-06 | N/A | vitest unit | `npm test -- src/tests/occurrence.test.ts` | ✅ | ⬜ pending |
| `docs/domain-model.md` exists + linked from CLAUDE.md (plan 165-04) | 3 | D-07 | N/A | grep | `test -f docs/domain-model.md && grep -q domain-model.md CLAUDE.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/dbt/tests/test_no_duplicate_occ_ids.sql` — D-09 uniqueness guard (singular test, `severity: warn` initially so Shape C OFV fan-out doesn't block the build). Created before the model edits so it can witness Shapes A+B disappearing.
- [ ] Add/extend `src/tests/occurrence.test.ts` — a case for a provisional sample row WITH `observation_id` set (new category 3 → `inat:N`), distinct from the existing `provisionalRow()` (observation_id null → null). Existing `occIdFromRow` priority cases remain valid.

*Existing dbt + vitest infrastructure covers everything else.*

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| `waba_specimen` source toggle visibly shows/hides the 33 specimen points; existing `waba_sample` toggle now controls provisional samples | D-13 | Map render + canvas interaction not unit-testable | Headless UAT via `o=<ids>&pane=list` + Playwright per `project_uat_playwright_sidebar`, or operator UAT toggling sources in `/app` |
| New `waba_specimen` badge/label reads correctly in occurrence detail | D-13 | Visual | Open an occurrence-detail for one of the 33 (e.g. via `o=inat_obs:<id>`) and confirm badge |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the new dbt test + occurrence.test.ts case
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (dbt quick run)
- [ ] `nyquist_compliant: true` set in frontmatter (planner/verifier)

**Approval:** pending
