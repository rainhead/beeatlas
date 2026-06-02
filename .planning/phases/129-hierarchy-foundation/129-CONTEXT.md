# Phase 129: Hierarchy Foundation - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a complete, query-ready, `taxon_id`-keyed taxon hierarchy (bees + non-bee
aculeate bycatch) inside `occurrences.db`, benchmarked for wa-sqlite
descendant-query performance, with a post-build orphan assertion that fails the
nightly export gate. **Pipeline-only — no user-visible change this phase.**

Covers HIER-01 through HIER-06.

**In scope:**
- Hierarchy table(s) in `occurrences.db` keyed on `taxon_id` (UNIQUE), supporting
  descendant-by-any-rank queries
- Coverage: every `taxon_id` referenced by occurrences (bees + bycatch) AND every
  checklist bee species (incl. zero-occurrence ones)
- `is_anthophila` (bee-only) flag on every hierarchy row
- Respect the v4.5 synonym / inactive-taxon bridge (`auto_synonyms`, manual entries win)
- Apidae-level descendant-query latency benchmark in wa-sqlite (decision gate for structure)
- Post-build assertion: zero orphan / missing-parent `taxon_id`; fails nightly gate
- Report counts of complex-rank and bycatch occurrences/species in VERIFICATION.md

**Out of scope (later phases / dropped):**
- Dropping denormalized string columns (Phase 131)
- Any frontend / filter / autocomplete change (Phase 130)
- Pages, subfamily pages, browse tree (Phases 132, 133)
- **Dedicated complex pages (PAGE-05) — dropped from v4.6 entirely** (see D-01)
- Floral host hierarchy (out of milestone scope)

</domain>

<decisions>
## Implementation Decisions

### Complex-rank handling
- **D-01:** Dedicated complex pages are **out of scope for v4.6, period.** Complex
  ranks remain hierarchy-resident, name-resolving, and filterable like any other
  rank; complex tree nodes (Phase 133) deep-link to a filtered map view rather
  than a static page. PAGE-05 is dropped from the milestone. Phase 129 STILL
  reports the complex-rank occurrence/species count in VERIFICATION.md to satisfy
  HIER-06 and for the record — but the count does not reopen the page decision.

### Hierarchy structure
- **D-02:** **Default to materialized path** (`lineage_path` + `instr()` scan).
  Rationale: the `ancestry` column in `taxa.csv.gz` is already a slash-delimited
  materialized path that `taxa_pipeline.py` already walks — near-zero build cost.
  Switch to nested-set (lft/rgt) ONLY on a clear benchmark failure (D-03). Do not
  default to nested-set or run a no-prior bake-off.
- **D-03:** **Benchmark bar is perceptual (~100ms), not a hard 50ms.** Run the
  Apidae (~4000-descendant) descendant query in real wa-sqlite/Firefox; ship
  materialized path unless it is *clearly sluggish* on a mid-range device. The
  benchmark must still run and its result documented (HIER-03), but it is a sanity
  check, not a tight gate. **This supersedes ROADMAP.md Phase 129 Success Criterion
  #2's "<50 ms" wording** — planner/verifier should treat ~100ms perceptual as the
  switch-to-nested-set trigger, not 50ms.

### Coverage scope
- **D-04:** Hierarchy covers: (a) every `taxon_id` referenced by occurrences —
  bees AND non-bee aculeate bycatch — and (b) every checklist bee species,
  including those with zero occurrences (preserves existing "checklist only"
  page/tree treatment from v4.0). Do NOT include the full active-Anthophila set
  from `taxa.csv.gz` — only observed + checklist taxa, to keep the shipped
  artifact small.

### Bycatch name resolution
- **D-05:** A non-bee bycatch occurrence resolves to its **finest available rank**
  (species binomial if identified to species → genus → family) — no information
  loss, no genus cap. Implication: the two-pass bycatch load must store each
  referenced bycatch `taxon_id` at its OWN rank/name, not roll it up to genus.
  Bycatch still gets `is_anthophila = 0` and never appears in any bee-only surface
  (no tree node, no page, no autocomplete entry).

### Claude's Discretion
- Exact table shape (one materialized-path table vs. `taxon_hierarchy` +
  `taxon_closure`) follows from the D-02 structure decision — planner/researcher
  resolve per ARCHITECTURE.md vs STACK.md schema divergence.
- Name of the bee-only flag (`is_anthophila` vs `is_bee`) and orphan-assertion
  implementation details — locked by requirements (hard-fail gate), mechanism is
  Claude's discretion.
- Two-pass load mechanics (Anthophila via existing `taxa_pipeline.py` approach;
  bycatch via targeted ancestry walk) — per PITFALLS.md Pitfall 5.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (read first — resolves most technical questions)
