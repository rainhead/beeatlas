---
phase: 168-temporal-lifecycle-dates
reviewed: 2026-06-25T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - data/dbt/tests/assert_id_date_parse_complete.sql
  - data/dbt/models/intermediate/int_ecdysis_base.sql
  - data/dbt/models/intermediate/int_combined.sql
  - data/dbt/models/marts/occurrences.sql
  - data/dbt/models/marts/schema.yml
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 168: Code Review Report

**Reviewed:** 2026-06-25
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 168 data-layer change that adds a single `id_date VARCHAR`
column to the `marts/occurrences` contract (37→38). The change spans the ARM 1
`date_identified` parse in `int_combined.sql`, the `date_identified` passthrough
in `int_ecdysis_base.sql`, the final mart SELECT projection, the contract entry
in `schema.yml`, and a new singular guard test `assert_id_date_parse_complete.sql`.

I re-derived the locked design decisions (D-06 VARCHAR keep-partials, D-08/D-09
NULL arms, the intentional shared-regex tautology) from CONTEXT.md and did **not**
flag those. I focused on parse correctness, NULL handling, regex anchoring, the
5-arm UNION typecheck, contract positional ordering, and the singular test's join
key / severity / coverage.

**Core mechanics are sound.** The parse correctly NULL-propagates
(`regexp_full_match(trim(NULL))` → NULL → `ELSE NULL`), the two regexes are
anchored (`^...$`) and byte-identical between parse and test, all five arms
project `id_date` last with explicit `::VARCHAR` casts so the UNION typechecks,
the contract appends `id_date` in last position (positional-order safe), and
`sqlite_export.py` carries the column through automatically without touching
`_GEO_COLS` (correct — no positional geo-blob coupling). The live verification
(28,444 ecdysis non-null, all other arms 0, 0 garbage) matches the code's intent.

The two warnings concern a stored-value/regex whitespace asymmetry that can
produce non-canonical persisted values, and a coverage gap in the guard test for
duplicate `ecdysis_id` fan-out. Neither is a blocker; both are robustness issues.

## Warnings

### WR-01: Parse stores trimmed value but does not normalize internal whitespace, allowing non-canonical persisted dates

**File:** `data/dbt/models/intermediate/int_combined.sql:64-69`

**Issue:** The parse matches `regexp_full_match(trim(e.date_identified), ...)`
and then stores `trim(e.date_identified)`. The `trim()` on both sides is
consistent for leading/trailing whitespace, so this is *not* a false-NULL bug.
However, the regexes are `^[0-9]{4}$` and `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` with no
tolerance for internal whitespace — which is correct — but a raw value like
`" 2025 "` is stored as `"2025"` (good), while the design's downstream consumer
(Phase 171 feed) will string-compare/render these. The asymmetry to watch: the
stored value is the *trimmed-but-otherwise-raw* string, so any future loosening
of the regex (e.g. allowing `2025-3-5` single-digit segments) would persist
non-zero-padded values that downstream date rendering may mishandle. Today this
is latent because the live distribution is clean, but the parse does no
canonicalization — it is a pure keep-or-NULL filter.

**Fix:** No change required for current data. If you want the stored value to be
provably canonical (so downstream can assume strict `YYYY` or `YYYY-MM-DD`),
make the stored expression echo the validated shape explicitly rather than
re-trimming the raw input:

```sql
CASE
    WHEN regexp_full_match(trim(e.date_identified), '^[0-9]{4}$')
      OR regexp_full_match(trim(e.date_identified), '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    THEN trim(e.date_identified)   -- already canonical given the strict anchored regex
    ELSE NULL
END::VARCHAR AS id_date
```

This is acceptable as-is because the anchored regexes already forbid internal
whitespace and non-zero-padded segments; the recommendation is to document that
invariant inline so a future regex relaxation does not silently de-canonicalize
the stored value.

### WR-02: Guard test relies on FULL-OUTER-JOIN fan-out being id_date-uniform; a future ARM-1 join that fans out per-ecdysis-id could mask a regression

