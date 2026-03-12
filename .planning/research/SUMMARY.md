# Project Research Summary

**Project:** Washington Bee Atlas — v1.4 Sample Layer (frontend)
**Domain:** Static interactive map — OpenLayers + Lit + hyparquet, client-side Parquet
**Researched:** 2026-03-12
**Confidence:** HIGH — all claims derived from direct inspection of current source files and installed packages

## Executive Summary

v1.4 is a pure frontend milestone that surfaces two data artifacts already produced by earlier pipeline milestones: `samples.parquet` (v1.2, iNat collection events) and `links.parquet` (v1.3, Ecdysis-to-iNat specimen linkage). No new npm dependencies are required. No backend, CDK, or GitHub Actions changes are needed. All implementation work is additive TypeScript inside `frontend/src/`, using libraries already installed (ol 10.7.0, lit 3.2.1, hyparquet 1.23.3) and patterns already established in the codebase. The four requirements (MAP-03, MAP-04, MAP-05, LINK-05) are well-defined, low-complexity, and can be implemented and tested independently.

The primary architectural decision — an exclusive layer toggle using `layer.setVisible()` rather than simultaneous display — is dictated by the data shapes (samples have no taxon column, making filter parity impossible) and click-handling clarity (merging hit-tests from two layers creates ambiguous UX). The sidebar component already has a multi-mode render pattern; adding a third branch for iNat observation detail is the natural extension. The only cross-cutting technical concern is BigInt coercion: hyparquet returns INT64 Parquet columns as JavaScript `BigInt`, which must be coerced to `number` with `Number()` before storing on OL features or in the `_linksMap`. This pattern already exists in the codebase for `year`/`month` columns.

The main implementation risk is the join key for `links.parquet`: the file uses UUID `occurrenceID` as its key, not the integer `ecdysis_id` used as the OL feature ID suffix. `occurrenceID` must be added to the `ParquetSource` column list and stored as a feature property so the sidebar can look it up. This is a one-line change to `parquet.ts` that must land in Phase 1, before any sidebar or links work begins. Missing it causes zero iNat links to appear in the specimen sidebar with no error.

## Key Findings

### Recommended Stack

No changes to `package.json`. All required libraries are installed.

**Core technologies (unchanged — context for integration):**
- `ol` 10.7.0: `VectorLayer`, `VectorSource`, `layer.setVisible()`, `layer.getFeatures(pixel)` — all stable APIs already in use
- `lit` 3.2.1: `@property`, `@state`, multi-mode `render()` — pattern already established in `BeeSidebar`
- `hyparquet` 1.23.3: `asyncBufferFromUrl` + `parquetReadObjects` — same call pattern used for `ecdysis.parquet`; INT64 columns return `BigInt`, coerce with `Number()`
- TypeScript 5.8.x: `bigint | null` union type supported without flags

**What NOT to add:** Zustand/MobX (existing `FilterState` singleton is sufficient), generic `ParquetSource<T>` (two concrete classes are simpler), `ol/interaction/Select` (existing `singleclick` handler is the pattern), `ol-layerswitcher` library (two-button toggle in sidebar is sufficient).

**New static assets required:**
- `frontend/src/assets/samples.parquet` — produced by v1.2 pipeline (`npm run fetch-inat`); already exists
- `frontend/src/assets/links.parquet` — produced by v1.3 pipeline (`npm run fetch-links`); must be copied by `scripts/build-data.sh`

### Expected Features

**Must have (v1.4 — all four requirements):**
- MAP-03: Sample dot layer renders on map — unclustered `VectorLayer` backed by new `SampleParquetSource` reading `samples.parquet`; each row is one dot at (lon, lat)
- MAP-04: Exclusive toggle switches between specimen clusters and sample dots; sidebar clears on switch; `layer.setVisible(bool)` mechanism
- MAP-05: Clicking a sample dot opens sidebar with observer, date, specimen count (null renders as "not recorded", not "0"), and link to `https://www.inaturalist.org/observations/<observation_id>`
- LINK-05: Specimen sidebar shows clickable iNat link when `links.parquet` maps the specimen's `occurrenceID`

**Should have (v1.4 if time permits — P2):**
- Filter controls hidden or disabled when sample layer is active (specimen taxon/date filters have no meaning for sample dots — showing them is misleading)
- Sample event count in sidebar summary when sample layer is active ("N collection events" mirroring specimen summary)

**Defer (v2+):**
- URL encoding of selected sample marker (`inat=<observation_id>` param) — deferred until collectors confirm they share sample links
- Combined specimen + sample view — only warranted if collectors explicitly request it; click disambiguation is non-trivial
- Sample dot size-encoded by specimen count — wait for feedback on basic dot layer first

### Architecture Approach

