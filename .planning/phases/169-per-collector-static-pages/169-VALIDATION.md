---
phase: 169
slug: per-collector-static-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 169 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | vite.config.ts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–20 seconds |

Data-side export logic is verified via the Python pipeline (`cd data && uv run pytest`)
where `collectors_export.py` gets a golden-fixture test mirroring the places export tests.

---

## Sampling Rate

- **After every task commit:** Run `npm test` (and `cd data && uv run pytest` for export-step tasks)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite green + visual UAT of one collector page
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 169-01-xx | 01 | 1 | PAGE-01 | — / — | collectors.json is an array, length ≥ 100, each record has login/display_name/specimen_count/sample_count/species_count/status fields | unit | `npm test src/tests/data-collectors.test.ts` | ❌ W0 | ⬜ pending |
| 169-01-xx | 01 | 1 | PAGE-01 | — / — | `_data/collectors.js` reads collectors.json only (never parquet — Pitfall #8) | unit | same | ❌ W0 | ⬜ pending |
| 169-01-xx | 01 | 1 | — | — / — | `collectors_export.py` gate = `collector_inat_login IS NOT NULL AND (ecdysis_id IS NOT NULL OR source IN ('waba_specimen','waba_sample'))`; ~124 records | unit (pytest) | `cd data && uv run pytest -k collectors_export` | ❌ W0 | ⬜ pending |
| 169-02-xx | 02 | 2 | PAGE-02 | — / — | headline stats present and numeric (specimen/sample/species counts) per record | unit | `npm test src/tests/data-collectors.test.ts` | ❌ W0 | ⬜ pending |
| 169-02-xx | 02 | 2 | PAGE-03 | — / — | `status_identified + status_awaiting == status_denominator` for every record (invariant) | unit | same | ❌ W0 | ⬜ pending |
| 169-02-xx | 02 | 2 | PAGE-04 | — / — | rendered `/collectors/{login}/` contains a `?collectors=` deep-link | build | `npm run build` then `grep -rl "collectors=" _site/collectors/` | ❌ post-build | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/data-collectors.test.ts` — covers PAGE-01, PAGE-02, PAGE-03 (mirror `src/tests/data-places.test.ts`). Includes the D-09 page-count floor (`length ≥ 100`) and the PAGE-03 split invariant.
- [ ] `public/data/collectors.json` — produced by `collectors_export.py`; must be committed so `npm test` and `npm run build` pass on a clean checkout without running the full pipeline (same convention as `places.json`).
- [ ] `data/tests/` golden-fixture test for `collectors_export.py` (mirror the places export test) — asserts the gate predicate and the sample-count formula (samples counted via `sample_id` OR `observation_id` for `waba_sample` rows whose `sample_id` is null — research finding #3).

*Existing Vitest + pytest infrastructure covers all phase requirements; no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Collector page renders correctly (H1 = human name w/ @login fallback; stats; status split copy) | PAGE-01..03 | Visual layout not asserted by unit tests | `npm run dev`, visit `/collectors/{a-known-login}/`, confirm name, counts, "N identified, N awaiting ID" |
| Map deep-link applies the collector filter | PAGE-04 | Requires live map + client filter round-trip | From a collector page, click "View on map", confirm the map filters to that collector's records (FilterState.selectedCollectors populated from `?collectors=`) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
