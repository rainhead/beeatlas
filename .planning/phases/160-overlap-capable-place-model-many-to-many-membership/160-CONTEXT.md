# Phase 160: Overlap-capable place model (many-to-many membership) - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Let a bee occurrence belong to **every** place its coordinate falls within,
instead of an arbitrary single `place_slug`. Today the place→occurrence model is
a forced partition: `marts/occurrences.sql` assigns one `place_slug` via
`ST_Within` + `DISTINCT ON` (no `ORDER BY` → non-deterministic when a point is
in two polygons), and `data/places_validation.py` rejects partially-overlapping
place polygons (`ST_Overlaps`) so that ambiguity never surfaces. That
one-place-per-occurrence rule is an implementation artifact of the scalar
column, NOT a domain requirement — real land management nests and overlaps.

This phase makes place membership **many-to-many** via a dedicated
`occurrence_places` bridge relation, drops the overlap-rejection guard, and
threads membership through counts, maps, and the frontend (filter + occurrence
detail).

**Why now / why split:** Phase 161 (WDFW wildlife areas) research found **16
real WDFW↔existing-place partial overlaps**. Rather than clip geometry to fit a
constraint the user never required, the model change was split out as this
prerequisite phase. See [[project_place_model_many_to_many]].

**In scope:**
- A new `occurrence_places` bridge mart (occurrence ↔ place_slug, one row per
  membership) sourced from the `ST_Within` join.
- Remove the scalar `place_slug` column from the occurrences mart (contract
  37 → 36 cols — the "33" estimate was stale) and the `DISTINCT ON` collapse.
- Remove the `ST_Overlaps` overlap-rejection check from `places_validation.py`
  (keep WKT-validity + WGS84-bounds checks).
- Per-place counts (`places_export.py` → `places.json`) and per-place maps
  (`places_maps.py`) recomputed via the bridge.
- Frontend: place filter matches on membership (`EXISTS`/join against the
  bridge in wa-sqlite) instead of `place_slug = ?`; sidebar occurrence detail
  lists **all** places an occurrence belongs to.

**Out of scope:**
- Adding new place *sources* (WDFW = Phase 161; hikes = Phase 162).
- Multi-place *filter selection* (selecting several places to filter by at
  once) — that's the pre-existing `PRICH-02` deferral on `selectedPlace`; this
  phase keeps the filter single-select, it just resolves via membership.
- Linear/corridor geometry (Phase 162).

</domain>

<decisions>
## Implementation Decisions

### Storage shape
- **D-01:** **`occurrence_places` bridge relation**, not an array column.
  Rationale: SQLite (the wa-sqlite frontend engine) has no native array type, so
  a `place_slugs VARCHAR[]` column would have to be materialized as JSON text
  and queried with `json_each`; a normalized bridge is a clean relational model
  on **both** ends (dbt mart + wa-sqlite table) and filters with a plain
  `EXISTS`/join. One row per (occurrence, place) membership.
- **D-02:** **Drop the scalar `place_slug`** from the occurrences mart entirely
  (the bridge is the single source of truth). The dbt occurrences contract goes
  **37 → 36 columns** (the "33" estimate predated columns added since Phase 131).
  This is acceptable — Phase 131 precedent dropped 4 columns; the dbt contract is
  the gate (see [[project_schema_validation]]) and must be updated in lockstep.

