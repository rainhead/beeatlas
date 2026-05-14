---
phase: 83
slug: scaffold-slice-port
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-12
approved: 2026-05-12
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

This is a SPIKE phase. The validation goal is **not** to assert business correctness of the dbt slice (that's Phase 84 with TEST-01..03, DIFF-01..02). It is to assert: (1) the scaffold matches the locked layout, (2) `dbt build` exits 0 end-to-end against a real `beeatlas.duckdb` copy, (3) outputs land at the exact sandbox paths, and (4) no production surface was touched.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (existing in `data/`) + shell assertions for path/grep checks |
| **Config file** | `data/pyproject.toml` (pytest config under `[tool.pytest.ini_options]` if present; otherwise default discovery from `data/tests/`) |
| **Quick run command** | `cd data && uv run pytest tests/test_dbt_scaffold.py -x` |
| **Full suite command** | `cd data && uv run pytest && bash dbt/run.sh build && bash dbt/run.sh test --select tag:scaffold_smoke 2>/dev/null || true` |
| **Estimated runtime** | quick: ~5s · full: ~30–60s (depends on `beeatlas.duckdb` size locally) |

Note: `dbt build` itself is the load-bearing integration check — full suite runs it. `bash dbt/run.sh test` is included for forward-compat with Phase 84 tests but is a no-op for Phase 83 (no tests defined).

---

## Sampling Rate

- **After every task commit:** Run quick command (`pytest -x` on dbt scaffold tests only)
- **After every plan wave:** Run full suite (`pytest` + `dbt build`)
- **Before `/gsd-verify-work`:** Full suite green AND `bash data/dbt/run.sh build` exits 0 from a clean shell
- **Max feedback latency:** 60 seconds (quick path: 5s)

---

## Per-Task Verification Map

> Filled in by the planner. The planner MUST add one row per task with an `<automated>` block that maps to one of the commands below, or mark the task as Wave-0-dependent.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 83-XX-YY | XX | W | SCAFFOLD-/PORT-NN | — | N/A (local spike, no network/auth surface) | unit / integration / shell | `<filled by planner>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Standard validation commands available to the planner

| ID | Requirement | Type | Command |
|----|------------|------|---------|
| V-SCAFFOLD-01 | SCAFFOLD-01 | integration | `cd data && bash dbt/run.sh build` exits 0 from clean checkout |
| V-SCAFFOLD-02 | SCAFFOLD-02 | unit (yaml shape) | `python -c "import yaml,sys; p=yaml.safe_load(open('data/dbt/profiles.yml')); assert 'spatial' in p['beeatlas']['outputs']['sandbox']['extensions']"` |
| V-SCAFFOLD-03a | SCAFFOLD-03 | shell | `! git grep -E 'data/dbt' -- data/run.py data/nightly.sh .github/workflows/` |
| V-SCAFFOLD-03b | SCAFFOLD-03 | shell | `grep -E '^data/dbt/(target\|logs)/?$' .gitignore` (or `data/dbt/.gitignore` covers both) |
| V-PORT-01 | PORT-01 | integration | `cd data && bash dbt/run.sh ls --resource-type model --output json` lists ≥3 marts and ≥1 staging model per `source()` schema |
| V-PORT-02a | PORT-02 | grep | `grep -E 'ST_Within' data/dbt/models/marts/occurrences.sql` |
| V-PORT-02b | PORT-02 | grep | `grep -E 'ST_Distance.*ORDER BY.*LIMIT 1' data/dbt/models/marts/occurrences.sql` |
| V-PORT-03 | PORT-03 | shell | `test -f data/dbt/target/sandbox/occurrences.parquet && test -f data/dbt/target/sandbox/counties.geojson && test -f data/dbt/target/sandbox/ecoregions.geojson` (after `dbt build`) |
| V-PORT-04 | PORT-04 | shell | `test -f .planning/research/dbt-spike-findings.md && grep -E '## Slice Choice' .planning/research/dbt-spike-findings.md` |

The planner SHOULD reuse these IDs in `<automated>` blocks and may add task-local commands (e.g. row-count sanity, GeoJSON structural check via `jq '.type == "FeatureCollection"'`).

---

## Wave 0 Requirements

- [ ] `data/tests/test_dbt_scaffold.py` — pytest module hosting scaffold-shape checks (file existence, profiles.yml schema, gitignore, no-production-touch grep). May be a thin wrapper around `subprocess.run` for the shell-style assertions to keep one test runner.
- [ ] `data/tests/conftest.py` — already exists in repo (verify); add a session-scoped fixture `dbt_run_sh` that returns the resolved path to `data/dbt/run.sh` if needed.
- [ ] `dbt-duckdb==1.10.1` added to `[dependency-groups].dev` in `data/pyproject.toml` (Wave 0 dep install gates everything downstream).
- [ ] `data/dbt/run.sh` wrapper script (executable; `chmod +x` is part of Wave 0 if planner picks this path).

*If pytest is not yet wired for this directory style, Wave 0 also wires a minimal `[tool.pytest.ini_options] testpaths = ["tests"]` in `data/pyproject.toml`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GeoJSON FeatureCollection structural equivalence to `export.py` output | PORT-02 (qualitative) | Byte-equality is not a v3.3 goal (Phase 84 / DIFF-01 owns that); spot-check is enough here | After `dbt build`, run `jq '.type, .features | length' data/dbt/target/sandbox/counties.geojson` — must be `"FeatureCollection"` and > 30 (WA has 39 counties) |
| Slice rationale prose is sensible | PORT-04 | Findings doc seeding is exploratory writing | Read `.planning/research/dbt-spike-findings.md §"Slice Choice"`; confirm the chosen slice + rationale paragraph is present and matches CONTEXT.md decision |

Everything else has an automated check above.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (pytest test file, dbt-duckdb dep, run.sh wrapper)
- [ ] No watch-mode flags (`pytest -x` is one-shot; `dbt build` is one-shot)
- [ ] Feedback latency < 60s (quick path < 5s)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
