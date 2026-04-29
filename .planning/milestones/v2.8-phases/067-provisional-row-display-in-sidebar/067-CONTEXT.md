# Phase 67: Provisional Row Display in Sidebar — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Frontend-only phase. `bee-occurrence-detail` gains rendering logic for two new row types introduced by Phase 66:
1. **Sample-only rows** (`ecdysis_id` null, `is_provisional` falsy) — "N specimens collected, identification pending"
2. **Provisional rows** (`is_provisional` true) — iNat community ID label with quality grade badge + link to the WABA observation

No pipeline or data changes beyond adding `specimen_inat_quality_grade` to the export (small Phase 66 gap extension). No new components — changes are confined to `bee-occurrence-detail.ts` and `filter.ts`.

</domain>

<decisions>
## Implementation Decisions

### Sample-Only Row Label (locked by success criteria)
- **D-01:** Sample-only rows (`ecdysis_id` null, `is_provisional` falsy) display "N specimens collected, identification pending" — exact copy from SC-1. No other changes to the existing sample-only layout.

### Provisional Row Content
- **D-02:** Provisional rows show the **full sample context** alongside the iNat ID — same fields as sample-only rows (date, `host_inat_login`, specimen count, elevation) plus:
  - The iNat community taxon name (`specimen_inat_taxon_name`)
  - The quality grade badge (using the existing `.quality-badge` CSS variants)
  - A link to the WABA observation via `specimen_observation_id`

### Provisional Label Format
- **D-03:** The label prefix is **"iNat ID:"** followed by the taxon name (italic) and the quality grade badge. Example: `iNat ID: Bombus sp. (RG)`. This is not described as "provisional" — it's a community identification from iNat, and the grade badge conveys certainty level.
- **D-04:** Quality grade for the badge comes from the **WABA observation itself** (`specimen_inat_quality_grade`), not the host plant observation. This requires adding `specimen_inat_quality_grade` to `export.py` and the parquet schema (see pipeline note below).

### Visual Treatment
- **D-05:** No special visual treatment beyond the "iNat ID:" label prefix and quality badge. Plain text layout — same visual style as sample-only rows.

### Schema Updates
- **D-06:** Add to `OccurrenceRow` and `OCCURRENCE_COLUMNS` (minimum set needed for this phase):
  - `is_provisional: boolean` (non-nullable, defaults to false for older rows)
  - `specimen_inat_taxon_name: string | null`
  - `host_inat_login: string | null` — replaces `observer` (Phase 66 breaking rename)
  - `specimen_inat_quality_grade: string | null` — needed for D-04
- **D-07:** `observer` field: the current `_renderSampleOnly` uses `row.observer`. Phase 67 updates this reference to `host_inat_login` throughout `bee-occurrence-detail.ts`.
- **D-08:** `specimen_inat_genus` and `specimen_inat_family` are NOT added in Phase 67 — deferred until taxon filter support for provisional rows is in scope.

### Pipeline Gap Extension
- **D-09:** `specimen_inat_quality_grade` (VARCHAR nullable) must be added to `export.py`. Source: `inaturalist_waba_data.observations.quality_grade` on ARM 2 (WABA observation). Populated for all rows where a WABA observation is linked; null for Ecdysis-only and sample-only rows. This is a minor extension of Phase 66's ARM 2 join — the field is already in the dlt-fetched observations table.
- **D-10:** `validate-schema.mjs` and `OCCURRENCE_COLUMNS` must include `specimen_inat_quality_grade` to pass the schema gate.

### Tests
- **D-11:** One new Vitest render test: mount `bee-occurrence-detail` with a provisional row fixture, assert the "iNat ID:" label and observation link are present. Follows the existing source-text / property-inspection pattern in `bee-sidebar.test.ts`.
- **D-12:** Existing sample-only and specimen render tests must continue to pass (no regressions).

### Claude's Discretion
- CSS class naming for the iNat ID label (e.g., `.inat-id-label`, `.provisional-label`, etc.)
- Whether to extract a shared `_renderQualityBadge(grade)` helper (the badge logic is duplicated between `_renderHostInfo` and the new provisional renderer)
- Exact DOM structure within the provisional row (div nesting, element order within the full-context layout)
- Test fixture structure (column values, how to represent `is_provisional: true` in the fixture object)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Component
- `frontend/src/bee-occurrence-detail.ts` — current rendering logic; `_renderSampleOnly` (needs `observer` → `host_inat_login` update); `_renderSpecimenGroup`; existing `.quality-badge` CSS variants
- `frontend/src/filter.ts` — `OccurrenceRow` interface and `OCCURRENCE_COLUMNS` array; both need Phase 66 + Phase 67 fields added

### Tests
- `frontend/src/tests/bee-sidebar.test.ts` — existing render test patterns (source-text assertion, property inspection); new provisional test goes here

### Schema Gate
- `scripts/validate-schema.mjs` — must include `specimen_inat_quality_grade` in the column list

### Pipeline (gap extension)
- `data/export.py` — ARM 2 join structure (WABA observations); `specimen_inat_quality_grade` is `waba.quality_grade` on the ARM 2 SELECT
- `.planning/phases/066-provisional-rows-in-pipeline/066-CONTEXT.md` — D-01 through D-14 define the full Phase 66 schema; read before touching export.py

### Requirements
- `REQUIREMENTS.md` — SID-01, SID-02 (acceptance criteria for this phase)
- `CLAUDE.md` — `specimenLayer` typo constraint; static hosting only

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.quality-badge` CSS with `.research` / `.needs_id` / `.casual` variants — reuse directly for `specimen_inat_quality_grade` badge on provisional rows
- `_renderSampleOnly(row)` — existing method becomes the structural template for the provisional row layout (add iNat ID label, quality badge, update observer field reference)
- `_formatSampleDate(dateStr)` — already used in `_renderSampleOnly`; provisional rows reuse it

### Established Patterns
- Row type discrimination: currently `ecdysis_id != null` → specimen, else → sample-only. Phase 67 adds a second branch: `is_provisional === true` within the `ecdysis_id == null` case.
- Quality badge rendering: `_renderHostInfo` already builds grade badges from `row.inat_quality_grade`. The provisional case follows the same pattern with `row.specimen_inat_quality_grade`.
- Tests use source-text pattern matching (`src.toMatch(...)`) and property inspection — no DOM rendering mocks needed for structure tests.

### Integration Points
- `render()` method in `bee-occurrence-detail` — current: `specimenBacked` vs `sampleOnly` split. Phase 67 splits `sampleOnly` further into `sampleOnly` (is_provisional falsy) and `provisional` (is_provisional true).
- `OCCURRENCE_COLUMNS` in `filter.ts` — feeds the DuckDB SELECT in `queryOccurrences`; must include all new columns or they'll be absent from fetched rows.

</code_context>

<specifics>
## Specific Ideas

- User clarified: the "iNat ID" label is NOT described as provisional — the iNat quality grade badge communicates certainty level. A research-grade (RG) WABA observation is a real ID, not just a tentative guess.
- The `observer` → `host_inat_login` rename from Phase 66 is a breaking change that Phase 67 must clean up in the frontend.

</specifics>

<deferred>
## Deferred Ideas

- `specimen_inat_genus` / `specimen_inat_family` in `OccurrenceRow` — deferred until taxon filter covers provisional rows (REQUIREMENTS.md: "Filter by determination status" is Future)
- Visual tint or badge for the provisional row container — no strong need; plain text is sufficient

</deferred>

---

*Phase: 067-provisional-row-display-in-sidebar*
*Context gathered: 2026-04-20*
