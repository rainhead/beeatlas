# Phase 168: Temporal Lifecycle Dates - Research

**Researched:** 2026-06-25
**Domain:** dbt/DuckDB data-layer mart change (single additive VARCHAR column)
**Confidence:** HIGH

## Summary

This is a tightly-scoped, additive data-layer change: add one `id_date VARCHAR`
column to the `occurrences` mart, derived only for ARM 1 (ecdysis) from the dirty
raw `date_identified` field, NULL for the other four arms. The dbt contract bumps
**37→38** and ships **data-before-code** to S3, sequenced after Phase 167's own
37-column data-before-code nightly lands.

Every mechanical fact the planner needs has been verified against the live code:
the edit sites, the union typecheck requirement, the `date_identified` source path,
the cleanest DuckDB parse expression, the `sqlite_export.py` carry-through, the
release-gate operator step, and the TEMP-02 de-dup already existing. There are no
landmines beyond the well-documented one-time integration-gate deadlock (already
handled by the `SKIP_INTEGRATION_GATE=1` nightly).

**Primary recommendation:** Parse `date_identified` **inline in `int_combined.sql`
ARM 1** with `regexp_full_match` (verified behavior below); emit `NULL::VARCHAR AS
id_date` in ARMs 2–5; project through `occurrences.sql`; add the column + one
warn-severity dbt test to `schema.yml` (37→38). `sqlite_export.py` needs **no
change**. Ship data-before-code per D-11/D-12.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A volunteer's specimen history is exactly two dated events: Collected and Identified. No "posted", no "catalogued".
- **D-02:** Posting is not an event — `posted_date`/`created_at` is dropped entirely (column + concept). Supersedes ROADMAP criterion 1 / TEMP-01. **Do not re-add the column.**
- **D-03:** Cataloguing is not a dated event (no trustworthy Ecdysis cataloguing date). "In iNat vs. in Ecdysis" is a Phase 170 status/provenance facet.
- **D-04:** Reuse the existing `date VARCHAR` column as the collection date. Do **not** add a `collection_date` column.
- **D-05:** Add exactly one column: `id_date VARCHAR`. Contract 37→38.
- **D-06:** `id_date` is `VARCHAR` with partials preserved. Keep year-only `'2025'`; keep full `YYYY-MM-DD`; map blank `''`, `'s.d.'`, and garbage (e.g. `'female'`) → `NULL`.
- **D-07:** ARM 1 ecdysis → parsed `date_identified` (per D-06 cleaning).
- **D-08:** ARM 3 waba_specimen → `NULL`. Identification means the formal Ecdysis determination only. **Do NOT chase iNat per-identification timestamps or extend the iNat pull.**
- **D-09:** ARM 2 waba_sample, ARM 4 inat_obs, ARM 5 checklist → `NULL`. Criterion 4's "no cross-ARM NULL gaps" binds only the specimen arms; these NULLs are correct.
- **D-10:** No special transition plumbing for TEMP-02 (the de-dup already exists in ARM 3's WHERE).
- **D-11:** Data-before-code release: update `schema.yml` → one-time `SKIP_INTEGRATION_GATE=1` nightly so the column lands in S3 → only then ship any TS that reads it.
- **D-12:** Sequencing dependency: Phase 167's own data-before-code nightly (its Task 3) must land `collector_inat_login` (37) in S3 **before** this 37→38 bump ships. Do not stack two unreleased contract bumps.
- **D-13:** Verification via dbt contract + dbt data tests at `bash data/dbt/run.sh build`, not a Python assertion.

### Claude's Discretion
- Exact `date_identified` parse implementation (regex / `try_cast` / `CASE`) and where it lives (inline in `int_combined` ARM 1 vs. a helper in `int_ecdysis_base`).
- Whether `sqlite_export.py` needs an explicit change or carries `id_date` through automatically.
- Exact dbt-test layout/severity for D-13.

### Deferred Ideas (OUT OF SCOPE)
- iNat community-ID identification dates for not-yet-catalogued specimens (rejected, D-08).
- Cataloguing as a dated milestone (no trustworthy source date, D-03).
- `posted_date` / submission timeline (dropped, D-02).
- Provenance/status facet (in-iNat vs. in-Ecdysis) — Phase 170/171.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEMP-01 | Surface intrinsic lifecycle dates into the mart for a per-record timeline without snapshot-diffing. **Reframed by D-01/D-02/D-05:** collection served by the existing `date` column; only `id_date` is added; `posted_date`/`created_at` dropped. | `date` column already exists for all arms (int_combined.sql:27,86,136,222,278); `id_date` derived inline in ARM 1 from `date_identified`. Parse policy in §"date_identified parse" satisfies criterion 3 (partials handled, not dropped). |
| TEMP-02 | A `waba_specimen → ecdysis` transition reads as one specimen, not delete+create. **Reframed/dissolved by D-10.** | De-dup already exists: ARM 3 WHERE excludes catalogued specimens via `int_matched_waba_ids` (int_combined.sql:202) and the inat_obs overlap (line 205). A specimen is in exactly one arm at a time by construction. No plumbing needed. See §"TEMP-02 confirmation". |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `id_date` derivation (parse `date_identified`) | Database / dbt intermediate (`int_combined` ARM 1) | — | Same tier that already derives `date`, `collector_inat_login`; union must typecheck so all arms project it |
| Contract enforcement | Database / dbt (`schema.yml` + `run.sh build`) | — | dbt contract is the project's sole schema gate (CLAUDE.md) |
| SQLite carry-through | Data export (`sqlite_export.py`) | — | `SELECT *` from parquet — automatic, no edit |
| Release sequencing | Operator / nightly (`nightly.sh`) | — | `SKIP_INTEGRATION_GATE=1` one-time, manual on maderas |

This phase touches **only** the database/data-export tier. No frontend/TypeScript work (Phase 171 consumes `id_date`).

## Standard Stack

No new packages. The phase uses the existing pinned toolchain:

| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| dbt-core | 1.10.1 | model build + contract enforcement | [CITED: data/dbt/run.sh:40] |
| dbt-duckdb | 1.10.1 | DuckDB adapter | [CITED: data/dbt/run.sh:40] |
| DuckDB | (bundled by dbt-duckdb) | `regexp_full_match` SQL engine | [VERIFIED: ran `regexp_full_match` locally, this session] |

**Installation:** none — invoked via `uvx --python 3.13 --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1` (the `data/dbt/run.sh` wrapper).

## Package Legitimacy Audit

Not applicable — this phase installs **no** external packages. All tooling is the
pre-pinned dbt/DuckDB stack already in use across Phases 160/167.

## Architecture Patterns

### Edit Sites (verified, exact)

Four files, in build-dependency order. Follow Phase 167's template exactly (it added
`collector_inat_login` 36→37 via the identical path).

