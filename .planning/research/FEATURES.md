# Feature Research

**Domain:** Linking iNaturalist specimen-photo observations to Ecdysis specimen records in the BeeAtlas sidebar
**Researched:** 2026-04-12
**Confidence:** HIGH (existing code examined directly; iNaturalist API verified live)

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Clickable iNat URL for specimen observation | Collectors already see an iNat link for host-plant observations; absence of a specimen photo link on a record that has one feels like missing data | LOW | Pattern already implemented for `inat_observation_id`; a second link in the same `<li>` follows the same `s.inatObservationId` pattern in `bee-specimen-detail.ts` line 119 |
| Visual distinction from host-plant link | Two different iNat links on one specimen line — collector needs to understand which is which at a glance | LOW | Label text ("photo" or "specimen photo") next to the link; existing `.inat-missing` CSS already scopes hint text |
| Graceful absent state | If no specimen photo observation exists, the sidebar must not show a broken or empty slot | LOW | Already handled for host link with `· iNat: —` span at line 121; same pattern applies to specimen photo link |
| Rename `inat_observation_id` to `host_observation_id` throughout | Two iNat ID columns on the same record require unambiguous names; the current name is overloaded | LOW | Pipeline, export, SQL projections in `filter.ts` and `bee-atlas.ts`, `Specimen` interface in `bee-sidebar.ts`, `validate-schema.mjs`, and test fixtures all need updating |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Quality grade badge on specimen photo link | Research grade signals community-confirmed taxon ID — directly relevant to collectors wondering if their specimen has been verified on iNat | LOW | `.quality-badge` CSS for `research`/`needs_id`/`casual` already exists in `bee-specimen-detail.ts` lines 63-83 and is reusable; pipeline stores `quality_grade` from iNat API `quality_grade` field |
| Observer login next to specimen photo link | Distinguishes who photographed the pinned specimen (may differ from the field collector); iNat community context | LOW | iNat API returns `user.login`; store alongside `specimen_observation_id` in parquet; render inline as "by {login}" |
| Photo thumbnail inline | Makes the link tangible — shows the pinned specimen image without navigation | HIGH | See Anti-Features for why this is deferred from MVP |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Inline photo thumbnail from iNaturalist CDN | Makes the link tangible; reduces clicks to confirm the right specimen | iNaturalist images are served from `inaturalist-open-data.s3.amazonaws.com`; `<img>` cross-origin embedding works in practice today but is not guaranteed by iNat's terms of service. More critically: the pipeline runs offline and cannot pre-cache thumbnails without additional S3 storage; fetching thumbnails at runtime from the static frontend requires the client to hit iNat's CDN directly, which creates a dependency on iNat CDN availability and CORS policy stability. Storing a `photo_url` column in `ecdysis.parquet` also increases file size for a column that is non-null for only a small fraction of specimens. | Link with "specimen photo" label opening in new tab — zero infrastructure complexity, works even if iNat CDN changes policies |
| Embedding full iNat observation via iframe | Richer context — observer, date, all IDs, taxon — without navigation away from the map | iNaturalist provides an unofficial iframe embed via `inat-obs-embed.glitch.me` which is third-party infrastructure not operated by iNat and not suitable for production. The official iNat site embeds observations in a modal; no stable public iframe API exists. Iframes also break mobile sidebar layout and require `allow-scripts` CSP relaxation. | Link to `https://www.inaturalist.org/observations/{id}` in new tab |
| Fetching live quality grade at map load time | Quality grade changes as community IDs accumulate — stale snapshot underrepresents current status | Violates static-hosting constraint; requires runtime iNat API calls from the browser. iNat's API rate limits (60 req/min, 10,000 req/day) would be hit easily if every page load fetched quality grades for all linked specimens. | Accept pipeline-sourced snapshot; store `quality_grade` at pipeline-fetch time and treat it as approximate context, not authoritative |
| Displaying full taxon name from specimen observation | iNat's community ID may differ from Ecdysis determination | Two taxon names on one specimen line creates confusion about which is authoritative; the Ecdysis determination is the collector's data, iNat's community ID is context | The existing `_renderHostInfo` pattern already handles iNat taxon for host observations; keep same approach: show grade badge as implicit taxon-confirmation signal, not a second species name |

## Feature Dependencies

```
Pipeline: fetch iNat observations with field_id=18116 (WABA catalog number)
    └──required by──> Export: join WABA observations to specimens on catalog_number suffix
                          └──required by──> ecdysis.parquet: add specimen_observation_id column
                                                └──required by──> Frontend: render specimen photo link

Rename inat_observation_id → host_observation_id
    └──must precede──> Adding specimen_observation_id
                           (avoids two ambiguous iNat columns in parquet, SQL, and Specimen interface)

specimen_observation_id in ecdysis.parquet
    └──enhances with──> observer_login (stored alongside by pipeline)
    └──enhances with──> quality_grade (stored alongside by pipeline; acknowledged as potentially stale)
```

### Dependency Notes