### Validation
- **D-03:** Remove the pairwise `ST_Overlaps` rejection from
  `places_validation.py` (lines ~109–133). Overlapping place polygons become
  legal. **Keep** the WKT-validity (#4) and WGS84-bounds (#5) checks, the slug
  checks, and the permit-field checks. Update/replace the overlap test in
  `data/tests/test_places_validation.py` to assert overlaps now load (not that
  they're rejected).

### Display
- **D-04:** When an occurrence belongs to multiple places, the **sidebar
  occurrence detail lists all of them** (place names, not slugs). Reuse the
  existing place-name lookup path (`bee-pane.ts` `_ensurePlaceNamesLoaded` /
  `_placeNameBySlug`). This is the one UI change in scope.

### Counts
- **D-05:** Per-place counts **count an occurrence toward every place it belongs
  to** (`places.json` specimen_count / sample_count derived via the bridge).
  Totals across places may exceed the global occurrence count — that's correct
  ("how many bees recorded in this place"). Same for per-place SVG maps.

### Claude's / planner's discretion (resolve in research/planning)
- **Join key (RESEARCH):** what stably identifies an occurrence to key the
  bridge on. `_row_id` is internal to the dbt model; the durable id is likely
  the existing `ecdysis:<int>` / `inat:<int>` occurrence id surfaced on the
  mart (per the ID-format invariant in CLAUDE.md). Confirm the column and that
  it's stable across pipeline runs.
- **Bridge artifact format (RESEARCH):** how `occurrence_places` ships to the
  static frontend (its own `.parquet` loaded into wa-sqlite as a table, vs
  folded into an existing artifact) and how the wa-sqlite query path joins it.
  Must fit the wa-sqlite + hyparquet stack (see [[project_duckdb_wasm_direction]]).
- **List determinism:** if any place-slug list is materialized anywhere, sort +
  dedupe for stable output/tests.
- **Empty membership:** an occurrence in no named place simply has zero bridge
  rows (no sentinel needed); the frontend treats "no rows" as "no place."

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The place model (code is the spec)
- `data/dbt/models/marts/occurrences.sql` §72–82,97 — the `ST_Within` place
  join + `DISTINCT ON` collapse + `place_slug` projection being replaced. The
  bridge is sourced from the same `ST_Within` join, minus the dedup.
- `data/places_validation.py` §109–133 — the `ST_Overlaps` rejection to remove
  (keep the other checks).
- `data/places_load.py` — TOML → `geographies.places` (unchanged; places still
  load as polygons).
- `data/places_export.py` — `places.json` per-place counts (`_query_counts`)
  and `places.geojson`; recompute counts via the bridge.
- `data/places_maps.py` — per-place SVG generation; drive from the bridge.
- `data/run.py` — STEPS order (a new mart slots into dbt-build; no new top-level
  step unless a new export artifact is added for the bridge).
- `data/tests/test_places_validation.py`, `test_places_load.py`,
  `test_places_export.py` — contract tests to update.

### dbt contract
- The occurrences contract is enforced at every
  `bash data/dbt/run.sh build` (CLAUDE.md; [[project_schema_validation]]).
  Dropping `place_slug` → 36 columns; update the contract definition + the
  occurrences schema YAML in lockstep, and add the `occurrence_places` mart's
  own contract.

### Frontend consumption (what changes)
- `src/filter.ts` §24 (`selectedPlace` single-select; PRICH-02 multi-select
  deferral), §48 (`place_slug` field on the occurrence row type — to be
  replaced), §87 (projected columns list), §296–298 (`place_slug = '{slug}'`
  WHERE → membership `EXISTS`/join).
- `src/bee-atlas.ts` §1241,1392–1395,1477,1670–1672 — `selectedPlace` URL state
  + toggle + clear-on-boundary-mode-switch (single-select filter behavior
  preserved; only the resolution changes).
- `src/bee-pane.ts` §577–581,830–875,1022–1048 — place chip + place-name
  loading; extend the occurrence-detail render to list all member places (D-04).
- `src/bee-occurrence-detail.ts` §226 — currently reads `filterState.selectedPlace`;
  this is where the "list all places for this occurrence" display lands.

### Project memory (background)
- [[project_place_model_many_to_many]] — the decision + rationale recorded for this phase.
- [[project_duckdb_wasm_direction]] — frontend SQL engine is wa-sqlite + hyparquet (constrains D-01 / artifact format).
- [[project_schema_validation]] — steps for changing an occurrences column under the dbt contract.
- [[project_deferred_places]] — Columbia Land Trust was deferred for the same overlap problem this phase solves at the model level.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The `ST_Within` join already exists in `marts/occurrences.sql` — the bridge
  reuses it verbatim, just without the `DISTINCT ON (_row_id)` collapse.
- `bee-pane.ts` already lazy-loads place names (`_ensurePlaceNamesLoaded`,
  `_placeNameBySlug`) for the filter chip — reuse it to render an occurrence's
  member place names (D-04).

### Established Patterns
- Single-place filter behavior (select one place → see its occurrences) must be
  preserved for non-overlapping places; only the SQL resolution changes from
  equality to membership.
- The dbt contract is the validation gate — there is no separate JS schema
  validator (post-v3.4). Column-set changes go through the contract.

### Integration Points
- Bridge mart is the new join surface between occurrences and places on BOTH
  the pipeline (dbt) and the client (wa-sqlite). The join key (D-discretion)
  is the load-bearing detail.
- `place_slug` removal ripples to the frontend occurrence row type and any
  projection/SELECT that lists columns (`filter.ts:48,87`).

</code_context>

<specifics>
## Specific Ideas

- Acceptance proof to design for: a point in the overlap of place A and place B
  resolves to BOTH A and B (two bridge rows), deterministically, and selecting
  either A or B in the filter finds that occurrence.
- The 16 known WDFW↔existing overlaps (enumerated in
  `161-RESEARCH.md`) are the real-world test cases this phase unblocks.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-place filter selection** (choose several places to filter by at once)
  — pre-existing `PRICH-02` deferral on `selectedPlace`; not this phase.
- **Containment-aware ranking** (e.g., "most specific place wins" for a primary
  label) — membership is a flat set here; if a primary/representative place is
  ever wanted, that's a later refinement.
- **WDFW areas (161) / hikes (162)** — the place *sources* that consume this
  model.

</deferred>

---

*Phase: 160-overlap-capable-place-model-many-to-many-membership*
*Context gathered: 2026-06-23*
