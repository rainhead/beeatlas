# Phase 76: Data Foundation — Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Source:** `/gsd-discuss-phase 76` interactive discussion + REQUIREMENTS.md (CHECK-01..06, TAX-01..04) + `.planning/research/SUMMARY.md` Gaps section + `.planning/seeds/species-tab.md`.

<domain>
## Phase Boundary

Land the data-pipeline foundation that downstream Phase 77 species aggregation depends on:

1. WA bee checklist (Bartholomew et al. 2024, JHR 97) committed and loaded into `checklist_data.species` via a new `data/checklist_pipeline.py` step in `data/run.py`.
2. iNat taxon lineage extended to walk full ancestor chains (family → subfamily → tribe → genus → subgenus) into `inaturalist_data.taxon_lineage_extended` so non-checklist species can be classified.
3. A canonical name reconciliation layer (authority-stripped, subgenus-parens-stripped, lowercase, single-spaced) materialized on both the checklist and occurrences sides, with synonyms.csv override and unmatched.csv sidecar for human review.

**No frontend work, no aggregation tables, no SVG maps, no photo manifest, no page scaffolding.** Those are Phases 77–81.

</domain>

<decisions>
## Implementation Decisions

### Locked by REQUIREMENTS.md / ROADMAP success criteria (do not re-litigate)

- File paths: `data/checklist_pipeline.py`, `data/checklist_synonyms.csv` (initially empty), `data/checklist_unmatched.csv` (sidecar artifact).
- DuckDB tables: `checklist_data.species` (10-column schema per CHECK-03); `inaturalist_data.taxon_lineage_extended` per TAX-01 (`taxon_id, family, subfamily, tribe, genus, subgenus`).
- Step ordering in `data/run.py STEPS`: `("checklist", load_checklist)` between `anti-entropy` and `export`.
- Reconciliation primitives: strip authority strings, strip subgenus parens, consult synonyms.csv, dump still-unmatched names to checklist_unmatched.csv.
- Pytest fixtures cover known disagreements (`Lasioglossum (Dialictus) zonulum` ↔ `Lasioglossum zonulum`) plus an authority-bearing variant.
- Test command: `cd data && uv run pytest test_checklist_pipeline.py test_taxon_lineage.py`.
- TAX-02 precedence: `COALESCE(checklist, inat)` for tribe/subfamily/subgenus.

### Decided in this discussion

#### D-01 — Checklist source file: TSV verbatim at `data/checklists/wa_bee_checklist.tsv`

- Source: `~/Downloads/washington_bees(3).tsv` — 2,862 rows, 2 columns (`species\tcounty`), bare binomials (no authority strings), one row per (species, county) pair.
- Commit verbatim as `data/checklists/wa_bee_checklist.tsv`. **File extension overrides CHECK-01's `.csv`** to match the actual upstream format. `data/checklists/README.md` records: provenance (Bartholomew et al. 2024, JHR 97; DOI 10.3897/jhr.97.129013), supplement format note, the manual extraction step that produced the TSV, and the file's two-column shape.
- `checklist_pipeline.py::load_checklist()` reads the TSV, aggregates per-species (DISTINCT scientificName), splits the binomial on whitespace into `genus` + `specific_epithet`, fills `scientificName` (= the binomial), leaves `family`, `subfamily`, `tribe`, `subgenus` NULL on the checklist side (TAX-02 fills these via iNat ancestor walk). `source_citation` = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)" populated for every row. `notes` left empty.
- **County information** is preserved in a separate sibling table `checklist_data.species_counties(scientificName VARCHAR, county VARCHAR)`. NOT collapsed onto the species row. Phase 77 may use this for "expected counties" badges; Phase 76 only needs to land it. Export step does not currently consume it — adding the table is forward-compatible.
- Required REQUIREMENTS.md amendment: CHECK-01 mentions `.csv`; update to `.tsv` (or "tab-separated") in the same commit that lands this CONTEXT.md.

