---
phase: 077-lineage-coverage-expansion
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 8/8 must-haves verified (in-codebase); 1 must-have requires live-DB human verification
overrides_applied: 0
re_verification: null
human_verification:
  - test: "Run live pipeline and confirm ≥95% coverage on production DB"
    expected: "After `cd data && uv run python run.py`, the LIN-05 coverage SQL returns ≥0.95 against the live `data/beeatlas.duckdb`; `data/lineage_unresolved.csv` is populated with (canonical_name, reason, attempted_at) rows for the residual <5%."
    why_human: "Phase goal threshold (`≥95% coverage on real iNat data`) cannot be verified statically — requires (a) network access to api.inaturalist.org, (b) ~12 minutes of paced (≤1 req/sec) HTTP, and (c) the live production DuckDB. The test-suite assertion `test_lineage_coverage_threshold` only proves the SQL gate works against a deterministic 19/20 fixture (=0.95 exactly)."
  - test: "Confirm the regenerated data/lineage_unresolved.csv is committed (or its contents are reasonable)"
    expected: "After the live pipeline run, `data/lineage_unresolved.csv` contains only rows the user agrees should remain unresolved (extinct synonyms, taxonomic errata)."
    why_human: "Whether the residual unresolved set is acceptable is a curation decision, not a code verification."
---

# Phase 77: Lineage Coverage Expansion — Verification Report

**Phase Goal (from ROADMAP.md):** Eliminate the ~31% iNat lineage coverage gap by introducing a canonical-name → taxon_id bridge populated by a new resolver step in the data pipeline. After this phase, ≥95% of canonical_names from `checklist_data.species ⊕ ecdysis_data.occurrences` should resolve to a `taxon_id` whose `taxon_lineage_extended` row has non-NULL family.

**Verified:** 2026-05-03
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The phase delivers three layers of code that together produce the goal: (1) a resolver module that populates the bridge, (2) a pipeline-step ordering that runs the resolver before the lineage walker, and (3) a SQL extension that makes the lineage walker read the bridge. All three are present and substantively implemented; the only thing the verifier cannot do is run the live HTTP pipeline against the production DB and observe the ≥95% threshold.

### Observable Truths

