# Phase 137: Promotion into Occurrences - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Promote the Phase 136 deduplicated, coord-bearing checklist records into the occurrences pipeline as a fourth source arm, then carry that source through to the map's point layer.

Concretely, this phase delivers:
1. **ARM 4 in `int_combined`** — a `source='checklist'` `SELECT ... UNION ALL` arm sourced from the Phase 136 output (`int_checklist_dedup_status`), type-aligned with ARMs 1–3.
2. **dbt contract bump** — `marts/occurrences` grows from 33 → 34 columns (new `checklist_id`); the enforced contract test passes at the new count.
3. **Phase 111 isolation test retirement** — the row-ceiling test that asserted checklist exclusion is explicitly retired (not skipped/left red) with a comment referencing the v4.7 reversal, and replaced with a positive `source='checklist'` existence assertion.
4. **`geo_blob` ↔ `features.ts` atomic change** — `sqlite_export._GEO_COLS` gains checklist identity and `src/features.ts` decodes a `checklist:<N>` occId, in **one atomic commit** (the positional coupling these two share is the whole point of PRO-04).

**Out of scope (later phases):** per-source counts UI, detail-card rendering, and any point-layer styling for checklist points → Phase 138 (UIX-*). This phase ends when checklist points exist in `occurrences.parquet`/`occurrences.db` and decode to a valid `checklist:<N>` occId; it does not build the frontend that *displays* them distinctly.

**Upstream gate (cleared):** Phase 136's HUMAN-REVIEW GATE — the curator must have reviewed `dedup_candidate_pairs.csv` and marked confirmations in `dedup_decisions.csv` before promotion. STATE.md records this as "curator dedup gate cleared" (2026-06-08).

</domain>

<decisions>
## Implementation Decisions

The user reviewed the open implementation areas and **delegated all of them** ("I don't have an opinion on any of these"). Everything below is a **derived default**, grounded in the Phase 136 output models and the ROADMAP success criteria — the planner has flexibility where noted, but the defaults are load-bearing enough to act on without re-asking.

### ARM 4 source & suppression enforcement
- **D-01 (derived):** ARM 4 reads **`int_checklist_dedup_status`** (the Phase 136 view = `int_checklist_collapsed.*` + `dedup_status`). The model's own header documents the consumption contract: filter with **`WHERE dedup_status IS DISTINCT FROM 'confirmed'`** (keep everything except curator-confirmed cross-source duplicates; NULL/`rejected` are kept). Apply this filter **in the promotion arm**, so `occurrences.parquet` is the single source of truth for what's a live point.
- **D-02 (derived):** Belt-and-suspenders **no-coord exclusion** in ARM 4: `AND lat IS NOT NULL AND lon IS NOT NULL`. (`stg_checklist__records_full` already filters to `coord_flag = 'valid'` upstream, but the success criterion explicitly requires no-coord records excluded, so assert it at the promotion boundary too.)

### New contract column
- **D-03 (derived):** New column **`checklist_id INTEGER`** = the surviving **`ObjectID`** from `int_checklist_collapsed` (lowest-ObjectID survivor per D-03 of Phase 136). ObjectID is the stable upstream checklist PK and is used as an integer throughout the dedup models.
- **D-04 (derived):** ARMs 1–3 each emit **`NULL::INTEGER AS checklist_id`** in their `SELECT` lists so the `UNION ALL` type-aligns (success criterion 2). Add `checklist_id` to the `marts/occurrences` contract in `schema.yml` as `data_type: integer`. Contract column count **33 → 34**.

### Contract breadth (minimal vs richer)
- **D-05 (derived, minimal):** Add **only `checklist_id`** (34 columns total — the "33 → 34 minimum" the success criteria call for). `collapsed_count` and other checklist-only provenance (`verbatim_name`, `locality`, `family`, `date_quality`) stay available **upstream** in `int_checklist_dedup_status` but are **not** promoted into the contract in this phase. If Phase 138's detail card needs `collapsed_count` ("represents N collapsed records"), surface it then — keeping the contract bump minimal here reduces NULL-cast churn across ARMs 1–3. *(Planner may surface `collapsed_count` now if it's cheap and clearly needed; default is minimal.)*