Four source files are modified; one new static asset is added; `build-data.sh` gains one `cp` line. The key architectural patterns are: (1) parallel load of all three Parquet files in `firstUpdated()`, with `_linksMap` stored as `@state` so that Lit re-renders the sidebar when the map data arrives; (2) `_layerMode: 'specimens' | 'samples'` as a `@state` on `BeeMap` driving both `layer.setVisible()` calls and the `singleclick` handler branch; (3) a new `InatSample` interface kept separate from the existing `Sample` interface because the data shapes are fundamentally different; (4) `occurrenceID` (UUID string) used as the join key for `links.parquet` — not the integer `ecdysis_id`.

**Major components and changes:**
1. `parquet.ts` (modified): Add `occurrenceID` to `ParquetSource` column list; add `SampleParquetSource` class for `samples.parquet`
2. `bee-map.ts` (modified): `_layerMode` and `_linksMap` and `_selectedInatSamples` as `@state`; `sampleLayer` construction; parallel `links.parquet` load in `firstUpdated()`; `singleclick` handler branched on `_layerMode`; toggle handler; URL params `lm` and `si`
3. `bee-sidebar.ts` (modified): New `@property` fields `layerMode`, `inatSamples`, `linksMap`; new `InatSample` interface; `_renderInatDetail()` method; iNat link in specimen `_renderDetail()`; toggle button; hide filters in sample mode
4. `style.ts` (modified): Add `sampleDotStyle` — fixed-size circle, visually distinct from specimen cluster style
5. `frontend/src/assets/links.parquet` (new): Copied by updated `build-data.sh`

### Critical Pitfalls

1. **Wrong join key for links.parquet** — Using the integer `ecdysis_id` (feature ID suffix) instead of the UUID `occurrenceID` as the lookup key produces zero iNat links with no error. Fix: add `occurrenceID` to `ParquetSource` column list and store as feature property in Phase 1, before any links work. (ARCHITECTURE.md Anti-Pattern 4)

2. **BigInt in Lit templates silently produces no output** — hyparquet returns INT64 columns as `BigInt`; passing a `BigInt` to a Lit template renders nothing and throws no error. Coerce with `Number()` at read time for both `samples.parquet` `specimen_count` and `links.parquet` `inat_observation_id`. (STACK.md BigInt section)

3. **filterState applied to sample layer silently hides all dots** — `matchesFilter()` reads `scientificName`, `genus`, `family` from OL feature properties; sample features have none of these. Any active taxon filter causes all sample dots to disappear. `sampleDotStyle` must not reference `filterState`. (ARCHITECTURE.md Anti-Pattern 1)

4. **Invisible layer still returns hits from `getFeatures()`** — OL `layer.getFeatures(pixel)` detects features on invisible layers. Without branching on `_layerMode`, clicking on the map when the sample layer is active will hit-test the (invisible) specimen layer and find results. Branch on `_layerMode` before calling `getFeatures()`. (STACK.md click handler section, ARCHITECTURE.md Anti-Pattern 5)

5. **links.parquet not copied to assets** — `build-data.sh` must include `cp data/links.parquet frontend/src/assets/links.parquet`. Missing this copy means the file is absent at Vite build time, causing the import to fail or the `_linksMap` to never populate. (PITFALLS.md Pitfall 15 pattern)

6. **CloudFront stale cache after deploy** — `links.parquet` is a new stable-path asset. After deploy, run `aws cloudfront create-invalidation --paths "/*"` to ensure the new file is served. Content-hashed JS/CSS self-invalidate; Parquet files at stable paths do not. (PITFALLS.md Pitfall 1)

## Implications for Roadmap

Research reveals a clean five-step dependency chain. Steps are small enough that a single Phase containing all five is feasible, but the natural separation points create three phases:

### Phase 1: Foundation — Parquet Sources and Asset Pipeline

**Rationale:** `parquet.ts` changes (adding `occurrenceID` to `ParquetSource`; adding `SampleParquetSource`) and `style.ts` changes (`sampleDotStyle`) have no Lit component dependencies and can be verified in isolation via browser console. The `build-data.sh` `cp` line for `links.parquet` must land here so the asset is available for all subsequent work.

**Delivers:** `SampleParquetSource` class; `occurrenceID` on specimen features; `sampleDotStyle`; `links.parquet` copied to assets by build script

**Addresses:** MAP-03 (partial — source only); LINK-05 (prerequisite — join key available)

**Avoids:** Pitfall 1 (wrong join key), Pitfall 3 (filterState on samples), Pitfall 5 (missing asset copy)

### Phase 2: Layer Toggle and Map Display (MAP-03, MAP-04)

**Rationale:** Construct `sampleLayer` and `_layerMode` state on `BeeMap`, wire the toggle handler, add the toggle button to `BeeSidebar`. This phase makes sample dots visible on the map and confirms rendering. Can be shipped independently before click interaction.

**Delivers:** Sample dots visible on map; exclusive toggle between specimen clusters and sample dots; sidebar clears on layer switch; URL `lm=` param encode/restore

**Addresses:** MAP-03 (complete), MAP-04 (complete)

**Avoids:** Pitfall 4 (invisible layer hit-testing — branching established here); Pitfall 3 (filter controls hidden in sample mode)

**Uses:** `layer.setVisible()`, `_layerMode` @state, `SampleParquetSource` from Phase 1

