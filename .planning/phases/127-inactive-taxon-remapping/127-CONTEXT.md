# Phase 127: Inactive Taxon Remapping - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the **inactive-taxon safety net** on top of the Phase 126 hard-fail resolution gate. When a `canonical_name` resolves to an iNat `taxon_id` that iNat has since **deactivated**, the pipeline must:

1. **Detect** it (ITR-01) — the resolver already enumerates inactive bridge IDs via LEFT JOIN to `taxa.csv.gz WHERE active = false`; this phase turns that enumeration into action.
2. **Auto-remap** (ITR-01) — for an inactive taxon with **exactly one** current successor (`current_synonymous_taxon_ids` from iNat taxon-detail), generate a name→name remapping entry.
3. **Triage-report + block** (ITR-02) — inactive names with no single resolvable successor are written to `data/inactive_unresolved.csv` and the build hard-fails until a human resolves them.
4. **Apply via the existing synonym JOIN** (ITR-03) — automated remappings flow through the same Phase 123 name-based mechanism (`int_combined`, `stg_checklist__species`) as `occurrence_synonyms.csv`.
5. **Manual precedence** (ITR-04) — manual `occurrence_synonyms.csv` entries win when the same source name appears in both.

**Reality check:** there are **0 inactive taxa** as of the current `taxa.csv.gz` (per Phase 124 `124-01-SUMMARY.md`). This phase is largely building a **dormant mechanism** that activates only when iNat deactivates a taxon currently in the bridge. Design accordingly — correctness and fail-loud behavior over throughput.

**Key tension:** the synonym JOIN keys on **names** (`synonym → accepted_name`), but `current_synonymous_taxon_ids` returns **taxon IDs**. Auto-remapping must translate successor ID → name and ensure that name resolves to an (active) `taxon_id` in the bridge so the marts' NOT NULL `taxon_id` contract (D-01, Phase 126) still holds.

</domain>

<decisions>
## Implementation Decisions

### Auto-remap storage & manual precedence (ITR-03 / ITR-04)
- **D-01:** Generated remappings are written to a **separate seed file `data/dbt/seeds/auto_synonyms.csv`** — physically distinct from the curated `occurrence_synonyms.csv`. It is **gitignored and regenerated nightly** (same lifecycle as `lineage_unresolved.csv`), and registered as a dbt seed.
- **D-02:** A new **`int_synonyms` model UNIONs the two seeds with manual precedence enforced declaratively in SQL**: `manual ∪ (auto ANTI JOIN manual ON synonym)`. The same-source-name collision (ITR-04) is resolved by the anti-join on the `synonym` column — manual wins.
- **D-03:** The **3 existing synonym-JOIN call sites are repointed** from `{{ ref('occurrence_synonyms') }}` to `{{ ref('int_synonyms') }}`: `int_combined.sql` (×2 — ecdysis arm `syn_e`, inat_obs arm `syn_io`) and `stg_checklist__species.sql` (×1 — `syn`). The JOIN shape (`syn.synonym = <arm>.canonical_name`, `COALESCE(syn.accepted_name, ...)`) is unchanged — only the ref source changes. This is the "same path" ITR-03 requires.
- **D-04 (planner must handle):** `auto_synonyms.csv` is gitignored, but `dbt seed` requires the file to **exist** at build time even in the 0-inactive case. The generation step must always write the file with at least a header row (`synonym,accepted_name,source`) so a fresh checkout / local dev run (`uv run python run.py`) does not break `dbt seed`. Schema must match `occurrence_synonyms.csv` (`synonym,accepted_name,source`) so the UNION is clean.