1. **`data/dbt/models/intermediate/int_combined.sql`** — the 5-way `UNION ALL`.
   Add `id_date` as the **last projected column in every arm** (after
   `collector_inat_login`), so the union typechecks:
   - **ARM 1 (ecdysis)**, after line 59 (`... AS collector_inat_login`): add the
     derived `id_date` expression (see §"date_identified parse"). `date_identified`
     is reachable as `e.date_identified` **only if `int_ecdysis_base` projects it**
     — see the carry-through note below. Simplest: parse it inline referencing the
     raw column through the base model.
   - **ARM 2 (waba_sample)**, after line 118: `NULL::VARCHAR AS id_date`
   - **ARM 3 (waba_specimen)**, after line 174: `NULL::VARCHAR AS id_date` (D-08)
   - **ARM 4 (inat_obs)**, after line 254: `NULL::VARCHAR AS id_date`
   - **ARM 5 (checklist)**, after line 316: `NULL::VARCHAR AS id_date`

2. **`data/dbt/models/intermediate/int_ecdysis_base.sql`** — currently projects 20
   columns (header line 1) and does **NOT** carry `date_identified`. The raw column
   exists on the source (`ecdysis_data.occurrences.date_identified`, confirmed by the
   freeform source def + test fixtures) and flows untouched through
   `stg_ecdysis__occurrences` (`SELECT *`, no column list). **Add `o.date_identified`
   to this model's SELECT** (e.g. after `o.canonical_name`, line 26) so ARM 1 can
   reference `e.date_identified`. Alternatively, do the whole parse here and project
   a clean `ecdysis_id_date` — planner's call (D-discretion). Inline-in-ARM-1 is
   marginally simpler and keeps the parse next to the other ARM-1 date logic.

