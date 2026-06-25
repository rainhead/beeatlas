---
phase: 168
slug: temporal-lifecycle-dates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 168 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | dbt data tests (contract + singular `data_tests`) + pytest (`@integration` tier, not required this phase) |
| **Config file** | `data/dbt/models/marts/schema.yml` (contract); `data/dbt/run.sh` (build/test wrapper) |
| **Quick run command** | `bash data/dbt/run.sh build --select int_ecdysis_base int_combined occurrences` |
| **Full suite command** | `bash data/dbt/run.sh build` then `cd data && uv run pytest` |
| **Estimated runtime** | ~60–120 seconds (dbt build over local duckdb) |

---

## Sampling Rate

- **After every task commit:** Run `bash data/dbt/run.sh build --select int_ecdysis_base int_combined occurrences`
- **After every plan wave:** Run `bash data/dbt/run.sh build` (full contract 38 enforced) + `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full `dbt build` green — the contract IS the gate.
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 168-01-xx | 01 | 1 | TEMP-01 | — | N/A (read-only mart projection) | contract | `bash data/dbt/run.sh build --select int_combined occurrences` | ✅ existing contract | ⬜ pending |
| 168-01-xx | 01 | 1 | TEMP-01 | — | N/A | singular dbt test (warn) | `bash data/dbt/run.sh test --select assert_id_date_parse_complete` | ❌ W0 (new test SQL) | ⬜ pending |
| 168-01-xx | 01 | 1 | TEMP-02 | — | one specimen, not delete+create | existing de-dup (no new test) | `bash data/dbt/run.sh build` | ✅ existing (int_combined.sql:202,205) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/dbt/tests/assert_id_date_parse_complete.sql` — singular test: any ecdysis row whose raw `date_identified` matches `^[0-9]{4}$` or `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` MUST have non-NULL `id_date` (parse completeness, TEMP-01 criterion 3). Severity `warn` (mirrors Phase 167 D-06). Shares the same regexes as the parse expression so it never false-trips.
- [ ] Contract column `id_date` added to `schema.yml` (`marts/occurrences`, 37→38) — the contract is the primary test surface.

*Framework install: none — dbt + pytest already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `id_date` lands in S3 before any consuming code | TEMP-01 (release) | One-time operator nightly with `SKIP_INTEGRATION_GATE=1` on maderas; gated on Phase 167's 37-col data being live first | Operator runs `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` after confirming 167's column is in S3 (STATE.md:76) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (the new singular test SQL)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