**File:** `data/dbt/tests/assert_id_date_parse_complete.sql:32-38`

**Issue:** The test joins `stg_ecdysis__occurrences src` to the mart `m` on
`CAST(m.ecdysis_id AS VARCHAR) = src.id` and asserts no row with a keep-shape
`date_identified` has `m.id_date IS NULL`. ARM 1 is a FULL OUTER JOIN to
`int_samples_base` plus LEFT JOINs to `sob`/synonyms/taxon bridges. If any of
those joins ever fan out (produce multiple mart rows per `ecdysis_id`), the test
passes as long as *at least one* of the duplicate rows has a non-NULL `id_date`.
Because `id_date` is derived purely from `e.date_identified` (identical across
all fan-out copies of a given `ecdysis_id`), the test is correct **today**. But
the test's correctness is *implicitly* coupled to that uniformity invariant,
which is not asserted anywhere. A future change that makes `id_date` depend on a
fanned-out joined column would let a partial-NULL regression slip past this
guard.

**Fix:** Make the coverage explicit by asserting per `ecdysis_id` that *no* mart
row is NULL, rather than relying on existential matching. Anti-join the other
direction (start from the mart, require every keep-shape row to be non-NULL):

```sql
{{ config(severity='warn') }}

SELECT m.ecdysis_id, src.date_identified
FROM {{ ref('occurrences') }} m
JOIN {{ ref('stg_ecdysis__occurrences') }} src
  ON src.id = CAST(m.ecdysis_id AS VARCHAR)
WHERE m.source = 'ecdysis'
  AND (
        regexp_full_match(trim(src.date_identified), '^[0-9]{4}$')
     OR regexp_full_match(trim(src.date_identified), '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      )
  AND m.id_date IS NULL
```

This fires on *any* mart row (not just the join's first match) that dropped a
keep-shape date, closing the fan-out coverage gap. The `warn` severity (matching
Phase 167 D-06) is appropriate and should be retained.

## Info

### IN-01: `date_identified` projected in `int_ecdysis_base` but the parse lives in `int_combined`, splitting the logic across two files

**File:** `data/dbt/models/intermediate/int_ecdysis_base.sql:27`, `data/dbt/models/intermediate/int_combined.sql:64-69`

**Issue:** `int_ecdysis_base` now passes raw `o.date_identified` through
unparsed (line 27), and the parse happens downstream in `int_combined` ARM 1.
CONTEXT.md D-Discretion explicitly allows either placement, so this is not a
defect — but the split means a reader of `int_ecdysis_base` sees a raw dirty
column with no indication it is parsed elsewhere, while the `modified`/`year`/
`month` columns in the same file *are* cleaned in place (e.g. line 23's
`strftime(GREATEST(...))`). The inconsistency is a minor readability cost.

**Fix:** Optional. Either add a one-line comment on
`int_ecdysis_base.sql:27` noting the parse is deferred to `int_combined` ARM 1,
or move the parse helper into `int_ecdysis_base` so all date cleaning lives
together. No behavioral change either way.

### IN-02: Three identical `NULL::VARCHAR AS id_date` rationale comments duplicate D-08/D-09 prose across arms

**File:** `data/dbt/models/intermediate/int_combined.sql:129,186,330` (and ARM 4 line 267)

**Issue:** Each non-specimen arm carries a bespoke inline justification for the
NULL id_date (D-09 for arms 2/4/5, D-08 for arm 3). This is good documentation,
but the near-duplicated phrasing ("non-specimen arm", "not volunteer work",
"museum/checklist record") is the kind of comment that drifts if the decision
record changes. Low risk given the decisions are locked.

**Fix:** Optional. Leave as-is (the per-arm rationale aids review), or collapse
to a single header comment referencing D-08/D-09 once and tagging each arm's
NULL with just `-- D-08`/`-- D-09`.

---

_Reviewed: 2026-06-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
