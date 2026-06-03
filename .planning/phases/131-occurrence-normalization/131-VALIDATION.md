---
phase: 131
slug: occurrence-normalization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 131 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (happy-dom environment) |
| **Config file** | `vite.config.ts` (`test:` section) |
| **Quick run command** | `npm test` (`vitest run`) |
| **Full suite command** | `npm test && npm run typecheck` |
| **Estimated runtime** | ~15 seconds (vitest); dbt build ~2–3 min |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd:verify-work`:** `npm test && npm run typecheck && bash data/dbt/run.sh build` must all be green / exit 0
- **Max feedback latency:** ~15 seconds (vitest); dbt gate run once per wave/phase

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (dbt) | — | — | NORM-01 | — | N/A | integration | `bash data/dbt/run.sh build` | ✅ (dbt contract) | ⬜ pending |
| (cols) | — | — | NORM-01 | — | N/A | unit | `npm test -- --grep "OCCURRENCE_COLUMNS"` | ✅ `filter.test.ts` (update) | ⬜ pending |
| (types) | — | — | NORM-01 | — | N/A | typecheck | `npm run typecheck` | ✅ (tsc --noEmit) | ⬜ pending |
| (size) | — | — | NORM-02 | — | N/A | manual | See Measurement Procedure (RESEARCH.md) | ❌ → VERIFICATION.md | ⬜ pending |
| (geo) | — | — | NORM-03 | — | N/A | unit | `npm test -- --grep "_buildGeoJSONFromRaw"` | ✅ `build-geojson.test.ts` (rewrite) | ⬜ pending |
| (join) | — | — | NORM-03 | — | N/A | unit | `npm test -- --grep "queryTablePage"` | ✅ `filter.test.ts` (new test) | ⬜ pending |
| (table) | — | — | NORM-03 | — | N/A | unit | `npm test -- --grep "bee-table"` | ✅ `bee-table.test.ts` (fixture) | ⬜ pending |
| (audit) | — | — | NORM-03 | — | N/A | audit | `grep -rn "scientificName\|specimen_inat_taxon_name" src/ --include="*.ts" \| grep -v test` returns no live readers | ❌ W0 script | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Concrete Task IDs assigned by the planner.*

---

## Wave 0 Requirements

- [ ] `src/tests/build-geojson.test.ts` — full rewrite for the 7-field geo_blob layout (`[lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, source]`) and the `{ geojson }`-only return shape (currently tests the removed 10-field layout and `summary`/`taxaOptions`)
- [ ] `filter.test.ts` — new assertion that `queryTablePage`/`queryListPage` SQL contains the `LEFT JOIN` on `taxa` and selects `display_name`
- [ ] `filter.test.ts:256` — update `expect(OCCURRENCE_COLUMNS).toContain('scientificName')` (and sibling dropped-column assertions) to the slimmer row shape
- [ ] grep-audit script asserting no live `src/` readers of the dropped column names remain

*Existing Vitest infrastructure covers all unit/integration needs — no framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `occurrences.db` byte size + gzipped transfer weight measurably smaller than pre-change baseline | NORM-02 | One-time before/after measurement; nightly pipeline is Python/dbt with no browser | Capture baseline `occurrences.db` size + `gzip -c` size before the change; re-measure after; record both in VERIFICATION.md (see RESEARCH.md Measurement Procedure) |
| `tablesReady` timing does not regress from ~250 ms v4.3 baseline | NORM-02 | Browser console benchmark (`features.ts`/`sqlite.ts`); no headless harness in pipeline | Load the built site in-browser, read the `tablesReady` console timing, confirm ≤ ~250 ms baseline; record in VERIFICATION.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (vitest path)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
