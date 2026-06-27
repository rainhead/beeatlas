---
phase: 170-source-provenance-facets-rebuild
reviewed: 2026-06-27T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/filter.ts
  - src/url-state.ts
  - src/features.ts
  - src/bee-map.ts
  - src/bee-pane.ts
  - src/bee-atlas.ts
  - src/style.ts
  - src/bee-occurrence-detail.ts
  - data/dbt/models/intermediate/int_combined.sql
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/marts/schema.yml
  - data/dbt/tests/assert_id_date_parse_complete.sql
  - data/collectors_export.py
  - data/sqlite_export.py
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 170: Code Review Report

**Reviewed:** 2026-06-27
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 170 decomposes the `source` enum on `marts/occurrences` into two orthogonal
columns — `tier` (`atlas`/`other`) and `record_type` (`specimen`/`provisional_sample`/
`waba_specimen`/`inat_expert`/`checklist`) — and rewires the three coupled frontend
consumers (filter SQL, map symbology, detail card) plus the `src=`→`tier=` URL
back-compat path.

The phase-critical invariants are all intact and well-defended:

- **occ_id positional coupling** is unchanged. `OCC_ID_SQL_CASE` (filter.ts:115-121),
  `occIdFromRow`/`parseOccId` (occurrence.ts:23-30/39-59), and the `inat_obs:` prefix
  in features.ts:42 all preserve the priority order `ecdysis → inat → inat_obs →
  checklist`. The `inat_obs:` occ_id PREFIX is correctly kept even though the
  `record_type` VALUE was renamed `inat_obs`→`inat_expert` — the two are not
  conflated anywhere (bee-atlas.ts:983/1014 `parsed.source === 'inat_obs'` is the
  occ_id domain, correct; detail card dispatches on `record_type === 'inat_expert'`,
  correct).
- **Tier filter SQL is injection-safe** (filter.ts:405-415): the `IN (...)` list is
  built from the hardcoded `VALID_TIERS` literal array, not user input; the
  all-hidden case emits the `1 = 0` sentinel rather than an empty `IN ()`.
- **`src=`→`tier=` back-compat anti-blank guard survives** (url-state.ts:269-291):
  garbage/unknown tokens collapse to "no filter" (visible=∅ → `hiddenTiers` left
  undefined), never all-hidden, never a crash. `tier=none` / `src=none` sentinels map
  to the explicit all-hidden set.
- **`features.ts` ↔ `sqlite_export.py` `_GEO_COLS` coupling** is consistent: index 6
  is `tier` on both sides (features.ts:36, sqlite_export.py:482-485).
- **MIN/COALESCE** in collectors_export.py:38 correctly uses
  `COALESCE(MIN(recordedBy), …)` (the prior CR-01 lesson).
- **Style-cache invariant** is satisfied structurally — `style.ts` holds only static
  layer specs; dynamic tier/selection state is applied via `setData` (data-driven
  re-cluster in bee-map `_visibleByTier`), and `intendedFilterActive` bypasses the
  filtered render path when a filter or selection is active.

No BLOCKER-severity defects were found. The findings below are quality/robustness
WARNINGs and Info-level items, several of which are stale documentation that will
mislead the next maintainer of this load-bearing area.

## Warnings

### WR-01: Map tier-filter and SQL tier-filter diverge — `1 = 0` (zero rows) vs. unfiltered map under all-hidden

