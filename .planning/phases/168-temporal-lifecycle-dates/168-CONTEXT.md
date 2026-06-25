# Phase 168: Temporal Lifecycle Dates - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface the **identification date** into the `occurrences` mart so a volunteer's
specimen history can be built as a two-event timeline — **Collected** and
**Identified** — without snapshot-diffing. Add a single `id_date VARCHAR` column,
bump the dbt contract **37→38**, and ship it **data-before-code** to S3 (a second
isolated contract bump, sequenced after Phase 167's own data-before-code release).

**Data-layer only** — no frontend/TypeScript work. The feed/event-stream UI is
Phase 171; provenance/status facets are Phase 170.

### Scope reframe (operator decisions — supersede the roadmap wording)
The discussion narrowed this phase substantially from the literal roadmap text.
**Downstream agents follow these decisions over ROADMAP criteria 1–2 / TEMP-01–02
where they conflict:**

- The history surface is **volunteers' work = WABA specimens only** — the
  Ecdysis-catalogued WABA specimens (ARM 1) and the not-yet-catalogued
  `waba_specimen` iNat-photo bees (ARM 3). Samples (`waba_sample`), expert iNat
  observations (`inat_obs`), and museum `checklist` records are **not in any
  feed** ("not much to say about samples").
- The volunteer cares about exactly **two dated events: Collected and
  Identified.** Collection is already carried by the existing `date` column;
  identification is the new `id_date`.
- **`posted_date` (iNat `created_at`) is dropped** — both as an event and as a
  column. A volunteer does not care what day they did data entry. This overrides
  ROADMAP criterion 1 / TEMP-01's naming of `posted_date`/`created_at`. **Do not
  re-add the column.**

</domain>

<decisions>
## Implementation Decisions

### Events surfaced (the timeline model)
- **D-01:** A volunteer's specimen history is exactly **two dated events:
  Collected and Identified.** No "posted", no "catalogued" as dated events.
- **D-02:** **Posting is not an event** — `posted_date`/`created_at` is dropped
  entirely (column + concept). Supersedes ROADMAP criterion 1 and TEMP-01.
- **D-03:** **Cataloguing is not a dated event** — Ecdysis has no trustworthy
  cataloguing date (only `modified`, which bumps on any edit). "In iNat vs. in
  Ecdysis" is a **status/provenance facet (Phase 170)**, not a timestamp.

### Columns & contract
- **D-04:** **Reuse the existing `date VARCHAR` column as the collection date.**
  It already holds the collection/event date for every specimen arm
  (`COALESCE(e.ecdysis_date, s.sample_date)` for ARM 1; `observed_on` for ARM 3).
  Do **not** add a redundant `collection_date` column.
- **D-05:** **Add exactly one column: `id_date VARCHAR`.** Contract **37→38**.
  Naming caveat to record: TEMP-01 says "collection_date" but the mart serves
  collection via the pre-existing `date` column; downstream feed code reads
  `date` for "Collected" and `id_date` for "Identified".
- **D-06:** **`id_date` is `VARCHAR` with partials preserved**, matching the
  existing `date` convention. Rationale (live data): ecdysis `date_identified` is
  *mostly year-only* (`'2025'`/`'2026'`/`'2024'` ≈ 26k rows) with full
  `YYYY-MM-DD` being rare (~17 rows). A strict `DATE` column would NULL out the
  year-only values and erase the ID signal for almost every identified specimen.
  Keep `'2025'` (feed renders "identified 2025"); map blank `''`, `'s.d.'`, and
  garbage (e.g. `'female'`) → `NULL`. Satisfies ROADMAP criterion 3
  (partial/missing dates handled explicitly, not dropped).

### Per-arm `id_date` source (the only field this phase derives)
- **D-07:** ARM 1 `ecdysis` → parsed `date_identified` (per D-06 cleaning).
- **D-08:** ARM 3 `waba_specimen` → **`NULL`**. Identification means the **formal
  Ecdysis determination only**; a not-yet-catalogued specimen reads as "Collected,
  awaiting ID" even though it carries a tentative iNat community species (which
  still surfaces separately via `canonical_name`). **No new date source needed —
  do NOT chase iNat per-identification timestamps or extend the iNat pull.**
