# Phase 135: Name Reconciliation - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve every verbatim checklist name (the raw `Scientific Name`, authority intact, in `checklist_data.checklist_records_full` from Phase 134) to a current accepted name + iNat `taxon_id` through a tiered resolver. The nightly pipeline makes **zero** GBIF/ITIS network calls — all external-authority lookups are a one-time, on-demand build step baked into a committed seed. Every decision is written to a committed audit CSV; external (GBIF) and fuzzy (rapidfuzz) candidates are surfaced for **curator promotion**, never auto-applied. Slash-compound determinations resolve to a lowest-common-ancestor `taxon_id`. A homonym guard and a fuzzy-review gate enforce integrity at build time.

**This is Phase B of the v4.7 DAG** (Phase A = 134 ingest). It builds the resolution layer; it does NOT yet promote checklist rows into `int_combined`/`occurrences.parquet` (that is Phase 137 / PRO-01) and does NOT build any frontend (Phase 138). Phase 136 (Deduplication) must not begin until the curator has reviewed `checklist_name_resolution_audit.csv` and promoted GBIF matches into `occurrence_synonyms.csv` (ROADMAP HUMAN-REVIEW GATE).

Requirements: RCN-01 … RCN-07 (see ROADMAP §Phase 135 for the 7 success criteria — they lock WHAT; the decisions below lock HOW).

</domain>

<decisions>
## Implementation Decisions

