---
phase: 127-inactive-taxon-remapping
reviewed: 2026-05-31T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - data/resolve_taxon_ids.py
  - data/run.py
  - data/.gitignore
  - data/tests/test_inactive_remap.py
  - data/dbt/models/intermediate/int_synonyms.sql
  - data/dbt/models/intermediate/int_combined.sql
  - data/dbt/models/intermediate/int_species_universe.sql
  - data/dbt/models/staging/stg_checklist__species.sql
  - data/dbt/seeds/auto_synonyms.csv
  - data/dbt/seeds/schema.yml
  - data/dbt/dbt_project.yml
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 127: Code Review Report

**Reviewed:** 2026-05-31T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 127 adds an inactive-taxon remapping mechanism: `generate_inactive_remaps()` detects bridge rows pointing at iNat-inactive taxa, queries `GET /v1/taxa/{id}` for `current_synonymous_taxon_ids`, and (for the single-successor case) writes an `auto_synonyms.csv` row plus a bridge upsert; `check_inactive_gate()` hard-fails the nightly run on any unresolved inactive taxon. A new `int_synonyms` view UNIONs the manual and auto seeds with an anti-join so manual entries win. Four models repoint to `int_synonyms`.

The dbt wiring is sound: the anti-join precedence is correct, and the synonym-rewrite + COALESCE taxon_id re-lookup path correctly routes an inactive `canonical_name` to its successor's `taxon_id` (because the bridge upsert adds `successor_name -> successor_taxon_id` before dbt seeds the regenerated CSV). The mechanism is dormant today (0 inactive taxa), so all findings below describe behavior at first activation.

The most serious issue is operational: a **transient API error during the inactive-remap step writes a blocking triage row that hard-fails the entire nightly pipeline with a fix instruction that cannot resolve the problem**. Several lesser issues concern non-convergence of the inactive bridge row, misleading triage reasons, and the contradictory git-tracked-but-gitignored state of the seed CSV.

## Critical Issues

### CR-01: Transient iNat API error hard-fails the entire nightly pipeline with an unactionable fix

**File:** `data/resolve_taxon_ids.py:96-115`, `data/resolve_taxon_ids.py:188-206`

**Issue:** When the `GET /v1/taxa/{id}` call raises `HTTPError` (after the 5-retry budget in `_inat_get_with_retry` is exhausted — e.g. a sustained 5xx outage or rate-limit storm), the code writes a triage row with `reason="api_error"` (line 97-103). An *empty* `results` array (line 107-114) is also labeled `api_error`. `check_inactive_gate()` then treats *every* row in `inactive_unresolved.csv` as blocking (line 200) and calls `sys.exit(...)`, aborting the nightly run before `dbt-build`.

This couples pipeline liveness to iNat API availability for a path that is supposed to be a quality gate, not an uptime gate. Worse, the only fix the gate offers is "add entries to occurrence_synonyms.csv" (line 204) — which does nothing for a transient API failure. The operator is told to hand-curate a synonym for a taxon that is fine; the real fix is to re-run when iNat recovers. A flaky upstream now produces a hard outage of the whole data refresh with a misleading runbook.

Note this is strictly worse than the sibling `check_resolution_gate`, which has a `KNOWN_NON_BEES` exclusion and whose unresolved reasons come from the resolver's own ladder; here there is no exclusion path (D-07, line 191-192) and an `api_error` is indistinguishable from a genuine taxonomic dead-end.

**Fix:** Separate transient/infrastructure failures from genuine unresolved-taxonomy failures so the gate only blocks on the latter.

```python
# In check_inactive_gate(): exclude transient reasons from the blocking set.
TRANSIENT_REASONS = {"api_error"}
rows = list(csv.DictReader(INACTIVE_UNRESOLVED_CSV.open(newline="")))
blocking = [r for r in rows if r["reason"] not in TRANSIENT_REASONS]
transient = [r for r in rows if r["reason"] in TRANSIENT_REASONS]
if blocking:
    names = ", ".join(r["canonical_name"] for r in blocking)
    sys.exit(
        f"inactive-gate: {len(blocking)} inactive taxon ID(s) with no auto-resolution. "
        f"Fix by adding entries to occurrence_synonyms.csv\nOffenders: {names}"
    )
if transient:
    # Surface loudly but do not abort the whole refresh on an upstream outage.
    print(f"inactive-gate: WARNING {len(transient)} transient API failures, will retry next run")  # noqa: T201
print("inactive-gate: OK (0 unresolved inactive taxa)")  # noqa: T201
```

Additionally, give the empty-`results` case its own reason (e.g. `taxon_not_found`) instead of reusing `api_error`, since an ID that iNat no longer returns is a genuine taxonomic dead-end that SHOULD block, whereas a 5xx should not.