#### D-02 — Status field: only `verified` populated in v3.2

- Every checklist row gets `status = 'verified'` (TSV represents verified WA county records). The `'likely-to-occur'` enum value is reserved for future use (forward-compatible) but not populated by Phase 76.
- Required REQUIREMENTS.md footnote on CHECK-03: "v3.2 populates only `verified`; `likely-to-occur` reserved for v3.3+ when a curated 'expected but not yet found' set is introduced."
- Notes column accepts any future curator commentary; Phase 76 leaves it empty for the bulk-loaded rows.

#### D-03 — Lineage extension: new function in `inaturalist_pipeline.py`, all observed iNat taxa

- Add `enrich_taxon_lineage_extended()` to `data/inaturalist_pipeline.py`. Writes `inaturalist_data.taxon_lineage_extended(taxon_id BIGINT, family VARCHAR, subfamily VARCHAR, tribe VARCHAR, genus VARCHAR, subgenus VARCHAR)`.
- Source taxon IDs to walk: union of `inaturalist_data.observations.taxon__id` (samples + iNat layer) + `inaturalist_waba_data.observations.taxon__id` (WABA observations). DISTINCT, NOT NULL filtered. The iNat v2 `/v2/taxa/{ids}` endpoint with `fields=id,name,rank,ancestors.name,ancestors.rank` (same shape `waba_pipeline.py:131-136` already uses; `batch_size=30` precedent retained).
- **The existing `enrich_taxon_lineage` in `waba_pipeline.py` is left untouched.** It writes the narrower `inaturalist_waba_data.taxon_lineage(taxon_id, genus, family)` table consumed by the `waba_link` CTE in `export.py:116`. Phase 76 does not migrate that join. The two tables coexist; Phase 77's `species_export.py` will read from the new `taxon_lineage_extended`.
- Called from `inaturalist_pipeline.py::load_observations()` after the dlt run completes (mirrors the waba pipeline's `enrich_taxon_lineage(DB_PATH)` call at end of `load_observations`). It must run **after** WABA so the union covers WABA taxa.
- Open follow-up captured for v3.3+: consolidating the two lineage tables (consider deleting `inaturalist_waba_data.taxon_lineage` and migrating `export.py:116` to read from `taxon_lineage_extended`). Not in Phase 76 scope.

#### D-04 — `canonical_name`: strip parens; materialize on each source table

- Transformation rule, applied identically wherever computed:
  1. Strip authority: drop everything from the first ", " or " (Author" pattern onward (regex tuned in plan-time; covers `"Andrena fulva (Müller, 1766)"`, `"Andrena fulva, 1766"`, `"Andrena fulva Müller, 1766"`).
  2. Strip subgenus parens: collapse `Lasioglossum (Dialictus) zonulum` → `Lasioglossum zonulum`. Subgenus is preserved as a separate column populated independently.
  3. Strip infraspecific markers and trailing tokens: `ssp.`, `var.`, `aff.`, `cf.`, `nr.` collapse the row to its binomial. v3.2 is species-level only; infraspecifics fold into their species.
  4. Lowercase.
  5. Collapse internal whitespace to single space; trim.
- Materialize as an actual column:
  - `checklist_data.species.canonical_name VARCHAR` — populated by `checklist_pipeline.py` at load time.
  - `ecdysis_data.occurrences.canonical_name VARCHAR` — populated by a post-ingest update / view in `checklist_pipeline.py` step (or a small helper called from `run.py` between `checklist` and `export`). Whichever the planner picks, the column is visible to ad-hoc queries; it is NOT computed only inside `species_export.py`.
- Implementation utility: a single `canonicalize(name: str) -> str` Python helper in `data/checklist_pipeline.py` (or a new `data/canonical_name.py` if reused). Pytest covers each transformation step independently plus the end-to-end disagreement fixtures.
- The canonical_name column is the JOIN KEY for Phase 77's species aggregation (FULL OUTER between `checklist_data.species` and `ecdysis_data.occurrences`).

#### D-05 — Unmatched policy: warn-only; synonyms.csv has 3 columns

- `data/checklist_synonyms.csv` schema: `checklist_name,canonical_name,source` (header row required).
  - `checklist_name`: the raw binomial as it appears in the checklist TSV.
  - `canonical_name`: the canonical_name (already-transformed) the checklist row should map to. Reviewer is responsible for computing it consistently with the canonicalize() rule.
  - `source`: free-text URL or citation explaining the mapping (audit trail). Required (non-empty).
- Reconciliation flow: for each checklist row whose `canonical_name` does NOT join to any occurrence row, consult synonyms.csv. If a row matches `checklist_name`, override the join key to its `canonical_name`. If still no match, write to `data/checklist_unmatched.csv` (`checklist_name,canonical_name,reason`).
- Pipeline policy: **warn-only**. Pipeline succeeds when `checklist_unmatched.csv` is non-empty; the count is logged. CI does NOT break on unmatched. Reviewer adds a synonyms.csv row, re-runs, and reads the diff. Aligns with the rest of the pipeline's anti-entropy posture (off-WA coordinates clipped, not failed; tribe-staleness tolerated).
- Both files are committed to git. `checklist_synonyms.csv` ships initially with just the header row; reviewer-added entries land in subsequent commits. `checklist_unmatched.csv` regenerates each pipeline run; commits represent snapshots of the unresolved set.

</decisions>

<canonical_refs>
## Canonical References

### REQUIREMENTS / scope
- `.planning/REQUIREMENTS.md` — CHECK-01 through CHECK-06, TAX-01 through TAX-04 (lines 12-24, 154-164). **MUST read before planning.** Note D-01 amends CHECK-01's file extension (`.csv` → `.tsv`) and D-02 adds a footnote to CHECK-03.
- `.planning/ROADMAP.md` — Phase 76 entry at line 504-514 (Goal, Depends on, Requirements list, Success Criteria).
- `.planning/seeds/species-tab.md` — original locked decisions, especially "Taxonomy primary source: Ecdysis" + "Tribe (and other gaps) filled from iNaturalist".

### Research
- `.planning/research/SUMMARY.md` — full research synthesis. Section "Gaps to Address Before Phase 76 Plan" (lines 189-194) is the basis for this discussion's gray areas.
- `.planning/research/PITFALLS.md` — pitfalls #2 (checklist ↔ Ecdysis name disagreement) and #5 (authority leak) bear directly on D-04 canonical_name.
- `.planning/research/FEATURES.md`, `STACK.md`, `ARCHITECTURE.md` — sub-agent outputs.

### Source code (integration points)
- `data/run.py:31-40` — STEPS list; `("checklist", load_checklist)` lands between `anti-entropy` and `export`.
- `data/waba_pipeline.py:109-160` — existing `enrich_taxon_lineage` whose pattern (batched iNat v2 `/v2/taxa/{ids}` calls, `CREATE OR REPLACE TABLE` with `executemany INSERT`) is the template for the new `enrich_taxon_lineage_extended`. **Not modified by Phase 76 per D-03.**
- `data/waba_pipeline.py:131-136` — iNat v2 taxa endpoint shape (`fields=id,name,rank,ancestors.name,ancestors.rank`, `batch_size=30`).
- `data/inaturalist_pipeline.py:114` — `load_observations()` is where the new `enrich_taxon_lineage_extended()` call lands (post dlt-run, pre return).
- `data/feeds.py:132` — `_slugify` (referenced for Phase 77; not consumed in Phase 76).
- `data/export.py:116` — current `LEFT JOIN inaturalist_waba_data.taxon_lineage tl` consumer of the existing waba lineage table. Untouched in Phase 76.
- `data/tests/conftest.py:108, 222` — existing taxon_lineage test fixtures show the pattern for the new wider table's pytest fixtures.

### Source data
- `~/Downloads/washington_bees(3).tsv` — 2,862 rows, copied verbatim into `data/checklists/wa_bee_checklist.tsv` per D-01.
- `~/Downloads/Washington's Bees(1).pdf` — Bartholomew et al. 2024 paper PDF, retained for provenance documentation in `data/checklists/README.md`.
- `~/Downloads/final_checklist_records_20240429-GenusAdded (1).csv` — 50,647 specimen-level records. **Not used in Phase 76** (rejected in D-01); kept in case a future phase wants the per-record metadata.

</canonical_refs>

<code_context>
## Reusable Patterns and Assets

- **dlt + DuckDB pipeline pattern** (`data/inaturalist_pipeline.py`, `waba_pipeline.py`, `geographies_pipeline.py`) — the new `checklist_pipeline.py` does NOT need dlt (no API fetch, no incremental cursor). It mirrors `geographies_pipeline.py`'s simpler one-shot DuckDB load shape: read source file → `CREATE OR REPLACE TABLE` → `executemany INSERT`.
- **Migration pattern** (`run.py:43-90`) — `_apply_migrations()` runs before STEPS. If `canonical_name` lands as a new column on `ecdysis_data.occurrences`, schema migration goes here. New table additions (`checklist_data.species`, `taxon_lineage_extended`) are `CREATE OR REPLACE` so no migration needed.
- **Pytest fixture pattern** (`data/tests/conftest.py`) — programmatic DuckDB fixture (TEST-01–03 from v1.7) is the precedent. New tests `test_checklist_pipeline.py` and `test_taxon_lineage.py` extend `conftest.py` fixtures with checklist + extended-lineage seed rows.
- **Schema validation gate** (`scripts/validate-schema.mjs`) — Phase 76 does NOT touch parquet outputs (those are Phase 77). The schema gate is unchanged in this phase.
- **Anti-entropy posture** (`data/anti_entropy_pipeline.py` step in `run.py`) — Phase 76's warn-only unmatched policy (D-05) aligns with this step's existing tolerate-and-log pattern.

</code_context>

<deferred>
## Deferred Ideas

### Captured during discussion, out of Phase 76 scope

- **Consolidate the two lineage tables.** The existing narrower `inaturalist_waba_data.taxon_lineage` (waba_pipeline.py) and the new wider `inaturalist_data.taxon_lineage_extended` (Phase 76) overlap. v3.3+ candidate: migrate `export.py:116` to read from the wider table and delete the narrower one. Not in Phase 76 because it touches WABA-link semantics that are outside this phase's domain.
- **Curated `'likely-to-occur'` set.** The CHECK-03 enum reserves the value but Phase 76 doesn't populate it. v3.3+ candidate: hand-curate a list of expected-but-not-yet-found WA bee species (neighboring-state records, range-expansion candidates) and surface them on the species page with a distinct badge. Per `species-tab.md` open question.
- **REQUIREMENTS.md amendment commit.** D-01 changes `wa_bee_checklist.csv` → `wa_bee_checklist.tsv`; D-02 adds a footnote on CHECK-03 status enum. These edits land in the same commit that produces this CONTEXT.md (or in the planner's first plan commit) so REQUIREMENTS stays in sync.

</deferred>

<next_steps>
## Next Up

`/clear` then:

`/gsd-plan-phase 76`

The planner will:
1. Read this CONTEXT.md and `.planning/REQUIREMENTS.md` (CHECK + TAX sections).
2. Decompose into plans — likely shape: (a) commit checklist TSV + README provenance + amend REQUIREMENTS, (b) `data/checklist_pipeline.py` (load + canonical_name materialization on `checklist_data.species`), (c) extend `data/inaturalist_pipeline.py` with `enrich_taxon_lineage_extended()`, (d) materialize `canonical_name` on `ecdysis_data.occurrences`, (e) reconciliation + synonyms/unmatched flow, (f) pytest coverage including the disagreement fixtures.
3. Verify against the five Success Criteria from ROADMAP Phase 76.

</next_steps>
