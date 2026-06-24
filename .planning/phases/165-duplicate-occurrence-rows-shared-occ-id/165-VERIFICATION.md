---
phase: 165-duplicate-occurrence-rows-shared-occ-id
verified: 2026-06-24T22:10:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Toggle 'WABA specimens' on/off in /app sidebar and confirm the ~33 specimen points appear/disappear on the map"
    expected: "The waba_specimen source toggle shows 33 specimen pins; toggling off removes them; toggling on restores them"
    why_human: "Map render + canvas interaction not unit-testable; Playwright-MCP with o=<ids>&pane=list can verify the list side, but visible pin count requires canvas inspection"
  - test: "Toggle 'Provisional samples' and confirm the ~28 provisional sample points appear/disappear"
    expected: "The corrected waba_sample toggle controls the project-166376 plant-observation records; all 28 should appear/disappear"
    why_human: "Map render; same canvas constraint as above"
  - test: "Open an occurrence-detail for one of the 33 waba_specimen rows (e.g. via o=inat_obs:<id>&pane=list) and confirm the badge and iNat link render correctly"
    expected: "'Awaiting Ecdysis catalogue entry' hint visible; 'View on iNaturalist' link points to real iNaturalist obs URL; bee taxon name shown"
    why_human: "Visual rendering; the _renderWabaSpecimen method is code-verified but the end-to-end appearance (badge copy, link validity) requires manual inspection"
  - test: "Open an occurrence-detail for a waba_sample (provisional) row and confirm the iNat link works"
    expected: "WR-01 fix: link reads 'View WABA observation' and points to https://www.inaturalist.org/observations/<observation_id> (the plant obs), NOT /observations/null"
    why_human: "WR-01 code fix is verified in source, but the live link target validity (plant obs actually exists at that URL) requires a browser check"
---

# Phase 165: Duplicate Occurrence Rows (Shared occ_id) — Verification Report

