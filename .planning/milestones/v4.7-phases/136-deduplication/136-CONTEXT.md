# Phase 136: Deduplication - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Two deduplication jobs over the Phase 134/135 full-fidelity checklist records (`checklist_data.checklist_records_full`, surfaced via `stg_checklist__records_full`):

1. **Internal collapse (DUP-01):** The ~5,184 exact internal duplicate groups (identical species, lat, lon, date, collector) collapse to a single record. This is deterministic and automatic — no human gate.
2. **Cross-source candidate flagging (DUP-02, DUP-03):** Checklist records that may duplicate an existing **Ecdysis specimen** (`int_ecdysis_base` / ARM 1 of `int_combined`) are detected **conservatively** and **flagged, never silently merged**. A build-generated `dedup_candidate_pairs.csv` lists every candidate pair; a curator confirms/rejects in a committed seed; only human-confirmed pairs suppress a checklist point from the eventual point layer.

**This phase is Phase C of the v4.7 DAG** (134 ingest → 135 reconciliation → **136 dedup** → 137 promotion → 138 frontend). It does **NOT** promote checklist rows into `int_combined`/`occurrences.parquet` (that is Phase 137 / PRO-01) and builds **no frontend** (Phase 138 / per-source counts display). It produces: the collapsed checklist record set, the candidate-pairs audit CSV, the curated decisions seed, and the `dedup_status` join that Phase 137 will consume.

**HUMAN-REVIEW GATE:** Phase 137 must not begin until the curator has reviewed `dedup_candidate_pairs.csv` and marked confirmations in the decisions seed. Unreviewed candidates must not suppress any point.

Requirements: DUP-01, DUP-02, DUP-03 (see ROADMAP §Phase 136 for the 3 success criteria — they lock WHAT; the decisions below lock HOW).

</domain>

<decisions>
## Implementation Decisions

