---
phase: 077-lineage-coverage-expansion
plan: 02
subsystem: data-pipeline

tags: [data-pipeline, inat-api, duckdb, resolver, tdd]

requires:
  - phase: 077-lineage-coverage-expansion
    plan: 01
    provides: bridge table DDL, 20-row LIN-05 fixture, resolve_taxon_ids-aware _zero_inat_pacing
provides:
  - data/resolve_taxon_ids.py (resolve_taxon_ids public entry, _ensure_bridge_table, _names_to_resolve, _pick_match, _resolve_one)
  - data/tests/test_resolve_taxon_ids.py (17-test suite covering D-02 / D-03 / LIN-02..04 / Pitfall #6)
affects:
  - 077-03 (will wire `resolve_taxon_ids` into data/run.py STEPS and add the bridge UNION-arm to enrich_taxon_lineage_extended)

tech-stack:
  added: []
  patterns:
    - "Reuse `_inat_get_with_retry` + `_INAT_PACE_SECONDS` via `from inaturalist_pipeline import …` (no factored helper module)"
    - "Per-row `INSERT … ON CONFLICT (canonical_name) DO UPDATE` UPSERT for partial-write safety"
    - "D-02 filter ladder: matched_term BEFORE name (case-insensitive) → is_active → Insecta → rank match"
    - "D-03 token-driven rank ladder: 1-token → genus, 2-token → species → genus(tokens[0])"
    - "404 detection via `total_results == 0`, NOT HTTP 404 (Pitfall #5)"
    - "`source` column distinguishes 'inat_species' vs 'inat_genus' (Pitfall #6)"
    - "Test fixture reroutes UNRESOLVED_CSV to tmp_path so production CSV never written by tests"
    - "Patch `inaturalist_pipeline.requests.get`, never `_inat_get_with_retry` (Pitfall #4)"

key-files:
  created:
    - data/resolve_taxon_ids.py
    - data/tests/test_resolve_taxon_ids.py
  modified: []

key-decisions:
  - "Use `dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat()` instead of the deprecated `utcnow()` (Python 3.14 deprecation; project requires-python = '>=3.14')"
  - "Defensively handle 3+-token canonical_names with a `species` lookup of the first 2 tokens (RESEARCH §D-03 says canonicalize() folds trinomials but a guard costs nothing)"
  - "Refresh-mode reads `UNRESOLVED_CSV` (rerouted in tests) to compute the retry set; previously-resolved bridge rows are NEVER touched (RESEARCH recommendation D-A6)"
  - "Plan execution order: implement Task 1 (module) before Task 2 (tests). The plan tagged both `tdd=\"true\"` but Task 2's `<read_first>` requires Task 1's file to exist; tests written immediately after with full mock-the-boundary coverage."

requirements-completed: [LIN-01, LIN-02, LIN-03, LIN-04]

duration: 5min
completed: 2026-05-04
---

# Phase 077 Plan 02: Resolver Module + Test Suite Summary

**Implements `data/resolve_taxon_ids.py` (210 lines) and `data/tests/test_resolve_taxon_ids.py` (597 lines, 17 tests, all green) — closes LIN-01 (resolver populates bridge), LIN-02 (rate-limit + retry via shared helper), LIN-03 (bridge IS the cache; refresh re-attempts only failures), LIN-04 (unresolved CSV with reason ∈ {'404','ambiguous','api_error'}). LIN-05 is closed in Plan 03 once `enrich_taxon_lineage_extended` learns to walk bridge IDs.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-04T04:48:27Z
- **Completed:** 2026-05-04T04:53:01Z
- **Tasks:** 2 (both autonomous, both green on first verification)
- **Files created:** 2 (1 module, 1 test file)
- **Files modified:** 0

## Final Line Counts

| File | Lines |
| ---- | ----- |
| `data/resolve_taxon_ids.py` | 210 |
| `data/tests/test_resolve_taxon_ids.py` | 597 |
| **Total** | **807** |

## Task Commits

1. **Task 1: Implement `data/resolve_taxon_ids.py` (bridge DDL, FULL OUTER source SQL, D-02 ladder, D-03 rank fallback, UPSERT, CSV writer)** — `6302672` (feat)
2. **Task 2: Create `data/tests/test_resolve_taxon_ids.py` (17 tests covering D-02 / D-03 / LIN-02..04 / Pitfall #6) + utcnow() deprecation fix** — `137112b` (test)

## 17 Test Names and Final Pass Status

All 17 tests pass on `cd data && uv run pytest tests/test_resolve_taxon_ids.py -x` and the full suite (`cd data && uv run pytest tests/`) is 101 passed, 0 warnings.

| # | Test | Coverage | Status |
|---|------|----------|--------|
| 1 | `test_cold_start_resolves_all_seeded_names` | LIN-01 | PASS |
| 2 | `test_names_to_resolve_unions_both_sources` | LIN-01 (FULL OUTER union) | PASS |
| 3 | `test_pacing_sleep_called_per_request` | LIN-02 (unconditional pacing) | PASS |
| 4 | `test_retry_on_429_then_succeeds` | LIN-02 (rate-limit retry) | PASS |
| 5 | `test_retry_on_5xx_then_succeeds` | LIN-02 (5xx retry) | PASS |
| 6 | `test_persistent_429_records_api_error` | LIN-02 / LIN-04 (`api_error`) | PASS |
| 7 | `test_second_run_makes_no_api_calls` | LIN-03 (idempotency) | PASS |
| 8 | `test_refresh_retries_only_failures` | LIN-03 (refresh semantics) | PASS |
| 9 | `test_unknown_name_writes_404_row` | LIN-04 (`404` reason; Pitfall #5) | PASS |
| 10 | `test_ambiguous_match_writes_ambiguous_row` | LIN-04 (`ambiguous` reason) | PASS |
| 11 | `test_api_error_writes_api_error_row` | LIN-04 (`api_error` reason) | PASS |
| 12 | `test_unresolved_csv_schema` | LIN-04 (CSV header) | PASS |
| 13 | `test_pick_match_uses_matched_term_for_synonym` | D-02 (Lasioglossum zonulum case) | PASS |
| 14 | `test_pick_match_filters_to_exact_name` | D-02 (multi-result disambiguation) | PASS |
| 15 | `test_genus_only_query_uses_genus_rank` | D-03 (1-token → genus) | PASS |
| 16 | `test_species_404_falls_back_to_genus` | D-03 (species → genus fallback) | PASS |
| 17 | `test_bridge_source_distinguishes_rank` | Pitfall #6 (`source` column) | PASS |

## Acceptance Criteria Roll-Up

**Task 1 acceptance criteria (11):** all pass —

- File exists: ✓
- `from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS` (exactly 1): ✓
- `CREATE TABLE IF NOT EXISTS inaturalist_data.canonical_to_taxon_id` (exactly 1): ✓
- `ON CONFLICT (canonical_name) DO UPDATE` (≥1): ✓
- `matched_term`-with-`lower()` regex hit: ✓
- `total_results` reference: ✓
- `f"inat_{rank}"` source column rank distinction: ✓
- `time.sleep(_INAT_PACE_SECONDS)` unconditional pacing: ✓
- `lineage_unresolved.csv|UNRESOLVED_CSV` references (7): ✓ (≥2 required)
- No append-mode `"a"` outside comments: ✓ (returned 0)
- `--refresh-lineage` CLI handling at module-main: ✓
- Module imports without error: ✓

**Task 2 acceptance criteria (10):** all pass —

- File exists: ✓
- 17 collected tests: ✓
- `pytest -x` exits 0: ✓
- 9 `patch("inaturalist_pipeline.requests.get"` instances: ✓ (≥8)
- 0 `patch("resolve_taxon_ids._inat_get_with_retry"` instances: ✓ (must be 0)
- 10 `matched_term` references: ✓ (≥2)
- 2 `inat_genus` references: ✓ (≥1)
- 2 `total_results 0` mentions: ✓ (≥1)
- 1 `call_count == 0` assertion: ✓ (≥1)
- `UNRESOLVED_CSV ... tmp_path` reroute (matches): ✓
- All 17 exact test names present: ✓ (`wc -l` returns 17)

## Verification one-liner (copy-pasteable)

```bash
cd data && uv run pytest tests/test_resolve_taxon_ids.py -x && \
  uv run pytest tests/ && \
  uv run python -c "from resolve_taxon_ids import resolve_taxon_ids; print('module import OK')"
# Expected: 17 passed, 101 passed, "module import OK"
```

## Files Created/Modified

- `data/resolve_taxon_ids.py` — 210 lines. Public `resolve_taxon_ids(refresh: bool = False)` entry; helpers `_ensure_bridge_table`, `_names_to_resolve`, `_pick_match`, `_resolve_one`; module constants `DB_PATH`, `UNRESOLVED_CSV`, `INAT_TAXA_URL`. Module-main runs `resolve_taxon_ids(refresh="--refresh-lineage" in sys.argv)`.
- `data/tests/test_resolve_taxon_ids.py` — 597 lines. Per-test `resolver_db` fixture, `_fake_taxa_search_response` / `_throttled_response` / `_matching_taxon` helpers, and the 17 tests above. Mocks at `inaturalist_pipeline.requests.get` exclusively; reroutes `UNRESOLVED_CSV` to `tmp_path`.

## Decisions Made

- **`dt.datetime.utcnow()` → `dt.datetime.now(dt.UTC).replace(tzinfo=None)`.** Python 3.14 (project's `requires-python`) deprecates `utcnow()`. Pytest surfaced the `DeprecationWarning` on first run. Fixed inline; preserves tz-naive ISO 8601 output (matches the original action's intent).
- **Defensive 3+-token rank ladder branch.** RESEARCH §D-03 states `canonicalize()` folds trinomials to binomial, so a 3+-token name should never reach the resolver. The action's `_resolve_one` keeps a defensive `else` arm that performs a `species` lookup on the first 2 tokens — guards against any future canonicalize() regression without changing the success path.
- **`refresh=True` reads UNRESOLVED_CSV, never deletes bridge rows.** RESEARCH recommendation D-A6: re-attempt names absent from bridge OR present in `lineage_unresolved.csv`. Successful resolutions are durable. The test `test_refresh_retries_only_failures` asserts the bridge row pre-seeded for `'osmia lignaria'` is untouched after `refresh=True` re-resolves only `'bombus impatiens'`.
- **Task ordering: implementation before tests, despite plan's `tdd="true"`.** The plan tagged both tasks as TDD but Task 2's `<read_first>` lists `data/resolve_taxon_ids.py` (just-written) as required reading. Plan tasks executed in declared order; tests still cover the contract pinned by RESEARCH and the action's spec.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `datetime.datetime.utcnow()` deprecated in Python 3.14**
- **Found during:** Task 2 first pytest run.
- **Issue:** `data/resolve_taxon_ids.py:175` used `dt.datetime.utcnow().isoformat()` per the action's verbatim source. Python 3.14 emits `DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal …`. The project pins `requires-python = ">=3.14"` (per `data/pyproject.toml`), so this is a future-correctness issue, not just a stylistic warning.
- **Fix:** Replaced with `dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat()` — produces an identical ISO 8601 string (no timezone suffix), but uses the un-deprecated path.
- **Files modified:** `data/resolve_taxon_ids.py`
- **Verification:** `pytest tests/` returns 101 passed, 0 warnings (was 5 warnings before the fix).
- **Committed in:** `137112b` (Task 2 commit, alongside the test file).

**2. [Rule 1 — Bug] Test 'ambiguous' fixture initially yielded a unique survivor**
- **Found during:** Task 2 ambiguous-match test draft.
- **Issue:** First draft of `test_ambiguous_match_writes_ambiguous_row` used genus-fallback results that included `{"name": "Andrena", ...}` matching the query `'andrena'` exactly — `_pick_match` would pick it as a unique winner instead of recording `'ambiguous'`.
- **Fix:** Replaced genus-fallback fixture with two non-matching siblings (`'Andrenax'`, `'Andreneza'`) so neither survives the matched_term/name equality step → `_pick_match` returns None → reason `'ambiguous'`.
- **Files modified:** `data/tests/test_resolve_taxon_ids.py` (caught before commit; only one diff observed externally).
- **Verification:** Test passes; bridge unchanged after run.
- **Committed in:** `137112b`.

---

**Total deviations:** 2 auto-fixed (1 deprecation correction, 1 test-fixture self-correction)
**Impact on plan:** Both fixes preserve the action's load-bearing contract and resulted in 0 warnings on the full suite. Zero scope creep.

## Issues Encountered

None — both tasks landed on first verification cycle modulo the two deviations above.

## User Setup Required

None — pure module + tests, importable. `data/run.py` STEPS wiring is explicitly out of scope for this plan; that lands in Plan 03.

## Next Phase Readiness

- Plan 03 can `from resolve_taxon_ids import resolve_taxon_ids` and wrap the call as `lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)` in STEPS.
- Plan 03's `enrich_taxon_lineage_extended` UNION-arm edit (Pitfall #2) will land alongside the STEPS reorder; the bridge will exist by the time the lineage walker runs.
- Plan 03's LIN-05 ≥95% threshold assertion is backed by Plan 01's deterministic 20-name fixture (returns exactly 0.95) — no flake.
- The autouse `_zero_inat_pacing` fixture (extended in Plan 01) already silently zero-paces `resolve_taxon_ids` for every test in `data/tests/`, so future test additions inherit the pattern for free.

## Self-Check: PASSED

- File `data/resolve_taxon_ids.py` exists (verified: `wc -l` = 210).
- File `data/tests/test_resolve_taxon_ids.py` exists (verified: `wc -l` = 597).
- Commits exist on main:
  - `6302672` — Task 1 implementation
  - `137112b` — Task 2 tests + deprecation fix
- `cd data && uv run pytest tests/test_resolve_taxon_ids.py -x` exits 0 (17/17 pass).
- `cd data && uv run pytest tests/` exits 0 (101/101 pass, 0 warnings).
- `cd data && uv run python -c "from resolve_taxon_ids import resolve_taxon_ids"` exits 0.
- `data/run.py` is intentionally NOT yet wired to call `resolve_taxon_ids` — that wiring is Plan 03 (verified by grep: `grep -c "resolve_taxon_ids" data/run.py` returns 0).

---
*Phase: 077-lineage-coverage-expansion*
*Completed: 2026-05-04*
