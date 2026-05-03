# Phase 76: Data Foundation — Discussion Log

**Date:** 2026-05-02
**Mode:** default (interactive AskUserQuestion, batched)

For human reference. NOT consumed by downstream agents (researcher/planner/executor).

## Gray Areas Surfaced

Drawn from `.planning/research/SUMMARY.md` "Gaps to Address Before Phase 76 Plan" (lines 189-194):

1. Checklist source ingestion
2. Lineage code & schema
3. Canonical name depth
4. Unmatched-names policy

User selected all four. User additionally challenged the CSV-as-source-of-truth assumption ("we already have a DuckDB database, is there any reason to have CSV as well?") — addressed inline before the per-area decisions.

## CSV-vs-DuckDB Challenge

**User question:** Why CSV when we already have DuckDB?

**Resolution:** CSV stays as source-of-truth because:
- REQUIREMENTS-CHECK-01 names the path explicitly.
- `data/beeatlas.duckdb` is a build artifact; deleting it must not lose hand-curated content.
- CSV-in-git makes provenance reviewable via git diff; same family as `checklist_synonyms.csv` and `checklist_unmatched.csv`.
- pnwmoths parallel is real but not load-bearing; the structural reason is curation belongs above the runtime store.

## Per-Area Decisions

### Area 1 — Checklist source ingestion

**Sub-question A: Source file format / ingestion mode**
- Options presented: hand-transcribe once / one-shot extraction script / decide-after-inspection.
- User selection: pointed to a TSV already extracted in a prior conversation (claude.ai chat, not browseable here).
- Local hunt found `~/Downloads/washington_bees(1).tsv` (2,928 rows) and a few other candidates. User then specified `(3).tsv` (2,862 rows; same `species\tcounty` shape).

**Sub-question B (refinement after source identified): Which file at `data/checklists/wa_bee_checklist.csv`?**
- Options: aggregated TSV as-is / TSV converted to CSV / specimen-level CSV.
- **Selected: aggregated TSV as-is.** Override CHECK-01's `.csv` extension to match upstream. Counties go to a separate `checklist_data.species_counties` join table.

**Sub-question C: Status field origin**
- Options: all-verified / all-verified-with-likely-to-occur-reserved / inspect-PDF.
- **Selected: all rows = `verified`; defer `likely-to-occur` set to v3.3+.**

### Area 2 — Lineage code & schema

- Options: new function in inaturalist_pipeline.py / migrate-and-widen existing waba function / extend existing in place.
- **Selected: new function in `inaturalist_pipeline.py`; widens to all observed taxa (union of iNat + WABA observation taxon IDs). Existing waba `enrich_taxon_lineage` left untouched.**

### Area 3 — Canonical name depth

- Options: strip-parens-materialize / strip-parens-export-only / keep-parens-materialize.
- **Selected: strip parens; materialize on each source table** (`checklist_data.species` and `ecdysis_data.occurrences`).
- Discussion captured the full transformation rule (authority strip, subgenus parens strip, infraspecific collapse, lowercase, single-space).

### Area 4 — Unmatched-names policy

- Options: warn-only-3col / warn-only-2col / threshold-fail-3col.
- **Selected: warn-only; synonyms.csv = `(checklist_name, canonical_name, source)` 3 columns.** Aligns with anti-entropy posture elsewhere in the pipeline.

## Deferred Ideas Raised

- Consolidate the two lineage tables in v3.3+ (the narrower waba_data.taxon_lineage and the new wider taxon_lineage_extended).
- Curated `'likely-to-occur'` checklist additions in v3.3+.
- REQUIREMENTS.md amendments needed: CHECK-01 file extension; CHECK-03 status enum footnote.

## Scope Creep Redirected

None this discussion — user stayed inside Phase 76's pipeline-only domain.
