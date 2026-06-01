---
phase: 127-inactive-taxon-remapping
fixed_at: 2026-05-31T00:00:00Z
review_path: .planning/phases/127-inactive-taxon-remapping/127-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 4
skipped: 2
status: partial
---

# Phase 127: Code Review Fix Report

**Fixed at:** 2026-05-31T00:00:00Z
**Source review:** .planning/phases/127-inactive-taxon-remapping/127-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 6
- Fixed: 4 (CR-01, WR-02, WR-03, WR-05)
- Skipped: 2 (WR-01 — design follow-up; WR-04 — intentional by-design)

All fixes honor the locked design decisions in 127-CONTEXT.md (D-01..D-13).
No new dependencies introduced. No dbt files changed.

**Invariant verification:**
- `cd data && uv run pytest tests/test_inactive_remap.py -x` → 10 passed
  (7 original + 3 added/adjusted for the new CR-01 / WR-03 behavior).
- `bash data/dbt/run.sh build` not re-run — no dbt files were modified
  (only `data/resolve_taxon_ids.py` and `data/tests/test_inactive_remap.py`).

## Fixed Issues

### CR-01: Transient iNat API error hard-fails the entire nightly pipeline with an unactionable fix

**Files modified:** `data/resolve_taxon_ids.py`, `data/tests/test_inactive_remap.py`
**Commit:** 57f4920
**Status:** fixed

