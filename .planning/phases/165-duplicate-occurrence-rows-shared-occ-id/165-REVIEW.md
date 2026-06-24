---
phase: 165-duplicate-occurrence-rows-shared-occ-id
reviewed: 2026-06-24T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - data/dbt/models/intermediate/int_waba_link.sql
  - data/dbt/models/intermediate/int_matched_waba_ids.sql
  - data/dbt/models/intermediate/int_ecdysis_base.sql
  - data/dbt/models/intermediate/int_provisional_waba_ids.sql
  - data/dbt/models/intermediate/int_combined.sql
  - data/dbt/models/intermediate/schema.yml
  - data/dbt/models/sources.yml
  - data/dbt/tests/test_no_duplicate_occ_ids.sql
  - src/url-state.ts
  - src/filter.ts
  - src/bee-pane.ts
  - src/bee-occurrence-detail.ts
  - src/tests/occurrence.test.ts
  - src/tests/url-state.test.ts
  - src/tests/filter.test.ts
  - docs/domain-model.md
  - CLAUDE.md
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 165: Code Review Report

**Reviewed:** 2026-06-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 165 reshapes the occurrence data model so no two `marts/occurrences` rows share a synthetic
`occ_id`. The MIN-removal in `int_waba_link` is correctly fenced at both consumers (DISTINCT filter
set in `int_matched_waba_ids`; an explicit `MIN(...) GROUP BY catalog_suffix` de-dup subquery in
`int_ecdysis_base`), and the `NOT IN` anti-joins in `int_provisional_waba_ids` and ARM 3 are
NULL-safe (all probed key columns are non-nullable iNat/WABA primary keys). The frontend
`VALID_SOURCES` lists in `url-state.ts` and `filter.ts` stay in sync (both 5-member), the `src=none`
sentinel and all-off path are sound, and no user input reaches SQL through the new `waba_specimen`
token (it is a compile-time literal validated against a fixed enum).

The central concern is **arm collision between ARM 3 (`waba_specimen`) and ARM 4 (`inat_obs`)**:
both arms emit `occ_id = inat_obs:N` keyed on `specimen_observation_id`, but ARM 3 only anti-joins
`int_matched_waba_ids` — it does NOT anti-join the ARM 4 ID space. Uniqueness rests entirely on a
runtime data claim ("Verified: no overlap except 320276469") guarded by a `severity:warn` test that
will NOT block a build. That is exactly the duplicate-`occ_id` class of defect this phase exists to
eliminate, structurally unenforced. Additionally, the redefined ARM 2 (`waba_sample`) now carries a
NULL `specimen_observation_id`, but the provisional renderer still builds its iNat link from that
column, producing a `.../observations/null` dead link.

## Critical Issues

### CR-01: `waba_specimen` (ARM 3) and `inat_obs` (ARM 4) can collide on `inat_obs:N` with no structural guard

**File:** `data/dbt/models/intermediate/int_combined.sql:122-206` (ARM 3) and `:210-258` (ARM 4)
**Issue:**
Both arms set `ecdysis_id = NULL` and `observation_id = NULL` and populate `specimen_observation_id`
(ARM 3: `sob.waba_obs_id`; ARM 4: `io.obs_id`). Under the canonical `occ_id` CASE
(ecdysis → inat → inat_obs → checklist) both therefore resolve to `inat_obs:N`. ARM 3's only
de-collision filter is:

```sql
AND sob.waba_obs_id NOT IN (SELECT waba_obs_id FROM {{ ref('int_matched_waba_ids') }})
```

This excludes Ecdysis-matched WABA obs (the ARM 1 overlap) but does **nothing** to exclude the ARM 4
`inat_obs` ID set. The inline comment asserts the two ID spaces are disjoint "except 320276469,
which the MIN fix moved to ecdysis" — but that is a point-in-time observation about two independently
ingested iNat datasets (`inaturalist_waba_data.observations` vs `inat_obs_data.observations`). iNat
observation IDs are globally unique per observation, so a single observation that appears in BOTH
ingestion feeds (e.g. a WABA-project research-grade observation that the expert-obs pull also
captures) yields the SAME numeric id in both arms and therefore two rows with the identical
`occ_id = inat_obs:N`. Nothing in the schema prevents an observation from being in both feeds.

The phase's own regression test (`test_no_duplicate_occ_ids.sql`) is set to `severity:warn`, so even
when this fires it will not fail `bash data/dbt/run.sh build` — the duplicate ships. This is the precise
defect class Phase 165 was created to remove, left structurally unenforced for the ARM 3/ARM 4 pair.

