# Phase 167: Collector Identity Column - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a single unified `collector_inat_login VARCHAR` column to the `occurrences`
mart, derived as `COALESCE(specimen_inat_login, host_inat_login, user_login)`.
Bump the dbt contract 36→37 columns and ship it **data-before-code** to S3 so
the column is live before any TypeScript reads it. This unblocks all
per-collector queries downstream (Phases 169, 171, 172).

**Data-layer only** — no frontend/TypeScript work in this phase. `OccurrenceRow`
and any TS consumers are explicitly out of scope until the column is live in S3.

</domain>

<decisions>
## Implementation Decisions

### COALESCE derivation (locked upstream + this discussion)
- **D-01:** Priority order is `COALESCE(specimen_inat_login, host_inat_login, user_login)` — locked by IDENT-01 / STATE.md.
- **D-02:** The derived column is computed in **`int_combined.sql`, all 5 arms** (operator choice 2026-06-24). This is also structurally required: `int_combined` is a 5-way `UNION ALL`, so every arm must project the column for the union to typecheck. Then project `collector_inat_login` through `occurrences.sql`'s final SELECT and add it to `schema.yml` (36→37).
- **D-03:** Per-arm source fields (verified against `int_combined.sql`):
  - ARM 1 `ecdysis` → `specimen_inat_login` (specimen photo obs) OR `host_inat_login` (matched sample plant obs); `user_login` NULL
  - ARM 2 `waba_sample` → `host_inat_login` only
  - ARM 3 `waba_specimen` → `specimen_inat_login` only
  - ARM 4 `inat_obs` → `user_login` only
  - ARM 5 `checklist` → all three NULL → `collector_inat_login` resolves NULL (expected; checklist excluded from identity per requirements scope)

### NO reconciliation seed — supersedes stale research
- **D-04:** **No `collector_identity.csv` seed is created.** The v6.0 research
  docs (`SUMMARY.md`, `PITFALLS.md` Pitfall 5, `ARCHITECTURE.md`) propose a
  `recordedBy`→iNat-handle reconciliation seed. The final roadmap (criterion 4)
  **reversed** this. The login is derived purely from the iNat-observation join;
  rows with no matched obs simply resolve NULL. **Downstream planner/executor
  MUST NOT reintroduce the seed** — the research docs are stale on this point.

### Build-time assertion (criterion 4) — data-informed split
Live duckdb counts (`dbt_sandbox.int_combined`, 2026-06-24) drove the scope decision:

| arm | rows | NULL collector_login | resolved |
|---|---|---|---|
| `waba_sample` | 28 | **0** | 100% |
| `waba_specimen` | 33 | **0** | 100% |
| `ecdysis` | 48,801 | **2,767** (5.7%) | 94.3% |
| `inat_obs` | 28,884 | 0 | 100% |
| `checklist` | 19,929 | 19,929 | 0% (excluded) |

The 2,767 NULL `ecdysis` rows **all carry a `recordedBy` but have no matched iNat
observation** (`specimen_observation_id` NULL AND sample `observation_id` NULL) —
real Ecdysis-catalogued specimens whose collector handle simply cannot be derived
from a join. Not a defect; precisely why D-04 holds.

- **D-05:** **Hard-error** dbt test (`severity: error`) asserting
  `collector_inat_login IS NOT NULL` for `source IN ('waba_sample','waba_specimen')`.
  These arms are tiny, controlled, and provably 100% resolved today — a NULL there
  is a genuine join regression and can never false-trip on existing data. Satisfies
  criterion 4's literal "specimen/sample" guarantee.
- **D-06:** **Warn + logged count** dbt test (`severity: warn`) on
  `source='ecdysis' AND collector_inat_login IS NULL` (operator severity choice).
  Surfaces the ~2,767-row unmatched population as drift each build without blocking
  nightly. Document the current baseline (~2,767) so reviewers can spot regressions.
- **D-07:** Mechanism is **dbt data tests** in the marts schema (not a Python
  assertion in `run.py`/`sqlite_export.py`) — the dbt contract build is already the
  enforcement surface per CLAUDE.md ("enforced at every `bash data/dbt/run.sh build`").

