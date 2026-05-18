# Requirements: v3.8 Conceptual Tidying

## Milestone Goal

Centralize scattered domain intelligence (definitions, predicates, field-mapping) into well-bounded modules across Python, SQL, and TypeScript — replacing ad-hoc assumptions spread throughout the codebase with pure functions in named conceptual homes. No new user-visible features.

## v3.8 Requirements

### TypeScript Occurrence Domain Module

- [ ] **TS-01**: `src/occurrence.ts` exports `occIdFromRow(row): string` (constructs `"ecdysis:N"` or `"inat:N"`) and `parseOccId(id: string)` (parses the prefix); all TypeScript call sites updated to use these functions; no inline occurrence ID construction remains in the codebase
- [ ] **TS-02**: `src/occurrence.ts` exports named predicates `isSpecimenBacked(row)`, `isSampleOnly(row)`, `isProvisional(row)` replacing inline discriminant conditions across `bee-occurrence-detail.ts`, `bee-atlas.ts`, and any other call sites
- [ ] **TS-03**: Vitest unit tests cover all functions exported from `src/occurrence.ts`; existing tests that tested the same logic inline are removed or updated

### Python Domain Module

- [ ] **PY-01**: `data/domain.py` exports `slugify(text: str) -> str`; `feeds.py` and `species_export.py` both import `slugify` from `domain.py`; `feeds.py`'s `_slugify` private function removed; existing slug behavior preserved byte-for-byte; pytest tests confirm
- [ ] **PY-02**: Dead `BEE_FAMILIES` constant removed from `species_export.py`; a clarifying comment added to `data/dbt/models/intermediate/int_species_universe.sql` noting the SQL `WHERE family IN (...)` is the sole gate

### dbt SQL Domain Constants

- [ ] **DBT-01**: `data/dbt/macros/inat_field_ids.sql` defines named macros for all four OFV field IDs (`8338` specimen count, `9963` sample ID, `18116` Ecdysis catalog suffix, `1718` host observation URL); anonymous integer literals replaced in all intermediate models; `dbt build` passes
- [ ] **DBT-02**: Duplicated `is_plant_taxon` CASE expression extracted from `int_ecdysis_base.sql` and `int_samples_base.sql` into a shared macro; `dbt build` passes

### Semantic Reconciliation

- [ ] **SEM-01**: A single canonical "confirmed (non-provisional) specimen" predicate chosen and documented; `places_export.py` and the diverging frontend or SQL site updated to agree; a test confirms the chosen semantics hold

## Future Requirements

- `OccurrenceRow` / `OCCURRENCE_COLUMNS` / `sqlite.ts` DDL / dbt schema.yml aligned as a single source of truth — deferred; requires careful schema governance work beyond pure extraction
- TypeScript `slugify` in `filter.ts` explicitly differentiated from Python `domain.slugify` (different contract: CSV filename, truncated) — deferred; document-and-defer is sufficient for now
- `canonical_name` column absent from `OCCURRENCE_COLUMNS` — investigate whether intentional — deferred

## Out of Scope

| Feature | Reason |
|---------|--------|
| New pipeline steps or data columns | No new features; refactoring only |
| New UI features | No new features; refactoring only |
| Full OccurrenceRow / OCCURRENCE_COLUMNS / sqlite DDL unification | Larger governance project; deferred to future milestone |
| Fixing behavior divergences (only documenting them) | Except SEM-01 which is explicitly in scope |

## Traceability

| Req | Phase | Status |
|-----|-------|--------|
| TS-01 | Phase 101 | Pending |
| TS-02 | Phase 101 | Pending |
| TS-03 | Phase 101 | Pending |
| PY-01 | Phase 102 | Pending |
| PY-02 | Phase 102 | Pending |
| DBT-01 | Phase 103 | Pending |
| DBT-02 | Phase 103 | Pending |
| SEM-01 | Phase 104 | Pending |
