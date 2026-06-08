# Plan 135-05 Summary — Pipeline wiring, one-time GBIF refresh, build gate

**Status:** Automated tasks complete (Tasks 1–3). **Task 4 (HUMAN-REVIEW GATE) is pending curator action** — Phase 136 must NOT begin until the curator reviews the audit and signs off.
**Requirements:** RCN-02, RCN-03, RCN-07
**Executed:** 2026-06-08 (inline on the main working tree on maderas — worktree isolation was unsafe because the full dbt build needs the local `data/beeatlas.duckdb` + host-cached spatial extension).

## What was built

### Task 1 — run.py STEPS wiring (committed)
- Added `_REFRESH_CHECKLIST = "--refresh-checklist" in sys.argv` and imported `resolve_checklist_names`, `check_checklist_resolution_gate`.
- Inserted two STEPS entries immediately after `("checklist", load_checklist)`: `resolve-checklist-names` (gated by `_REFRESH_CHECKLIST` — a **no-op on the nightly path**, zero GBIF calls, RCN-03) and `checklist-resolution-gate` (hard-fails only on `source='unresolved'`, D-04).
- Verified the **Anthophila ancestor = 630955** in `taxa.csv.gz` (a confirmed bee's ancestry contains `/630955/`); the `assert_no_anthophila_homonyms.sql` literal was already correct — no change needed.

### Task 2 — one-time GBIF refresh (committed)
- **Environmental prerequisite handled:** the working `beeatlas.duckdb` was stale (pre-Phase-134) and lacked `checklist_data.checklist_records_full`. Ran `load_checklist()` to materialize it (50,646 rows, 975 distinct verbatim names) before resolving.
- Ran `resolve_checklist_names(refresh=True)` directly (NOT `run.py --refresh-checklist`, which would have run the whole nightly pipeline). Result: **975 resolved, 0 unresolved.** Tier split: **941 exact, 30 gbif, 2 slash_lca, 2 fuzzy.**
- Committed the three regenerated artifacts: `data/checklist_name_resolution_audit.csv` (975 rows + header), `data/checklist_fuzzy_review.csv` (6 candidate rows / 2 names), `data/dbt/seeds/gbif_checklist_synonyms.csv` (12 GBIF `VARIANT` spelling-correction mappings, the active lowest-precedence 3rd arm of `int_synonyms`, RCN-06).
- **Gate green:** `check_checklist_resolution_gate()` → `checklist-resolution-gate: OK (975 names resolved)`.

### Task 3 — full dbt build + tests (verification-only, no file changes)
- `bash dbt/run.sh build` → **PASS=79 WARN=1 ERROR=0** (99.9s). `assert_no_anthophila_homonyms` **PASS** (RCN-07 homonym guard green against real resolved data).
- Scoped pytest (`test_resolve_checklist_names.py`, `test_checklist_pipeline.py`, `test_canonical_name.py`) → **66 passed, 0 failed** (3 skipped + 3 deselected = network/integration-marked). The 18 pre-existing `dbt_sandbox` failures (`test_resolve_taxon_ids.py`/`test_dbt_diff.py`) were correctly left out of scope (RESEARCH Pitfall 7).

## Deviations

1. **Fuzzy candidate count: 6 rows / 2 names, vs RESEARCH's ~13 estimate.** Live GBIF absorbed more misspellings into the `gbif` tier (30 names) than the research estimate predicted, leaving fewer for the local rapidfuzz tier. RCN-04's mechanism (fuzzy candidates written to an inert review CSV, never auto-applied) is satisfied. The 2 fuzzy names are `Andrena unknown` (a placeholder) and `Andrena prunorum-prunorum` (malformed duplicated epithet) — both legitimate review items.
2. **Stale iNat bridge caveat.** `inaturalist_data.canonical_to_taxon_id` (919 rows) was carried from the pre-rebuild DB; only `checklist_records_full` was freshly loaded, not a full `inaturalist`/`resolve-taxon-ids` rebuild. A current bridge could shift a few names between the `exact` and `gbif` tiers. Mitigated by: the 12 GBIF mappings are all orthographic `VARIANT` corrections independent of bridge state, GBIF/fuzzy are promote-reviewable, and **the curator gate (Task 4) reviews all tier assignments.**
3. **1 dbt WARN** (`test_lin05_lineage_coverage`, warn-only by design, 1 taxon) — a stale-lineage artifact unrelated to 135-05, not a regression.

## ⏸ Task 4 — HUMAN-REVIEW GATE (pending curator)
The committed `checklist_name_resolution_audit.csv` lists every name → taxon_id decision with its `source` tier + confidence; `checklist_fuzzy_review.csv` lists the fuzzy candidates. **Per the ROADMAP gate, Phase 136 must not begin until the curator:**
1. Reviews the audit (sort by `confidence` ascending) and the fuzzy-review CSV.
2. Promotes any trusted GBIF/fuzzy match by adding a one-line row to `data/dbt/seeds/occurrence_synonyms.csv` (the only promotion mechanism, D-03).
3. Reruns `cd data && bash dbt/run.sh build` green if any promotions were made.
Unconfirmed candidates stay unpromoted (auditable, inert) and do not block the build.

## Key files
- `data/run.py` — no-op nightly resolver + gate STEPS (RCN-03)
- `data/checklist_name_resolution_audit.csv` — committed audit (curator review surface)
- `data/checklist_fuzzy_review.csv` — inert fuzzy candidates (RCN-04)
- `data/dbt/seeds/gbif_checklist_synonyms.csv` — 12 GBIF VARIANT corrections (RCN-06 3rd arm)
- `data/dbt/tests/assert_no_anthophila_homonyms.sql` — RCN-07 guard (PASS; 630955 confirmed)

## Self-Check: PASSED (automated tasks). Phase gate awaits curator sign-off (Task 4).