### Cross-source sign-off persistence (DUP-02, DUP-03)
- **D-01:** **Two-file split, mirroring Phase 135's audit-vs-seed pattern.** The build **always rewrites** `dedup_candidate_pairs.csv` as a pure, regenerated **audit artifact** (the curator's review surface). A **separate committed curated seed** — e.g. `data/dbt/seeds/dedup_decisions.csv` — holds `(pair_key → dedup_status)` confirmations. The build **LEFT JOINs** decisions onto regenerated candidates by `pair_key`. The nightly rebuild can freely regenerate candidates and **never clobbers** a human decision. (Directly analogous to 135's `occurrence_synonyms.csv` curated seed vs `checklist_name_resolution_audit.csv` regenerated audit.)
- **D-02:** **`pair_key` = composite `(checklist ObjectID, Ecdysis ecdysis_id)`** — both upstream-stable source PKs, human-readable and debuggable. Chosen over a content hash precisely so a coordinate-rounding or normalization tweak can't silently orphan prior decisions. **Stability depends on D-03:** candidate generation runs on the **post-collapse** checklist records, and the surviving representative's `ObjectID` is chosen deterministically (lowest), so the key a curator confirmed against is reproduced on every rebuild.
- **`dedup_status` vocabulary:** at minimum `confirmed` / `rejected`; an unreviewed pair (no seed row) is treated as the implicit "candidate/unreviewed" state. Only `confirmed` ever suppresses a point. Exact enum spelling is planner discretion as long as `confirmed` is the suppression trigger.

### Internal collapse policy (DUP-01)
- **D-03:** **Lowest `ObjectID` wins.** Within each exact-duplicate group (identical species, lat, lon, date, collector), keep the row with the smallest `ObjectID`; its non-key fields (locality, date_quality, family, month/day) carry forward as-is. Deterministic, trivially stable, debuggable, and it guarantees the stable `pair_key` that D-02 depends on. (The exact 5-key match implies near-identical true data-entry dupes, so survivor-field choice is low-risk.)
- **D-04:** **Survivor carries a `collapsed_count` column** = number of rows in its group (1 if unique). Cheap, honest provenance: surfaces how much internal duplication existed, aids the curator, and lets any future audit reconstruct the raw total. Fits the project's "report, don't hide" stance from Phase 135.

### Cross-source match rules (DUP-02)
Locked criterion (ROADMAP): exact accepted-name **AND** non-year-only date **AND** coordinates within ~1 km **AND** normalized collector; **NULL-date and NULL-coordinate rows are never candidates.** The decisions below resolve the "how" of each component. Guiding bias from DUP-03: **prefer false-split (keep both) when uncertain** — a missed pair renders as two points (acceptable); the human gate makes over-flagging safe but noisy, so the curator's review load is the cost to manage.
- **D-05:** **Collector = token-set normalization.** Normalize (lowercase, trim, collapse whitespace, strip punctuation), then compare as a **sorted token set with initials awareness** (`J Smith` ≈ `John Smith` via initial match). Catches more real cross-source dupes for review than exact-equality, while staying exact set logic (no fuzzy scoring). No existing collector normalizer in the codebase — this is net-new (note: `normalize_scientific_name` is for taxa, not people).
- **D-06:** **Date = match at the coarser shared precision.** Exclude if either side is year-only or NULL. Otherwise compare at the coarser of the two precisions: both have day → require same Y-M-D; either lacks day → require same Y-M. Bridges a month-precision checklist record to a full-date Ecdysis specimen of the same month (the common cross-source shape).
- **D-07:** **Distance threshold = 1.0 km**, as one named tunable constant (the ROADMAP's ~1 km). Accounts for checklist point-level coordinate imprecision vs Ecdysis georeferencing of the same collection. Reasonable review net given the human gate. (Tighter 0.5 km was considered and rejected — token-set collector + coarser-date already favor recall, and the human gate absorbs the wider net.)
- **D-08:** **One candidate row per `(checklist record, Ecdysis specimen)` pair** — full cartesian within the match window (no nearest-only collapse). The checklist point is suppressed if **ANY** of its pairs has `dedup_status = confirmed`. The curator confirms/rejects each pair independently; suppression is per-checklist-point. Keeps `pair_key` clean as `(ObjectID, ecdysis_id)` and hides no plausible match from review.

### Claude's Discretion
- **Suppression output contract (deliberately not deep-discussed — user deselected).** Derived default the planner should follow unless evidence says otherwise: expose `dedup_status` on the (collapsed) checklist record set via the candidate→decisions LEFT JOIN, so Phase 137 can exclude `confirmed`-suppressed rows when it promotes into `int_combined` and Phase 138 can compute per-source counts. This phase **stops at producing that joinable status + the `collapsed_count`**; it does not itself filter rows out of any point layer (no point layer exists until 137/138). Exact column placement (a new `int_*`/`stg_*` model vs a column on an existing checklist staging model) is the planner's call.
- **Distance metric implementation** — DuckDB `ST_Distance` on an appropriate geographic/projected representation (existing marts use `ST_Distance`); haversine vs projected-meters is the planner's call as long as the 1.0 km constant (D-07) is honored.
- **Where internal collapse runs** — Python (`checklist_pipeline.py`, which loads `checklist_records_full`) vs a dbt model (`stg_`/`int_` over `stg_checklist__records_full`). Lean dbt to match the `int_*` transform convention, but the planner decides.
- **Token-set collector algorithm details** — exact tokenization, initials-matching rule, library vs hand-rolled.
- **Build gate for the human-review invariant** (DUP-03): how the build asserts "no checklist point is suppressed without a `confirmed` seed row" — mirror 135's gate pattern (`check_resolution_gate`).
- **pytest assertion shape** for DUP-01 (no exact-duplicate tuples remain post-collapse) and the NULL-date/NULL-coord exclusion for DUP-02.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 136: Deduplication" — goal, 3 success criteria, the HUMAN-REVIEW GATE blocking Phase 137
- `.planning/REQUIREMENTS.md` — DUP-01, DUP-02, DUP-03 (accept criteria); downstream PRO-* framing for Phase 137 consumption

### Adjacent phase decisions (the pattern this phase mirrors)
- `.planning/phases/135-name-reconciliation/135-CONTEXT.md` — the **audit-vs-curated-seed split** (D-03/D-08 there: `occurrence_synonyms.csv` committed seed vs `checklist_name_resolution_audit.csv` regenerated audit; `check_resolution_gate` build-gate template). D-01/D-02 here reuse that shape.
- `.planning/phases/134-full-fidelity-ingest/134-CONTEXT.md` — the `checklist_records_full` schema (verbatim_name, lat/lon, year/month/day, date_quality, recordedBy, ObjectID, coord_flag) this phase deduplicates.

### v4.7 research
- `.planning/research/ARCHITECTURE.md` — `stg_checklist__records_full` / ARM / dedup sketches
- `.planning/research/PITFALLS.md` — duplication and coordinate-matching pitfalls

### Existing code this phase extends (read before planning)
- `data/dbt/models/staging/stg_checklist__records_full.sql` — the deduplication INPUT: individual coord-bearing checklist records (filtered to `coord_flag = 'valid'`), with synonym + taxon_id resolution already applied. Columns include `ObjectID`, `canonical_name`, `lat`, `lon`, `year`, `month`, `day`, `date_quality`, `recordedBy`.
- `data/dbt/models/intermediate/int_ecdysis_base.sql` + `int_combined.sql` (ARM 1) — the cross-source MATCH TARGET: Ecdysis specimens with `ecdysis_id`, `canonical_name`, `lat`/`lon`, `date`, `recordedBy`.
- `data/dbt/seeds/occurrence_synonyms.csv` — the committed-seed precedent for D-01's `dedup_decisions.csv` (same seed + LEFT JOIN shape).
- `data/resolve_taxon_ids.py` `check_resolution_gate()` — the build-blocking gate pattern for the DUP-03 human-review invariant.
- `data/checklist_pipeline.py` — loads `checklist_records_full`; candidate location if internal collapse runs in Python (D-03 discretion).
- `data/dbt/models/marts/checklist.sql` — note: this is the **county-range** mart (NULL lat/lon, presence-only) and is NOT the dedup target; the point-data records are `stg_checklist__records_full`. Do not confuse the two.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 135 audit-vs-seed pattern** (`occurrence_synonyms.csv` + `int_synonyms` LEFT JOIN; `checklist_name_resolution_audit.csv` regenerated): the exact template for `dedup_decisions.csv` (committed) + `dedup_candidate_pairs.csv` (regenerated) with a `pair_key` LEFT JOIN (D-01).
- **`check_resolution_gate()`** (`data/resolve_taxon_ids.py`): build-blocking gate template for the DUP-03 "no suppression without `confirmed`" invariant.
- **`ST_Distance`** usage in `marts/checklist.sql` and `marts/occurrences.sql`: existing spatial-distance precedent for the 1.0 km proximity test (D-07).

### Established Patterns
- dbt `int_*` intermediate models are the canonical home for record-level transforms over staging (collapse + candidate generation fit here).
- Committed curated seed + regenerated audit CSV + build-gate is the project's standard human-in-the-loop shape (Phase 135).

### Integration Points
- **Input:** `stg_checklist__records_full` (post-135 resolved checklist points) → internal collapse → cross-source candidate generation against `int_ecdysis_base`.
- **Output:** collapsed checklist record set (+ `collapsed_count`), `dedup_candidate_pairs.csv` (audit), `dedup_decisions.csv` (curated seed), and a joinable `dedup_status` on checklist records.
- **Downstream consumer:** Phase 137 (PRO-01) excludes `confirmed`-suppressed checklist rows when promoting into `int_combined`; Phase 138 reads per-source counts from the same status.

### No existing collector normalizer
- `data/canonical_name.py:73 normalize_scientific_name()` normalizes **taxa**, not people — D-05's token-set collector normalization is net-new code.

</code_context>

<specifics>
## Specific Ideas

- The 5,184 internal-duplicate-group figure is a concrete DUP-01 acceptance anchor — pytest asserts zero exact-duplicate tuples (species+lat+lon+date+collector) remain post-collapse, and `collapsed_count` lets the test/audit reconstruct the pre-collapse total.
- DUP-03's "prefer false-split (keep both) when uncertain" is the tie-breaking philosophy across every match-rule decision (D-05–D-08): missed pairs are acceptable, silent merges are not.
- `pair_key = (ObjectID, ecdysis_id)` must be eyeballable against source rows — chosen specifically for curator debuggability over a hash.

</specifics>

<deferred>
## Deferred Ideas

- **Per-source counts display + point-layer suppression rendering** — Phase 138 (frontend). This phase produces the `dedup_status`/`collapsed_count` data contract only.
- **Promotion of (deduplicated) checklist rows into `occurrences.parquet`** — Phase 137 (PRO-01).
- **Suppression output contract deep-dive** — user deselected for discussion; captured as a derived default + planner discretion above. Revisit only if Phase 137 planning surfaces ambiguity.
- **Fuzzy collector matching (rapidfuzz)** — rejected for this phase (D-05 chose token-set, not fuzzy). Could be revisited if token-set misses a meaningful share of real cross-source dupes the curator flags by hand.

</deferred>

---

*Phase: 136-deduplication*
*Context gathered: 2026-06-07*