3. **`data/dbt/models/marts/occurrences.sql`** — project `id_date` through the final
   SELECT. Add `j.id_date` after `j.collector_inat_login` (line 92). (The mart's
   intermediate CTEs are `SELECT *` from `int_combined` via `joined`, so the column
   propagates automatically up to the final explicit SELECT, which is the only place
   it must be named.)

4. **`data/dbt/models/marts/schema.yml`** — add the column to the `occurrences`
   contract (currently 37 columns; this makes 38). Add after the
   `collector_inat_login` block (ends line 110):
   ```yaml
         - name: id_date
           data_type: varchar
           data_tests:
             - <D-13 test, see below>
   ```

### Column-ordering convention
The contract is **positional-order-enforced** (`contract.enforced: true`). The
`schema.yml` column order must match the `occurrences.sql` final-SELECT order. Both
Phase 160 and Phase 167 appended new columns at the **end** of the final SELECT and
the **end** of the contract block. Follow that: `id_date` is the last column in both
`occurrences.sql` (after `collector_inat_login`) and `schema.yml`.

### Anti-Patterns to Avoid
- **DATE-typing `id_date`:** would NULL out ~26k year-only IDs (`'2025'` etc.) and
  erase the signal. D-06 explicitly mandates VARCHAR. Don't "improve" it to DATE.
- **Adding `posted_date`/`created_at`:** explicitly dropped (D-02). Don't re-add.
- **Touching the iNat pull for ARM 3 ID dates:** explicitly out of scope (D-08).
- **Stacking two unreleased contract bumps:** the 167 (37) data MUST be live in S3
  before this 38 bump ships (D-12).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation of the new column | A Python assertion in `run.py`/`sqlite_export.py` | dbt contract (`schema.yml` + `run.sh build`) | The contract is already the project's enforcement surface (CLAUDE.md, D-13); a second validator drifts |
| SQLite column carry-through | Explicit column list in `sqlite_export.py` | The existing `SELECT * FROM read_parquet(...)` | `id_date` flows automatically — see §"sqlite_export carry-through" |
| Date parsing | A custom CASE-ladder over substring lengths | `regexp_full_match` for the two keep-patterns | One regex per pattern is clearer and DuckDB-native |

## date_identified parse (the only field this phase derives)

### Live raw distribution (from CONTEXT code_context)
`ecdysis_data.occurrences.date_identified` is dirty: blank `''` (19,356), `'2025'`
(17,274), `'2026'` (5,223), `'2024'` (3,959), `'s.d.'` (113), `'female'` (56), full
`YYYY-MM-DD` rare (`'2026-03-05'` ×12, `'2026-03-04'` ×5). [CITED: 168-CONTEXT.md:181-185]
Re-run the frequency query at plan time if a fresher distribution is wanted (CONTEXT
§Specific Ideas).

### Recommended expression (VERIFIED behavior)
DuckDB `regexp_full_match` was confirmed this session to match exactly the two
keep-patterns and reject the garbage:

```
regexp_full_match('2025',       '^[0-9]{4}$')                    -> true
regexp_full_match('2025-03-04', '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')  -> true
regexp_full_match('female',     '^[0-9]{4}$')                    -> false
regexp_full_match('s.d.',       '^[0-9]{4}$')                    -> false
```
[VERIFIED: ran `duckdb.connect().execute(...)` locally — returned `(True, True, False, False)`]

Concrete recommended `id_date` derivation for ARM 1 (place after
`collector_inat_login`):

```sql
    CASE
        WHEN regexp_full_match(trim(e.date_identified), '^[0-9]{4}$')
          OR regexp_full_match(trim(e.date_identified), '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        THEN trim(e.date_identified)
        ELSE NULL
    END::VARCHAR                                                AS id_date
```

