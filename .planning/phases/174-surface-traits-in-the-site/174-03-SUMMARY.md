---
phase: 174-surface-traits-in-the-site
plan: "03"
subsystem: ui
tags: [species-traits, eleventy, nunjucks, templates, accessibility]
dependency_graph:
  requires:
    - phase: 174-02
      provides: resolveHostBees(), makeSpeciesNode trait fields (sociality/diet_breadth/host_plant_family), .traits*/.node-badge* CSS
  provides:
    - Traits definition-list section on species detail pages (D-04/D-05/D-08/D-09 / TRAIT-UI-01/02)
    - Sociality + Specialist badges on species rows in index tree, genus, and subgenus pages (D-06/D-07 / TRAIT-UI-03/04)
  affects: [_pages/species-detail.njk, _pages/species.njk, _pages/genus.njk, _pages/subgenus.njk]
tech-stack:
  added: []
  patterns:
    - "Nunjucks {% if %} (no dash) inside HTML attribute values to preserve adjacent spaces"
    - "Nunjucks {%- if -%} for block-level conditional guards and badge text whitespace control"
    - "tabindex='0' on <dt> and <span class=node-badge> for keyboard-accessible native title= tooltips"
key-files:
  created: []
  modified:
    - _pages/species-detail.njk
    - _pages/species.njk
    - _pages/genus.njk
    - _pages/subgenus.njk
key-decisions:
  - "Used {% if %} (no dash) inside title= attribute values to avoid Nunjucks {%- stripping the adjacent trailing space from preceding text (e.g. 'Source: {%- if' would render 'Source:Bee-Gap' — deviation from PATTERNS.md which used {%- inside attrs)"
  - "tribe.njk intentionally excluded — iterates genus rows, not species rows (D-07)"
  - "No | safe on any trait/host-bee value — autoescape handles HTML body, title=, and href= contexts"
  - "Host-bee hrefs interpolate only hb.slug (path-safe) or hb.genusName (known atlas genus) — unresolved hosts render as plain <em>"
requirements-completed: [TRAIT-UI-01, TRAIT-UI-02, TRAIT-UI-03, TRAIT-UI-04]
duration: ~20m (Tasks 1-2; Task 3 awaiting human UAT)
completed: 2026-06-30
---

# Phase 174 Plan 03: Template Trait Rendering Summary

**Traits definition-list on species detail (5-row dl, host-bee links, provenance title=) + sociality/Specialist badges on species rows across index tree, genus, and subgenus pages — all build-time Nunjucks, zero JS.**

## Performance

- **Duration:** ~20m (Tasks 1-2 executed; Task 3 awaiting human UAT)
- **Started:** 2026-06-30
- **Completed:** Tasks 1-2 committed 2026-06-30; Task 3 pending
- **Tasks:** 2 of 3 completed (Task 3 is human-verify checkpoint)
- **Files modified:** 4

## Accomplishments

- `_pages/species-detail.njk`: `<section class="traits">` with `<dl class="traits-dl">` inserted between checklist-attribution and action links; outer if-guard omits whole section when no traits present (D-04/TRAIT-UI-01); host-bee loop renders linked species/genus anchors or plain `<em>` for unresolved hosts (D-05/TRAIT-UI-02); each `<dt>` carries `tabindex="0"` + source-enum-mapped `title=` tooltip (D-08/TRAIT-UI-04); friendly labels (Cleptoparasitic, Specialist (Family), Generalist) per D-09
- `_pages/species.njk` `renderNode` species branch: sociality + Specialist badge spans inserted between `.node-name` and `.node-counts`; `data-name` attribute unchanged (species-index.ts filter unaffected); no badge for generalist/null (D-06)
- `_pages/genus.njk`: same badge spans applied in all three species-list loops (`sg.species`, `genus.ungroupedSpecies`, `genus.species`) using `sp.*` fields from the Wave 2 `{ ...sp }` spread (D-07)
- `_pages/subgenus.njk`: identical badge spans in the `subgenus.species` loop
- `npm test` green (900 tests, 33 files); `npx @11ty/eleventy --dryrun` exits 0; `tribe.njk` has zero `node-badge`

## Task Commits