### Block vs. report on unresolvable inactives (ITR-02)
- **D-05:** Unresolvable inactives **hard-fail the nightly build** — chosen over report-and-continue, consistent with the project's contract-enforced-at-build culture and the Phase 126 resolution-gate precedent. A new **inactive-gate step** (mirroring `check_resolution_gate` / the `resolution-gate` STEP) reads `data/inactive_unresolved.csv` and exits non-zero with an actionable message naming the offenders when any blocking rows are present.
- **D-06:** `data/inactive_unresolved.csv` is the **actionable triage report** (gitignored, overwritten each run, like `lineage_unresolved.csv`). Suggested columns: `canonical_name, inactive_taxon_id, inat_name, reason, attempted_at` where `reason ∈ {no_successor, split, successor_not_in_taxa_csv}`.
- **D-07:** The **only sanctioned triage exit** is a human adding an `occurrence_synonyms.csv` entry mapping the inactive name to a current accepted name (their taxonomic judgment). There is **no acknowledged-exclusion / override set** (deliberately rejected the KNOWN_NON_BEES-style escape hatch). If an inactive taxon has genuinely no successor, that is a data problem to solve by hand (fix the source name upstream). Rationale: one triage path, no second config surface; rare events warrant human attention. **Wedge risk accepted** — cannot occur today (0 inactive taxa).

### Multi/zero-synonym policy & target-name source (ITR-01 / ITR-02)
- **D-08:** Count policy on `current_synonymous_taxon_ids`: **exactly 1 successor → auto-remap**; **0 successors (no replacement) OR many successors (taxon split — can't infer which one an occurrence belongs to) → write to `inactive_unresolved.csv`** (blocking per D-05). This is the literal reading of ITR-01 ("a known current synonym", singular). Did NOT take the "pick first active of many" variant — no silent guessing on a genuine split.
- **D-09:** The successor's canonical **name** (the `accepted_name` written to `auto_synonyms.csv`) is resolved by **local lookup of successor `taxon_id` → name in the already-downloaded `taxa.csv.gz`** — no extra per-successor API call beyond the one taxon-detail fetch. If the successor is **not yet present in `taxa.csv.gz`** (brand-new taxon / stale dump), treat as **unresolved → triage** (`reason = successor_not_in_taxa_csv`). Consistent with how inactivity is already detected (same file).
- **D-10:** Because the auto-remap step already holds the successor's **active** `taxon_id` (from the API/`taxa.csv.gz`), it should **upsert `lower(successor_name) → successor_taxon_id` directly into `inaturalist_data.canonical_to_taxon_id`** (the bridge) so the mart join produces a non-null `taxon_id` for the remapped accepted_name — no re-resolution round-trip required. (Alternative of relying on `_names_to_resolve` to pick up `auto_synonyms.accepted_name` is possible but adds an ordering dependency; direct upsert is cleaner. Planner's call on exact wiring.)

### Claude's Discretion (Area "Step placement & file lifecycle" — not selected for discussion)
- **D-11:** **Pipeline placement** — a new generation STEP (e.g. `inactive-remap`) plus the `inactive-gate` STEP (D-05), placed to mirror `resolve-taxon-ids` → `resolution-gate`. Detection/remapping needs `taxa.csv.gz`, which `taxa-download` currently fetches **after** `resolve-taxon-ids`/`resolution-gate` (run.py STEPS). **Ordering must be resolved** — see research dependency RD-01.
- **D-12:** File lifecycle — both `auto_synonyms.csv` and `inactive_unresolved.csv` are gitignored and overwritten each run (add to `data/.gitignore`; note `auto_synonyms.csv` lives under `data/dbt/seeds/` so the gitignore entry must target that path).
- **D-13:** Whether the generation logic extends `resolve_taxon_ids.py` (which already owns the inactive-enumeration block and the bridge connection) or lives in a new module is the planner's call — extending is the lower-friction option since the inactive-detection query and `_inat_get_with_retry`/`_INAT_PACE_SECONDS` pacing already live there.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

ROADMAP.md lists no canonical refs for Phase 127. The following are the load-bearing code/doc paths discovered during scout.

