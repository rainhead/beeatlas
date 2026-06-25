---
phase: 168-temporal-lifecycle-dates
verified: 2026-06-25T00:00:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification: # No previous VERIFICATION.md — initial verification
---

# Phase 168: Temporal Lifecycle Dates Verification Report

**Phase Goal:** Each occurrence carries its intrinsic lifecycle dates readable from the mart, and the waba_specimen→ecdysis transition reads as a single specimen's timeline rather than a phantom delete+create.

**Goal as narrowed by CONTEXT (D-01..D-13):** The lifecycle timeline is two events — Collected (the EXISTING `date` column, D-04) and Identified (the NEW `id_date VARCHAR` column). `posted_date`/`created_at` was deliberately DROPPED (D-02). The waba_specimen→ecdysis transition requires no new code (D-10): the existing ARM-3 de-dup keeps a specimen in exactly one arm.

**Verified:** 2026-06-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | occurrences mart carries `id_date VARCHAR` (contract 37→38) | ✓ VERIFIED | schema.yml occurrences model = 38 `name:` entries (lines 4–119); `- name: id_date` / `data_type: varchar` at L116–117. Local parquet `DESCRIBE` = 38 cols, `has id_date: True`. Orchestrator confirms live S3 parquet = 38 cols with `id_date`. |
| 2 | ARM 1 ecdysis keeps parseable `date_identified` verbatim (year-only + full ISO); blank/'s.d.'/garbage → NULL (D-06/D-07) | ✓ VERIFIED | int_combined.sql L64–69: `CASE WHEN regexp_full_match(trim(e.date_identified),'^[0-9]{4}$') OR ...'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN trim(...) ELSE NULL END::VARCHAR AS id_date`. Parquet: ecdysis id_date shapes = {year-only: 26548, full-iso: 17}; garbage leaked = 0. |
| 3 | ARMs 2–5 (waba_sample, waba_specimen, inat_obs, checklist) emit `id_date = NULL` (D-08/D-09) | ✓ VERIFIED | int_combined.sql L129/186/267/330 each `NULL::VARCHAR AS id_date` (4 matches, whitespace-tolerant grep). Parquet per-arm non-null id_date: waba_sample 0, waba_specimen 0, inat_obs 0, checklist 0. |
| 4 | A parseable raw `date_identified` is never silently dropped — asserted by warn-severity singular test (TEMP-01 crit 3, D-13) | ✓ VERIFIED | assert_id_date_parse_complete.sql exists, `{{ config(severity='warn') }}` (warn=1, error=0), two `regexp_full_match` byte-identical to ARM-1, violation predicate `m.id_date IS NULL`, joins mart→staging on `CAST(m.ecdysis_id AS VARCHAR)=src.id`. Local build: PASS (0 rows). Committed bd4618b7. |
| 5 | A catalogued specimen is in exactly one int_combined arm (existing ARM-3 de-dup) carrying collection date + (where determined) id_date — no transition plumbing (TEMP-02, D-10) | ✓ VERIFIED | ARM-3 de-dup intact: int_combined.sql L214 `AND sob.waba_obs_id NOT IN (SELECT waba_obs_id FROM int_matched_waba_ids)` — untouched. Parquet: 0 specimen_observation_ids span >1 source. Ecdysis: 48,800/48,801 rows carry non-null collection `date` independent of id_date. No new code (git diff f36dec15 touches only the 4 declared files). |
| 6 | `id_date` carries to `occurrences.db` with no edit to `sqlite_export.py`, not in `_GEO_COLS` | ✓ VERIFIED | `git diff --quiet data/sqlite_export.py` = clean; `grep id_date data/sqlite_export.py` = 0. Local `public/data/occurrences.db` regenerated (Task 3). |
| 7 | Live S3 occurrences.parquet carries id_date (38 cols), sequenced after Phase 167's 37-col landing | ✓ VERIFIED | Orchestrator-confirmed authoritative: live S3 parquet = 38 cols, has `id_date` + `collector_inat_login`; per-source id_date non-null ecdysis 28,444, all other arms 0; 0 non-conforming values. Phase 167 marked complete (commit 69821883, "collector_inat_login live in S3"). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `data/dbt/tests/assert_id_date_parse_complete.sql` | warn-severity singular test, `id_date IS NULL` violation | ✓ VERIFIED | Exists, committed bd4618b7. Contains `severity='warn'`, two `regexp_full_match`, `m.id_date IS NULL`, refs both `stg_ecdysis__occurrences` and `occurrences`. |
| `data/dbt/models/intermediate/int_ecdysis_base.sql` | raw `date_identified` projected | ✓ VERIFIED | L27 `o.date_identified` (last column). Non-comment grep = 1. |
| `data/dbt/models/intermediate/int_combined.sql` | id_date in all 5 arms (ARM1 parsed, ARMs2-5 NULL::VARCHAR) | ✓ VERIFIED | 5× `AS id_date`; ARM1 parse L64–69; 4× `NULL::VARCHAR ... AS id_date` (L129/186/267/330). ARM-3 dedup L214 untouched. |
| `data/dbt/models/marts/occurrences.sql` | `j.id_date` final SELECT | ✓ VERIFIED | L93 `j.id_date` (1 match). |
| `data/dbt/models/marts/schema.yml` | id_date contract entry, 38 cols | ✓ VERIFIED | L116 `- name: id_date`, L117 `data_type: varchar`. Occurrences model = 38 column entries. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| int_ecdysis_base.sql | int_combined.sql | ARM 1 reads `e.date_identified` | ✓ WIRED | `regexp_full_match(trim(e.date_identified)...)` ×2 in ARM 1 L65–66; `e` = int_ecdysis_base alias (L70). |
| int_combined.sql | occurrences.sql | `joined` CTE SELECT * → `j.id_date` | ✓ WIRED | occurrences.sql L93 `j.id_date`; joined CTE is `ROW_NUMBER() OVER () AS _row_id, *`. |
| occurrences.sql | schema.yml | enforced contract name + varchar | ✓ WIRED | `- name: id_date` / `data_type: varchar`; contract `enforced: true`; local build compiled the 38-col contract green. |
| assert_id_date_parse_complete.sql | int_combined.sql | shared two keep-regexes (tautology) | ✓ WIRED | Test regexes `^[0-9]{4}$` and `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` byte-identical to ARM-1 parse. Confirmed by 0-garbage-leaked + test PASS. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| occurrences mart | `id_date` | ARM-1 parse of `int_ecdysis_base.date_identified` (real Ecdysis source) | Yes — 26,565 non-null ecdysis values (local); 28,444 live S3 | ✓ FLOWING |