### External authority scope (RCN-02, RCN-03)
- **D-01:** **GBIF only** via `pygbif`. No ITIS. ITIS is referenced nowhere in the codebase today and only `pygbif` was added in 134; the GBIF backbone covers Anthophila adequately and is a single offline cache to maintain. (STACK.md's ITIS-SQLite "Option 2" is explicitly NOT adopted.) The resolver's external tier is GBIF backbone match only.

### Tier order & auto-apply vs curator-promote (RCN-02, RCN-04)
- **D-02:** Tier order is **exact-canonical → committed synonym seed → GBIF**. The first two tiers **auto-apply** (enter the live pipeline). GBIF matches AND all `rapidfuzz` fuzzy candidates are **promote-only**: written to the audit / review CSVs, inert until a human copies them into `occurrence_synonyms.csv`. This matches the ROADMAP human-review-gate wording ("curator … promoted any GBIF/ITIS matches into `occurrence_synonyms.csv`").
- **D-03:** **Promotion mechanism = add a row to `data/dbt/seeds/occurrence_synonyms.csv`** (the single maintained curated seed). There is no separate staging file; promotion is a one-line seed edit + dbt rebuild. (Aligns with RCN-06's "one synonym source".)

### Blocking gate semantics (RCN-02 SC#2, reconciles with D-02)
- **D-04:** The build **blocks only on no-match-anywhere** — a name fails the gate only if NO tier matched it (not exact, not seed, not GBIF). A GBIF or fuzzy hit counts as **resolved-pending-promotion**: it satisfies the gate and waits in the audit CSV for unhurried curation. Net effect: once every name has ≥1 candidate, nightly stays green; truly-unrecognized names hard-fail the build (mirrors the existing WABA `check_resolution_gate` pattern). Unresolved names are reported in the audit CSV + build output, never hidden.

### Slash-compound LCA (RCN-05)
- **D-05:** The **77 slash-compound rows** (all `Agapostemon angelicus/texanus` / `texanus/angelicus`, verified in the committed CSV) resolve to the **lowest-common-ancestor `taxon_id`** of the components — genus *Agapostemon* here — computed from iNat ancestry (`data/raw/taxa.csv.gz`; a prior `stg_waba__taxon_lineage` was dropped as unused, so ancestry is re-derived). The point is **filterable at genus rank**. The detail card preserves the **verbatim `angelicus/texanus`** string alongside the resolved genus (display wiring is Phase 138; the resolution + verbatim retention is this phase). Cross-genus component pairs (none in current data) generalize to their true LCA at whatever rank.

### Resolver integration & committed cache (RCN-03, RCN-06)
- **D-06:** **Extend the existing `data/resolve_taxon_ids.py` `inaturalist_data.canonical_to_taxon_id` bridge** with a checklist tier rather than a separate resolver. The one-time GBIF lookups run via a **`--refresh`-style flag** (mirroring the existing `--refresh-lineage` / `auto_synonyms.csv` pattern) and are **baked into a committed dbt seed CSV** (the "committed DuckDB cache" of SC#3 is realized as a committed seed that loads into DuckDB — NOT a committed binary `.duckdb`). The nightly path reads only the committed seed; zero network calls.
- **D-07:** **Retire the disjoint checklist-synonyms Python path.** `checklist_pipeline.py` `reconcile()` (line ~162) reads `SYNONYMS_PATH = checklist_synonyms.csv` (the file is already absent, so it currently no-ops). Remove/redirect this path so all checklist synonym resolution flows through `occurrence_synonyms` / `int_synonyms`; add a test asserting a single synonym source (RCN-06).

### Audit CSV (RCN-02 SC#2)
- **D-08:** `checklist_name_resolution_audit.csv` (committed) lists **every** name → `taxon_id` decision with `source` tier (`exact` / `synonym_seed` / `gbif` / `fuzzy` / `unresolved`) and a **numeric confidence**: exact & seed = `1.0`; GBIF = GBIF's `matchType`/confidence; fuzzy = the `rapidfuzz` similarity score (0–100, normalized). One numeric column + the tier captures provenance and lets the curator sort the review queue by trust.

### Claude's Discretion
- Homonym-guard mechanism (RCN-07): a dbt test that fails the build if any `canonical_name` within Anthophila maps to >1 `taxon_id` in `int_combined`. Exact test placement/SQL is the planner's call.
- Fuzzy-review-gate enforcement mechanism (RCN-04): how the build asserts "no unreviewed fuzzy mapping is live" (e.g., assert no `occurrence_synonyms.csv` row is sourced from the fuzzy-candidate CSV without provenance). Mechanism is discretion; the invariant is locked.
- Exact column names/ordering of the audit and fuzzy-review CSVs; function decomposition within `resolve_taxon_ids.py`; how the checklist tier reads `verbatim_name` and applies `normalize_scientific_name()` before matching (RCN-01).
- LCA computation details (which ancestry representation to derive from `taxa.csv.gz`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 135: Name Reconciliation" — goal, 7 success criteria, the HUMAN-REVIEW GATE blocking Phase 136
- `.planning/REQUIREMENTS.md` — RCN-01 … RCN-07 (accept criteria), plus downstream PRO-01 / UIX-01 / UIX-03 framing

### v4.7 research (HIGH confidence)
- `.planning/research/SUMMARY.md` — executive summary; "Phase B: Reconciliation" rationale + gate
- `.planning/research/STACK.md` §"taxonomy authorities" + §"Option 2 ITIS" — why GBIF primary; ITIS-offline option (NOT adopted per D-01)
- `.planning/research/ARCHITECTURE.md` — `stg_checklist__records_full` / reconciliation / ARM sketches (downstream context for the seed + bridge shape)
- `.planning/research/PITFALLS.md` — name-normalization and resolution pitfalls

### Adjacent phase decisions
- `.planning/phases/134-full-fidelity-ingest/134-CONTEXT.md` — D-11 (deps already added), D-12 (`verbatim_name` raw with authority), the `checklist_records_full` schema this phase consumes

### Existing code this phase extends (read before planning)
- `data/resolve_taxon_ids.py` — tiered resolver, `canonical_to_taxon_id` bridge, `auto_synonyms.csv` generation, `--refresh-lineage` one-time-build pattern, `check_resolution_gate` / `check_inactive_gate` (the gate template for D-04)
- `data/canonical_name.py` `normalize_scientific_name()` (line 73) — the RCN-01 normalizer (authority strip / whitespace / case fold) already exists; reuse it
- `data/checklist_pipeline.py` `reconcile()` (line ~162) + `SYNONYMS_PATH` (line 28) — the disjoint checklist-synonyms path to retire (D-07); `_load_checklist_records_full` (134) produces the input table
- `data/dbt/seeds/occurrence_synonyms.csv` — the single curated synonym seed (currently 1 row: `agapostemon texanus → agapostemon subtilior`); promotion target (D-03)
- `data/dbt/models/intermediate/int_synonyms.sql` — combines `occurrence_synonyms` + `auto_synonyms`; the unified subsystem (RCN-06)
- `data/raw/taxa.csv.gz` (~39 MB) — iNat taxa dump with ancestry; source for LCA (D-05)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `normalize_scientific_name()` (`data/canonical_name.py:73`): directly satisfies RCN-01 normalization; the checklist tier calls it on `verbatim_name` before matching.
- `resolve_taxon_ids.py` bridge + `--refresh-lineage` + `auto_synonyms.csv` writer: the template for D-06's checklist `--refresh` build step and committed-seed cache.
- `check_resolution_gate()` (`resolve_taxon_ids.py:60`): the existing build-blocking gate pattern reused for D-04 (block on no-match-anywhere).
- `int_synonyms.sql`: the single synonym subsystem to route checklist resolution through (RCN-06).

### Established Patterns
- One-time on-demand external lookups baked into a committed seed, nightly reads seed only (RCN-03) — already practiced by `auto_synonyms.csv` (iNat inactive-taxon remaps). GBIF checklist resolution follows the same shape.
- dbt seed + `int_*` intermediate + schema-test gates is the canonical place for synonymy and integrity assertions (RCN-06, RCN-07).

### Integration Points
- Input: `checklist_data.checklist_records_full.verbatim_name` (134).
- Output: promoted entries in `occurrence_synonyms.csv` + the `canonical_to_taxon_id` bridge; the committed GBIF cache seed; `checklist_name_resolution_audit.csv` + the fuzzy-review CSV.
- Downstream consumer: Phase 137 (PRO-01) wires reconciled checklist rows into `int_combined`.

</code_context>

<specifics>
## Specific Ideas

- Slash-compound data is narrow and known: 77 rows, all *Agapostemon angelicus/texanus* → genus *Agapostemon* LCA. Use it as the RCN-05 test fixture.
- RCN-04 expects "13 known misspellings" to appear as fuzzy candidates — use that as a concrete acceptance check for the fuzzy tier.
- The curated seed is tiny today (1 row) — the audit CSV review queue is the real curation surface.

</specifics>

<deferred>
## Deferred Ideas

- **Test-suite improvements** — captured separately in `.planning/seeds/test-suite-improvements.md` (a whole milestone): ~35-min suite runtime, function-scoped fixtures re-running full loads, 18 pre-existing `dbt_sandbox` failures in `test_resolve_taxon_ids.py`/`test_dbt_diff.py`, missing `ruff` dep. Relevant here because Phase 135 edits `resolve_taxon_ids.py` (where those failures live) — but the fixes belong to the dedicated milestone, not this phase.
- ITIS / Catalogue of Life integration — out of scope per D-01; revisit only if GBIF coverage proves insufficient.
- Frontend rendering of verbatim-vs-accepted name and source color — Phase 138 (UIX-01, UIX-03).
- Promotion of checklist rows into `occurrences.parquet` — Phase 137 (PRO-01).

</deferred>

---

*Phase: 135-name-reconciliation*
*Context gathered: 2026-06-04*