- `.planning/research/SUMMARY.md` — synthesis; the structure-decision gate, phase
  ordering, and the four open gaps (structure, complex count, checklist migration
  scope, canonical_name retention)
- `.planning/research/STACK.md` — materialized-path argument; `instr()` latency math
  (~110ms worst-case full scan at 17K rows); tool-version capability verification
- `.planning/research/ARCHITECTURE.md` — `_build_taxon_hierarchy` placement in
  `sqlite_export.py`; lazy taxonCache load (NOT on `tablesReady` boot path);
  closure-table schema proposal
- `.planning/research/PITFALLS.md` — Pitfall 1 (wa-sqlite structure perf),
  Pitfall 3 (name non-uniqueness → taxon_id-only keys + UNIQUE), Pitfall 5
  (orphan bycatch → two-pass load + zero-orphan assertion)

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — HIER-01..06 (and PAGE-05, now dropped per D-01)
- `.planning/ROADMAP.md` §"Phase 129: Hierarchy Foundation" — goal + 5 success
  criteria (NOTE: criterion #2's "<50 ms" is superseded by D-03)
- `.planning/PROJECT.md` — v4.6 milestone scope, constraints, key context
  (taxon names not unique; Anthophila monophyletic; reusability as design value)

### Code to modify / depend on
- `data/sqlite_export.py` — `_GEO_COLS` positional coupling, `ATTACH` pattern,
  `geo_blob` construction; new `_build_taxon_hierarchy` lands here
- `data/taxa_pipeline.py` — existing materialized-path ancestry walk;
  `ANTHOPHILA_ID = 630955`; `active = 'true'` string guard; `LIKE '%/630955/%'`
  Anthophila filter; `taxon_lineage_extended` (Anthophila-filtered, ~17,343 rows)
- `data/dbt/models/intermediate/int_combined.sql` — three-arm UNION (columns
  dropped later in Phase 131, not here)
- `data/dbt/models/marts/schema.yml` — 37-col occurrences contract (rewritten in 131)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `taxa_pipeline.py` ancestry-walk pattern (`unnest(string_split(ancestry, '/'))`
  + self-row UNION arm) is the proven template for building the hierarchy from
  `taxa.csv.gz`; the bycatch pass adapts the same approach without the
  `/630955/` Anthophila filter.
- `sqlite_export.py` `ATTACH '...' AS out (TYPE sqlite)` + table-create pattern is
  exactly how the new hierarchy tables get written into `occurrences.db`.

### Established Patterns
- **v4.3 boot-path performance is load-bearing** — `tablesReady` was reduced
  930ms→250ms; the hierarchy/taxonCache must load lazily (first autocomplete focus
  or background post-`tablesReady`), NOT on the boot path.
- **`taxon_id`-only keys everywhere** — names are not unique within a kingdom
  (genus *Bombus* vs subgenus *Bombus*); UNIQUE constraint on `taxon_id`.
- **v4.5 synonym/inactive bridge** — active-taxon handling + `auto_synonyms`
  hard-fail gate; manual entries win. Hierarchy build respects this.
- **Phase 128 backfill** used kingdom=Animalia so bycatch resolves to a real
  genus taxon — consistent with D-05 finest-rank display.

### Integration Points
- Hierarchy ships as additional tables INSIDE `occurrences.db` (not a companion
  file) — consistent with the geo_blob pre-computation pattern.
- This phase is additive: the tables ship to production via the nightly pipeline
  as soon as Phase 129 merges, but nothing reads them until Phase 130. The
  string columns stay intact until Phase 131.

</code_context>

<specifics>
## Specific Ideas

- Benchmark must be run in **real wa-sqlite / Firefox** (not server-side DuckDB —
  per PITFALLS.md, server perf does not predict WASM perf), on a mid-range device,
  against the Apidae subtree (~4000 descendants).
- VERIFICATION.md must record: structure chosen + benchmark latency justifying it;
  complex-rank occurrence/species count; bycatch occurrence/species count; zero
  orphan taxon_ids confirmed.

</specifics>

<deferred>
## Deferred Ideas

- **Dedicated complex pages (PAGE-05)** — dropped from v4.6 per D-01. If a future
  milestone wants them, the complex-rank count recorded in this phase's
  VERIFICATION.md is the starting evidence.
- **Floral host hierarchy** — explicitly out of milestone scope (no host taxon_ids
  exist; nothing depends on them).
- **Non-bee taxa in tree/autocomplete** — bycatch resolves names only; never gets
  bee-only surface presence.

</deferred>

---

*Phase: 129-Hierarchy Foundation*
*Context gathered: 2026-06-02*
