---
phase: 160
slug: overlap-capable-place-model-many-to-many-membership
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 160 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 160-RESEARCH.md "Validation Architecture". Planner fills the
> per-task map; this is the strategy skeleton.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (data pipeline)** | pytest (`data/tests/`) via `uv run pytest` |
| **Framework (dbt contract)** | `bash data/dbt/run.sh build` (33-col contract enforced; now 32 + new bridge contract) |
| **Framework (frontend)** | Vitest (`npm test`) |
| **Config file** | `data/pyproject.toml` (pytest) · `vitest.config` (frontend) |
| **Quick run command** | `cd data && uv run pytest tests/test_places_validation.py tests/test_places_export.py` |
| **Full suite command** | `cd data && uv run pytest && cd .. && npm test && bash data/dbt/run.sh build` |
| **Estimated runtime** | pytest ~tens of s; npm test ~hundreds of tests; dbt build longer |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (pytest place tests OR `npm test` for frontend tasks)
- **After every plan wave:** Run the full suite (pytest + npm test + dbt build)
- **Before `/gsd-verify-work`:** Full suite + `bash data/dbt/run.sh build` must be green (the dbt contract is the gate)
- **Max feedback latency:** quick < ~30s; full suite is the wave gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | | | none (v5.2) | T-160-?? / — | place-filter SQL stays injection-safe (slug escaped, parameterized/EXISTS) | unit/contract | `…` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Validation Architecture (from research — the behaviors that MUST be proven)

1. **Multi-membership resolves to a SET.** A point inside the overlap of place A
   and place B produces TWO `occurrence_places` rows (occ_id→A, occ_id→B),
   deterministically (stable across builds). Test against a synthetic
   overlapping-places fixture.
2. **Overlap guard removed.** `places_validation.py` accepts a places fixture
   containing two partially-overlapping polygons (previously rejected). The old
   "rejects overlap" assertion is inverted to "loads cleanly". WKT-validity +
   WGS84-bounds + slug + permit checks still reject their bad inputs.
3. **Occurrences contract is 32 cols, bridge contract exists.**
   `bash data/dbt/run.sh build` green: `place_slug` absent from
   `marts/occurrences` contract; new `occurrence_places` mart builds under its
   own contract; `occ_id` join key matches `occIdFromRow` priority.
4. **Counts double-count by membership.** `places_export.py` `_query_counts`:
   an occurrence in A∩B increments BOTH A and B specimen/sample counts
   (`places.json`). Per-place SVG maps include the point for every place it's in.
5. **Frontend filter via membership.** Selecting place A finds an occurrence
   whose membership includes A even if it also belongs to B (wa-sqlite EXISTS
   subquery against the in-`occurrences.db` `occurrence_places` table).
6. **Occurrence detail lists all places (D-04).** Sidebar renders every member
   place name for a multi-place occurrence (reusing `_placeNameBySlug`).

---

## Wave 0 Requirements

- [ ] Overlapping-places test fixture (two partially-overlapping polygons) for
      `data/tests/test_places_validation.py` and an occurrence-in-overlap fixture
      for the bridge/export tests — research flagged fixtures as the main gap.
- [ ] Update `data/tests/test_places_validation.py` overlap case (reject → load).
- [ ] Frontend test for the membership filter rewrite (`filter.ts`).

*Planner: confirm exact fixture files and whether `occurrences.db` test fixtures
(`scripts/make-local-manifest.js`, `scripts/validate-db.mjs` whitelists) need the
`occurrence_places` table added.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar lists multiple place names for a real multi-place occurrence | D-04 | Visual render | Load an occurrence in a known overlap; confirm the detail pane lists both place names |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