### Phase 3: Click Interaction and iNat Links (MAP-05, LINK-05)

**Rationale:** With the layer toggle in place and `_layerMode` established, the `singleclick` handler branch and the `_linksMap` load can be added. Both are independent of each other and can be worked in parallel.

**Delivers:** Sample dot click shows iNat observation detail in sidebar (observer, date, specimen count, iNat link); specimen sidebar shows iNat link when `links.parquet` has a match; URL `si=` param encode/restore

**Addresses:** MAP-05 (complete), LINK-05 (complete)

**Avoids:** Pitfall 2 (BigInt coercion — done at read time in SampleParquetSource and linksMap load); Pitfall 4 (branch already established in Phase 2)

**Uses:** `_linksMap` @state on `BeeMap`; `InatSample` interface; `_renderInatDetail()` on `BeeSidebar`

### Phase Ordering Rationale

- Phase 1 before Phase 2: `SampleParquetSource` must exist before `sampleLayer` can be constructed; `occurrenceID` on features is a prerequisite for `links.parquet` lookup
- Phase 2 before Phase 3: `_layerMode` and `singleclick` branch structure must exist before click detail logic is added; `lm=` URL param must be in place before `si=` param is added
- MAP-05 and LINK-05 (both in Phase 3) are independent of each other within the phase

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Parquet sources):** `SampleParquetSource` is a direct copy-and-adapt of existing `ParquetSource`; `sampleDotStyle` mirrors existing `clusterStyle` pattern; no new APIs
- **Phase 2 (Layer toggle):** `layer.setVisible()` is standard OL; toggle button pattern is established by existing filter controls in `BeeSidebar`; URL param encoding pattern established by existing `o=` param
- **Phase 3 (Click interaction):** `singleclick` + `getFeatures()` pattern already in production; `BeeSidebar` multi-mode render pattern already in production; `linksMap` load uses same `asyncBufferFromUrl` + `parquetReadObjects` call already in use twice

No phases require deeper research. All patterns are confirmed from existing codebase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All library versions verified from `frontend/package.json`; integration patterns verified from existing source files |
| Features | HIGH | Four requirements are precise and scoped; existing codebase directly inspected; feature dependencies fully mapped |
| Architecture | HIGH | All architectural decisions derived from direct source inspection; no external research required; all five anti-patterns documented from codebase |
| Pitfalls | HIGH (project-specific) / MEDIUM (infrastructure) | Project-specific pitfalls (BigInt, join key, filterState, invisible layer) verified against codebase; CloudFront/CDK pitfalls from training data (cutoff August 2025) |

**Overall confidence:** HIGH

### Gaps to Address

- **`links.parquet` asset presence:** Verify that `scripts/build-data.sh` already includes or will include the `cp data/links.parquet frontend/src/assets/links.parquet` line before Phase 1 is considered complete. This is a one-line build script change that is easy to miss.

- **Filter controls in sample mode (P2):** Whether to hide or visibly disable specimen filters when `_layerMode === 'samples'` is a minor UX decision left open by research. Either approach is correct; the recommendation is to hide entirely for v1.4 simplicity, then reconsider if users report confusion.

- **`downloaded_at` column in samples.parquet:** Research notes this column should be omitted from the `SampleParquetSource` column list. Confirm that the column is present but not needed — including it wastes bandwidth; the schema allows selective column reads via hyparquet's `columns` parameter.

## Sources

### Primary (HIGH confidence)

- `frontend/src/bee-map.ts` — VectorLayer, ClusterSource, singleclick, filterState singleton patterns
- `frontend/src/parquet.ts` — ParquetSource implementation, column loading, BigInt `Number()` coercion
- `frontend/src/bee-sidebar.ts` — multi-mode render pattern, Sample/DataSummary/FilteredSummary branches
- `frontend/src/filter.ts` — FilterState singleton
- `frontend/src/style.ts` — clusterStyle, existing OL style imports
- `frontend/package.json` — installed versions: ol 10.7.0, hyparquet 1.23.3, lit 3.2.1
- `data/inat/download.py` DTYPE_MAP — samples.parquet schema confirmed
- `data/links/fetch.py` — links.parquet schema, occurrenceID key type, Int64 nullable confirmed
- `.planning/PROJECT.md` — milestone scope, requirement IDs

### Secondary (MEDIUM confidence)

- [OpenLayers Layer API](https://openlayers.org/en/latest/apidoc/module-ol_layer_Layer-Layer.html) — `layer.setVisible()`, `getFeatures(pixel)`
- [Map UI Patterns](https://mapuipatterns.com/patterns/) — exclusive layer toggle UX, sidebar clear-on-switch pattern
- [ol-layerswitcher](https://github.com/walkermatt/ol-layerswitcher) — base layer radio button pattern (reference only; not used)

### Tertiary (LOW confidence — informational)

- Map UI design references (Eleken, UXPin) — general map sidebar pattern confirmation
- eBird, iNaturalist Explore, AllTrails — sidebar-clears-on-layer-switch pattern observation

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