Notes:
- `trim()` guards stray whitespace; blank `''` and `'s.d.'`/`'female'` fall to the
  `ELSE NULL` branch.
- `e.date_identified` requires step 2 above (project `date_identified` from
  `int_ecdysis_base`). If the planner instead does the parse inside
  `int_ecdysis_base`, project a clean `ecdysis_id_date` and reference that in ARM 1.
- This keeps year-only **and** full dates verbatim (satisfies D-06 + criterion 3).
- Optional hardening (not required): also accept `YYYY-MM` (`'^[0-9]{4}-[0-9]{2}$'`)
  if any appear in a fresher distribution — currently none observed, so the two
  patterns above suffice. [ASSUMED: no other partial formats present — verify with a
  fresh `SELECT DISTINCT` if desired]

## Runtime State Inventory

This is a **purely additive dbt column** — no rename, no data migration, no stored
runtime state to reconcile.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `id_date` is a new column derived at build time from the raw `date_identified` already ingested into the DuckDB `ecdysis_data.occurrences` source. No existing record carries the new name as a key. | None |
| Live service config | None — no external service references `id_date`. | None |
| OS-registered state | None — nightly cron is unchanged; only a one-time manual `SKIP_INTEGRATION_GATE=1` invocation is added (operator step, D-11). | One-time operator run (already a documented pattern) |
| Secrets/env vars | None. | None |
| Build artifacts | `occurrences.parquet` and `occurrences.db` gain the column on the next build — fully regenerated each run, no stale artifact. | None (auto-regenerated) |

## Common Pitfalls

### Pitfall 1: Union typecheck failure
**What goes wrong:** Adding `id_date` to ARM 1 but forgetting one of ARMs 2–5 →
`UNION ALL` types/columns mismatch, build error.
**How to avoid:** Add `NULL::VARCHAR AS id_date` to **all four** non-ecdysis arms.
The explicit `::VARCHAR` cast matters — a bare `NULL` can infer as a different type
and clash with ARM 1's VARCHAR. (Mirrors Phase 167's `collector_inat_login` pattern,
though that one used a COALESCE in every arm rather than a bare NULL.)
**Warning sign:** `dbt build` fails at `int_combined` compilation, before the mart.

### Pitfall 2: Contract column-order mismatch
**What goes wrong:** `schema.yml` column order or `data_type` doesn't match the
mart's actual output → contract enforcement error.
**How to avoid:** Append `id_date` last in **both** `occurrences.sql` final SELECT
and the `schema.yml` contract; `data_type: varchar`.
**Warning sign:** `dbt build` fails with a contract column-mismatch message naming
`id_date`.

### Pitfall 3: The one-time integration-gate deadlock (expected, not a defect)
**What goes wrong:** The first nightly after the 37→38 change makes `test_dbt_diff`
fail — live S3 `occurrences.parquet` has 37 cols, fresh sandbox has 38. The gate
also blocks the publish that would refresh the baseline → deadlock.
**How to avoid:** This is the documented `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh`
one-time bypass (nightly.sh:236-247, 251-253; memory
`project_occurrences_contract_release_sequence`). The **next** normal run compares
new-vs-new and passes unaided.
**Warning sign:** `INTEGRATION GATE FAILED` on the first post-change nightly — expected.

### Pitfall 4: Stacking two unreleased contract bumps (D-12)
**What goes wrong:** Shipping the 38-col change before Phase 167's 37-col data is
live in S3 → the baseline diff is comparing against 36-col data and the bypass logic
gets muddled across two unreleased bumps.
**How to avoid:** Confirm Phase 167 Task 3's `SKIP_INTEGRATION_GATE` nightly has
completed and 37-col `occurrences.parquet` is live in S3 **before** running this
phase's bypass nightly. Per STATE.md line 76, Phase 167 is "Awaiting operator
`SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` on maderas" — this is the gating
predecessor.
**Warning sign:** S3 `occurrences.parquet` still has 36 columns when you go to ship 38.

## Release Sequencing (operator steps)

Documented in: memory `project_occurrences_contract_release_sequence`,
`data/nightly.sh:236-259`, CONTEXT D-11/D-12. The concrete operator sequence:

1. **(Predecessor gate)** Confirm Phase 167's 37-col data is live in S3 — run/confirm
   Phase 167 Task 3's `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` on maderas. (D-12)
2. Land this phase's code change (the 4 file edits, contract 37→38) on `main` after
   a green local `bash data/dbt/run.sh build` + `cd data && uv run pytest`.
3. **One-time bypass nightly on maderas:** `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh`
   — publishes the 38-col `occurrences.parquet`/`occurrences.db` to S3, bypassing the
   one-time deadlock. (D-11, nightly.sh:243)
4. Subsequent normal nightlies compare new-vs-new and the gate passes unaided.
5. **Only after** the column is live in S3 may any TS that reads `id_date` ship
   (Phase 171). This phase ships **no** TS (data-layer only).

## sqlite_export carry-through (verified — NO change needed)

`sqlite_export.generate_sqlite` creates `out.occurrences` via
`CREATE TABLE out.occurrences AS SELECT * FROM read_parquet('{src_parquet}')`
(`data/sqlite_export.py:436`). **`id_date` flows in automatically.**

- It must **NOT** be added to `_GEO_COLS` (sqlite_export.py:477-480) — that list is
  the pre-serialized geo blob for the map (`lat, lon, ecdysis_id, observation_id,
  specimen_observation_id, year, source, checklist_id`), positionally coupled to
  `features.ts`. `id_date` is a detail-card field, not a map field; leave the geo
  blob untouched.
- No `schema.yml`-side issue for `occurrences.db`: the SQLite schema is derived
  entirely from the parquet (docstring line 413), so the new column appears with no
  DDL edit.

**Conclusion (resolves the D-discretion item):** `sqlite_export.py` needs **no edit**.

## TEMP-02 confirmation (verified — D-10 holds)

The "phantom delete+create" risk is dissolved because the de-dup keeping a specimen
in exactly one arm already exists. ARM 3 (`waba_specimen`) excludes any obs that has
been catalogued in Ecdysis or appears in the expert feed:

- **`int_combined.sql:202`** — `AND sob.waba_obs_id NOT IN (SELECT waba_obs_id FROM {{ ref('int_matched_waba_ids') }})`
  — once a WABA specimen is matched to its Ecdysis catalog entry, it leaves ARM 3 and
  appears in ARM 1 instead.
- **`int_combined.sql:205`** — `AND sob.waba_obs_id NOT IN (SELECT obs_id FROM {{ source('inat_obs_data', 'observations') }})`
  — and never collides with ARM 4.

So a specimen transitioning waba_specimen → ecdysis keeps its real-world collection
`date` (ARM 1: `COALESCE(e.ecdysis_date, s.sample_date)`, line 27) and **gains** an
`id_date` (its formal Ecdysis determination) — continuous by construction, no
`posted_date` carry-over. **No transition plumbing in this phase.** [VERIFIED:
int_combined.sql:202,205]

## dbt test surface (D-13 / TEMP-01 criteria 3–4)

Follow the Phase 167 precedent: a `not_null`-style data test scoped with `where:`,
and (per STATE.md line 75) **multiple severity-scoped tests on one column require
explicit `name:` keys** to avoid a dbt 1.10.1 compilation error.

**Recommended test (warn severity):** assert that ecdysis rows whose raw
`date_identified` *should* parse did not silently drop to NULL. Because the test
runs against the **mart** (which no longer carries raw `date_identified`), the
cleanest formulation is a **singular test** (a `tests/*.sql` file) that joins back to
the raw source, OR — simpler and self-contained — a generic check on the mart that a
parseable-looking `id_date` is non-null where expected.