The mart `id_date` is fed by a real CASE parse over the ecdysis source column, not a hardcoded value. Live S3 shows 28,444 populated ecdysis id_dates (vs 26,565 in the older local sandbox) — data is genuinely flowing and growing with nightly refresh.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Mart has id_date, 38 cols | duckdb DESCRIBE local parquet | `column_count: 38`, `has id_date: True` | ✓ PASS |
| Per-arm id_date population | GROUP BY source COUNT FILTER non-null | ecdysis 26565; waba_sample/waba_specimen/inat_obs/checklist all 0 | ✓ PASS |
| No garbage leaked | non-null id_date failing both keep-regexes | 0 | ✓ PASS |
| TEMP-02 single-arm | specimen_observation_id spanning >1 source | 0 | ✓ PASS |
| Collection date independent of id_date | ecdysis non-null `date` / total | 48800/48801 | ✓ PASS |
| Parse shapes match policy | id_date shape histogram | year-only 26548 + full-iso 17 = 26565 | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared for this phase. The phase's enforcement surface is `bash data/dbt/run.sh build` (D-13), reported green by the executor and orchestrator (contract 38 enforced, PASS=92, `assert_id_date_parse_complete` PASSED). Not independently re-run here because the orchestrator already executed the build green and the parquet/data assertions above re-verify the same invariants against the produced artifact.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TEMP-01 | 168-01 | Surface intrinsic lifecycle dates into the mart for snapshot-diff-free timelines (data-before-code). **Narrowed by D-02:** posting date dropped; collection served by existing `date`; only `id_date` added. | ✓ SATISFIED | `id_date` column live (mart + S3, 38 cols); ARM-1 parse keeps partials; warn test enforces parse completeness. Collected event served by pre-existing `date` column (D-04). |
| TEMP-02 | 168-01 | waba_specimen→ecdysis reads as one specimen's timeline, not delete+create. **Narrowed by D-10:** the risk dissolves because Collected/Identified are persistent real-world facts; existing ARM-3 de-dup already keeps a specimen in one arm. | ✓ SATISFIED | ARM-3 de-dup (`int_matched_waba_ids` NOT IN, L214) intact; 0 specimen_observation_ids span >1 source; specimen carries continuous `date` + gains `id_date`. No transition plumbing added. |