- **D-09:** ARM 2 `waba_sample`, ARM 4 `inat_obs`, ARM 5 `checklist` → `NULL`
  (non-specimen / not volunteer work; excluded from feeds, nothing to source).
  ROADMAP criterion 4's "no cross-ARM NULL gaps" binds **only the specimen arms**;
  these NULLs are correct, not gaps.

### waba_specimen → ecdysis transition (TEMP-02 — reframed, largely dissolved)
- **D-10:** The "phantom delete+create" risk **only existed if system-presence
  (iNat → Ecdysis) were treated as dated events.** Since Collected and Identified
  are real-world facts that persist across cataloguing, a catalogued specimen
  simply keeps its collection `date` and gains an `id_date` — continuous by
  construction. No `posted_date` carry-over is needed (D-02). The de-dup that
  keeps a specimen in exactly one arm at a time already exists (ARM 3's
  `WHERE sob.waba_obs_id NOT IN (SELECT waba_obs_id FROM int_matched_waba_ids)`).
  **No special transition plumbing in this phase.**

### Release sequencing (carried from Phase 167)
- **D-11:** Data-before-code per `project_occurrences_contract_release_sequence`:
  update `schema.yml` (add `id_date`) → nightly with `SKIP_INTEGRATION_GATE=1`
  (one-time) so the column lands in S3 → only then ship any TS that reads it.
- **D-12:** **Sequencing dependency:** Phase 167's own data-before-code nightly
  (its Task 3, "awaits operator — SKIP_INTEGRATION_GATE nightly on maderas" per
  STATE.md) must complete and land `collector_inat_login` (37) in S3 **before**
  this 37→38 bump ships. Do not stack two unreleased contract bumps.

