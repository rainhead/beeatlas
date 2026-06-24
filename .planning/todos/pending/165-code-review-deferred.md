---
type: code-review-deferred
phase: 165
created: 2026-06-24
source: 165-REVIEW.md
---

# Phase 165 — deferred code-review findings

CR-01 (critical) and WR-01 (warning) were fixed in-phase (commits `e71bfcad`, `2920c651`).
These remaining findings were judged non-blocking and deferred:

- **WR-02** — `src/bee-pane.ts` hard-codes `hiddenSources.size === 5` for the honest-empty
  ("all sources hidden") message. Correct today (5 sources) but brittle: regresses when a 6th
  source arm is added. Derive the count from `VALID_SOURCES.length` instead.
- **WR-03** — `data/dbt/models/intermediate/int_ecdysis_base.sql` de-dups the now-1:N
  `int_waba_link` via an arbitrary `MIN(specimen_observation_id)` pick. Display-only (the
  specimen-photo link on an `ecdysis` row); the fan-out guard itself is correct. Consider a
  deterministic/most-recent pick if the photo link matters.
- **WR-04** — `data/dbt/models/intermediate/int_combined.sql` copy-pastes the same taxon
  name-normalization CASE expression four times across arms; drift between copies would desync
  `canonical_name` from `taxon_id`. Extract to a dbt macro.
- **IN-01** — `docs/domain-model.md` category numbering vs SQL ARM numbering mismatch (cosmetic).
- **IN-02** — `src/occurrence.ts` docstrings still describe the pre-165 provisional semantics.
- **IN-03** — dead `void isFilterActive;` in `src/bee-pane.ts`.

Also tracked separately: **Shape C** (`ecdysis:6317352`/`6317353`) — duplicate `ecdysis:` rows
from a duplicate `sample_id` OFV in `inaturalist_data.observations__ofvs` (obs 288589692). The
D-09 uniqueness test surfaces it at `severity: warn`; escalate the test to `error` once Shape C
is fixed. Candidate for a backlog item.
