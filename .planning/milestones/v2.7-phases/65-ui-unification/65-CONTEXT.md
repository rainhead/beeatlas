# Phase 65: UI Unification - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

`<bee-occurrence-detail>` replaces `<bee-specimen-detail>` and `<bee-sample-detail>`; renders specimen columns, sample columns, or both based on nullability (null-omit pattern). `bee-atlas` coordinator and `bee-map` lose all `layerMode` references and the layer-switching toggle is removed from `bee-header`. `<bee-table>` is updated with a unified column set for all occurrence rows, showing blank cells for null fields. Old detail components are deleted. All existing tests pass.

v2.9 will revisit all UI decisions in this phase — keep implementations pragmatic.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all implementation choices to Claude's judgment; all will be revisited in v2.9.

- **D-01 (Claude's Discretion): `<bee-occurrence-detail>` data shape** — Component receives a flat array of raw occurrence row objects (read from OL feature properties, same as current `buildSamples` approach). For specimen-backed rows (`ecdysis_id` non-null), render the existing grouped-by-sample display (year/month/collector/fieldNumber header, species list). For sample-only rows (`ecdysis_id` null), render a compact entry with date, observer, specimen_count, and iNat link. For mixed clusters, show specimen groups first then sample-only entries below with a visual separator. Null fields are omitted entirely. `_restoreSelectionSamples` and `_restoreClusterSelection` in `bee-atlas.ts` are updated to also handle sample-only IDs (no longer skip `ecdysis_id == null` rows).

- **D-02 (Claude's Discretion): Unified table columns** — Single `OCCURRENCE_COLUMN_DEFS` replaces `SPECIMEN_COLUMN_DEFS` and `SAMPLE_COLUMN_DEFS`. Include: Date, Species (`scientificName`), Collector (`recordedBy`), Observer, County, Ecoregion, Elev (m), Field #, Modified, Photo. Sample-only rows show blanks for specimen-only columns; specimen-backed rows show blanks for observer/specimen_count. `OccurrenceRow` type in `filter.ts` replaces `SpecimenRow | SampleRow`; `queryTablePage` and `queryAllFiltered` drop the `layerMode` parameter and return all occurrences ordered by date desc. Sorting applies to the `date` column (unified across both row types).

- **D-03 (Claude's Discretion): `visibleIds` unification** — `queryVisibleIds` in `filter.ts` returns `Set<string>` (combined ecdysis + inat IDs) instead of `{ ecdysis: Set<string>; samples: Set<string> }`. `bee-atlas.ts` replaces `_visibleEcdysisIds` / `_visibleSampleIds` with a single `_visibleIds: Set<string> | null`. `bee-map.ts` property becomes `visibleIds`. `makeClusterStyleFn` updated to use this unified set — sample-only dots are now correctly highlighted when filter is active. Click handler filter uses `visibleIds` instead of `visibleEcdysisIds`. Tests updated for the new return type.

- **D-04 (Claude's Discretion): `layerMode` removal scope** — Remove `_layerMode` state, `_onLayerChanged` handler, `layerMode` property from `bee-header`, `bee-map`, `bee-atlas`, `bee-table`. Remove `layerMode` from url-state params (ui.layerMode key). Remove `bee-header` layer tab buttons. `buildCsvFilename` no longer takes layerMode. `makeSampleDotStyleFn` in `style.ts` deleted (deferred from Phase 64). Phase 63 D-02/D-03 narrowing (`WHERE ecdysis_id IS NOT NULL`, `WHERE observation_id IS NOT NULL`) removed from `queryTablePage` and `queryAllFiltered`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema
- `scripts/validate-schema.mjs` — authoritative `occurrences.parquet` column list; `OccurrenceRow` SELECT must cover all columns used in detail and table display

### Source Files to Modify
- `frontend/src/bee-specimen-detail.ts` — DELETE
- `frontend/src/bee-sample-detail.ts` — DELETE
- `frontend/src/bee-sidebar.ts` — replace two conditional components with `<bee-occurrence-detail>`; update `samples`/`selectedSampleEvent` props to unified occurrence data
- `frontend/src/bee-occurrence-detail.ts` — CREATE; Lit component; receives occurrence rows; renders specimen groups + sample-only entries; null-omit pattern
- `frontend/src/bee-atlas.ts` — remove `_layerMode`, `_selectedSampleEvent`, `_visibleEcdysisIds`, `_visibleSampleIds`; add `_visibleIds`; update `_restoreSelectionSamples`/`_restoreClusterSelection` for sample-only rows; remove `_onLayerChanged`
- `frontend/src/bee-map.ts` — remove `layerMode`, `visibleEcdysisIds`, `visibleSampleIds`; add `visibleIds`; update click handler; update `makeClusterStyleFn` call; delete `buildSamples` (or keep for internal use if still needed); remove `_buildRecentSampleEvents` if unused
- `frontend/src/bee-header.ts` — remove layer tab buttons and `layer-changed` event dispatch
- `frontend/src/bee-table.ts` — replace `SPECIMEN_COLUMN_DEFS`/`SAMPLE_COLUMN_DEFS` with `OCCURRENCE_COLUMN_DEFS`; remove `layerMode` property; update sort logic
- `frontend/src/filter.ts` — `queryVisibleIds` returns `Set<string>`; `queryTablePage`/`queryAllFiltered` drop `layerMode`; add `OccurrenceRow` interface; remove `SpecimenRow`/`SampleRow`; remove `buildCsvFilename` layerMode param; remove `SPECIMEN_COLUMNS`/`SAMPLE_COLUMNS` or merge
- `frontend/src/url-state.ts` — remove `layerMode` from ui params
- `frontend/src/style.ts` — delete `makeSampleDotStyleFn`

### Tests to Update
- `frontend/src/tests/filter.test.ts` — update `queryVisibleIds` assertions for `Set<string>` return; remove layerMode from `queryTablePage`/`queryAllFiltered` calls
- `frontend/src/tests/bee-atlas.test.ts` — remove `_layerMode` and `_selectedSampleEvent` references
- `frontend/src/tests/bee-table.test.ts` — remove `layerMode` property
- `frontend/src/tests/bee-sidebar.test.ts` — update for `<bee-occurrence-detail>`
- All other test files that import `SampleRow`, `SpecimenRow`, `layerMode`

### Prior Phase Context
- `.planning/phases/63-sqlite-data-layer/63-CONTEXT.md` — D-02/D-03: layerMode narrowing to be removed in Phase 65
- `.planning/phases/64-occurrencesource/64-CONTEXT.md` — D-09: layerMode left as no-op for Phase 65 cleanup; D-03: all columns set as feature properties; Specifics: Phase 65 revisits click-to-sidebar data flow

### Requirements
- `.planning/REQUIREMENTS.md` §OCC-08, §OCC-09, §OCC-10

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildSamples()` in `bee-map.ts:28` — grouping logic reusable for specimen-backed rows in the new component; sample-only rows need a separate render path
- `BeeSpecimenDetail` styles in `bee-specimen-detail.ts` — copy `.sample`, `.sample-header`, `.sample-meta`, `.species-list`, `.quality-badge` CSS into `bee-occurrence-detail`
- `BeeSampleDetail._formatSampleDate()` — reuse in new component for sample-only date display
- `makeClusterStyleFn` in `style.ts` — already accepts a `() => Set<string> | null` callback; trivial to update when `visibleIds` becomes a single set

### Established Patterns
- Null-omit pattern: render sections only if the discriminating column is non-null (`ecdysis_id` for specimen side, `observation_id` for sample side)
- Feature property access: `f.get('column_name')` — all occurrence columns available as feature properties (Phase 64 D-03)
- `tablesReady` awaited before queries — unchanged

### Integration Points
- `bee-sidebar.ts` is the rendering host — it routes to the correct detail component; Phase 65 simplifies this to always render `<bee-occurrence-detail>` when any selection exists
- `_restoreSelectionSamples` currently skips `ecdysis_id == null` rows — must be fixed to pass sample-only rows to the new component
- `queryTablePage`/`queryAllFiltered` in `filter.ts` — callers in `bee-atlas.ts` must remove `layerMode` argument

</code_context>

<specifics>
## Specific Ideas

User explicitly deferred all visual/behavioral choices to Claude's judgment, noting all will be revisited in v2.9. Keep implementations pragmatic and minimal — avoid over-engineering anything in this phase.

</specifics>

<deferred>
## Deferred Ideas

- All sidebar detail display decisions — revisit in v2.9
- All table column design decisions — revisit in v2.9
- Filter highlight behavior for sample-only dots — being fixed in Phase 65 via visibleIds unification, but visual treatment is open for v2.9 refinement

</deferred>

---

*Phase: 65-ui-unification*
*Context gathered: 2026-04-17*
