# Phase 96: Index Page Replacement - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace `_pages/species.njk` with a new static family→genus index page. The new page lists all species grouped by family then genus, with a type-to-filter text input that narrows displayed genera and species in real time. Genus names link to `/species/{Genus}/`; species names link to `/species/{Genus}/{specificEpithet}/`. The existing tree-nav + all-cards layout is gone. Delete the old components (`bee-species-page.ts`, `bee-species-filter.ts`, `species/url-state.ts`, `taxon-tree.njk`) and their test files in the same phase.

</domain>

<decisions>
## Implementation Decisions

### Old Component Cleanup
- **D-01:** Delete all old `/species/` monolith components **in Phase 96** — do not defer to a follow-on task.
  - Source files to delete: `src/species/bee-species-page.ts`, `src/species/bee-species-filter.ts`, `src/species/url-state.ts`
  - Template file to delete: `_includes/taxon-tree.njk` (verify exact path at execution time)
  - Test files to delete: any test files dedicated to those components (e.g., `src/tests/bee-species-page.test.ts`, `src/tests/bee-species-filter.test.ts`, `src/tests/species-url-state.test.ts` — researcher confirms actual paths)
  - `src/entries/species.ts`: update to remove dead imports; if only dead imports remain, delete it too
  - `src/tests/arch.test.ts`: remove/update guards that reference the deleted components
  - Rationale: `noUnusedLocals` does not catch orphaned side-effect imports; dedicated test files would keep passing (false confidence); Phase 96 is the final v3.6 phase and URL-05 says "replaced entirely."

### Claude's Discretion
- **Filter mechanism**: Not discussed. Researcher/planner should follow the genus/tribe page pattern — a thin JS entry module (like `taxon-page.ts`) that adds a `<input>` listener and toggles CSS `hidden` on non-matching family sections, genus rows, and species rows. A new Lit coordinator is NOT warranted — the search is a simple string-match visibility toggle with no reactive state management.
- **Index data structure**: `_data/species.js` already provides `species.flat` (with `family`, `genus`, `slug`, `scientificName`, `occurrence_count`). Researcher/planner may choose to group at Nunjucks template time or add a `familyIndex` computed export to `_data/species.js` — either approach is acceptable.
- **`bee-species-card.ts` and `seasonality-viz.ts`**: These may also be unused after the old page is replaced. Researcher should check whether any other template still references them (e.g., `species-detail.njk`). If not, delete them in this phase too.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §URL-05, IDX-01, IDX-02, IDX-03, IDX-04 — locked requirements for this phase

### Page to Replace
- `_pages/species.njk` — current template; entire content is replaced

### Page Pattern to Follow
- `_pages/genus.njk` — canonical model for the new index style (static Nunjucks + thin JS entry; no Lit coordinator)
- `src/entries/taxon-page.ts` — entry module for genus/tribe/subgenus pages; reference for filter interactivity pattern

### Data Source
- `_data/species.js` — build-time Eleventy data; provides `species.flat` (array with `family`, `genus`, `slug`, `scientificName`, `occurrence_count`) and `species.genusList`. The `slug` field is the hierarchical path `Genus/specificEpithet` (Phase 92 migration).

### Files to Delete (researcher confirms exact paths)
- `src/species/bee-species-page.ts`
- `src/species/bee-species-filter.ts`
- `src/species/url-state.ts`
- `_includes/taxon-tree.njk` (or equivalent path — verify)

### Files to Update
- `src/entries/species.ts` — remove dead imports; delete if fully empty after cleanup
- `src/tests/arch.test.ts` — update guards referencing deleted components

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_data/species.js` `species.flat`: the full species array with all fields needed for the index (family, genus, slug, scientificName, occurrence_count); no new data pipeline work required
- `_pages/genus.njk`: copy the breadcrumb + article + media-grid pattern as the structural baseline for the new index page
- `src/entries/taxon-page.ts`: provides `<bee-taxon-nav>` registration; new index entry module can be modeled after this

### Established Patterns
- Static Nunjucks pagination/grouping: genus/tribe pages use `pagination` frontmatter over `species.genusList`; the index can use Nunjucks `groupby` or a new computed property on `_data/species.js`
- Thin JS entry (not Lit coordinator): genus/subgenus/tribe pages all use `taxon-page.ts` for their interactivity — no per-page coordinator component
- Species slug format: `slug` field = `Genus/specificEpithet` → href = `/species/{{ sp.slug }}/`; genus href = `/species/{{ sp.genus }}/`

### Integration Points
- `_pages/species.njk` `permalink: /species/index.html` — preserve this permalink in the replacement template
- `_data/species.js` may need a `familyIndex` export (array of `{family, genera: [{genus, species: [...]}]}`) for clean Nunjucks iteration — researcher decides
- `src/tests/arch.test.ts`: guards that block imports of `bee-species-page` / `bee-species-filter` from non-species files; these become vacuous after deletion and should be removed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

Reviewed todos (not in scope for Phase 96):
- "Cluster blobs need selection visual feedback" — unrelated map interaction concern
- "Hash-versioned parquet URLs" — unrelated pipeline concern
- "Nightly run failure notification" — unrelated pipeline concern

</deferred>

---

*Phase: 96-Index Page Replacement*
*Context gathered: 2026-05-15*