| #   | Truth                                                                                                                  | Status     | Evidence                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bridge table `inaturalist_data.canonical_to_taxon_id` is created (DDL with PK on canonical_name)                       | ✓ VERIFIED | `data/resolve_taxon_ids.py:24-33` (`CREATE TABLE IF NOT EXISTS …`) and `data/tests/conftest.py:147` (test DDL match)                                                                                                                  |
| 2   | Public entry `resolve_taxon_ids(refresh: bool = False)` exists and reuses `_inat_get_with_retry` from inaturalist_pipeline (no duplicated retry) | ✓ VERIFIED | `data/resolve_taxon_ids.py:17` (`from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS`), `:183` (signature)                                                                                                       |
| 3   | Source SQL is the FULL OUTER union of checklist+occurrences LEFT JOIN bridge (= what's missing)                        | ✓ VERIFIED | `data/resolve_taxon_ids.py:42-55` (`WITH u AS (… UNION …) … LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name) WHERE b.canonical_name IS NULL`)                                                                  |
| 4   | LIN-02 invariants: ≤1 req/sec pacing (`time.sleep(_INAT_PACE_SECONDS)` UNCONDITIONAL) + retry via shared helper (429/5xx)      | ✓ VERIFIED | `data/resolve_taxon_ids.py:145` (`time.sleep(_INAT_PACE_SECONDS)` runs every loop iteration, even on rank-fallback); retry handled inside `_inat_get_with_retry`. Test `test_pacing_sleep_called_per_request`, `test_retry_on_429_then_succeeds`, `test_retry_on_5xx_then_succeeds` pass. |
| 5   | LIN-03 cache invariant: bridge IS the cache; back-to-back runs make 0 calls; `--refresh-lineage` retries previously-failed names only | ✓ VERIFIED | `data/run.py:37,47` (`_REFRESH_LINEAGE = "--refresh-lineage" in sys.argv`; lambda passes through). `_names_to_resolve` excludes already-bridged names. Test `test_second_run_makes_no_api_calls`, `test_refresh_retries_only_failures` pass. |
| 6   | LIN-04 unresolved CSV: written each run with header `(canonical_name, reason, attempted_at)`; reason ∈ {404, ambiguous, api_error} | ✓ VERIFIED | `data/resolve_taxon_ids.py:192-195` (header + writerows in `"w"` mode); `_resolve_one` writes `last_reason ∈ {"404","ambiguous","api_error"}` (lines 143/151/155/159). Tests `test_unknown_name_writes_404_row`, `test_ambiguous_match_writes_ambiguous_row`, `test_api_error_writes_api_error_row`, `test_unresolved_csv_schema` pass. |
| 7   | Pipeline wiring: `resolve-taxon-ids` step runs immediately after `checklist` and immediately before `taxon-lineage-extended`; `taxon-lineage-extended` appears EXACTLY ONCE | ✓ VERIFIED | `data/run.py:47-48`. Live introspection: `[ecdysis, ecdysis-links, inaturalist, waba, projects, anti-entropy, checklist, resolve-taxon-ids, taxon-lineage-extended, export, feeds]`. count('taxon-lineage-extended')==1. |
| 8   | `enrich_taxon_lineage_extended` source SQL has THREE UNION arms — observations + waba_observations + bridge (Pitfall #2 closed) | ✓ VERIFIED | `data/inaturalist_pipeline.py:208-220` — third arm `SELECT taxon_id AS taxon__id FROM inaturalist_data.canonical_to_taxon_id WHERE taxon_id IS NOT NULL`. Regression test `test_enrich_includes_bridge_taxon_ids` (test_taxon_lineage_extended.py:155) asserts a bridge-only ID is walked. |
| 9   | LIN-05 (≥95% coverage) holds against the live DB after a full pipeline run                                              | ? UNCERTAIN | Test `test_lineage_coverage_threshold` (test_resolve_taxon_ids.py:600) verifies the SQL gate against the deterministic 19/20=0.95 fixture, PASSES. Live-DB threshold requires running real HTTP pipeline — see `human_verification` section. |

**Score:** 8/8 must-haves verifiable in-codebase are VERIFIED. The 9th (live-DB ≥95%) is intrinsically a human-verifiable item per the orchestrator's context note.

### Required Artifacts

| Artifact                                       | Expected                                              | Status      | Details                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `data/resolve_taxon_ids.py`                    | resolver module with public `resolve_taxon_ids()`     | ✓ VERIFIED  | 211 lines (planning summary stated 210 — 1-line drift, immaterial). All 5 documented helpers present (`_ensure_bridge_table`, `_names_to_resolve`, `_pick_match`, `_resolve_one`, `resolve_taxon_ids`). Module imports cleanly. |
| `data/tests/test_resolve_taxon_ids.py`         | 17-test resolver suite + LIN-05 threshold test (=18)  | ✓ VERIFIED  | 626 lines; pytest collects 18 tests; all 18 pass.                                         |
| `data/tests/conftest.py` (modified)            | bridge DDL + 20-name LIN-05 fixture (19/20=0.95) + _zero_inat_pacing extension to resolve_taxon_ids | ✓ VERIFIED | DDL at lines 146-153; bridge seed (19 rows) at 442-466; lineage seed extension; `_zero_inat_pacing` extended (515-535) with try/except ImportError; coverage SQL returns exactly 0.95. |
| `data/run.py` (modified)                       | imports resolve_taxon_ids; STEPS reordered; --refresh-lineage flag wired | ✓ VERIFIED  | Import at :33; flag at :37; STEPS at :39-51 with lambda at :47.                          |
| `data/inaturalist_pipeline.py` (modified)      | enrich_taxon_lineage_extended source SQL has 3rd UNION arm; docstring updated | ✓ VERIFIED  | Third arm at :215-218; docstring at :189-194 enumerates three sources. UNION count inside function body = 2 (= 3 SELECT arms). |
| `data/tests/test_taxon_lineage_extended.py` (modified) | new test_enrich_includes_bridge_taxon_ids; lineage_db fixture creates bridge | ✓ VERIFIED  | Test at :155-199; asserts `'300003' in sent_ids`. lineage_db fixture extended with bridge DDL. Test passes. |
| `data/.gitignore`                              | does NOT exclude lineage_unresolved.csv (matches checklist_unmatched.csv precedent) | ✓ VERIFIED  | `git check-ignore -v data/lineage_unresolved.csv` exits 1 (NOT IGNORED). `*.csv` not present in `data/.gitignore`. |

### Key Link Verification

| From                                              | To                                              | Via                                                       | Status   | Details                                                                                  |
| ------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `data/resolve_taxon_ids.py`                       | `data/inaturalist_pipeline.py`                  | `from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS` | ✓ WIRED  | Line 17.                                                                                 |
| `data/resolve_taxon_ids.py`                       | `inaturalist_data.canonical_to_taxon_id`        | `INSERT … ON CONFLICT (canonical_name) DO UPDATE`         | ✓ WIRED  | Lines 161-172 (UPSERT used inside `_resolve_one`).                                       |
| `data/run.py STEPS`                               | `resolve_taxon_ids`                             | `lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)`     | ✓ WIRED  | Line 47. STEPS list invokes via `fn()` — lambda is the zero-arg adapter.                  |
| `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended` | `inaturalist_data.canonical_to_taxon_id` | third UNION arm in source SQL                              | ✓ WIRED  | Lines 215-218.                                                                           |
| `data/tests/test_resolve_taxon_ids.py`            | iNat HTTP boundary                              | `patch("inaturalist_pipeline.requests.get", …)`           | ✓ WIRED  | 9 instances; 0 instances of `patch("resolve_taxon_ids._inat_get_with_retry")` (Pitfall #4 closed). |

### Data-Flow Trace (Level 4)

| Artifact                                     | Data Variable                  | Source                                                | Produces Real Data | Status     |
| -------------------------------------------- | ------------------------------ | ----------------------------------------------------- | ------------------ | ---------- |
| `resolve_taxon_ids()`                        | `names` (canonical names)      | `checklist_data.species` ∪ `ecdysis_data.occurrences` LEFT JOIN bridge → DuckDB query | Yes (DB-driven)    | ✓ FLOWING  |
| `_resolve_one()`                             | `data["results"]`              | `_inat_get_with_retry(INAT_TAXA_URL, …)` (real HTTP at runtime; mocked in tests) | Yes                | ✓ FLOWING  |
| Bridge UPSERT                                | `match["id"]`                  | iNat response → `_pick_match` filter ladder            | Yes                | ✓ FLOWING  |
| `enrich_taxon_lineage_extended` taxon_ids list | row[0] from 3-arm UNION         | obs ∪ waba_obs ∪ bridge — all DB-driven                | Yes                | ✓ FLOWING  |

### Behavioral Spot-Checks

| Behavior                                    | Command                                                                                  | Result                | Status |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------- | ------ |
| Resolver module imports cleanly             | `uv run python -c "from resolve_taxon_ids import resolve_taxon_ids"`                     | exit 0                | ✓ PASS |
| STEPS list ordering                         | `uv run python -c "import run; ...assertions on STEPS index/count..."`                   | exit 0; STEPS printed | ✓ PASS |
| --refresh-lineage flag toggles _REFRESH_LINEAGE | `sys.argv.append('--refresh-lineage'); reload(run); assert run._REFRESH_LINEAGE is True` | True                  | ✓ PASS |
| Bridge UNION arm reachable from enrich source | `inspect.getsource(enrich_taxon_lineage_extended)` contains `canonical_to_taxon_id`     | True                  | ✓ PASS |
| `git check-ignore` does NOT match lineage_unresolved.csv | `git check-ignore -v data/lineage_unresolved.csv`                            | exit 1 (not ignored)  | ✓ PASS |
| Full pytest suite                           | `uv run pytest tests/`                                                                   | 103 passed in 13.21s  | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s)        | Description                                                                                                                                       | Status      | Evidence                                                                                                                                            |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIN-01      | 077-01, 077-02, 077-03 | Resolver queries iNat for every canonical_name in FULL OUTER union; persists to bridge                                                            | ✓ SATISFIED | `data/resolve_taxon_ids.py:42-88` (`_names_to_resolve`); UPSERT at 161-172. Tests `test_cold_start_resolves_all_seeded_names`, `test_names_to_resolve_unions_both_sources` pass. |
| LIN-02      | 077-02                | ≤1 req/sec, honor 429/5xx with retry/backoff (mirror Phase 76 pattern)                                                                            | ✓ SATISFIED | Pacing at line 145 unconditional; retry via shared `_inat_get_with_retry`. Tests `test_pacing_sleep_called_per_request`, `test_retry_on_429_*`, `test_retry_on_5xx_*` pass. |
| LIN-03      | 077-02, 077-03        | Bridge IS the cache; back-to-back = 0 calls; `--refresh-lineage` flag                                                                              | ✓ SATISFIED | `_names_to_resolve` excludes already-bridged names; `_REFRESH_LINEAGE` flag at run.py:37,47. Tests `test_second_run_makes_no_api_calls` (asserts call_count==0), `test_refresh_retries_only_failures` pass. |
| LIN-04      | 077-02                | Unresolved → CSV with (canonical_name, reason, attempted_at); reason ∈ {404, ambiguous, api_error}                                                | ✓ SATISFIED | resolve_taxon_ids.py:192-195 (CSV header + body). Three reason paths in `_resolve_one`. Tests `test_unknown_name_writes_404_row`, `test_ambiguous_match_writes_ambiguous_row`, `test_api_error_writes_api_error_row`, `test_unresolved_csv_schema` pass. |
| LIN-05      | 077-01, 077-03        | After phase ships, ≥95% of FULL OUTER union species have non-NULL `family` via `taxon_lineage_extended` LEFT JOIN; pytest fixture asserts threshold | ✓ SATISFIED (test layer) / ? NEEDS HUMAN (live DB) | `test_lineage_coverage_threshold` (test_resolve_taxon_ids.py:600) PASSES against deterministic 19/20=0.95 fixture. Live-DB ≥95% requires running pipeline against api.inaturalist.org — see human_verification. |

REQUIREMENTS.md already marks LIN-01..LIN-05 as `Complete` (lines 173-177); they were also unchecked in ROADMAP via `[x]` for plans 01..03.

**Orphaned requirements:** none — REQUIREMENTS.md maps Phase 77 to exactly LIN-01..LIN-05, and every plan in the directory carries the appropriate subset in its frontmatter `requirements:` field. No requirement is unaccounted-for.

### Anti-Patterns Found

None. Spot-scanned the new artifacts:
- `data/resolve_taxon_ids.py` has no TODO/FIXME/placeholder comments. The single `# noqa: T201` at line 199 is a documented project convention for pipeline-progress prints (pattern C in PATTERNS.md).
- No empty implementations (`return null|{}|[]`) outside the legitimate `unresolved: list[tuple] = []` accumulator at line 189.
- No `console.log`-style placeholders in tests; all 18 tests carry real assertions.
- `data/tests/test_resolve_taxon_ids.py` does not patch `_inat_get_with_retry` (Pitfall #4 verified clean — count = 0).
- The plan's `utcnow()` deprecation was caught in flight and replaced with `dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat()` (line 178) — no DeprecationWarnings emitted by pytest.
- `dt.datetime.utcnow()` does NOT appear in the source.

### Human Verification Required

#### 1. Live pipeline produces ≥95% coverage on the production DB

**Test:** Run `cd data && uv run python run.py` against `data/beeatlas.duckdb`. Wait for the new `--- resolve-taxon-ids ---` step to complete (~12 minutes for ~700 unresolved names at ≤1 req/sec on a cold start). Then run the LIN-05 coverage SQL:

```sql
SELECT count(*) FILTER (WHERE tle.family IS NOT NULL) * 1.0 / count(*)
FROM (
    SELECT DISTINCT canonical_name FROM checklist_data.species WHERE canonical_name IS NOT NULL
    UNION
    SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences WHERE canonical_name IS NOT NULL
) u
LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.taxon_id = b.taxon_id;
```

**Expected:** Result ≥ 0.95.
**Why human:** Requires network (api.inaturalist.org), real wall-clock pacing, and the live DB — none of which are appropriate for an automated verifier to perform. The SUMMARY.md user-setup section already calls this out as a phase-gate task.

#### 2. Review the regenerated `data/lineage_unresolved.csv`

**Test:** After the live run, open `data/lineage_unresolved.csv`. Confirm the residual unresolved set is reasonable (extinct synonyms, taxonomic errata) and ≤5% of the union.
**Expected:** A small (<35 row) list whose contents the user agrees should remain unresolved.
**Why human:** Curation decision — only domain knowledge can judge whether a given unresolved name is acceptable.

### Gaps Summary

No gaps. Every must-have that can be checked statically or with the offline test suite is verified. The phase ships test scaffolding (Plan 01), the resolver module + suite (Plan 02), and pipeline wiring + LIN-05 threshold test (Plan 03). The full suite is green at 103 tests; the orchestrator's regression gates (pytest 103 passed, npm test 172 passed) are also green.

The only outstanding item is the LIN-05 threshold against the **live** production DB, which is intrinsically out of scope for offline verification and is properly routed to the user as a phase-gate manual check.

---

_Verified: 2026-05-03_
_Verifier: Claude (gsd-verifier)_
