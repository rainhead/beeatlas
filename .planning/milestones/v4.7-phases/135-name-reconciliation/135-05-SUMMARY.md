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

## Post-gate fixes (curator review round, 2026-06-08)

During the curator's review of the audit, three resolver issues were found and fixed (all committed; gate re-green, dbt build PASS=79/ERROR=0, 66 tests green):

1. **Slash-compound canonical casing.** `slash_lca` rows wrote the raw capitalized verbatim into `canonical_name`/`accepted_canonical_name` (violating the lowercase-canonical convention; `accepted_canonical_name` disagreed with `resolved_taxon_id`). Now `canonical_name` is the normalized lowercase slash form (`agapostemon texanus/angelicus`) and `accepted_canonical_name` is the resolved genus (`agapostemon`, matching the genus-LCA taxon 606634). `verbatim_name` still holds the raw string.
2. **Fix A — empty GBIF taxon_ids (iNat fallback).** 19/30 GBIF-accepted names had an empty `taxon_id` because they're absent from the observation-driven bridge (e.g. `andrena chalybiodes → chalybioides`). Added an iNat taxa-API fallback in the GBIF tier that resolves the accepted name, upserts the live bridge, and persists to the committed `curated_taxon_ids.csv` seed (nightly-loaded by `resolve_taxon_ids`, so durable across clean rebuilds). **Empty GBIF taxon_ids: 19 → 1** (`anthidiellum robertsoni`, a subspecies already curated to 361496). `chalybiodes` now resolves end-to-end to 573383.
3. **Fix B — `--refresh-checklist` non-idempotency.** The resolver read its own `gbif_checklist_synonyms.csv` back into the synonym map, so a second refresh resolved those names as `synonym_seed` before the GBIF tier (the only seed writer) and **truncated the seed to header-only**. Removed the read-back; GBIF is re-queried each refresh. Verified stable across two consecutive runs (seed=12, curated=18 unchanged).

## Deviations (remaining, for curator awareness)

1. **Fuzzy candidate count: 6 rows / 2 names, vs RESEARCH's ~13 estimate.** The ~13 figure is the *fixture* expectation (`test_at_least_13_fuzzy_candidates` runs with GBIF mocked OFF, so all misspellings fall to rapidfuzz). Against live data GBIF is ON and resolves most misspellings as `VARIANT`/`EXACT`, leaving only 2 genuinely-unmatchable names for fuzzy: `Andrena unknown` (placeholder) and `Andrena prunorum-prunorum` (malformed duplicated epithet). RCN-04's mechanism (inert fuzzy review CSV) is satisfied.
2. **1 dbt WARN** (`test_lin05_lineage_coverage`, warn-only by design, 1 taxon) — a stale-lineage artifact unrelated to 135-05, not a regression.

Final tier split (post-fix): ~947 exact, 26 gbif (1 empty taxon_id), 2 slash_lca, 2 fuzzy; 0 unresolved.

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