## Warnings

### WR-01: Inactive bridge row is never retired, so the remap never converges and re-hits the API every night

**File:** `data/resolve_taxon_ids.py:143-154`

**Issue:** On the single-successor path the code upserts `successor_name -> successor_taxon_id` (a *new* bridge row keyed on the successor's canonical_name) but never deletes or updates the original inactive row `canonical_name -> inactive_taxon_id`. The original row still points at the inactive taxon. On the next nightly run, the `WHERE t.active = false` detection query (line 76-83) finds that same inactive row again, re-issues the paced `GET /v1/taxa/{id}` (line 89-95), and re-writes the identical `auto_synonyms.csv` row. The state never reaches a fixed point: every inactive taxon costs one API round-trip *forever*, and `inactive_unresolved.csv` / `auto_synonyms.csv` are rewritten each run even when nothing changed.

It is also slightly surprising that `auto_synonyms.csv` is fully regenerated from only the *currently-inactive* bridge rows. If an inactive row is ever manually removed from the bridge (or its taxon becomes active again), its previously-emitted auto-synonym row silently disappears from the seed, which could un-rewrite occurrence data that downstream consumers expected to stay rewritten.

**Fix:** After a successful upsert of the successor, retire the predecessor row so detection converges, e.g.:

```python
con.execute(
    "DELETE FROM inaturalist_data.canonical_to_taxon_id "
    "WHERE canonical_name = ? AND taxon_id = ?",
    [canonical_name, inactive_taxon_id],
)
```
Confirm this is consistent with the intended invariant (the `auto_synonyms` row plus the successor bridge row should be sufficient to route `canonical_name` to the right taxon_id downstream). If predecessor rows must be retained for audit, instead persist the auto-synonym decisions in a table rather than regenerating the CSV from live-inactive state each run.

### WR-02: Successor-name lookup ignores inactive/duplicate-name ambiguity and silently takes `fetchone()`

**File:** `data/resolve_taxon_ids.py:122-138`

**Issue:** The successor name is resolved by `SELECT name ... WHERE CAST(taxon_id AS INTEGER) = ? AND active = true` then `.fetchone()`. If `taxa.csv.gz` contains more than one active row for that `taxon_id` (it should not, but the file is an external upstream dump with no enforced uniqueness here), `fetchone()` silently picks an arbitrary row. More importantly, the `name` column from iNat can be a homonym that, after `lower().strip()`, collides with an existing `synonym` already present in `auto_synonyms.csv` from a *different* inactive taxon — that produces a duplicate `synonym` key and the dbt `unique` test on `auto_synonyms.synonym` (schema.yml:18-19) fails the build. Because two distinct inactive predecessors can legitimately map to two different successors whose lowercased names are identical, this is reachable without any data corruption.

**Fix:** Detect and triage the collision instead of letting the dbt test abort the build. Before appending to `auto_rows`, check whether `successor_name` (or `canonical_name`) is already present as a synonym key in `auto_rows`; if so, route to `triage_rows` with a dedicated reason (e.g. `duplicate_synonym_key`). Also consider asserting `len(rows) <= 1` from the name lookup or selecting deterministically.

### WR-03: `inat_name` and successor `name` from the iNat API are written to a CSV/seed without formula-injection hardening

**File:** `data/resolve_taxon_ids.py:138-140`, `data/resolve_taxon_ids.py:168-179`

**Issue:** Values sourced from the iNat API (`inat_name`, and the successor `name` that becomes `accepted_name`) are written verbatim into `auto_synonyms.csv` and `inactive_unresolved.csv`. SQL-structure injection into DuckDB is NOT possible here — `csv.writer` correctly quotes embedded delimiters/quotes/newlines, and dbt's seed loader parses the CSV with a real CSV parser, and the bridge upsert is fully parameterized (line 143-154). So this is not a SQL-injection vector. It is, however, a classic CSV formula-injection vector: a taxon `name` beginning with `=`, `+`, `-`, or `@` would be interpreted as a formula if `auto_synonyms.csv` / `inactive_unresolved.csv` are ever opened in a spreadsheet by a curator (the intended human workflow for triage). Bee scientific names will not realistically start with those characters, so risk is low, but the data is third-party and flows into a human-reviewed file.

**Fix:** Either accept the low risk explicitly (these are scientific names, lowercased) or sanitize on write by prefixing a leading apostrophe / rejecting names whose first char is in `=+-@`. Given the bee-name domain, a `WARNING`-level note and a guard that triages any name containing characters outside `[a-z .-]` (which would also catch garbage API responses) is the proportionate fix.

### WR-04: `auto_synonyms.csv` is simultaneously git-tracked and git-ignored

**File:** `data/.gitignore:15`, `data/dbt/seeds/auto_synonyms.csv`

**Issue:** `data/dbt/seeds/auto_synonyms.csv` is committed to the repo (`git ls-files` confirms it is tracked) yet `data/.gitignore:15` lists `dbt/seeds/auto_synonyms.csv`. A tracked file that is also ignored is a contradictory state: `git status` will not surface modifications, but the file still participates in commits/merges. On maderas, `nightly.sh` runs `git pull` and then the pipeline overwrites this file in place; because it is tracked, a future upstream edit to the committed header could conflict with the locally-regenerated content, and because it is ignored, an operator will not see the dirty working tree. The current behavior (dbt seeds the freshly-regenerated file within the same run) is correct, but the dual state is a maintenance trap.

**Fix:** Pick one model. If the file is a pure runtime artifact (like `lineage_unresolved.csv`), `git rm --cached data/dbt/seeds/auto_synonyms.csv` and keep the `.gitignore` entry, and have the pipeline create the header-only file when absent (the code already calls `mkdir(parents=True, exist_ok=True)` at line 167, so seeding from scratch is fine). If a committed header-only seed is required so a clean checkout can `dbt build` before the pipeline runs, remove the `.gitignore` entry and treat regeneration as an intentional working-tree change. Do not keep both.

### WR-05: `time.sleep(_INAT_PACE_SECONDS)` is issued before the early-exit detection check has any rows, but per-iteration sleep precedes the API call unconditionally even on the name-lookup-only path

**File:** `data/resolve_taxon_ids.py:88-126`

**Issue:** Each loop iteration sleeps `_INAT_PACE_SECONDS` (line 89) before the detail request — correct pacing. But the *successor name lookup* at line 122-126 is a local DuckDB read of `taxa.csv.gz`, not an API call, yet it occurs inside the same paced loop. That is fine. The real concern: there is no upper bound or batching on the number of inactive taxa. With the bridge re-detecting unconverged inactive rows every night (see WR-01), a growing set of inactive taxa linearly grows the nightly API time at 1s/taxon with no cap, and a single `HTTPError` mid-loop is swallowed per-row (good) but the loop continues issuing more paced requests against an API that just failed. This is robustness, not correctness.

**Fix:** Lower priority; primarily resolved by fixing WR-01 (convergence). Optionally add a circuit-breaker: after N consecutive `HTTPError`s, stop issuing further detail requests and mark the remainder `api_error` without sleeping, so a hard iNat outage fails fast rather than slowly.

## Info

### IN-01: Duplicated `_dt.datetime.now(_dt.UTC).replace(tzinfo=None).isoformat()` timestamp expression repeated five times

**File:** `data/resolve_taxon_ids.py:102, 113, 134, 163` (and the module-level variant at 390)

**Issue:** The same timestamp construction is inlined in every triage branch. This is error-prone (one branch could drift) and noisy.

**Fix:** Compute once per iteration: `attempted_at = _dt.datetime.now(_dt.UTC).replace(tzinfo=None).isoformat()` near the top of the loop body and reference it in each triage dict. Also note the local `import datetime as _dt` at line 71 shadows the module-level `import datetime as dt` (line 9) used by `_resolve_one` — two aliases for the same module in one file is confusing; standardize on one.

### IN-02: `successor_name = row[0].lower().strip()` can be `accepted_name == synonym` (no-op self-map)

**File:** `data/resolve_taxon_ids.py:138-140`

**Issue:** If the successor's lowercased name equals the inactive `canonical_name` (e.g. a pure taxon-ID merge with no name change), the emitted `auto_synonyms` row maps a name to itself. It is harmless (the LEFT JOIN rewrite is idempotent for `synonym == accepted_name`), but it pollutes the seed and the triage/audit story with rows that do nothing.

**Fix:** Skip emitting an `auto_synonyms` row when `successor_name == canonical_name`; still perform the bridge upsert (the taxon_id changed even though the name did not).

### IN-03: `int_synonyms` does not chain transitive synonyms

**File:** `data/dbt/models/intermediate/int_synonyms.sql:10-15`

**Issue:** `int_synonyms` is a flat union; downstream models do a single LEFT JOIN hop (`syn.synonym = canonical_name`). If an auto-remap produces `A -> B` while `occurrence_synonyms` already contains `B -> C`, occurrences of `A` resolve only to `B`, not the ultimately-accepted `C`. This is a pre-existing single-hop assumption, not introduced by Phase 127, but Phase 127 makes it more likely to occur (auto-generated successors may themselves be curated synonyms). Worth documenting.

**Fix:** Out of scope for v1 if single-hop is the accepted invariant; otherwise add a note in `int_synonyms.sql` and consider a recursive resolution CTE in a follow-up phase.

---

_Reviewed: 2026-05-31T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