### Detection & resolution (already built — extend, don't rebuild)
- `data/resolve_taxon_ids.py` — owns the resolver, the Phase 124 inactive-enumeration block (lines ~258-273: bridge LEFT JOIN `read_csv(raw/taxa.csv.gz) WHERE active = false`), `check_resolution_gate()` (D-02 gate to mirror), `KNOWN_NON_BEES`, and the `_inat_get_with_retry` / `_INAT_PACE_SECONDS` paced-API helpers. The auto-remap + inactive-gate logic extends this (D-13).
- `data/run.py` — pipeline orchestrator. `STEPS` list (lines 84-107): `resolve-taxon-ids` → `resolution-gate` → `taxa-download` → `taxon-lineage-extended` → `dbt-build`. New `inactive-remap` + `inactive-gate` steps slot in here (RD-01 ordering).
- `data/raw/taxa.csv.gz` — gitignored nightly dump; has `taxon_id` + `name` + `active` (BOOLEAN, auto-inferred by `read_csv`) columns. Source of both inactivity detection and successor-name lookup (D-09).

### Synonym JOIN mechanism (Phase 123 — the application path, ITR-03)
- `data/dbt/seeds/occurrence_synonyms.csv` — curated manual seed (`synonym,accepted_name,source`); currently 1 row (`agapostemon texanus → agapostemon subtilior`). The manual-precedence anchor (ITR-04 / D-02).
- `data/dbt/seeds/schema.yml` — seed config; `auto_synonyms.csv` must be registered here.
- `data/dbt/models/intermediate/int_combined.sql` — 2 synonym JOINs to repoint (lines ~53-55 ecdysis arm, ~169-171 inat_obs arm). `COALESCE(syn.accepted_name, canonical_name)` is the synonymized name used for the `ctt` taxon_id join — auto-remap output flows through here.
- `data/dbt/models/staging/stg_checklist__species.sql` — 1 synonym JOIN to repoint (line ~31). Rewrites checklist `canonical_name`/`specific_epithet`/`scientificName` on synonym match.
- **NEW** `data/dbt/models/intermediate/int_synonyms.sql` — the union model to create (D-02).

### Bridge & marts (NOT NULL contract — D-01 of Phase 126 must keep holding)
- `data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` — passthrough over `inaturalist_data.canonical_to_taxon_id` bridge (PK `canonical_name`); the table the auto-remap step upserts into (D-10).
- `data/dbt/models/marts/schema.yml` — `taxon_id` is `NOT NULL` on both marts (37-col occurrences contract). Remapped accepted_names must resolve, or the build fails here too (belt-and-suspenders behind the inactive-gate).

### Prior-phase context (read for continuity)
- `.planning/phases/126-taxon-ids/126-CONTEXT.md` — D-01 (NOT NULL contract), D-02 (resolution-gate hard-fail precedent this phase mirrors), and the explicit call-out: "Phase 127 adds the auto-remap + triage-report safety net on top of this gate."
- `.planning/phases/124-pre-work-contract-cleanup/124-01-SUMMARY.md` — inactive-enumeration mechanism details; `active = false` is BOOLEAN not string; **0 inactive as of current taxa.csv.gz**.

### Project docs
- `CLAUDE.md` — nightly pipeline ownership (`data/nightly.sh`, `run.py` STEPS env-driven via `DB_PATH`/`EXPORT_DIR`); the 37-column `marts/occurrences` contract note. Keep doc hygiene per the global "keep docs up to date before pushing" rule if the contract/step surface changes.
- `data/.gitignore` — lines 12-15 already ignore `checklist_unmatched.csv`, `lineage_unresolved.csv`, `raw/taxa.csv.gz`. Add `inactive_unresolved.csv` and the `auto_synonyms.csv` seed path (D-12).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Inactive-enumeration query** (`resolve_taxon_ids.py` ~line 258): `bridge LEFT JOIN read_csv(taxa.csv.gz) WHERE t.active = false` already produces `(canonical_name, taxon_id, inat_name)` for every inactive bridge entry — this IS the detection half of ITR-01; Phase 127 adds the per-row API fetch + remap-or-triage decision.
- **`check_resolution_gate()`** — exact template for the new inactive-gate: read a gitignored CSV, partition into blocking vs. acceptable, `sys.exit(actionable message)` on blocking, else print an OK summary line.
- **`_inat_get_with_retry` + `_INAT_PACE_SECONDS`** — paced/retried iNat API client already imported in `resolve_taxon_ids.py`; reuse for the `GET /v1/taxa/{id}` taxon-detail call that yields `current_synonymous_taxon_ids`.
- **`occurrence_synonyms.csv` + `int_combined`/`stg_checklist__species` JOIN pattern** — the entire application mechanism (ITR-03) already exists; this phase adds a sibling seed and a union model, leaving the JOIN logic untouched.

