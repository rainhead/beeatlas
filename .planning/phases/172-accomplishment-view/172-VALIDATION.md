---
phase: 172
slug: accomplishment-view
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-28
---

# Phase 172 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data pipeline) + vitest (frontend) |
| **Config file** | `data/pyproject.toml` (pytest), `vitest.config.ts` |
| **Quick run command** | `cd data && uv run pytest -m "not integration" -q` / `npm test` |
| **Full suite command** | `npm test && cd data && uv run pytest -m "not integration"` |
| **Estimated runtime** | ~60–120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (`npm test` for frontend tasks; `cd data && uv run pytest -m "not integration"` for export/SVG tasks)
- **After every plan wave:** Run the full suite (both `npm test` AND pytest — per `feedback_run_tests_before_push`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 172-01-01 | 01 | 0 | ACCOM-01..04 | — / — | N/A | unit | `npm test` | ❌ W0 (extend fixture + data-collectors.test.ts) | ⬜ pending |
| 172-01-02 | 01 | 0 | ACCOM-01,03 | — / — | N/A | unit | `cd data && uv run pytest -m "not integration"` | ❌ W0 (SVG golden-shape test, mirror test_species_maps.py) | ⬜ pending |
| 172-02-01 | 02 | 1 | ACCOM-02,04 | — / — | N/A | unit | `cd data && uv run pytest -m "not integration"` | ✅ (collectors_export aggregations: active_since/seasons_count/county_count/ecoregion_count/species_by_genus) | ⬜ pending |
| 172-02-02 | 02 | 1 | ACCOM-01,03 | — / — | N/A | unit | `cd data && uv run pytest -m "not integration"` | ✅ (collector_maps.py binary-fill county + ecoregion SVG generation) | ⬜ pending |
| 172-03-01 | 03 | 2 | ACCOM-01..04 | — / — | N/A | integration | `npm test` (data-collectors floor) + build-mode page render | ✅ (collector-detail.njk: two maps, grouped species list, seasons badge, eco caption) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are indicative — the planner finalizes plan/wave decomposition.*

---

## Wave 0 Requirements

- [ ] Extend `src/tests/fixtures/collectors.fixture.json` with `active_since`, `seasons_count`, `county_count`, `ecoregion_count`, `species_by_genus` (Phase 172 shape) — coordinated with Phase 171.1 fixture.
- [ ] Extend `src/tests/data-collectors.test.ts` to assert the new fields' shape/types.
- [ ] New `data/tests/test_collector_maps.py` — golden-shape SVG assertions (binary county + ecoregion fill), mirroring `data/tests/test_species_maps.py`.
- [ ] Extend the existing `collectors_export` golden-fixture pytest with the new aggregation columns.

*Existing pytest + vitest infrastructure covers everything else — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual correctness of the two coverage SVGs + badge/list layout on a real collector page | ACCOM-01..04 | Visual/UX judgement; phase carries **UI hint: yes** | Operator UAT: build the site, open a known multi-county collector page (e.g. a prolific WABA collector), confirm filled counties match their records, the ecoregion map + count read correctly, the genus-grouped species list links to `/species/{slug}/`, and the "Active since YYYY (N seasons)" badge is accurate. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