### Enforcement surface
- **D-13:** Verification is via the **dbt contract + dbt data tests** at
  `bash data/dbt/run.sh build` (per CLAUDE.md and Phase 167 D-07), not a Python
  assertion in `run.py`/`sqlite_export.py`. A reasonable test: ARM 1 ecdysis rows
  with a non-empty raw `date_identified` that *should* parse don't silently go
  NULL (planner's call on exact predicate/severity).

### Claude's Discretion
- Exact `date_identified` parse implementation (regex/`try_cast`/`CASE`) and
  where it lives (inline in `int_combined` ARM 1 vs. a small helper in
  `int_ecdysis_base`) — planner's call, provided D-06's keep-year-only /
  NULL-the-garbage policy holds.
- Whether `sqlite_export.py` needs an explicit change or carries `id_date`
  through automatically (it selects from the mart) — verify at plan time.
- Exact dbt-test layout/severity for D-13.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec & decisions
- `.planning/milestones/v6.0-ROADMAP.md` §"Phase 168" — goal + 4 success criteria.
  **Note:** criteria 1–2 and TEMP-01–02 are partially superseded by D-01/D-02/D-05
  above (posted_date dropped; collection served by existing `date`).
- `.planning/REQUIREMENTS.md` — TEMP-01 (line 24), TEMP-02 (line 25)
- `.planning/phases/167-collector-identity-column/167-CONTEXT.md` — the direct
  predecessor; same data-layer pattern, same release sequence, same enforcement
  surface. Read it for the established approach.

### Release sequence (MANDATORY — easy to get wrong)
- Memory `project_occurrences_contract_release_sequence` — data-before-code order
  + one-time `SKIP_INTEGRATION_GATE=1` nightly
- Memory `project_schema_validation` — dbt contract is the gate; steps for
  changing an occurrences column
- `CLAUDE.md` §"Known State" — dbt contract on `marts/occurrences` enforced at
  every `data/dbt/run.sh build`
- `.planning/STATE.md` §Current Position / §Decisions — Phase 167 Task 3
  (SKIP_INTEGRATION_GATE nightly) is the gating predecessor for D-12

### Data model (edit sites)
- `data/dbt/models/intermediate/int_combined.sql` — the 5-arm UNION ALL; add
  `id_date` to **every** arm's SELECT (union must typecheck). ARM 1 derives it
  from `date_identified`; ARMs 2–5 emit `NULL::VARCHAR` (D-07/D-08/D-09).
- `data/dbt/models/marts/occurrences.sql` — project `id_date` through the final SELECT
- `data/dbt/models/marts/schema.yml` — contract (add `id_date`; 37→38) + any D-13 test
- `data/dbt/models/intermediate/int_ecdysis_base.sql` — source of `ecdysis_date`
  (already projected as collection date); candidate home for a `date_identified`
  parse helper. Raw `ecdysis_data.occurrences.date_identified` is the dirty source.
- `data/sqlite_export.py` — verify `id_date` carries through to `occurrences.db`

### Domain vocabulary
- `CLAUDE.md` §"Domain Vocabulary" and `docs/domain-model.md` — Specimen vs Sample
  vs Observation; the five `int_combined` source arms

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The existing `date VARCHAR` column already IS the collection date for all arms —
  no work needed for "Collected" beyond reusing it (D-04).
- `int_combined.sql` ARM 1 already LEFT JOINs the linked specimen obs (`sob`) and
  the FULL OUTER JOIN to samples — the catalogued-specimen linkage exists; nothing
  to add for TEMP-02 (D-10).
- The dbt contract + `data/dbt/run.sh build` is the existing assertion surface
  (D-13) — reuse it, don't invent a validator.

### Established Patterns
- Phase 167 (collector_inat_login, 36→37) is the exact template: int model → mart
  SELECT → `schema.yml` contract bump → data-before-code release. Follow it.
- `int_combined` is a 5-way `UNION ALL`; **every arm must project `id_date`** for
  the union to typecheck (the four non-ecdysis arms emit `NULL::VARCHAR`).

### Integration Points
- `occurrences.parquet` (dbt external mart) and `occurrences.db` (via
  `sqlite_export.py`) both gain `id_date`.

### Live data shape (id_date source = ecdysis date_identified)
- Year-only dominates: `'2025'` (17,274), `'2026'` (5,223), `'2024'` (3,959).
- Blank `''` (19,356) and `'s.d.'` (113) → NULL.
- Garbage column-shift values exist (e.g. `'female'` 56) → NULL.
- Full `YYYY-MM-DD` is rare (`'2026-03-05'` 12, `'2026-03-04'` 5).
  → confirms D-06 (VARCHAR keep-partials; DATE would erase ~26k year-only IDs).

</code_context>

<specifics>
## Specific Ideas

- The two anchor events map cleanly to the milestone's core value ("tighten
  learning cycles"): **Collected → Identified** is exactly "I caught something →
  here's what it was." Everything else (posting, cataloguing) is administrative
  and intentionally excluded.
- Re-run the `date_identified` frequency query against `ecdysis_data.occurrences`
  at plan time if the parse policy needs a fresher distribution.

</specifics>

<deferred>
## Deferred Ideas

- **iNat community-ID identification dates** for not-yet-catalogued specimens —
  explicitly rejected for this phase (D-08). If WABA later wants "iNat IDed it on
  date X" as a distinct event, that's a future phase needing a source-pull
  extension.
- **Cataloguing as a dated milestone** — no trustworthy source date today (D-03);
  revisit only if Ecdysis exposes a reliable accession date.
- **`posted_date` / submission timeline** — dropped (D-02); trivial to re-add as a
  column later if a "you submitted N records" progress view ever wants it.
- **Provenance/status facet** (in-iNat vs. in-Ecdysis, awaiting-ID vs. identified)
  — Phase 170 (Source → Provenance Facets) and Phase 171 (feed rendering).

</deferred>

---

*Phase: 168-temporal-lifecycle-dates*
*Context gathered: 2026-06-25*