### Checklist-row column population
- **D-06 (derived):** A checklist row populates: `lat`, `lon`, `year`, `month`, `recordedBy`, `canonical_name`, `taxon_id`, `source='checklist'`, `checklist_id`, plus `county`/`ecoregion_l3` via the existing `occurrences.sql` spatial join (no special-casing needed — the join runs over all `int_combined` rows). The `date` varchar is built at **available precision** from `year`/`month`/`day` + `date_quality` (e.g. `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`); checklist records are often month- or year-precision. All ecdysis/iNat/sample-specific columns (`ecdysis_id`, `catalog_number`, `observation_id`, `specimen_*`, `floralHost`, `host_*`, `sample_*`, `is_provisional`, `image_url`, `obs_url`, `user_login`, `license`, etc.) are **NULL with correct casts**.

### Phase 111 test retirement
- **D-07 (derived, honest-tests default):** Retire `test_occurrences_row_count_not_inflated_by_checklist` (in `data/tests/test_dbt_scaffold.py`). **Keep a re-baselined row-count ceiling guard** (raised to absorb the ~10k checklist rows) **AND add a positive assertion** that `source='checklist'` rows exist in `occurrences.parquet`. Add a comment in the test file referencing the **v4.7 reversal** decision (checklist records now intentionally enter `int_combined`). Rationale: the success criterion strictly requires only the positive assertion + comment, but dropping the explosion guard entirely loses a real safety net — consistent with the v4.8 honest-suite posture. *(Planner discretion on the exact new ceiling; the positive assertion + v4.7 comment are non-negotiable per PRO-03.)*

### geo_blob ↔ features.ts atomic coupling
- **D-08 (derived):** **Append** `checklist_id` to `sqlite_export._GEO_COLS` (new index 7, after `source`) so existing positional indices (lat=0 … source=6) stay stable. In `src/features.ts` `_buildGeoJSONFromRaw`, read `row[7]` and add a decode branch **`else if (checklist_id != null) occId = \`checklist:${checklist_id}\``** appended to the existing if/else chain (checklist rows have NULL ecdysis/observation/specimen ids, so chain position is immaterial — append is cleanest). Update the `_GEO_COLS` column-order comment. **Single atomic commit** covering both files + a Vitest test that decodes a `checklist:<N>` occId and asserts `_buildGeoJSONFromRaw` drops no checklist point (PRO-04).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 137: Promotion into Occurrences" — goal + 4 success criteria (lock WHAT)
- `.planning/REQUIREMENTS.md` — PRO-01, PRO-02, PRO-03, PRO-04 (accept criteria)

### Upstream phase this consumes (read first)
- `.planning/phases/136-deduplication/136-CONTEXT.md` — the dedup contract: `dedup_status` vocabulary (`confirmed` suppresses), `collapsed_count`, the audit-vs-seed split, `pair_key`. PRO-* consumes 136's output.
- `data/dbt/models/intermediate/int_checklist_dedup_status.sql` — **ARM 4's direct input.** Its header documents the exact Phase 137 consumption contract (`WHERE dedup_status IS DISTINCT FROM 'confirmed'`). Output columns = `int_checklist_collapsed.*` + `dedup_status`.
- `data/dbt/models/intermediate/int_checklist_collapsed.sql` — the collapsed survivor columns available to ARM 4: `ObjectID`, `canonical_name`, `lat`, `lon`, `year`, `month`, `day`, `date_quality`, `recordedBy`, `verbatim_name`, `locality`, `family`, `coord_flag`, `taxon_id`, `collapsed_count`.

