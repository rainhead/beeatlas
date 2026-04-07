# Phase 15: Click Interaction and iNat Links - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the sample dot singleclick to show a full detail view in the sidebar (observer, date, specimen count, iNat observation link). Load `links.parquet` to inject iNat observation links into the specimen detail sidebar. No new layers, no new filters, no URL state for selected sample.

</domain>

<decisions>
## Implementation Decisions

### Specimen iNat link — when match exists
- iNat link appears **next to the ecdysis.org link** on each species row
- Both links shown side by side: ecdysis.org link + iNat link
- Consistent with existing per-row pattern in `_renderDetail`

### Specimen iNat link — when no match
- Show a **greyed/muted placeholder**: `iNat: —`
- Muted text, not a link — factually indicates no iNat record without implying data is pending
- The ecdysis.org link is still present regardless

### links.parquet loading
- Load **eagerly at startup**, alongside `ecdysis.parquet`
- Consistent with how all other Parquet assets load — no lazy/on-demand complexity
- Links appear immediately on first specimen click, no loading state needed

### Sample dot click sidebar
- Claude's Discretion: layout of single-dot detail (observer, date, specimen count, iNat link)
- Return to recent events list when "close" / back is triggered
- Uses existing `SampleEvent` interface fields — no new interface needed

### Claude's Discretion
- Exact `LinksParquetSource` implementation (follow `ParquetSource` pattern in parquet.ts)
- How `links` lookup map is built (Map<occurrenceID, inat_observation_id> keyed by UUID string)
- How `Specimen` interface is extended to carry iNat observation ID (or passed separately)
- Sample dot clicked sidebar layout — should feel consistent with the recent events row format

</decisions>

<specifics>
## Specific Ideas

- Greyed placeholder text: `iNat: —` (em dash, not hyphen) — visually minimal
- iNat observation URL pattern: `https://www.inaturalist.org/observations/${inat_observation_id}`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ParquetSource` (parquet.ts): Pattern for `LinksParquetSource` — VectorSource subclass with `asyncBufferFromUrl` + `parquetReadObjects`, columns array
- `SampleEvent` interface (bee-sidebar.ts): Already has observer/date/specimen_count/coordinate — Phase 15 adds a clicked-dot detail view that reuses this
- `_renderRecentSampleEvents()` (bee-sidebar.ts): Existing event-row format — extend or reuse for clicked-dot detail
- `_renderDetail(samples: Sample[])` (bee-sidebar.ts): Specimen cluster detail — where iNat link is injected; `Specimen` interface currently has `name` and `occid`
- `buildSamples()` (bee-map.ts): Builds `Sample[]` from Feature array — Phase 15 extends `Specimen` to carry `inatObservationId: number | null`

### Established Patterns
- Module-level Parquet source: `specimenSource`, `sampleSource` created at module level; `links` loaded same way
- BigInt coercion: `Number(obj.inat_observation_id)` — INT64 from hyparquet comes as BigInt
- Graceful miss for optional data: links.parquet might not exist on first CI run — `|| echo` pattern in `build-data.sh` already handles this
- `inat_observation_id` is nullable (null when no iNat link scraped) — test for null before rendering

### Integration Points
- `parquet.ts`: Add `LinksParquetSource` class (or simpler: export a plain `loadLinks()` async function that returns `Map<string, number>`)
- `bee-map.ts`: Load links at startup; build `_linksMap: Map<string, number>` (occurrenceID → inat_observation_id); pass to `buildSamples()` or inject into `Specimen` objects
- `bee-sidebar.ts`: `Specimen` interface gets optional `inatObservationId?: number | null`; `_renderDetail` renders link or `iNat: —` placeholder
- `bee-map.ts` singleclick sample branch (Phase 14 placeholder lines 608-616): Replace with actual detail — build a `SampleEvent` object from the clicked feature and set `this.selectedSamples` to show it
- `bee-sidebar.ts` render(): When `layerMode === 'samples'` and a dot is clicked, show detail instead of recent events list

</code_context>

<deferred>
## Deferred Ideas

- URL encoding of selected sample marker (`inat=` param) — MAP-06, explicitly deferred in REQUIREMENTS.md
- Sample dot size-encoded by specimen count — MAP-08, deferred
- Combined specimens + samples view — MAP-07, deferred

</deferred>

---

*Phase: 15-click-interaction-and-inat-links*
*Context gathered: 2026-03-13*