**Note on REQUIREMENTS.md wording vs. honored scope:** REQUIREMENTS.md L24 (TEMP-01) literally names "iNat posting date (`created_at`)" and L25 (TEMP-02) names "iNat posting date" carry-over. Per CONTEXT D-02 these were deliberately dropped by the operator during discuss-phase (posting is not an event). This is an intentional scope narrowing recorded in 168-CONTEXT.md (D-02 explicitly "Supersedes ROADMAP criterion 1 and TEMP-01"), the PLAN objective ("Scope reframe… posted_date / iNat created_at is DROPPED"), and the SUMMARY. The absence of `posted_date`/`created_at` is therefore CORRECT, not a gap. Both requirement IDs are accounted for and marked Complete in REQUIREMENTS.md (L83–84).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | The only `ELSE NULL` in the new code is the intended garbage→NULL parse fallback (D-06), populated by a real parse path for valid input — not a stub. No TBD/FIXME/XXX in modified files. The 4 `NULL::VARCHAR AS id_date` arms are the intended D-08/D-09 behavior, not stubs. |

Pre-existing unrelated warnings noted in SUMMARY (`test_lin05_lineage_coverage`, `test_no_duplicate_occ_ids`, `collector_inat_login_ecdysis_drift` = 2767) are out of scope for this phase and not introduced by it.

### Human Verification Required

None. This is a data-layer-only phase (no TypeScript/frontend/visual surface). All truths are verifiable programmatically against the mart parquet, the dbt source files, and the orchestrator-confirmed live S3 state. The operator S3 release (Task 4, `checkpoint:human-action`) has already been completed — the orchestrator independently confirmed the 38-column `id_date` parquet is live in production S3.

### Gaps Summary

No gaps. The phase goal, as narrowed by the locked CONTEXT decisions (D-01..D-13), is genuinely achieved in both code and production:

- The single new `id_date VARCHAR` column exists in the mart (contract 37→38, exactly 38 columns), is parsed from real ecdysis `date_identified` in ARM 1 (year-only + full ISO kept verbatim, garbage NULLed), is `NULL::VARCHAR` in the four non-specimen arms, and is enforced by a warn-severity parse-completeness singular test sharing byte-identical regexes (tautology guarantee).
- The "Collected" event is correctly served by the pre-existing `date` column (D-04, no redundant `collection_date`), and `posted_date`/`created_at` was correctly NOT added (D-02).
- TEMP-02 holds structurally with zero new plumbing (D-10): the existing ARM-3 de-dup keeps a catalogued specimen in exactly one arm (verified: 0 specimen_observation_ids span multiple sources), so the transition reads as one continuous specimen timeline.
- `sqlite_export.py` is unedited and `id_date` is not in `_GEO_COLS`.
- The column is live in production S3 (38 cols, 28,444 ecdysis id_dates, all other arms 0, 0 non-conforming) per the orchestrator's authoritative independent check, sequenced after Phase 167's 37-col landing (D-11/D-12).

Both requirement IDs (TEMP-01, TEMP-02) are accounted for, satisfied per the narrowed scope, and marked Complete in REQUIREMENTS.md.

---

_Verified: 2026-06-25_
_Verifier: Claude (gsd-verifier)_
