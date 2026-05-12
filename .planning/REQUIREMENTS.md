# Milestone v3.3 Requirements — dbt Spike

**Milestone goal:** Learn whether `dbt-duckdb` is the right shape for the BeeAtlas data layer by porting one representative slice end-to-end on a branch. Produce a go/no-go writeup that decides whether v3.4+ pursues a full migration.

**Scope discipline (per `feedback_spike_scope`):** Requirements are framed as *learning outcomes* — diffs, writeups, captured observations. No requirement says "replaces X" or "deletes X." Cutover decisions belong to a follow-up rewrite milestone.

**Out of scope for v3.3:**

| Item | Reason |
|------|--------|
| Changes to `data/run.py`, `data/nightly.sh`, `public/data/` | Spike is exploratory; production paths untouched |
| Changes to `scripts/validate-schema.mjs` or frontend consumers | No schema cutover in spike |
| Replacing or deleting any existing Python pipeline code | Cutover deferred to follow-up rewrite milestone |
| Anti-entropy, ingestion, or artifact-generator restructuring | Out of slice — `species_maps.py`, `feeds.py`, dlt fetchers stay |
| Multi-slice porting | One slice is enough to learn the shape |
| dbt CI integration | Local-only spike |

## v3.3 Requirements

### Scaffolding (SCAFFOLD)

- [ ] **SCAFFOLD-01**: `data/dbt/` contains a working `dbt-duckdb` project (`dbt_project.yml`, `profiles.yml`, `sources.yml`) that connects to a copy of `data/beeatlas.duckdb` and lists the upstream raw tables it reads as `source()` declarations.
- [ ] **SCAFFOLD-02**: `dbt build` runs end-to-end on the spike slice from a clean local checkout and exits 0.
- [ ] **SCAFFOLD-03**: dbt artifacts (`target/`, logs, profiles) are gitignored where appropriate; the dbt project is not referenced by `data/run.py`, `data/nightly.sh`, or any CI workflow.

### Slice Port (PORT)

- [ ] **PORT-01**: One slice is selected and documented in the phase context. Recommended: `export.py` → `ecdysis.parquet` + `samples.parquet` + `counties.geojson` + `ecoregions.geojson`. The slice and rationale are recorded in the findings doc.
- [ ] **PORT-02**: The slice is expressed as a DAG of dbt models with declared `{{ ref() }}` and `{{ source() }}` dependencies, producing the same logical outputs as the chosen Python module.
- [ ] **PORT-03**: Output artifacts materialize to a sandbox directory (e.g. `data/dbt/target/sandbox/`), NOT `public/data/`. The path is documented.
- [ ] **PORT-04**: Spatial joins from the slice (e.g. `ST_Within` + `ST_Distance` nearest-polygon fallback) are expressed in dbt model SQL preserving current semantics; deviations are listed in findings.

### Tests & Contracts (TEST)

- [ ] **TEST-01**: At least three classes of dbt generic test are attempted on slice models — `not_null`, `unique`, and `relationships` — with per-test results recorded (which assertions held, which failed, which couldn't be expressed cleanly).
- [ ] **TEST-02**: A dbt model `contract` is declared and enforced on at least one output model; behavior on intentional schema drift (e.g. dropped or renamed column) is observed and documented.
- [ ] **TEST-03**: At least one invariant currently enforced by `scripts/validate-schema.mjs` or `data/run.py::_apply_migrations` is re-expressed as a dbt test or contract; the comparison is recorded (does dbt express it more clearly? less? same?).

### Diffing (DIFF)

- [ ] **DIFF-01**: A reproducible diff script compares dbt sandbox outputs against current `export.py` outputs from `public/data/` — covering row counts, column schema, and key-set equality on stable IDs (`ecdysis_id`, `inat:<id>`).
- [ ] **DIFF-02**: Spatial-join discrepancies (rows differing in `county` or `ecoregion_l3` assignment between dbt and `export.py`, if any) are enumerated and root-caused.
- [ ] **DIFF-03**: All material differences between dbt outputs and `export.py` outputs are classified into one of: schema-design improvement, latent bug uncovered, semantic divergence to investigate, or neutral / cosmetic.

### Partial Runs & Lineage (PART)

- [ ] **PART-01**: `dbt run --select` partial-run behavior is exercised on at least two subgraphs of the slice. Observed parallelism (or its absence) is documented.
- [ ] **PART-02**: A model-level lineage artifact (e.g. `dbt docs generate` output, screenshot, or `dbt ls --resource-type model` listing) is captured and referenced from findings.

### Findings (FIND)

- [ ] **FIND-01**: `.planning/research/dbt-spike-findings.md` exists with sections covering: what worked well, what was awkward or impossible, where dbt expressed things more clearly than Python, where it expressed them less clearly.
- [ ] **FIND-02**: Findings include a concrete go / no-go / go-with-conditions recommendation for a follow-up rewrite milestone (v3.4+), with reasoning grounded in the diff and test results.
- [ ] **FIND-03**: Findings list explicit conditions / prerequisites that would have to be true for a full-rewrite milestone to succeed — covering at minimum: test coverage, schema decisions, ingestion-vs-transform boundaries, parallel-run / orchestration story, and impact on the DuckDB-WASM frontend direction.

## Future Requirements

(Conditional on v3.3 findings — to be defined in v3.4+ if go/conditional-go.)

- Full migration of remaining transform code (`species_export.py`, `resolve_taxon_ids.py` if SQL-shaped, occurrence-links derivation, taxon-lineage enrichment) to dbt models.
- Hard cutover: replace `export.py` and `species_export.py` in `data/run.py`; retire `_apply_migrations()`; replace `validate-schema.mjs` with dbt contracts.
- Test surface expansion: re-express anti-entropy invariants and pipeline post-conditions as dbt singular tests.
- Documentation: publish dbt-generated lineage docs alongside the project.

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SCAFFOLD-01 | Phase 83 | Pending |
| SCAFFOLD-02 | Phase 83 | Pending |
| SCAFFOLD-03 | Phase 83 | Pending |
| PORT-01 | Phase 83 | Pending |
| PORT-02 | Phase 83 | Pending |
| PORT-03 | Phase 83 | Pending |
| PORT-04 | Phase 83 | Pending |
| TEST-01 | Phase 84 | Pending |
| TEST-02 | Phase 84 | Pending |
| TEST-03 | Phase 84 | Pending |
| DIFF-01 | Phase 84 | Pending |
| DIFF-02 | Phase 84 | Pending |
| DIFF-03 | Phase 84 | Pending |
| PART-01 | Phase 84 | Pending |
| PART-02 | Phase 84 | Pending |
| FIND-01 | Phase 84 | Pending |
| FIND-02 | Phase 84 | Pending |
| FIND-03 | Phase 84 | Pending |

**Coverage:** 18/18 v3.3 requirements mapped to exactly one phase. No orphans. No duplicates.