**Fix:** Add an explicit anti-join against the ARM 4 ID space to ARM 3's WHERE clause so the
disjointness is enforced in SQL rather than asserted in a comment:

```sql
  AND sob.waba_obs_id NOT IN (SELECT waba_obs_id FROM {{ ref('int_matched_waba_ids') }})
  AND sob.waba_obs_id NOT IN (SELECT obs_id FROM {{ source('inat_obs_data', 'observations') }})
```

(Confirm the `inat_obs_data.observations` PK column name — it is referenced as `io.obs_id` in ARM 4.)
If product intent is that a WABA-photographed specimen should win over the expert-obs row, instead
add the symmetric exclusion to ARM 4. Either way the choice must live in SQL. Separately, escalating
`test_no_duplicate_occ_ids.sql` to `severity:error` once the known Shape-C OFV fan-out is fixed is
necessary but not sufficient — a warn-level test cannot be the sole guard for the invariant this
phase establishes.

## Warnings

### WR-01: Provisional (`waba_sample`) detail renderer builds its iNat link from a now-NULL column → `.../observations/null`

**File:** `src/bee-occurrence-detail.ts:341-345` (`_renderProvisional`)
**Issue:**
ARM 2 (`waba_sample`, `is_provisional=TRUE`) was redefined to set `specimen_observation_id = NULL`
(int_combined.sql:95) and instead carry the plant obs id in `observation_id` (`:97`,
`occ_id = inat:N`). But `render()` dispatches `is_provisional` rows to `_renderProvisional`, which
links:

```ts
<a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}" ...>
   View WABA observation</a>
```

For every new-shape `waba_sample` row `specimen_observation_id` is null, so the anchor renders
`https://www.inaturalist.org/observations/null` — a dead link on every provisional card. The
occurrence.test.ts addition (`:84-86`) confirms the new shape uses `observation_id`, not
`specimen_observation_id`, so this mismatch is real.

**Fix:** Link off `observation_id` for the provisional arm (it is the plant/sample obs id):

```ts
${row.observation_id != null ? html`
  <a href="https://www.inaturalist.org/observations/${row.observation_id}"
     target="_blank" rel="noopener">View WABA observation</a>` : ''}
```

Also guard the anchor behind a null check so a row with neither id renders no broken link.

### WR-02: All-off list message hard-codes `=== 5`; will silently regress if a sixth source is added

**File:** `src/bee-pane.ts:1239`
**Issue:**
```ts
: this._hiddenSources.size === 5
  ? html`<div class="panel-content"><p class="hint">No sources selected...</p></div>`
```
The "No sources selected" honest-empty message keys on the literal `5`. The source universe is
otherwise centralized in `VALID_SOURCES` (5 members today). `filter.ts` already computes the all-off
state from the allowlist (`visibleSources.length === 0` → `1 = 0`), and `url-state.ts` derives
`src=none` from `VALID_SOURCES` size. This one call site duplicates that count as a magic number, so
adding a sixth source (the phase narrative explicitly anticipates more arms) makes a fully-hidden
6-source state show "Click a point on the map to see details" instead of the honest-empty message,
because `size === 5` is false at `size === 6`.

**Fix:** Derive the count from the shared source list rather than a literal, e.g. compare against the
exported `VALID_SOURCES` cardinality (or `>= VALID_SOURCES.size`):

```ts
: this._hiddenSources.size >= TOTAL_SOURCE_COUNT  // imported/derived from VALID_SOURCES
```

### WR-03: `int_ecdysis_base` link join surfaces an arbitrary WABA obs via `MIN(...)`, silently mismatching `int_matched_waba_ids`

**File:** `data/dbt/models/intermediate/int_ecdysis_base.sql:37-41`
**Issue:**
After the MIN-removal in `int_waba_link`, this consumer re-introduces a de-dup via
`MIN(specimen_observation_id) GROUP BY catalog_suffix` to keep one row per ecdysis record. The
comment acknowledges the pick is "arbitrary" because "both obs represent the same catalog entry."
That assumption is the same one the D-05 bug report just disproved: obs `320276469` and `320276018`
shared catalog suffix `25000848` yet were genuinely different observations, one of which had to be
re-homed. Choosing `MIN()` here means the ecdysis mart row's `specimen_observation_id` (and thus the
`📷` photo link in `_renderCollectorGroup`, bee-occurrence-detail.ts:287-289) deterministically points
at the lower-id WABA obs, which may not be the observation the collector actually intends for that
specimen. This is display-only (it does not affect counting or `occ_id`), so it is a Warning, not a
Blocker — but it is an undocumented data-quality compromise riding on a now-falsified assumption.