**File:** `src/bee-map.ts:588-593`, `src/filter.ts:405-415`
**Issue:** The map's `_visibleByTier` drops features whose `tier` is in `hiddenTiers`
(string-set membership on `f.properties.tier`). The SQL path in `buildFilterSQL`
treats the all-hidden case specially with the `1 = 0` honest-empty sentinel. These are
consistent for the all-hidden case (both produce zero). However, `_visibleByTier`
filters on the literal `tier` *property value* carried on each geo feature, while the
SQL filters on `o.tier`. If a geo_blob row ever carries a `tier` value outside
`{atlas, other}` (e.g. an empty string from the `tier ?? ''` fallback in
features.ts:49 / filter.ts:451 when the column is NULL), that feature is **never
hidden by `_visibleByTier`** (its `''` tier is not in `hiddenTiers`) but **is excluded
by the SQL** `o.tier IN ('atlas','other')` complement once any tier is hidden. The map
and the list/table can then disagree about which points exist. Today every arm emits a
non-null `atlas`/`other` literal so this is latent, but the `?? ''` fallbacks make it
silent if a future arm forgets to set `tier`.
**Fix:** Make the contract explicit — either assert non-null tier at the data layer
(add a `not_null` + `accepted_values: ['atlas','other']` dbt test on `tier` in
`marts/schema.yml`, mirroring the existing `record_type` discipline), or have
`_visibleByTier` treat an unrecognized tier the same way the SQL does (exclude it when
any tier is hidden) so the two paths cannot drift.

### WR-02: `marts/schema.yml` adds `tier`/`record_type` to the contract but does not constrain their values

**File:** `data/dbt/models/marts/schema.yml:61-64`
**Issue:** `tier` and `record_type` are the new load-bearing facets that drive
symbology, the filter, and the 5-way detail-card dispatch. The contract enforces only
`data_type: varchar` for both. A typo in any int_combined ARM (e.g. `'inat-expert'`,
`'Atlas'`, or a forgotten arm emitting NULL) would pass the contract silently and then:
the map would mis-color (`tier` not matching `'other'` falls through to the recency
gradient), the detail card would fall through to `_renderSampleOnly` (the final `else`
in bee-occurrence-detail.ts:478), and the tier filter would never hide the row. None of
these fail loudly.
**Fix:** Add `accepted_values` tests:
```yaml
      - name: tier
        data_type: varchar
        data_tests:
          - accepted_values: { values: ['atlas', 'other'] }
      - name: record_type
        data_type: varchar
        data_tests:
          - accepted_values:
              values: ['specimen', 'provisional_sample', 'waba_specimen', 'inat_expert', 'checklist']
```
This makes the 5 record_type spellings and 2 tier values structural (the comment at
filter.ts:77 says they are "fixed by 170-01", but nothing enforces it).

### WR-03: Stale `source=` documentation in the intermediate model survives the rename

**File:** `data/dbt/models/intermediate/int_combined.sql:1-8`, `data/dbt/models/intermediate/schema.yml:24-28`
**Issue:** The header block and the intermediate `schema.yml` description still document
the model as emitting `source='ecdysis'`, `source='waba_sample'`, … `source='inat_obs'`,
`source='checklist'`. The model no longer produces a `source` column at all (it emits
`tier` + `record_type`); the marts contract has no `source`. The doc now describes a
column that does not exist, and crucially still uses the OLD value `inat_obs` for ARM 4,
which is exactly the value that was renamed to `inat_expert` — a future maintainer
grepping for `inat_obs` will be led to believe a `source`/`record_type` value of
`inat_obs` is live. Given the phase brief explicitly flags conflating the `inat_obs`
record_type value with the `inat_obs:` occ_id prefix as a hazard, this stale doc is a
real trap.
**Fix:** Update the int_combined.sql header arms to the new facet vocabulary
(`tier=…, record_type=…`) and rewrite the intermediate `schema.yml` description; in
particular change the ARM 4 reference from `source='inat_obs'` to
`record_type='inat_expert'` and note the `inat_obs:` occ_id prefix is intentionally
distinct.

### WR-04: `collectors_export.py` module docstring still references the dropped `source` column