### Release sequencing (locked)
- **D-08:** Data-before-code per `project_occurrences_contract_release_sequence`:
  update `schema.yml` → nightly with `SKIP_INTEGRATION_GATE=1` (one-time) so the
  new column lands in S3 → only then ship any TypeScript that reads it. Never
  combine the contract bump and the consuming code in one nightly run (avoids the
  double-gate deadlock: nightly `test_dbt_diff` + deploy `validate-db`).

### Claude's Discretion
- Exact dbt test file layout (singular test SQL vs. a `dbt_utils`/`where`-scoped
  generic test) is the planner's call, provided D-05/D-06 severities and predicates
  hold.
- Whether the warn-test baseline count is hard-coded as an expected threshold or
  just logged — planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec & decisions
- `.planning/milestones/v6.0-ROADMAP.md` §"Phase 167" — goal + 4 success criteria (the contract for this phase)
- `.planning/REQUIREMENTS.md` — IDENT-01 (line 14)
- `.planning/STATE.md` §Decisions — `[v6.0 IDENT-01]`, `[v6.0 TEMP]`, `[v6.0 PAGE]`, and the Phase 165 ARM decisions (D-10/D-12/D-13)

### Release sequence (MANDATORY — easy to get wrong)
- Memory `project_occurrences_contract_release_sequence` — the data-before-code order + one-time `SKIP_INTEGRATION_GATE=1` nightly
- Memory `project_schema_validation` — dbt contract is the gate; steps for changing an occurrences column
- `CLAUDE.md` §"Known State" — dbt contract on `marts/occurrences` (36 cols as of Phase 160) enforced at every `data/dbt/run.sh build`

### Data model
- `data/dbt/models/intermediate/int_combined.sql` — the 5-arm UNION ALL; login source fields per arm (edit site for D-02)
- `data/dbt/models/marts/occurrences.sql` — final SELECT (project `collector_inat_login` here)
- `data/dbt/models/marts/schema.yml` — contract (add column + the two D-05/D-06 tests)
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` — source of `specimen_inat_login`
- `data/dbt/models/intermediate/int_samples_base.sql` — source of `host_inat_login`

### Stale — DO NOT FOLLOW on the seed question
- `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md` (Pitfall 5), `.planning/research/ARCHITECTURE.md` §(a) — these propose a `collector_identity.csv` seed that D-04 explicitly rejects. Useful for general context, **stale on the seed.**

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `int_combined.sql` already carries `specimen_inat_login`, `host_inat_login`, `user_login` in every arm — the COALESCE inputs all exist; this is purely additive.
- The dbt contract + `data/dbt/run.sh build` is the existing build-time assertion surface — D-05/D-06 plug into it rather than inventing a new validator.

### Established Patterns
- Phase 160 added/removed mart columns via the same path (int model → mart SELECT → `schema.yml` contract bump → data-before-code release). Follow it.
- `specimen_inat_login` is currently **dropped** from `occurrences.sql`'s SELECT (it exists in `int_combined` but isn't projected). The COALESCE consumes it inside `int_combined`, so the mart never needs to project the raw field — only the derived `collector_inat_login`.

### Integration Points
- `occurrences.parquet` (dbt external mart) and `occurrences.db` (via `sqlite_export.py`) both gain the column; verify `sqlite_export.py` carries it through (it selects from the parquet/mart).

</code_context>

<specifics>
## Specific Ideas

- Verified live counts are the source of truth for the assertion baseline: 2,767
  ecdysis NULLs today, 0 for both WABA-named arms. Re-run the per-arm count query
  against `dbt_sandbox.int_combined` if the baseline needs refreshing at plan time.

</specifics>

<deferred>
## Deferred Ideas

- **Per-collector page generation gating** (`collector_identity.csv` vs. distinct
  logins) — belongs to Phase 169, not here. Note: the PAGE decision in STATE.md
  gates pages on a curated set, NOT all distinct `host_inat_login`. The *page*
  gating is separate from this phase's *column* (which is intentionally NULL for
  checklist and populated for casual `inat_obs` observers).
- **Temporal lifecycle dates** (`collection_date`, `posted_date`, `id_date`) —
  Phase 168, its own separate contract bump and nightly run.

None of these are in scope for Phase 167.

</deferred>

---

*Phase: 167-collector-identity-column*
*Context gathered: 2026-06-24*