**Fix:** If a stable, meaningful representative matters, pick by an explicit rule (e.g. most-recent
`observed_on`, or research-grade preferred) rather than `MIN(id)`, and document that the ecdysis-row
photo link is "one of N matching WABA photos" so a future reader does not treat it as authoritative.
If arbitrary is genuinely acceptable, state that explicitly in the renderer too.

### WR-04: ARM 3 repeats the same 6-line taxon-normalization CASE four times; drift risk on the join keys

**File:** `data/dbt/models/intermediate/int_combined.sql:155-206`
**Issue:**
The genus/species canonicalization expression
(`lower(trim(CASE WHEN position(' ' ...) ...))`) is copy-pasted verbatim four times in ARM 3: the
`canonical_name` projection (`:155-161`), the `ctt_ws` join condition (`:174-180`), the `g_ws` join's
`position(...) = 0` guard and `genus_name` match (`:184-197`), and the final WHERE filter (`:200-206`).
The other arms (1 and 4) derive `canonical_name` from a single upstream column and join on it, so they
have no such duplication. Four hand-maintained copies of a non-trivial string expression is a
correctness hazard: an edit to one (e.g. handling a three-word infraspecific name) that misses the
others would silently desync the projected `canonical_name` from the value the taxon-id join actually
matched on, yielding rows with a name that does not correspond to their `taxon_id`.

**Fix:** Compute the normalized name once in a CTE (or a small upstream model / dbt macro) and
reference the single column in the projection, both joins, and the WHERE filter:

```sql
WITH ws AS (
    SELECT *, lower(trim(CASE WHEN position(' ' IN trim(specimen_inat_taxon_name)) > 0
        THEN split_part(...) || ' ' || split_part(...) ELSE trim(specimen_inat_taxon_name) END))
        AS ws_canonical
    FROM {{ ref('int_specimen_obs_base') }}
)
-- then reference ws.ws_canonical everywhere
```

## Info

### IN-01: domain-model.md category numbering does not match `int_combined` ARM numbering

**File:** `docs/domain-model.md:17-23` vs `data/dbt/models/intermediate/int_combined.sql:1-8`
**Issue:**
The doc table orders categories as 1=`ecdysis`, 2=`waba_specimen`, 3=`waba_sample`, 4=`inat_obs`,
5=`checklist`, and the prose headers read "Category 2 — waba_specimen" / "Category 3 — waba_sample".
But `int_combined.sql` labels them ARM 1=`ecdysis`, ARM 2=`waba_sample`, ARM 3=`waba_specimen`,
ARM 4=`inat_obs`, ARM 5=`checklist`. The `source`→`occ_id` mapping is internally consistent in both,
but a reader cross-referencing "Category 2" in the doc against "ARM 2" in the SQL lands on the wrong
arm. Per phase intent, doc accuracy is Info-level.
**Fix:** Renumber the doc table to match ARM order (swap rows 2 and 3) or explicitly note that the doc
"Category" index is independent of the SQL "ARM" index.

### IN-02: `occurrence.ts` doc comments and `parseOccId` return type understate the prefix vocabulary

**File:** `src/occurrence.ts:14-21, 33-38`
**Issue:**
`occIdFromRow`'s docstring still says it returns "`'ecdysis:N'` ... `'inat:N'` ... or `null`" and
`parseOccId`'s docstring says "Returns `{ source: 'ecdysis' | 'inat', numericId }`", omitting
`inat_obs` and `checklist`, even though the implementations (and the return type union on `:39`)
handle all four. With `waba_specimen` now actively producing `inat_obs:N` for real specimen rows, the
stale comments are more misleading than before.
**Fix:** Update both docstrings to enumerate all four prefixes (`ecdysis`/`inat`/`inat_obs`/`checklist`).

### IN-03: `filter.ts:1306` dead `void isFilterActive;` suppression no longer needed

**File:** `src/filter.ts:1306` (and `bee-pane.ts:3,1306`)
**Issue:**
`bee-pane.ts` ends with `void isFilterActive;` and a comment "Suppress unused variable warnings for
filter-related code used in Plan 02." `isFilterActive` is imported (`:3`) but the only reference is
this `void` statement — it is not used in the component. Either the import is genuinely unused (drop
both the import and the `void` line) or it should be wired into the collapsed-state `active` logic.
Carrying a `void` no-op as permanent dead code is a maintainability smell.
**Fix:** Remove the unused `isFilterActive` import and the trailing `void isFilterActive;` line, or
use it where intended.

---

_Reviewed: 2026-06-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