**File:** `data/collectors_export.py:5-6`
**Issue:** The module docstring documents the gate as
`source IN ('waba_specimen', 'waba_sample')`, but the actual query (line 68) was
rewritten to `record_type IN ('waba_specimen', 'provisional_sample')`. Two drifts in one
line: the column (`source`→`record_type`) and the value (`waba_sample`→
`provisional_sample`, since the old ARM-2 `source='waba_sample'` is now
`record_type='provisional_sample'`). The predicate rewrite itself is correct and drops
no arm (ecdysis + waba_specimen + provisional_sample are all retained), but the
docstring now contradicts the code it documents.
**Fix:** Update the docstring to
`record_type IN ('waba_specimen', 'provisional_sample')` to match the live WHERE clause.

## Info

### IN-01: `OccurrenceProperties.tier` typed as `string`, weakening the symbology match

**File:** `src/filter.ts:33`
**Issue:** `OccurrenceProperties.tier` is `string`, while the underlying domain is the
2-value `TierKey` union. The map `_visibleByTier` (bee-map.ts:592) does
`this.hiddenTiers.has(f.properties.tier)` against a `Set<string>`, and bee-map's
`hiddenTiers` @property is `Set<string>` (bee-map.ts:60) rather than `Set<TierKey>`.
Loosening to `string` removes the compiler's ability to catch a tier typo at the
feature-construction sites (features.ts:49, filter.ts:451).
**Fix:** Type `OccurrenceProperties.tier` as `TierKey | ''` (or `TierKey`) and narrow
bee-map's `hiddenTiers` to `Set<TierKey>` so the symbology and filter paths share one
checked type.

### IN-02: Empty-string tier fallback masks a NULL-tier data defect instead of surfacing it

**File:** `src/features.ts:49`, `src/filter.ts:451`
**Issue:** Both geo-feature builders coalesce a missing tier to `''`
(`tier: tier ?? ''` / `String(row.tier ?? '')`). A point with `tier=''` renders with the
default (atlas) recency color and can never be hidden by the tier filter. Combined with
the unconstrained contract (WR-02), a NULL tier is silently absorbed rather than caught.
**Fix:** Once WR-02's `not_null` test guarantees a non-null tier, the `?? ''` fallbacks
become dead defensiveness; either remove them or keep them but add a `console.warn` so a
NULL tier in dev is visible rather than silently styled.

### IN-03: Debug `console.log` benchmark statements remain in the hot data-load path

**File:** `src/features.ts:63,70`
**Issue:** `loadOccurrenceGeoJSON` logs two `[BENCHMARK]` lines on every cold load.
These are pre-existing (not introduced by Phase 170) but sit in a file this phase
edited; they ship to production and clutter the console on every page load.
**Fix:** Gate behind `import.meta.env.DEV` or remove. Low priority — flagged for
completeness, not a Phase 170 regression.

### IN-04: ARM-1 FULL OUTER JOIN can stamp `record_type='specimen'` on an `ecdysis_id IS NULL` row

**File:** `data/dbt/models/intermediate/int_combined.sql:21-55`
**Issue:** ARM 1 is a FULL OUTER JOIN of ecdysis × samples and hardcodes
`record_type = 'specimen'`. A sample-only row (ecdysis side NULL, `observation_id`
present from the samples side) therefore carries `record_type='specimen'` with
`ecdysis_id IS NULL`. The frontend tolerates this because the detail card groups on
`isSpecimenBacked` (ecdysis_id) first and the final `else` falls to `_renderSampleOnly`
(bee-occurrence-detail.ts:478), so the card is still sensible. This is **not a Phase 170
regression** — the prior code hardcoded `source='ecdysis'` on the same rows — but the
new `record_type='specimen'` label is now semantically misleading for these
sample-only rows, and anyone querying `WHERE record_type='specimen'` expecting an
Ecdysis specimen will over-count.
**Fix:** Optional/future — consider deriving record_type per-row
(`CASE WHEN e.ecdysis_id IS NOT NULL THEN 'specimen' ELSE 'provisional_sample' END`) or
document the invariant that `record_type='specimen'` does NOT imply `ecdysis_id IS NOT
NULL`. No action required for this phase if the prior semantics are intended.

---

_Reviewed: 2026-06-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
