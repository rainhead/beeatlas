# Phase 136: Deduplication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-07
**Phase:** 136-deduplication
**Areas discussed:** Sign-off persistence, Internal-collapse policy, Cross-source match rules

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Sign-off persistence | Where dedup_status lives so a rebuild can't clobber a human decision | ✓ |
| Internal-collapse policy | Survivor row + non-key reconciliation + provenance | ✓ |
| Cross-source match rules | Distance metric, date precision, collector normalization, one-to-many | ✓ |
| Suppression output contract | Downstream data shape for 137/138 | (deselected → planner discretion) |

---

## Sign-off persistence

### Q1 — Where does dedup_status live?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate curated seed (135 pattern) | Build rewrites dedup_candidate_pairs.csv (audit); committed dedup_decisions.csv holds (pair_key → status); LEFT JOIN | ✓ |
| Hand-edit candidate CSV in place | One committed file, build must non-destructively merge new candidates while preserving decided rows | |

**User's choice:** Separate curated seed (135 pattern) → **D-01**

### Q2 — Pair key

| Option | Description | Selected |
|--------|-------------|----------|
| Composite (ObjectID, ecdysis_id) | Two upstream-stable PKs; human-readable; stable if collapse is deterministic | ✓ |
| Content hash of match fields | Survives ObjectID churn but opaque; a rounding tweak orphans all prior decisions | |

**User's choice:** Composite (ObjectID, ecdysis_id) → **D-02**
**Notes:** Stability requires candidate generation to run on post-collapse records (ties to D-03).

---

## Internal-collapse policy

### Q1 — Survivor selection

| Option | Description | Selected |
|--------|-------------|----------|
| Lowest ObjectID wins | Deterministic, stable, debuggable; survivor's non-key fields carry forward | ✓ |
| Most-complete row, ObjectID tiebreak | Fewest-NULLs row, tie by lowest ObjectID | |
| Coalesce per field, lowest ObjectID identity | Merge first-non-null per field; survivor matches no single source row | |

**User's choice:** Lowest ObjectID wins → **D-03**

### Q2 — Provenance

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — collapsed_count column | Survivor carries count of absorbed rows (1 if unique) | ✓ |
| No — collapse silently | One row per group, no count; raw volume only in pytest/commit history | |

**User's choice:** Yes — collapsed_count column → **D-04**

---

## Cross-source match rules

### Q1 — Collector matching

| Option | Description | Selected |
|--------|-------------|----------|
| Exact after light normalization | Lowercase/trim/strip-punct then exact equality; fewest false candidates | |
| Token-set normalization | Sorted token set, initials-aware (J Smith ≈ John Smith); catches more for review | ✓ |
| Fuzzy (rapidfuzz) threshold | Max recall, most speculative pairs, heaviest curator load | |

**User's choice:** Token-set normalization → **D-05**

### Q2 — Date match

| Option | Description | Selected |
|--------|-------------|----------|
| Match at coarser shared precision | Exclude year-only/NULL; compare at coarser of two precisions (Y-M-D or Y-M) | ✓ |
| Require exact full date both sides | Y-M-D on both or no candidate; most conservative | |

**User's choice:** Match at coarser shared precision → **D-06**

### Q3 — Distance threshold

| Option | Description | Selected |
|--------|-------------|----------|
| 1.0 km (as roadmapped) | ROADMAP ~1km as a single tunable constant | ✓ |
| 0.5 km (tighter) | Smaller higher-precision queue; may miss rounding/datum-separated dupes | |

**User's choice:** 1.0 km → **D-07**

### Q4 — One-to-many handling

| Option | Description | Selected |
|--------|-------------|----------|
| One row per pair; any confirm suppresses | Full cartesian within window; per-pair decisions; ANY confirm suppresses the checklist point | ✓ |
| One row per checklist record (nearest only) | Collapse to nearest Ecdysis; hides other plausible matches | |

**User's choice:** One row per pair; any confirm suppresses → **D-08**

---

## Claude's Discretion

- Suppression output contract / `dedup_status` column placement (user deselected; derived default captured in CONTEXT.md)
- Distance metric implementation (haversine vs projected `ST_Distance`), honoring the 1.0 km constant
- Where internal collapse runs (Python `checklist_pipeline.py` vs dbt `int_*` model)
- Token-set collector algorithm details (tokenization, initials rule, library choice)
- Build gate mechanism for the DUP-03 "no suppression without confirmed" invariant
- pytest assertion shapes for DUP-01 collapse and DUP-02 NULL exclusion
- Exact `dedup_status` enum spelling (only `confirmed` must trigger suppression)

## Deferred Ideas

- Per-source counts display + point suppression rendering — Phase 138
- Promotion of deduplicated checklist rows into `occurrences.parquet` — Phase 137
- Fuzzy (rapidfuzz) collector matching — rejected here, revisit if token-set under-recalls
