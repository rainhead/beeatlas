---
phase: 127
slug: inactive-taxon-remapping
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-31
validated: 2026-05-31
---

# Phase 127 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 (run via `uv run pytest` from `data/`) |
| **Config file** | `[tool.pytest.ini_options] testpaths = ["tests"]` in `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest tests/test_inactive_remap.py -x` |
| **Full suite command** | `cd data && uv run pytest tests/ -x --ignore=tests/test_dbt_synonymy.py --ignore=tests/test_dbt_diff.py` |
| **Estimated runtime** | ~10 seconds (quick); dbt build (plan 02) ~30-60 seconds |

The Python half (plan 01) is exercised entirely by pytest against synthetic gzipped `taxa.csv.gz` fixtures and mocked `requests.get` — never live data. The dbt half (plan 02) is verified by `cd data && bash dbt/run.sh build` against the committed header-only `auto_synonyms.csv` seed (the 0-inactive reality).

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_inactive_remap.py -x`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -x --ignore=tests/test_dbt_synonymy.py --ignore=tests/test_dbt_diff.py` (plan 01) and `cd data && bash dbt/run.sh build` (plan 02)
- **Before `/gsd:verify-work`:** Full suite must be green and dbt build must pass
- **Max feedback latency:** ~10 seconds (pytest quick run); ~60 seconds (dbt build)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 127-01-01 | 01 | 1 | ITR-01 / ITR-02 | T-127-02 | Failing tests assert detection/triage shapes before impl exists (RED) | unit | `cd data && uv run pytest tests/test_inactive_remap.py -x 2>&1 \| grep -qE "AttributeError\|ImportError\|has no attribute\|cannot import" && echo RED-OK` | ✅ created by this task | ✅ green |
| 127-01-02 | 01 | 1 | ITR-01 / ITR-02 | T-127-01 / T-127-02 / T-127-03 | Parameterized writes; malformed response → blocking triage; gate cannot be bypassed | unit | `cd data && uv run pytest tests/test_inactive_remap.py -x` | ✅ (file from 127-01-01) | ✅ green |
| 127-01-03 | 01 | 1 | ITR-01 / ITR-02 | T-127-03 | Gate wired as dedicated STEP before dbt-build; writeback files gitignored | unit/import | `cd data && grep -A2 '"taxa-download"' run.py \| grep -q '"inactive-remap"' && grep -A1 '"inactive-remap"' run.py \| grep -q '"inactive-gate"' && grep -q 'dbt/seeds/auto_synonyms.csv' .gitignore && grep -q '^inactive_unresolved.csv' .gitignore && uv run python -c "import run" && echo WIRED-OK` | ✅ existing run.py / .gitignore | ✅ green |
| 127-02-01 | 02 | 1 | ITR-03 / ITR-04 | T-127-06 / T-127-07 / T-127-08 | Header-only seed varchar-typed (no exec); anti-join gives manual precedence | grep/SQL | `cd data && test "$(cat dbt/seeds/auto_synonyms.csv)" = "synonym,accepted_name,source" && grep -q "auto_synonyms" dbt/seeds/schema.yml && grep -q "auto_synonyms" dbt/dbt_project.yml && grep -q "WHERE m.synonym IS NULL" dbt/models/intermediate/int_synonyms.sql && echo SEED-MODEL-OK` | ✅ created by this task | ✅ green |
| 127-02-02 | 02 | 1 | ITR-03 / ITR-04 | T-127-07 / T-127-08 | All four JOIN sites repoint via int_synonyms; 37-col contract holds; dbt exit code propagates | dbt build | `cd data && test "$(grep -rl "ref('occurrence_synonyms')" dbt/models/ \| grep -v int_synonyms \| wc -l)" = "0" && bash dbt/run.sh build && echo BUILD-OK` | ✅ existing dbt models | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `data/tests/test_inactive_remap.py` — failing unit tests for ITR-01/ITR-02 (created in task 127-01-01, the RED step)

*No new conftest fixtures required: existing patterns (`resolver_db` analog, `MINI_TAXA_TSV` gzip fixture) + `tmp_path` + monkeypatch suffice. The fixture deliberately does NOT call `resolve_taxon_ids()` (Pitfall 4 — avoids the pre-existing dbt_sandbox gap).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live auto-remap happy path (real inactive taxon → bridge upsert + auto_synonyms row) | ITR-01 | Cannot be exercised against current data — the bridge has 0 inactive taxa today | Covered by synthetic gzipped `taxa.csv.gz` fixtures + mocked `inaturalist_pipeline.requests.get` in `test_single_successor_writes_auto_synonyms`; no live equivalent exists to run |
| Live inactive-gate hard-fail (real triage rows block the nightly build) | ITR-02 | Same 0-inactive reality — no live inactive taxon to trigger the gate | Covered by `test_inactive_gate_blocks` (synthetic triage CSV → `SystemExit`); the dormant path is verified by mocks, not data |
| ITR-03 / ITR-04 end-to-end through built `occurrences.parquet` | ITR-03 / ITR-04 | Requires a full dbt build; precedence + 37-column contract asserted via the build, not an isolated unit test | Run `cd data && bash dbt/run.sh build`; confirm build exits 0 and the agapostemon texanus → subtilior manual mapping still appears (regression anchor flows through int_synonyms' manual arm) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-05-31 — all 5 task verifications green, 0 gaps.

---

## Validation Audit 2026-05-31

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 5 Per-Task Map verifications re-run against the live codebase and confirmed green:
- `tests/test_inactive_remap.py` — 10 passed (grew from 7 via review-fix cases)
- 127-01-03 STEPS wiring + gitignore + `import run` → WIRED-OK
- 127-02-01 header-only seed + `int_synonyms` anti-join → SEED-MODEL-OK
- 127-02-02 repoint (0 stray `occurrence_synonyms` refs) + `dbt/run.sh build` → PASS=57 WARN=2 ERROR=0

The two dbt warnings (`not_null_occurrences_taxon_id` 33 rows, `test_lin05_lineage_coverage`) are pre-existing from Phase 126, not introduced by Phase 127. No new tests generated — coverage was already complete.