### Code this phase modifies (read before planning)
- `data/dbt/models/intermediate/int_combined.sql` — add ARM 4 here; ARMs 1–3 (ecdysis / waba_sample / inat_obs) need the `NULL::INTEGER AS checklist_id` cast. Materialized as TABLE.
- `data/dbt/models/marts/occurrences.sql` — spatial-join pipeline over `int_combined`; checklist rows flow through the existing county/ecoregion joins unchanged.
- `data/dbt/models/marts/schema.yml` — the **enforced 33-column `occurrences` contract**; add `checklist_id` (`data_type: integer`) → 34 columns.
- `data/sqlite_export.py` §`_GEO_COLS` (~line 459) — geo_blob column order `[lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, source]`; append `checklist_id`.
- `src/features.ts` `_buildGeoJSONFromRaw` (lines 17–48) — positional decode + occId construction (`ecdysis:` / `inat:` / `inat_obs:`); add `checklist:<N>` branch. **Atomic with `_GEO_COLS`** (positional coupling).
- `data/tests/test_dbt_scaffold.py` §`test_occurrences_row_count_not_inflated_by_checklist` (~line 196) — the Phase 111 isolation test to retire (PRO-03).

### v4.7 research
- `.planning/research/ARCHITECTURE.md` — `stg_checklist__records_full` / ARM / promotion sketches
- `.planning/research/PITFALLS.md` — UNION ALL type-alignment and coordinate pitfalls

### Domain vocabulary
- `CLAUDE.md` §"Domain Vocabulary" + §"ID format" — `ecdysis:<int>` / `inat:<int>` prefixes are load-bearing; `checklist:<N>` is the net-new prefix this phase introduces.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`int_checklist_dedup_status` view** (Phase 136): ARM 4's input, with a documented consumption contract — no new dedup logic needed in this phase, just SELECT + filter.
- **`occurrences.sql` spatial join**: runs over the whole `int_combined`; checklist points get `county`/`ecoregion_l3` for free once they're in ARM 4.
- **Existing ARM 2/3 NULL-cast pattern** in `int_combined.sql`: ARMs already emit typed `NULL AS ...` for source-specific columns — the `NULL::INTEGER AS checklist_id` cast follows the same shape.
- **Append-only `_GEO_COLS` precedent** (Phase 131 NORM-02): the column list + `features.ts` decode were already changed together in one commit when `source` moved index 9→6; the comment there explicitly documents the atomic-commit coupling. PRO-04 repeats that move.

### Established Patterns
- dbt `int_*` intermediate models own record-level transforms; `marts/occurrences` is the enforced-contract boundary.
- The geo_blob is a single pre-serialized TEXT blob; `features.ts` decodes it positionally — index drift between `_GEO_COLS` and `features.ts` is the documented failure mode, hence the atomic-commit requirement.
- occId disambiguation by prefix (`ecdysis:` / `inat:` / `inat_obs:`) — `checklist:` extends this set.

### Integration Points
- **Input:** `int_checklist_dedup_status` → ARM 4 of `int_combined` (filtered) → `occurrences.parquet` → `sqlite_export` geo_blob → `features.ts` point layer.
- **Contract gate:** `bash data/dbt/run.sh build` enforces the 34-column contract (no separate JS validator — see CLAUDE.md Known State).
- **Downstream consumer:** Phase 138 reads `source='checklist'` + (later) `collapsed_count` for per-source counts and detail-card rendering.

</code_context>

<specifics>
## Specific Ideas

- `int_checklist_dedup_status.sql`'s header is effectively a pre-written spec for ARM 4's WHERE clause — the planner should treat `WHERE dedup_status IS DISTINCT FROM 'confirmed'` as the canonical filter, not reinvent it.
- The v4.7 reversal comment (PRO-03) should be explicit and greppable — a future reader hitting the retired test must understand that checklist exclusion was an *intentional* earlier invariant that v4.7 deliberately reversed, not a regression.

</specifics>

<deferred>
## Deferred Ideas

- **Per-source counts UI + detail card + checklist point styling** — Phase 138 (UIX-*). This phase only makes the points exist and decode.
- **Surfacing `collapsed_count` into `occurrences.parquet`** — deferred to Phase 138 if the detail card needs "represents N collapsed records"; kept out of the contract here to minimize the bump (D-05).
- **Richer checklist provenance in the contract** (`verbatim_name`, `locality`, `family`, `date_quality`) — available upstream; promote only if a concrete downstream consumer needs it.

</deferred>

---

*Phase: 137-promotion-into-occurrences*
*Context gathered: 2026-06-08*
