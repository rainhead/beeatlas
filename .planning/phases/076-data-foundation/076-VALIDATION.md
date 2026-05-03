---
phase: 76
slug: data-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-02
revised: 2026-05-02
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Filled in by the planner; gsd-planner is expected to expand the Per-Task Verification Map and Wave 0 sections from the plans it produces.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data/) — managed via `uv` per `data/pyproject.toml` |
| **Config file** | `data/pyproject.toml` (testpaths = ["tests"]) |
| **Quick run command** | `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py -x` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~30 seconds (target — programmatic DuckDB fixtures, no network) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_taxon_lineage.py -x`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Wave 0 Strategy (Documented and Intentional)

This phase satisfies the Wave 0 contract via Plan 02 (TDD on `canonicalize()`) — the
algorithm-critical surface. Plan 02 lands its full failing-test scaffold (`tests/test_canonical_name.py`,
15+ tests) in Wave 1 BEFORE any consumer (Plans 03/05) imports `canonicalize`.

The DB-write functions (`load_checklist`, `_update_occurrences_canonical_name`, `reconcile`,
`enrich_taxon_lineage_extended`) are integration-tested in Plan 06 (Wave 4) against a programmatic
DuckDB fixture. Plans 03/04/05 verify via grep + import smoke tests (Wave 2/3); the functional
contract is enforced by Plan 06's integration suite. This is the documented and intentional shape
for this phase — there is no separate Wave 0 stub plan.

`wave_0_complete: true` reflects this: Plan 02 (the only plan whose surface is amenable to
pre-implementation TDD without DB plumbing) has its tests landing first.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 076-01 | 1 | CHECK-01 | T-76-01 | provenance verifiable | file-existence + grep | `test -f data/checklists/wa_bee_checklist.tsv && test "$(wc -l < data/checklists/wa_bee_checklist.tsv)" = "2863" && head -1 data/checklists/wa_bee_checklist.tsv \| grep -qP '^species\tcounty$'` | ✅ | ⬜ pending |
| 01-02 | 076-01 | 1 | CHECK-01 | — | docs-only | grep | `test -f data/checklists/README.md && grep -q "Bartholomew" data/checklists/README.md && grep -q "10.3897/jhr.97.129013" data/checklists/README.md && grep -q "2,862" data/checklists/README.md && grep -q "verified" data/checklists/README.md && grep -q "likely-to-occur" data/checklists/README.md` | ✅ | ⬜ pending |
| 01-03 | 076-01 | 1 | D-05 schema | T-76-02 | header-only seed | file-existence + grep | `test -f data/checklist_synonyms.csv && test "$(wc -l < data/checklist_synonyms.csv)" = "1" && head -1 data/checklist_synonyms.csv \| grep -qx 'checklist_name,canonical_name,source'` | ✅ | ⬜ pending |
| 01-04 | 076-01 | 1 | CHECK-01, D-01, D-02 | — | docs amendment | grep | `grep -q "wa_bee_checklist.tsv" .planning/REQUIREMENTS.md && ! grep -q "wa_bee_checklist.csv" .planning/REQUIREMENTS.md && grep -q "v3.2 populates only \`verified\`" .planning/REQUIREMENTS.md` | ✅ | ⬜ pending |
| 02-01 | 076-02 | 1 | CHECK-06, TAX-04 | — | RED state assertion | pytest (failing) | `cd data && uv run pytest tests/test_canonical_name.py -x 2>&1 \| grep -qE "(ModuleNotFoundError\|ImportError).*canonical_name"` | ✅ | ⬜ pending |
| 02-02 | 076-02 | 1 | CHECK-06, TAX-04 | T-76-05 | regex termination | pytest (passing) | `cd data && uv run pytest tests/test_canonical_name.py -v` | ✅ | ⬜ pending |
| 03-01 | 076-03 | 2 | CHECK-02, CHECK-03, CHECK-04 | T-76-01, T-76-06 | parameterized SQL | import smoke + grep | `cd data && uv run python -c "from checklist_pipeline import load_checklist, SOURCE_CITATION, CHECKLIST_PATH; assert SOURCE_CITATION.startswith('Bartholomew'); assert str(CHECKLIST_PATH).endswith('wa_bee_checklist.tsv')"` | ✅ | ⬜ pending |
| 03-02 | 076-03 | 2 | CHECK-04 | — | STEPS ordering | python import | `cd data && uv run python -c "import run; names = [s[0] for s in run.STEPS]; i = names.index('checklist'); assert names[i-1] == 'anti-entropy', names; assert names[i+1] == 'export', names; print('STEPS order OK')"` | ✅ | ⬜ pending |
| 04-01 | 076-04 | 3 | TAX-01, TAX-03 | T-76-03, T-76-07 | rank set membership | import smoke | `cd data && uv run python -c "from inaturalist_pipeline import enrich_taxon_lineage_extended, TARGET_RANKS; assert callable(enrich_taxon_lineage_extended); assert TARGET_RANKS == {'family', 'subfamily', 'tribe', 'genus', 'subgenus'}, TARGET_RANKS"` | ✅ | ⬜ pending |
| 04-02 | 076-04 | 3 | D-03 ordering | — | STEPS ordering after waba | python import | `cd data && uv run python -c "import run; names=[s[0] for s in run.STEPS]; i=names.index('taxon-lineage-extended'); assert names[i-1] == 'waba', names; print('order OK:', names)"` | ✅ | ⬜ pending |
| 05-01 | 076-05 | 3 | CHECK-05, CHECK-06 | T-76-04, T-76-09, T-76-10 | parameterized UPDATE | python smoke (functional) | `cd data && uv run python -c "import duckdb; from checklist_pipeline import _update_occurrences_canonical_name, reconcile, SYNONYMS_PATH, UNMATCHED_PATH; con = duckdb.connect(':memory:'); con.execute('CREATE SCHEMA ecdysis_data'); con.execute('CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)'); con.execute(\"INSERT INTO ecdysis_data.occurrences VALUES ('Lasioglossum (Dialictus) zonulum'), ('Andrena fulva (Müller, 1766)'), (NULL)\"); _update_occurrences_canonical_name(con); rows = con.execute('SELECT scientific_name, canonical_name FROM ecdysis_data.occurrences ORDER BY scientific_name NULLS LAST').fetchall(); assert ('Andrena fulva (Müller, 1766)', 'andrena fulva') in rows; assert ('Lasioglossum (Dialictus) zonulum', 'lasioglossum zonulum') in rows; assert [r for r in rows if r[0] is None][0][1] is None"` | ✅ | ⬜ pending |
| 05-02 | 076-05 | 3 | CHECK-05, D-05 | T-76-02 | unmatched.csv header | file-existence + grep | `test -f data/checklist_unmatched.csv && head -1 data/checklist_unmatched.csv \| grep -qx 'checklist_name,canonical_name,reason'` | ✅ | ⬜ pending |
| 06-01 | 076-06 | 4 | TAX-04, CHECK-06 | T-76-11 | fixture isolation | pytest (full suite regression) | `cd data && uv run pytest tests/ -x` | ✅ | ⬜ pending |
| 06-02 | 076-06 | 4 | TAX-04, CHECK-02, CHECK-05, CHECK-06 | — | end-to-end JOIN | pytest | `cd data && uv run pytest tests/test_checklist_pipeline.py -v` | ✅ | ⬜ pending |
| 06-03 | 076-06 | 4 | TAX-01, TAX-03, D-03 | T-76-03, T-76-07 | mocked HTTP + NULL emission | pytest | `cd data && uv run pytest tests/test_taxon_lineage.py -v` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Plan 02 lands `data/tests/test_canonical_name.py` with the failing-test scaffold for `canonicalize()` (CHECK-06, TAX-04 algorithm) BEFORE Plans 03/05/06 import the helper. This satisfies Wave 0 for the algorithm-critical surface.
- [N/A] DB-write integration coverage is intentionally deferred to Plan 06 (Wave 4). See "Wave 0 Strategy" above for the rationale; this is not a gap.

*Existing pytest infrastructure already in place (`data/pyproject.toml`, `data/tests/conftest.py`); Plan 02 adds the canonical_name test file (Wave 0 contract); Plan 06 adds the integration test files (deferred to Wave 4 by design).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `checklist_unmatched.csv` is reviewable after first real run | CHECK-04, CHECK-06 | Output depends on live ecdysis data | After Wave N: `cd data && uv run python run.py`; inspect `data/checklist_unmatched.csv`; expect <50 entries on first run |
| `data/checklists/README.md` provenance prose reads correctly | CHECK-01 | Subjective text | `cat data/checklists/README.md` and confirm Bartholomew et al. 2024 (JHR 97, DOI 10.3897/jhr.97.129013) provenance + supplement format note + manual-extraction step + two-column shape note |
| Plan 05 Task 2 `data/checklist_unmatched.csv` snapshot regeneration against the live DB | CHECK-05, D-05 | Requires `data/beeatlas.duckdb` populated (long ecdysis + iNat fetches) | After Plan 05 lands: `cd data && uv run python checklist_pipeline.py`; inspect resulting `data/checklist_unmatched.csv` |

All other tasks have automated `<verify><automated>` commands listed in the Per-Task Verification Map above.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 02 lands canonical_name TDD scaffold; DB integration deferred to Plan 06 by design)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `wave_0_complete: true` set in frontmatter

**Approval:** pending checker re-review post-revision.