### Established Patterns
- **Gitignored, overwritten-nightly report CSVs** (`lineage_unresolved.csv`, `checklist_unmatched.csv`) — the lifecycle model for `inactive_unresolved.csv` and `auto_synonyms.csv` (D-06, D-12).
- **Gate-step-after-producer-step** in `run.py` STEPS (`resolve-taxon-ids` → `resolution-gate`) — the structural model for `inactive-remap` → `inactive-gate` (D-05, D-11).
- **dbt seed UNION-with-precedence** — new pattern for this codebase; anti-join on the natural key (`synonym`) is the idiom (D-02).

### Integration Points
- Bridge upsert (`inaturalist_data.canonical_to_taxon_id`, `ON CONFLICT (canonical_name) DO UPDATE`) — the auto-remap step writes successor name→id here (D-10), reusing the existing UPSERT shape in `_resolve_one`.
- New `int_synonyms` model sits between the two seeds and the 3 existing JOIN consumers — the only schema-graph change beyond the seed addition.

</code_context>

<specifics>
## Specific Ideas

- Successor count semantics are exact: **1 = auto, {0, ≥2} = triage** (D-08). A taxon split (≥2) is explicitly NOT auto-resolved.
- Manual precedence is keyed on the **`synonym` (source) column** only — matching ITR-04's "same source name" wording (D-02).
- `auto_synonyms.csv` / `occurrence_synonyms.csv` share the exact schema `synonym,accepted_name,source`; auto rows should carry a recognizable `source` value (e.g. `inat-inactive-remap` + the inactive taxon_id) so triage humans can tell generated from curated.

### Research Dependencies (flagged during discussion — for gsd-phase-researcher)
- **RD-01 (pipeline ordering — highest priority):** `taxa.csv.gz` is fetched by `taxa-download`, which currently runs **after** `resolve-taxon-ids`/`resolution-gate` in `run.py` STEPS. The inactive-remap step needs a **current** `taxa.csv.gz` to detect inactivity AND to look up successor names (D-09). Today's inactive-enumeration reads the **prior night's** dump. Determine whether to (a) move `taxa-download` earlier so detection runs against today's data, (b) place `inactive-remap`/`inactive-gate` after `taxa-download` (but before `dbt-build` and after the bridge exists), or (c) accept one-night-stale detection. Option (b) seems most likely correct — confirm the bridge is fully populated by then and that re-running won't double-fetch.
- **RD-02 (iNat taxon-detail response shape):** Confirm `GET /v1/taxa/{id}` returns `current_synonymous_taxon_ids` for inactive taxa, its exact type (array of ints, possibly empty/null), and how iNat represents a "no successor" vs "split" case. The auto-remap-vs-triage branch (D-08) depends on this. Verify against a real inactive taxon if one can be found (none in the current bridge).
- **RD-03 (taxa.csv.gz successor coverage):** Verify the successor taxon (a currently-active replacement) reliably appears in the same `taxa.csv.gz` dump as the inactive one. If iNat's exported `taxa.csv.gz` lags live taxonomy, a just-created successor may be absent → `successor_not_in_taxa_csv` triage path (D-09). Quantify the staleness window if possible.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The "Step placement & file lifecycle" area was not selected for discussion but was captured as Claude's-discretion decisions D-11–D-13 rather than deferred.)

</deferred>

---

*Phase: 127-inactive-taxon-remapping*
*Context gathered: 2026-05-31*