Two viable patterns (planner's call):

1. **Singular test** `data/dbt/tests/assert_id_date_parse_complete.sql` (warn):
   ```sql
   -- Fails (warns) if an ecdysis row with a parseable raw date_identified
   -- has a NULL id_date in the mart — i.e. the parse silently dropped a real date.
   {{ config(severity='warn') }}
   SELECT o.id AS ecdysis_id, o.date_identified
   FROM {{ source('ecdysis_data','occurrences') }} o
   JOIN {{ ref('occurrences') }} m ON m.ecdysis_id = o.id
   WHERE m.source = 'ecdysis'
     AND (
           regexp_full_match(trim(o.date_identified), '^[0-9]{4}$')
        OR regexp_full_match(trim(o.date_identified), '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
         )
     AND m.id_date IS NULL
   ```
   This directly asserts "no parseable date silently dropped" — the exact D-13 /
   criterion-3 guarantee. (Note: `ecdysis_id` is the mart join key to the source `id`;
   verify the source PK name at plan time — `int_ecdysis_base` maps `o.id → ecdysis_id`.)

2. **Generic `not_null` with `where`** on `id_date` scoped to a parseable-pattern
   predicate — harder to express cleanly because the mart lacks the raw column; the
   singular test (option 1) is preferred for precision.

**Severity:** `warn` (matches the predecessor's D-06 drift pattern). This test
**cannot false-trip on existing data** if the parse expression and the test predicate
use the **same** two regexes — they are tautologically consistent, so a warn only
fires on a genuine regression (e.g. someone weakens the parse). Hard-`error` is also
defensible since by construction it should never fire; warn is the conservative,
nightly-non-blocking choice consistent with Phase 167 D-06. Planner picks final
severity.

**Naming:** if any second `id_date` test is added later, give each an explicit
`name:` (STATE.md line 75 lesson).

## State of the Art

No moving target here — dbt 1.10.1 / dbt-duckdb 1.10.1 are pinned in
`data/dbt/run.sh`. `regexp_full_match` is a stable DuckDB built-in. The mart-column
+ data-before-code pattern is established across Phases 160 and 167.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No partial date formats other than bare `YYYY` and full `YYYY-MM-DD` appear in `date_identified` (e.g. no `YYYY-MM`). | date_identified parse | A `YYYY-MM` value would be dropped to NULL. Low risk (none observed); re-run `SELECT DISTINCT date_identified` at plan time to confirm. |
| A2 | The mart-to-source join key for the singular test is `mart.ecdysis_id = source.id` (per `int_ecdysis_base` mapping `o.id → ecdysis_id`). | dbt test surface | Test fails to compile / mis-joins. Verify exact source PK name at plan time. |

## Open Questions

1. **Parse home: inline ARM 1 vs. `int_ecdysis_base` helper?**
   - What we know: Both work; D explicitly leaves this to the planner.
   - Recommendation: Inline in ARM 1 (keeps the date logic together; only requires
     projecting raw `date_identified` from the base model). Either is acceptable.

2. **Test severity warn vs. error?**
   - What we know: By construction (shared regex) the test never fires on good data.
   - Recommendation: `warn` (matches Phase 167 D-06, nightly-non-blocking). Planner decides.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dbt-core / dbt-duckdb | the entire build | ✓ (via `uvx` in `data/dbt/run.sh`) | 1.10.1 / 1.10.1 | — |
| DuckDB `regexp_full_match` | `id_date` parse | ✓ | bundled | — |
| `uv` / `uvx` | dbt + pytest invocation | ✓ (used by nightly + run.sh) | — | — |
| maderas + AWS profile | the one-time `SKIP_INTEGRATION_GATE` nightly publish | operator-side (not verifiable here) | — | none — operator step |

No blocking gaps. The only non-local dependency is the operator-run nightly on
maderas (D-11), which is an established manual step, not a tooling gap.

## Validation Architecture

> `workflow.nyquist_validation` not checked as false; section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | dbt data tests (contract + `data_tests:`) + pytest (`@integration` tier) |
| Config file | `data/dbt/models/marts/schema.yml` (contract); `data/dbt/run.sh` (wrapper); `data/tests/` (pytest) |
| Quick run command | `bash data/dbt/run.sh build --select occurrences int_combined int_ecdysis_base` |
| Full suite command | `bash data/dbt/run.sh build` then `cd data && uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEMP-01 | `id_date` present, VARCHAR, partials kept / garbage NULLed | contract + singular test | `bash data/dbt/run.sh build` | ❌ Wave 0 (new test SQL) |
| TEMP-01 | parseable raw date never silently dropped to NULL | singular dbt test (warn) | `bash data/dbt/run.sh test --select assert_id_date_parse_complete` | ❌ Wave 0 |
| TEMP-02 | one specimen, not delete+create (de-dup already enforced) | existing ARM 3 WHERE (no new test) | `bash data/dbt/run.sh build` (build succeeds) | ✅ existing (int_combined.sql:202,205) |

### Sampling Rate
- **Per task commit:** `bash data/dbt/run.sh build --select int_ecdysis_base int_combined occurrences`
- **Per wave merge:** `bash data/dbt/run.sh build` (full contract) + `cd data && uv run pytest`
- **Phase gate:** Full `dbt build` green (contract 38 enforced) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `data/dbt/tests/assert_id_date_parse_complete.sql` — covers TEMP-01 criterion 3 (parse completeness). New file.
- [ ] Contract column `id_date` in `schema.yml` — the contract IS the primary test surface.
- [ ] (Optional) a pytest `@integration` assertion is **not** needed — D-13 mandates dbt, not Python.

*Framework install: none — dbt/pytest already present.*

## Security Domain

Not applicable in the conventional sense — this is an internal data-layer column with
no auth, sessions, network input, or user-supplied data. The single relevant control:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (data-quality only) | The `regexp_full_match` parse is itself the validation: untrusted/garbage `date_identified` values (`'female'`, `'s.d.'`) are mapped to NULL rather than propagated. No injection surface (static SQL, no string interpolation of user input). |

No threat patterns (no runtime, static hosting, no PII beyond public iNat logins
already shipped). [CITED: CLAUDE.md §Constraints — static hosting only]

## Sources

### Primary (HIGH confidence)
- `data/dbt/models/intermediate/int_combined.sql` — 5-arm UNION ALL; exact line numbers for each arm's projection and ARM 3 de-dup (lines 27, 59, 86, 118, 136, 174, 202, 205, 222, 254, 278, 316).
- `data/dbt/models/intermediate/int_ecdysis_base.sql` — confirms `date_identified` NOT currently projected (20-col header); `event_date AS ecdysis_date` at line 11.
- `data/dbt/models/staging/stg_ecdysis__occurrences.sql` — `SELECT *` (line 9), so `date_identified` flows through.
- `data/dbt/models/sources.yml` — `ecdysis_data.occurrences` defined with no column list (freeform), so all raw columns available (lines 3-8).
- `data/dbt/models/marts/occurrences.sql` — final SELECT (lines 74-92); append point line 92.
- `data/dbt/models/marts/schema.yml` — current 37-col contract; `collector_inat_login` block lines 92-110; append point after 110.
- `data/sqlite_export.py` — `SELECT *` carry-through (line 436); `_GEO_COLS` (lines 477-480, do not touch).
- `data/nightly.sh` — integration-gate deadlock + bypass (lines 236-259).
- `data/dbt/run.sh` — pinned dbt 1.10.1 / dbt-duckdb 1.10.1 (line 40).
- DuckDB `regexp_full_match` behavior — ran locally this session, returned `(True, True, False, False)` for the four test inputs.
- `.planning/STATE.md` — Phase 167 gating (line 76), dbt multi-test naming lesson (line 75).
- `.planning/phases/167-collector-identity-column/167-CONTEXT.md` — the template pattern (D-02 union typecheck, D-07/D-08 enforcement + release).

### Secondary (MEDIUM confidence)
- 168-CONTEXT.md live `date_identified` distribution (lines 181-185) — operator-reported counts, not re-queried this session.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Edit sites & union typecheck: HIGH — read every file, exact line numbers verified.
- date_identified parse: HIGH — `regexp_full_match` behavior verified locally; distribution cited from CONTEXT (re-query optional).
- sqlite_export carry-through: HIGH — `SELECT *` confirmed at line 436.
- Release sequencing: HIGH — nightly.sh + memory + Phase 167 precedent all aligned.
- TEMP-02 dissolution: HIGH — exact de-dup lines (202, 205) verified.
- dbt test surface: MEDIUM — pattern is clear; exact source PK join key (A2) to confirm at plan time.

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (stable — pinned toolchain, no external moving parts)

## RESEARCH COMPLETE
