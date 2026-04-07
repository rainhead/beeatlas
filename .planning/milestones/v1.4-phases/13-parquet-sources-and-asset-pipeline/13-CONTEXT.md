# Phase 13: Parquet Sources and Asset Pipeline - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Infrastructure only — no user-visible output except the dot style. This phase creates the data layer foundations that Phases 14 and 15 build on:
- `SampleParquetSource` class in `parquet.ts` reading `samples.parquet`
- `occurrenceID` property added to specimen features in `ParquetSource`
- `sampleDotStyle` in `style.ts` for the sample layer
- `links.parquet` copied to `frontend/src/assets/` by `build-data.sh`

</domain>

<decisions>
## Implementation Decisions

### Sample dot color
- Recency-coded with a shifted palette (distinct from specimen clusters):
  - fresh (≤6 weeks): teal `#1abc9c`
  - this year (older than 6 weeks): blue `#3498db`
  - older: slate `#7f8c8d` (reuses existing older-gray value)
- White stroke, same as specimen clusters
- Fixed radius (not size-encoded — MAP-08 defers size-by-count)
- `recencyTier()` reused from style.ts; date parsed from ISO timestamp string (e.g. `2023-04-04 15:32:38-07:00`)

### SampleParquetSource columns
- Load all Phase-15-needed columns now: `observation_id`, `observer`, `date`, `lat`, `lon`, `specimen_count`
- No need to revisit `parquet.ts` in Phase 15
- `specimen_count` is INT64 → coerce with `Number()` at read time (hyparquet returns BigInt)
- Feature ID scheme: `inat:${observation_id}` (mirrors `ecdysis:${ecdysis_id}` pattern)

### occurrenceID on specimen features
- Add `occurrenceID` to the `columns` array in `ParquetSource`
- Set as a feature property named `occurrenceID` (UUID string, no rename)
- Used as join key for links.parquet lookup in Phase 15

### build-data.sh asset copy
- Add `cp links/links.parquet "$REPO_ROOT/frontend/src/assets/links.parquet"` after existing parquet copies
- Graceful: if links.parquet doesn't exist yet (first CI run before any link fetches), the copy should not hard-fail the build
  - Use `cp ... || echo "links.parquet not found, skipping"` or similar

### Claude's Discretion
- Exact radius value for sample dots (suggest ~5px fixed, smaller than single-specimen cluster radius of 4 to allow for visual distinction)
- Whether `sampleDotStyle` is cached (it can be — unlike clusterStyle, it's determined only by date, not filter state)
- Temporal parsing approach for dot recency (use `Temporal.Instant.from()` or `new Date()` to extract year/month)

</decisions>

<specifics>
## Specific Ideas

- User noted: specimen recency coloring (green/orange/gray) was originally chosen because samples weren't available yet. They want to revisit specimen symbology in a future phase — this is deferred to backlog.
- Shifted palette (teal/blue/slate) chosen so sample dots feel like a distinct data type, enabling future combined-layer views if ever desired.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ParquetSource` (parquet.ts): Direct pattern to follow for `SampleParquetSource` — VectorSource subclass, `asyncBufferFromUrl` + `parquetReadObjects`, columns array, `fromLonLat`, feature properties
- `recencyTier()` (style.ts): Existing function takes `(year, month)` — reuse for sample dots after parsing date string
- `RECENCY_COLORS` (style.ts): Not reused (shifted palette), but pattern for defining a `SAMPLE_RECENCY_COLORS` const is the same
- `hexWithOpacity()` (style.ts): Reuse for sample fill color if opacity needed
- `styleCache` (style.ts): Can cache `sampleDotStyle` by `tier` key (no filter state complication)

### Established Patterns
- Feature ID: `${source}:${id}` prefix — use `inat:${observation_id}`
- BigInt coercion: `Number(obj.year)`, `Number(obj.month)` already in `ParquetSource` — same pattern for `Number(obj.specimen_count)` and `Number(obj.observation_id)`
- Asset URL import: `import samplesDump from './assets/samples.parquet?url'` — same pattern for `links.parquet` when needed in Phase 15

### Integration Points
- `build-data.sh`: Add `cp` for `links.parquet` after existing parquet copies (data/ → frontend/src/assets/)
- `frontend/src/assets/`: `ecdysis.parquet` and `samples.parquet` already here — `links.parquet` joins them
- `style.ts`: Add `SAMPLE_RECENCY_COLORS` const and `sampleDotStyle` function alongside existing `clusterStyle`
- `parquet.ts`: Add `SampleParquetSource` class; add `occurrenceID` to existing `ParquetSource` columns

</code_context>

<deferred>
## Deferred Ideas

- Revisit specimen point symbology (recency colors green/orange/gray) — user noted these were chosen when samples didn't exist yet; deferred to post-v1.4 backlog
- Sample dot size encoded by specimen count (MAP-08) — explicitly deferred in REQUIREMENTS.md
- Combined specimens + samples view (MAP-07) — explicitly deferred

</deferred>

---

*Phase: 13-parquet-sources-and-asset-pipeline*
*Context gathered: 2026-03-12*