**Applied fix:** A transient/infrastructure API failure (`HTTPError` after
`_inat_get_with_retry`'s own retry budget, or an empty `results` array) no longer
writes a blocking `api_error` triage row. The invented `api_error` reason — which
was outside the three sanctioned D-06 BLOCKING reasons
(`{no_successor, split, successor_not_in_taxa_csv}`) — was the root cause: it
coupled pipeline liveness to iNat uptime and offered an unactionable
"add to occurrence_synonyms.csv" fix. Now both transient cases:
- leave the inactive bridge row untouched (so it is naturally re-attempted next
  run — the bridge row persists, satisfying the fix direction's preferred
  behavior),
- emit a loud `WARNING` line and a per-run transient-failure count in the summary,
- are NOT written to `inactive_unresolved.csv`, so `check_inactive_gate()` cannot
  hard-fail on them.

`check_inactive_gate()` was re-documented to make explicit that it blocks only on
genuine taxonomic dead-ends (the D-06 set), preserving D-05's hard-fail for those.
The existing `_inat_get_with_retry` paced-retry behavior is unchanged.

Two tests were added asserting the NEW non-blocking behavior
(`test_transient_api_error_does_not_block`, `test_empty_results_does_not_block`):
they confirm no blocking row is written, the inactive bridge row is preserved, the
warning is surfaced, and the gate passes on the resulting empty triage file.

**Note (logic-bearing — recommend a glance during verification):** the gate's
blocking semantics changed conceptually (transient rows are simply never produced,
so blocking on all present rows remains correct). Verified by tests, but flagged
here since it is a behavioral change to a safety gate.

### WR-02: Successor-name lookup duplicate-synonym-key collision can abort the dbt build

**Files modified:** `data/resolve_taxon_ids.py`
**Commit:** aa8a577
**Status:** fixed

**Applied fix:** Added a `seen_synonyms` guard before appending to `auto_rows`.
If a `synonym` key (the `canonical_name`) would repeat within a single run, the
row is routed to triage with a new reason `duplicate_synonym_key` instead of being
emitted a second time. This prevents a duplicate `synonym` value from ever reaching
the dbt `unique` test on `auto_synonyms.synonym` and aborting the whole build. The
anomaly row is blocking via the gate (fail-closed), which is the correct treatment
for an unexpected duplicate that warrants human attention.

### WR-03: iNat API names written to curator-facing CSVs without formula-injection hardening

**Files modified:** `data/resolve_taxon_ids.py`, `data/tests/test_inactive_remap.py`
**Commit:** a4a36b4
**Status:** fixed

**Applied fix:** Added a module-level `_csv_safe()` helper that prefixes a single
quote to any string cell beginning with a spreadsheet formula trigger (`= + - @`).
It is applied on write to every cell of `auto_synonyms.csv` and
`inactive_unresolved.csv` (the curator-facing triage files). Non-string cells
(integer taxon IDs) pass through unchanged. This is a no-op for real bee scientific
names and only defends against a crafted/garbage iNat response. The bridge UPSERT
(parameterized) and the dbt seed parse path were deliberately left untouched per
the fix direction. Test `test_csv_formula_injection_is_neutralized` covers the
`=`-prefixed successor-name case.

### WR-05: No cap on the paced per-taxon API loop

**Files modified:** `data/resolve_taxon_ids.py`
**Commit:** feb715e
**Status:** fixed

**Applied fix:** Two defensive bounds on the per-taxon detail loop:
- `_INACTIVE_REMAP_MAX_TAXA = 500` — a generous hard ceiling on per-run detail
  fetches (0 inactive taxa today, so it only trips on an anomaly such as a
  detection-query regression). The remainder is left untouched (bridge rows
  persist) and retried next run.
- `_INACTIVE_REMAP_MAX_CONSECUTIVE_FAILS = 10` — a circuit-breaker: after N
  consecutive transient API failures the loop stops issuing further paced requests
  (fails fast on a hard iNat outage rather than burning ~1s/taxon to no effect).
  A usable response resets the counter.

Both emit clear `WARNING` log lines when tripped.

## Skipped Issues

### WR-01: Inactive bridge row is never retired, so the remap never converges

**File:** `data/resolve_taxon_ids.py:143-154`
**Reason:** skipped — design follow-up, not a safe code-review fix.
**Original issue:** On the single-successor path the code upserts the successor's
bridge row but never retires the original inactive predecessor row, so detection
re-finds the same inactive taxon every night and re-issues the API call forever
(no fixed point).

**Why not auto-fixed:** Truly retiring/repointing the predecessor bridge row is a
DESIGN change that interacts with the locked D-10 decision (which only upserts the
successor name) and the resolver's bridge semantics. The predecessor
`canonical_name → inactive_taxon_id` row currently serves as the COALESCE fallback
for any occurrence whose `canonical_name` is the inactive name and that is not
rewritten by the synonym JOIN. Deleting it risks producing a NULL `taxon_id` and
violating the marts NOT NULL `taxon_id` contract (D-01, Phase 126) — exactly the
invariant the fix direction warns against. No minimal, clearly-correct convergence
fix exists that honors D-10 without touching the bridge semantics. The practical
impact today is also nil (0 inactive taxa) and bounded going forward by the WR-05
caps (the per-night cost is paced and now capped).

**Recommendation:** Address convergence in a dedicated future phase (a
`/gsd:discuss-phase` candidate): either persist auto-remap decisions in a table
(rather than regenerating the CSV from live-inactive state each run) so a retired
predecessor's rewrite is durable, or define explicit predecessor-retirement
semantics that provably preserve the marts NOT NULL contract.

### WR-04: `auto_synonyms.csv` is simultaneously git-tracked and git-ignored

**File:** `data/.gitignore:15`, `data/dbt/seeds/auto_synonyms.csv`
**Reason:** skipped — intentional, by-design per D-04 + D-12.
**Original issue:** The seed file is both committed and listed in `.gitignore`,
which the reviewer flagged as a contradictory maintenance trap.

**Why not auto-fixed:** This dual state is the deliberate design. D-04 requires a
committed header-only placeholder so a fresh checkout can run `dbt seed`/`dbt build`
before the pipeline has regenerated the file; D-12 gitignores the path so the
nightly-regenerated content is never committed. "Tracked placeholder + gitignored
updates" is the intended lifecycle, identical in spirit to other
regenerated-nightly artifacts. Removing the `.gitignore` entry or untracking the
file would break one of the two locked decisions. No change made.

---

_Fixed: 2026-05-31T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