**Phase Goal:** Eliminate duplicate `marts/occurrences` rows sharing a synthetic `occ_id` across `int_combined` source arms by correcting the data model (not display dedup). Deliver: (1) `docs/domain-model.md`; (2) corrected five-category `int_combined`; (3) fix the `int_waba_link` MIN() shadowing; (4) dbt occ_id-uniqueness regression test; (5) frontend `waba_specimen` source taxonomy.
**Verified:** 2026-06-24T22:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No occ_id collisions in int_combined except Shape-C (ecdysis:6317352/6317353) — Shapes A and B gone | VERIFIED | DuckDB query returns exactly 2 rows: `ecdysis:6317352` and `ecdysis:6317353`. `inat_obs:320276469` (Shape A) and `inat:351027987` (Shape B) absent |
| 2 | obs 320276469 no longer collides on occ_id (Shape A eliminated) | VERIFIED | Only one row with `specimen_observation_id=320276469` exists in `int_combined`: `source='inat_obs'`. The old provisional ARM 2 collision is gone. The obs appears as `inat_obs` (it is a research-grade expert observation); the ecdysis record 6307712 links via obs 320276018 instead. Note: plan said "resolves to ecdysis:" but the actual resolution is "appears as inat_obs with no duplicate" — Shape A collision eliminated |
| 3 | waba_sample: 28 rows, is_provisional=TRUE, zero rows with specimen_observation_id NOT NULL (D-11) | VERIFIED | DuckDB: `waba_sample` rows=28, `specimens_in_waba_sample`=0, `provisional_true`=28 |
| 4 | waba_specimen: 33 rows, is_provisional=FALSE, all with specimen_observation_id set | VERIFIED | DuckDB: `waba_specimen_rows`=33, `provisional_true`=0, `have_spec_obs_id`=33 |
| 5 | CR-01 fix: waba_specimen arm (ARM 3) anti-joins against inat_obs_data.observations to prevent structural occ_id collision | VERIFIED | `int_combined.sql` line 202: `AND sob.waba_obs_id NOT IN (SELECT obs_id FROM {{ source('inat_obs_data', 'observations') }})` — commit `e71bfcad` |
| 6 | WR-01 fix: provisional card iNat link uses observation_id not specimen_observation_id | VERIFIED | `bee-occurrence-detail.ts` `_renderProvisional` line 343: `href="...${row.observation_id}"` with null-guard — commit `2920c651` |
| 7 | dbt occ_id uniqueness test exists, severity:warn, CASE mirrors occurrence_places.sql priority | VERIFIED | `data/dbt/tests/test_no_duplicate_occ_ids.sql`: `{{ config(severity='warn') }}`, CASE expression matches ecdysis→inat→inat_obs→checklist order. dbt build: WARN=2 (Shape C only), ERROR=0 |
| 8 | bash data/dbt/run.sh build passes (36-col contract intact) | VERIFIED | PASS=90 WARN=2 ERROR=0. Warnings are test_lin05_lineage_coverage (pre-existing) and test_no_duplicate_occ_ids (Shape C) |
| 9 | npm test (865) and npx tsc --noEmit pass | VERIFIED | 865 tests passed, 0 failed. tsc exits 0 with no output |
| 10 | waba_specimen present in SourceKey/VALID_SOURCES in url-state.ts and filter.ts; 5th source toggle in bee-pane.ts; _renderWabaSpecimen in bee-occurrence-detail.ts; OCC_ID_SQL_CASE/occIdFromRow UNCHANGED | VERIFIED | grep confirmed: url-state.ts (2 occurrences: SourceKey union + VALID_SOURCES Set), filter.ts (2: OccurrenceRow.source + VALID_SOURCES array), bee-pane.ts (2: toggle entry + size===5 all-off guard), bee-occurrence-detail.ts (3: method def + dispatch + method call). OCC_ID_SQL_CASE at filter.ts:108-114 unchanged; occurrence_places.sql CASE at lines 44-47 unchanged |
| 11 | docs/domain-model.md exists (>=60 lines, covers 5 categories, corrected is_provisional, occ_id vocabulary, pipeline-lag) and is linked from CLAUDE.md Domain Vocabulary section | VERIFIED | File exists at 157 lines. Contains: `166376`, `waba_specimen`, `is_provisional`, `occIdFromRow`, `inat_obs:`, `ecdysis:`. Link at CLAUDE.md line 19, within Domain Vocabulary section (confirmed via awk section check) |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/dbt/tests/test_no_duplicate_occ_ids.sql` | D-09 occ_id uniqueness guard, severity:warn | VERIFIED | Exists; `{{ config(severity='warn') }}`; `ref('int_combined')`; CASE mirrors occurrence_places.sql; warns on 2 Shape-C rows |
| `data/dbt/models/intermediate/int_waba_link.sql` | 1:N catalog-match, MIN() removed | VERIFIED | No `MIN(` in body; comment confirms removal; returns all waba_obs per catalog_suffix |
| `data/dbt/models/intermediate/int_provisional_waba_ids.sql` | project-166376 membership anti-join int_samples_base | VERIFIED | Full replacement: `project_id = 166376` JOIN with anti-join `NOT IN (SELECT observation_id FROM int_samples_base)` |
| `data/dbt/models/intermediate/int_combined.sql` | 5-arm UNION ALL: ecdysis/waba_sample/waba_specimen/inat_obs/checklist | VERIFIED | ARM 2=waba_sample (project members, provisional), ARM 3=waba_specimen (33 specimens, CR-01 anti-join present), ARM 4=inat_obs, ARM 5=checklist |
| `data/dbt/models/intermediate/int_ecdysis_base.sql` | Fan-out guard on waba_link consumer (MIN subquery) | VERIFIED | Lines 38-41: `SELECT catalog_suffix, MIN(specimen_observation_id) AS specimen_observation_id` subquery; 0 fanned-out ecdysis rows confirmed by DuckDB |
| `src/url-state.ts` | waba_specimen in SourceKey union + VALID_SOURCES | VERIFIED | Line 31: SourceKey union; line 33: VALID_SOURCES Set — both include 'waba_specimen' adjacent to 'waba_sample' |
| `src/filter.ts` | waba_specimen in OccurrenceRow.source + VALID_SOURCES array | VERIFIED | Line 76: OccurrenceRow.source union; line 398: VALID_SOURCES array — both include 'waba_specimen' |
| `src/bee-pane.ts` | 5th source toggle for waba_specimen; waba_sample copy corrected; all-off guard ===5 | VERIFIED | 5 entries in layers array; waba_sample label='Provisional samples'; line 1239: `size === 5` |
| `src/bee-occurrence-detail.ts` | _renderWabaSpecimen branch; dispatch before inat_obs; WR-01 fix in _renderProvisional | VERIFIED | `_renderWabaSpecimen` at line 352; dispatch at line 470 (waba_specimen before inat_obs); _renderProvisional uses observation_id at line 343 |
| `docs/domain-model.md` | Human-first 5-category doc, >=60 lines | VERIFIED | 157 lines; all 5 categories with source/is_provisional/occ_id/real-world thing; corrected is_provisional; positional coupling section; Shape C and pipeline-lag documented |
| `CLAUDE.md` | Link to docs/domain-model.md in Domain Vocabulary section | VERIFIED | Line 19, between "Collection event" definition and "## Architecture Invariants" |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/dbt/tests/test_no_duplicate_occ_ids.sql` | `int_combined` | `ref('int_combined')` in CTE | VERIFIED | Present in SQL |
| `int_provisional_waba_ids.sql` | `inaturalist_data.observations__observation_projects` | `JOIN ... project_id=166376` anti-join `int_samples_base` | VERIFIED | `166376` literal present; sources.yml updated with `observations__observation_projects` declaration |
| `int_combined.sql` ARM 3 | `int_specimen_obs_base` | `waba_specimen` arm with double anti-join | VERIFIED | Anti-join against `int_matched_waba_ids` AND `inat_obs_data.observations` (CR-01 fix) |
| `int_ecdysis_base.sql` | `int_waba_link` | MIN() subquery guard | VERIFIED | `GROUP BY catalog_suffix` subquery at lines 38-41 |
| `src/bee-pane.ts` | `url-state.ts VALID_SOURCES` | `_onSourceToggle('waba_specimen', ...)` + `hiddenSources.size === 5` | VERIFIED | Both present |
| `CLAUDE.md Domain Vocabulary` | `docs/domain-model.md` | markdown link | VERIFIED | `[docs/domain-model.md](docs/domain-model.md)` in Domain Vocabulary section |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `int_combined` waba_specimen arm | 33 rows from `int_specimen_obs_base` | `stg_waba__observations` (iNat pipeline) anti-joined against `int_matched_waba_ids` + `inat_obs_data.observations` | Yes — DuckDB confirms 33 rows with `specimen_observation_id NOT NULL` | FLOWING |
| `int_combined` waba_sample arm | 28 rows from `int_provisional_waba_ids` | `stg_inat__observations` JOIN `observations__observation_projects` project_id=166376 | Yes — DuckDB confirms 28 rows, all is_provisional=TRUE | FLOWING |
| `_renderWabaSpecimen` | `row.obs_url` | `int_combined` ARM 3: `'https://www.inaturalist.org/observations/' || sob.waba_obs_id` | Yes — obs_url is a computed non-null column for all 33 waba_specimen rows | FLOWING |
| `_renderProvisional` (WR-01 fix) | `row.observation_id` | ARM 2 waba_sample: `obs.id AS observation_id` | Yes — observation_id populated for all 28 waba_sample rows | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| occ_id uniqueness test returns only Shape-C | `duckdb data/beeatlas.duckdb -c "WITH o AS (...) SELECT occ_id, COUNT(*) FROM o WHERE occ_id IS NOT NULL GROUP BY occ_id HAVING COUNT(*)>1 ORDER BY occ_id"` | 2 rows: ecdysis:6317352, ecdysis:6317353 only | PASS |
| waba_sample: 28 rows, all provisional, no specimens | DuckDB source distribution query | `waba_sample`: cnt=28, provisional_true=28, has_spec_obs_id=0 | PASS |
| waba_specimen: 33 rows, not provisional, all have spec_obs_id | DuckDB source distribution query | `waba_specimen`: cnt=33, provisional_true=0, has_spec_obs_id=33 | PASS |
| dbt build passes with no errors | `bash data/dbt/run.sh build` | PASS=90 WARN=2 ERROR=0 | PASS |
| npm test 865 tests pass | `npm test` | 865 passed, 0 failed | PASS |
| tsc type-check clean | `npx tsc --noEmit` | Exit 0, no output | PASS |
| obs 320276469 in int_matched_waba_ids (rescued from Shape A) | DuckDB query | 1 row returned | PASS |
| obs 320276469 Shape A collision gone | DuckDB: only 1 row with specimen_observation_id=320276469 (inat_obs source) | 1 row; no duplicate | PASS |

---

### Requirements Coverage

No REQ-IDs declared for this phase (promoted from backlog 999.9). Verification is against CONTEXT decisions D-01..D-13.

| Decision | Description | Status | Evidence |
|----------|-------------|--------|----------|
| D-01 | Same occ_id = same occurrence; collapse at data layer | VERIFIED | No collisions except Shape-C (OFV bug, not arm collision) |
| D-02 | Fix at data layer (int_combined/upstream), not display | VERIFIED | int_waba_link/int_provisional_waba_ids/int_combined corrected |
| D-03 | provisional = WABA plant-images/sample-IDs project (166376) members | VERIFIED | int_provisional_waba_ids joins `project_id=166376` |
| D-05 | Remove MIN() from int_waba_link | VERIFIED | No MIN() in int_waba_link body |
| D-06 | Document arm taxonomy and occ_id vocabulary | VERIFIED | docs/domain-model.md covers all 5 arms + occIdFromRow vocabulary |
| D-07 | docs/domain-model.md linked from CLAUDE.md Domain Vocabulary | VERIFIED | Line 19 of CLAUDE.md |
| D-09 | dbt uniqueness assertion on occ_id, severity:warn | VERIFIED | test_no_duplicate_occ_ids.sql exists; warns on 2 Shape-C rows |
| D-10 | Keep the 33 waba_specimen rows, is_provisional=FALSE | VERIFIED | waba_specimen: 33 rows, provisional=0, all have spec_obs_id |
| D-11 | No specimens in waba_sample | VERIFIED | specimens_in_waba_sample=0 |
| D-12 | source='waba_specimen' for category 2 | VERIFIED | 'waba_specimen' in int_combined ARM 3 |
| D-13 | waba_specimen in SourceKey/VALID_SOURCES/toggle/detail card | VERIFIED | All 4 files updated; 5th toggle present; all-off guard ===5 |
| CR-01 | waba_specimen anti-joins inat_obs_data.observations (structural guard) | VERIFIED | int_combined.sql line 202; commit e71bfcad |
| WR-01 | Provisional card link uses observation_id not specimen_observation_id | VERIFIED | bee-occurrence-detail.ts line 343; commit 2920c651 |

---

### Anti-Patterns Found

No TBD/FIXME/XXX debt markers found in phase files. No stub implementations identified.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `int_combined.sql` ARM 3 | 155-209 | Inline CASE expression repeated 4x (WR-04 from code review) | Info | Correctness hazard for future edits (desync risk). Code review WR-04 accepted as deferred — not a blocker |
| `src/bee-pane.ts` | 1239 | `size === 5` magic literal (WR-02 from code review) | Info | Will silently regress if a 6th source is added. Code review WR-02 accepted as deferred — not a blocker |

---

### Human Verification Required

The following items require human testing (visual / map interaction / live link validation):

### 1. waba_specimen toggle shows/hides the ~33 points on the map

**Test:** In `/app`, open the source-filter panel. Toggle "WABA specimens" off and on.
**Expected:** ~33 specimen points disappear when toggled off and reappear when toggled on. The 5th toggle entry should be labeled "WABA specimens".
**Why human:** Map render + canvas interaction not unit-testable. The `_onSourceToggle('waba_specimen', ...)` wiring is code-verified but the pin count on the Mapbox canvas requires visual confirmation.

### 2. waba_sample (Provisional samples) toggle controls the ~28 plant-obs records

**Test:** Toggle "Provisional samples" off and on.
**Expected:** ~28 provisional sample points disappear/reappear. The toggle label should read "Provisional samples" (corrected from old "Provisional WABA" copy).
**Why human:** Same canvas constraint as above.

### 3. waba_specimen occurrence-detail card renders correctly

**Test:** Navigate to a waba_specimen occurrence (e.g. via `o=inat_obs:<id>&pane=list` with one of the 33 obs IDs) and open the detail card.
**Expected:** Shows bee taxon name, quality badge (e.g. "research"), date, "View on iNaturalist" link to a real iNat URL, and "Awaiting Ecdysis catalogue entry" hint text. No blank/null fields for the obs_url.
**Why human:** `_renderWabaSpecimen` implementation is verified in code, but the visual output (badge copy, link formatting) requires visual inspection.

### 4. WR-01 fix: waba_sample detail card iNat link is not broken

**Test:** Navigate to a waba_sample (provisional) occurrence and open the detail card.
**Expected:** "View WABA observation" link points to `https://www.inaturalist.org/observations/<plant_obs_id>` (a real iNaturalist plant observation, NOT `/observations/null`).
**Why human:** The code fix (using `observation_id` instead of `specimen_observation_id`) is source-verified, but the live link target must be confirmed as a real iNaturalist observation.

---

### Gaps Summary

No gaps. All 11 must-haves verified. The 4 human verification items above are standard UI/visual checks that cannot be automated programmatically.

**Deferred code review items (not blockers):**
- WR-02: `size === 5` magic literal in bee-pane.ts (forward-compatibility risk)
- WR-03: ARM 1 ecdysis uses MIN() to pick one representative WABA obs for photo link (arbitrary pick)
- WR-04: Inline CASE expression repeated 4x in ARM 3 (WR-04 drift risk)
- IN-01/IN-02/IN-03: Doc category-vs-ARM numbering mismatch; stale occurrence.ts docstrings; dead `void isFilterActive`

These were explicitly accepted as deferred by the code review.

---

_Verified: 2026-06-24T22:10:00Z_
_Verifier: Claude (gsd-verifier)_