1. **Task 1: Detail-page Traits section** — `408593d7` (feat)
2. **Task 2: Sociality + Specialist badges on index, genus, subgenus** — `1858829e` (feat)
3. **Task 3: Human UAT** — awaiting human sign-off

## Files Created/Modified

- `_pages/species-detail.njk` — Traits `<section>` + `<dl class="traits-dl">`, 5 conditionally-rendered dt/dd pairs, host-bee loop with typed link resolution
- `_pages/species.njk` — sociality + specialist badge spans in `renderNode` species branch (between `.node-name` and `.node-counts`)
- `_pages/genus.njk` — badge spans in all 3 species-list loops
- `_pages/subgenus.njk` — badge spans in the subgenus.species loop

## Decisions Made

**Whitespace in title= attribute values:** PATTERNS.md used `{%- if %}` inside `title="Source: {%- if..."` which would strip the trailing space from the preceding text literal (Nunjucks whitespace control operates on adjacent text tokens). Used `{% if %}` (no dash) inside all `title=` attribute values to preserve surrounding spaces. This is a deviation from PATTERNS.md but produces the correct output (`Source: Bee-Gap 2017, species-level` not `Source:Bee-Gap 2017, species-level`). Documented as auto-fix Rule 1 (bug in pattern reference).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nunjucks {%- inside title= attribute value strips adjacent space**
- **Found during:** Task 1 (detail-page Traits section implementation)
- **Issue:** PATTERNS.md used `title="Source: {%- if sp.sociality_source..."`. In Nunjucks, `{%-` strips trailing whitespace from the immediately preceding text token. The text `Source: ` ends with a space, which `{%-` would strip, rendering `title="Source:Bee-Gap 2017"` (missing space after colon). Same issue applies to ` · {%- if ...` constructs in badge titles.
- **Fix:** Used `{% if %}` (no `-` dash) inside all `title=` attribute values, preserving adjacent spaces. Block-level guards and badge text content (inside `<span>` tags) continue to use `{%- if -%}` for proper whitespace stripping.
- **Files modified:** `_pages/species-detail.njk`, `_pages/species.njk`, `_pages/genus.njk`, `_pages/subgenus.njk`
- **Committed in:** `408593d7` (Task 1), `1858829e` (Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in pattern reference)
**Impact on plan:** Fix is necessary for correct tooltip text rendering. No scope creep. All acceptance criteria met.

## Issues Encountered

- Pre-existing `| safe` count in `species-detail.njk` is 2 (not 1 as the plan stated): `month_histogram | dump | safe` + `on_checklist | dump | safe`. No new `| safe` was added; the requirement "no NEW `| safe` introduced" is satisfied.

## Known Stubs

None. Template logic is complete. All trait fields render from live `sp.*` / `node.*` data when species.json contains trait data (post 174-01 pipeline). The local `public/data/species.json` predates the 174-01 run and lacks trait fields — this is a local dev concern, not a stub in the template code.

## Threat Flags

No new threat surface beyond the plan's threat model. T-174-04/05/06 mitigations fully implemented: autoescape handles HTML body + title= + href= contexts; hrefs only interpolate typed-safe targets (`hb.slug`, `hb.genusName`); no `| safe` on any trait value.

## User Setup Required

**UAT requires local data regeneration** (see Task 3 checkpoint below). The local `public/data/species.json` predates the 174-01 pipeline run and lacks trait fields. To see traits render locally:

1. Run `bash data/dbt/run.sh build` (builds `species_traits.parquet` in `data/dbt/target/sandbox/`)
2. Run `cd data && uv run python species_export.py` to regenerate `public/data/species.json` with trait fields
3. Then `npm run dev` and verify at `/species/{a-specialist-species}/`

Alternatively, trait rendering is verified in CI once the nightly pipeline publishes updated `species.json` to S3.

## Next Phase Readiness

Tasks 1 and 2 complete. Template rendering logic is correct and compiled. UAT (Task 3) is the remaining gate — human review of visual rendering, host-bee linking, badge scannability, and provenance tooltips.

---
*Phase: 174-surface-traits-in-the-site*
*Completed (Tasks 1-2): 2026-06-30*