- **Rename must precede new column:** Adding `specimen_observation_id` while the existing column is still named `inat_observation_id` creates two ambiguously-named iNat ID columns in the parquet schema, SQL projections, TypeScript interface, and test fixtures. The rename is a prerequisite, not a parallel task.
- **Pipeline join via catalog number suffix:** Ecdysis `occurrenceID` is `ecdysis:<integer>`; the iNat WABA observation field stores the catalog number (the integer portion). The export join must strip the prefix and match on the integer. This logic must be verified against real WABA observation data before the frontend is wired up.
- **Specimen interface extension is additive:** `bee-sidebar.ts` exports the `Specimen` interface; adding `specimenObservationId?: number | null` (and optionally `specimenObserverLogin?: string | null`) propagates to `bee-specimen-detail.ts` and `bee-atlas.ts` without breaking existing tests.

## MVP Definition

### Launch With (v2.3)

- [ ] Pipeline: query iNat API for observations with `field_id=18116` (WABA catalog number); store `observation_id`, `catalog_number`, `observer_login`, `quality_grade` incrementally in DuckDB
- [ ] Export: join WABA observations to `ecdysis` table on catalog number; add `specimen_observation_id` (Int64 nullable) to `ecdysis.parquet`; rename `inat_observation_id` to `host_observation_id` throughout (pipeline, export, SQL, schema gate, frontend)
- [ ] Schema gate: update `validate-schema.mjs` for renamed column and new column
- [ ] Frontend: add `specimenObservationId` to `Specimen` interface in `bee-sidebar.ts`; render link in `bee-specimen-detail.ts` with absent-state fallback

### Add After Validation (v2.3+)

- [ ] Observer login display next to specimen photo link — add `specimenObserverLogin` to `Specimen` interface; render "by {login}" inline; depends on pipeline storing `observer_login`
- [ ] Quality grade badge on specimen photo link — reuse existing `.quality-badge` CSS; add `specimenQualityGrade` to `Specimen` interface; depends on pipeline storing `quality_grade` and acceptance of staleness

### Future Consideration (v3+)

- [ ] Photo thumbnail inline — requires resolving static-hosting constraint by pre-fetching thumbnails to S3 at pipeline time and serving from CloudFront; complexity and S3 cost are high relative to incremental value over a text link

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Specimen photo link (URL only) | HIGH — closes "where is the photo?" for linked specimens | LOW | P1 |
| Rename host_observation_id throughout | HIGH — required for schema clarity and naming sanity | LOW | P1 |
| Observer login next to link | MEDIUM — context for who photographed the pinned specimen | LOW | P2 |
| Quality grade badge | MEDIUM — signals community ID confidence | LOW (CSS exists) | P2 |
| Inline photo thumbnail | LOW — incremental over a link | HIGH (CORS + CDN + parquet column) | P3 |

## Existing Code Integration Points

The `bee-specimen-detail.ts` component already contains all patterns needed for the v2.3 MVP:

1. **`bee-sidebar.ts` `Specimen` interface** (line 17-24) — add `specimenObservationId?: number | null`; optionally `specimenObserverLogin` and `specimenQualityGrade`
2. **`bee-atlas.ts` DuckDB query** (line 769, 789) — add `specimen_observation_id` to SELECT; add field to object construction
3. **`bee-map.ts` cluster builder** (line 43, 47) — add `specimen_observation_id` from feature properties
4. **`features.ts` DuckDB SELECT** (line 21) — add `specimen_observation_id` column
5. **`filter.ts`** (line 144) — add `specimen_observation_id` to the URL alias block if needed for SQL projections
6. **`bee-specimen-detail.ts` render template** (lines 119-121) — the `${s.inatObservationId != null ? ... : ...}` block is the direct model for a parallel `${s.specimenObservationId != null ? ... : ...}` block
7. **`validate-schema.mjs`** — update column list: `host_observation_id` replaces `inat_observation_id`; add `specimen_observation_id`
8. **`bee-sidebar.test.ts`** (lines 199-200, 239-240) — fixture specimens need `specimenObservationId` field for new test coverage; existing absent-state test fixtures remain valid if field is optional

## Sources

- Live iNaturalist API: `https://api.inaturalist.org/v1/observations/170010000` — confirmed response fields: `quality_grade` ("research"), `user.login`, photo URL pattern `inaturalist-open-data.s3.amazonaws.com/photos/{id}/square.jpg` with substitutable size token (square/small/medium/large/original)
- [iNaturalist API photo URL forum](https://forum.inaturalist.org/t/where-to-get-high-quality-images-for-observations-from-the-api/48134) — photo size variants available via URL substitution; no explicit CORS confirmation
- [iNaturalist observation embed (iframe)](https://www.inaturalist.org/posts/89817-embedding-observations-using-an-iframe) — official iframe embed exists but via third-party `glitch.me` host; not production-reliable
- [iNaturalist as a tool for museum specimens (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6240452/) — established pattern: catalog number in iNat observation fields links physical specimen to field photo
- Direct code analysis: `frontend/src/bee-specimen-detail.ts`, `frontend/src/bee-sidebar.ts`, `frontend/src/bee-atlas.ts`, `frontend/src/features.ts`, `frontend/src/filter.ts`, `frontend/src/bee-map.ts`, `.planning/PROJECT.md`

---
*Feature research for: BeeAtlas v2.3 — Specimen iNat Observation Links*
*Researched: 2026-04-12*
