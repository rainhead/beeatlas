# Phase 13: Parquet Sources and Asset Pipeline - Research

**Researched:** 2026-03-12
**Domain:** OpenLayers VectorSource subclassing, hyparquet, OpenLayers style functions, bash asset pipeline
**Confidence:** HIGH

## Summary

Phase 13 is an infrastructure-only phase that creates four concrete artifacts: `SampleParquetSource` in `parquet.ts`, `occurrenceID` property on specimen features, `sampleDotStyle` in `style.ts`, and a `links.parquet` copy step in `build-data.sh`. All four are narrowly scoped additions to existing files with clear patterns to follow. No new libraries are introduced — every tool needed is already in the codebase.

The `SampleParquetSource` mirrors `ParquetSource` exactly: `VectorSource` subclass, `asyncBufferFromUrl` + `parquetReadObjects`, feature ID as `inat:${observation_id}`, BigInt coercion with `Number()` for INT64 columns. The date field in `samples.parquet` is an ISO 8601 timestamp string with timezone offset (e.g. `'2021-09-06 20:47:40+03:00'`), so year/month extraction requires `Temporal.Instant.from()` or equivalent — `Temporal.PlainDate.from()` cannot parse it directly.

The `sampleDotStyle` function is simpler than `clusterStyle` because it has no filter state dependency: a per-tier style cache keyed by `recencyTier()` output is sufficient. The `links.parquet` copy in `build-data.sh` is a one-liner with graceful failure handling since the file is pipeline-generated and may not exist on first CI run.

**Primary recommendation:** Follow the existing `ParquetSource` / `clusterStyle` patterns exactly — the codebase already has all the primitives; this phase is additive with zero architectural risk.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sample dot color:**
- Recency-coded with a shifted palette (distinct from specimen clusters):
  - fresh (≤6 weeks): teal `#1abc9c`
  - this year (older than 6 weeks): blue `#3498db`
  - older: slate `#7f8c8d` (reuses existing older-gray value)
- White stroke, same as specimen clusters
- Fixed radius (not size-encoded — MAP-08 defers size-by-count)
- `recencyTier()` reused from style.ts; date parsed from ISO timestamp string (e.g. `2023-04-04 15:32:38-07:00`)

**SampleParquetSource columns:**
- Load all Phase-15-needed columns now: `observation_id`, `observer`, `date`, `lat`, `lon`, `specimen_count`
- No need to revisit `parquet.ts` in Phase 15
- `specimen_count` is INT64 → coerce with `Number()` at read time (hyparquet returns BigInt)
- Feature ID scheme: `inat:${observation_id}` (mirrors `ecdysis:${ecdysis_id}` pattern)

**occurrenceID on specimen features:**
- Add `occurrenceID` to the `columns` array in `ParquetSource`
- Set as a feature property named `occurrenceID` (UUID string, no rename)
- Used as join key for links.parquet lookup in Phase 15

**build-data.sh asset copy:**
- Add `cp links/links.parquet "$REPO_ROOT/frontend/src/assets/links.parquet"` after existing parquet copies
- Graceful: if links.parquet doesn't exist yet (first CI run before any link fetches), the copy should not hard-fail the build
  - Use `cp ... || echo "links.parquet not found, skipping"` or similar

### Claude's Discretion
- Exact radius value for sample dots (suggest ~5px fixed, smaller than single-specimen cluster radius of 4 to allow for visual distinction)
- Whether `sampleDotStyle` is cached (it can be — unlike clusterStyle, it's determined only by date, not filter state)
- Temporal parsing approach for dot recency (use `Temporal.Instant.from()` or `new Date()` to extract year/month)

### Deferred Ideas (OUT OF SCOPE)
- Revisit specimen point symbology (recency colors green/orange/gray) — user noted these were chosen when samples didn't exist yet; deferred to post-v1.4 backlog
- Sample dot size encoded by specimen count (MAP-08) — explicitly deferred in REQUIREMENTS.md
- Combined specimens + samples view (MAP-07) — explicitly deferred
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-03 (partial) | User can see iNat collection events rendered as simple dot markers (source only in this phase) | `SampleParquetSource` reads `samples.parquet` and produces OL features; layer wiring deferred to Phase 14 |
| LINK-05 (prerequisite) | Specimen sidebar shows iNat observation link when linkage exists in links.parquet | `occurrenceID` added to `ParquetSource` feature properties enables Phase 15 join; `links.parquet` bundled via asset pipeline |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hyparquet | ^1.23.3 | Parquet file reading in browser | Already used for `ParquetSource`; `asyncBufferFromUrl` + `parquetReadObjects` is the proven pattern |
| OpenLayers (ol) | ^10.7.0 | VectorSource base class, Feature, Point geometry | Already used for entire map layer system |
| temporal-polyfill | ^0.2.5 | Date arithmetic for recency tier calculation | Already used in `style.ts` for `recencyTier()` |

### No New Dependencies
This phase introduces zero new npm dependencies. All tools are already installed and in active use.

**Installation:** none required.

---

## Architecture Patterns

### Existing Code Patterns (HIGH confidence — read from source)

**ParquetSource pattern (`frontend/src/parquet.ts`):**
```typescript
// Columns declared at module level
const columns = ['ecdysis_id', 'longitude', 'latitude', ...];

export class ParquetSource extends VectorSource {
  constructor({url}: {url: string}) {
    const load = (extent, resolution, projection, success, failure) => {
      asyncBufferFromUrl({url})
        .then(buffer => parquetReadObjects({columns, file: buffer}))
        .then(objects => {
          const features = objects.flatMap(obj => {
            if (obj.longitude == null || obj.latitude == null) return [];
            const feature = new Feature();
            feature.setGeometry(new Point(fromLonLat([obj.longitude, obj.latitude])));
            feature.setId(`ecdysis:${obj.ecdysis_id}`);
            feature.setProperties({ year: Number(obj.year), ... });
            return feature;
          });
          this.addFeatures(features);
          if (success) success(features);
        })
        .catch(failure);
    };
    super({loader: load, strategy: all});
  }
}
```

**clusterStyle pattern (`frontend/src/style.ts`):**
```typescript
const styleCache = new Map<string, Style>();

export function clusterStyle(feature: FeatureLike): Style {
  // ... compute cacheKey
  if (cacheKey && styleCache.has(cacheKey)) return styleCache.get(cacheKey)!;
  const style = new Style({ image: new Circle({ radius, fill, stroke }) });
  if (cacheKey) styleCache.set(cacheKey, style);
  return style;
}
```

**recencyTier pattern (`frontend/src/style.ts`):**
```typescript
function recencyTier(year: number, month: number): keyof typeof RECENCY_COLORS {
  const sampleDate = Temporal.PlainDate.from({ year, month, day: 1 });
  if (Temporal.PlainDate.compare(sampleDate, sixWeeksAgo) >= 0) return 'fresh';
  if (year >= today.year) return 'thisYear';
  return 'older';
}
```

**Asset URL import pattern (`frontend/src/bee-map.ts`):**
```typescript
import ecdysisDump from './assets/ecdysis.parquet?url';
import samplesDump from './assets/samples.parquet?url';
```

---

## Key Technical Findings

### samples.parquet Schema (HIGH confidence — verified by direct inspection)
```
observation_id: int64      ← BigInt from hyparquet, coerce with Number()
observer:       large_string
date:           large_string  ← ISO 8601 with TZ offset: '2021-09-06 20:47:40+03:00'
lat:            double
lon:            double
specimen_count: int64      ← BigInt from hyparquet, coerce with Number()
```
Sample row: `{'observation_id': 93932795, 'observer': 'amelathopoulos', 'date': '2021-09-06 20:47:40+03:00', 'lat': 47.14, 'lon': -118.34, 'specimen_count': 0}`

### ecdysis.parquet Schema (HIGH confidence — verified by direct inspection)
```
ecdysis_id:      int64
occurrenceID:    large_string  ← UUID string, join key for links.parquet
longitude:       double
latitude:        double
scientificName:  large_string
family:          large_string
genus:           large_string
specificEpithet: large_string
year:            int64
month:           int64
recordedBy:      large_string
fieldNumber:     large_string
```
`occurrenceID` is already present in `ecdysis.parquet` — it just needs to be added to the `columns` array in `ParquetSource` and surfaced as a feature property.

### links.parquet Status (HIGH confidence — verified by directory listing)
`/Users/rainhead/dev/beeatlas/data/links/links.parquet` does **not** exist yet — the `links/` directory contains only `__init__.py` and `fetch.py`. The file is generated by the pipeline (`npm run fetch-links`). This confirms the graceful-fail requirement for the `build-data.sh` cp step.

### Date Parsing for Sample Dots (HIGH confidence — verified sample data)
The `date` column contains strings like `'2021-09-06 20:47:40+03:00'` — this is an ISO 8601 datetime with timezone offset, not a plain date. `Temporal.PlainDate.from()` cannot parse it. The correct approach:

```typescript
// Option A: Temporal.Instant (respects UTC semantics)
const instant = Temporal.Instant.from(date.replace(' ', 'T'));
const zdt = instant.toZonedDateTimeISO('UTC');
const year = zdt.year;
const month = zdt.month;

// Option B: new Date() (simpler, sufficient for year/month extraction)
const d = new Date(date);
const year = d.getUTCFullYear();
const month = d.getUTCMonth() + 1;
```

Option A (Temporal) is consistent with the existing `style.ts` dependency. Option B (`new Date`) is simpler and sufficient since we only need year/month for recency tier and precision at month boundaries doesn't matter for display. Either is acceptable per Claude's Discretion.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet reading in browser | Custom ArrayBuffer streaming | `asyncBufferFromUrl` + `parquetReadObjects` from hyparquet | Already proven; handles column projection, BigInt coercion patterns established |
| Style caching | Custom Map management | `styleCache` pattern already in `style.ts` | Existing pattern; add second cache map or extend the existing one |
| URL asset bundling | Manual copy into build output | Vite `?url` import suffix | Vite handles hashing, path rewriting; already used for `ecdysis.parquet` and `samples.parquet` |

---

## Common Pitfalls

### Pitfall 1: BigInt from INT64 columns
**What goes wrong:** `observation_id` and `specimen_count` are INT64 in Parquet; hyparquet returns them as JavaScript `BigInt`. Using them as feature IDs (`inat:${obj.observation_id}`) or in arithmetic without coercion produces `"inat:93932795n"` (the BigInt `n` suffix) or a TypeError.
**Why it happens:** hyparquet faithfully preserves Parquet numeric precision.
**How to avoid:** Coerce at read time: `Number(obj.observation_id)`, `Number(obj.specimen_count)`. The existing `ParquetSource` already does `Number(obj.year)` and `Number(obj.month)` — same pattern.
**Warning signs:** Feature IDs containing `n` suffix; sidebar shows `NaN` or `[object BigInt]`.

### Pitfall 2: Date string incompatible with Temporal.PlainDate.from()
**What goes wrong:** `Temporal.PlainDate.from('2021-09-06 20:47:40+03:00')` throws a RangeError — PlainDate cannot parse datetime strings with time and timezone components.
**Why it happens:** `samples.parquet` stores full datetime strings, not plain dates.
**How to avoid:** Use `Temporal.Instant.from(date.replace(' ', 'T'))` then `.toZonedDateTimeISO()`, or use `new Date(date)` and extract `getUTCFullYear()` / `getUTCMonth() + 1`.
**Warning signs:** Runtime RangeError in browser console when sample features are styled.

### Pitfall 3: build-data.sh fails if links.parquet absent
**What goes wrong:** `set -euo pipefail` causes `cp links/links.parquet ...` to fail and exit the script non-zero when the file doesn't exist (first CI run before any links have been fetched).
**Why it happens:** The links.parquet file is pipeline-generated; it doesn't exist in a fresh checkout.
**How to avoid:** Use `cp links/links.parquet "$REPO_ROOT/frontend/src/assets/links.parquet" || echo "links.parquet not found, skipping"` — the `|| echo` prevents the `set -e` exit.
**Warning signs:** CI build fails at the copy step with "No such file or directory".

### Pitfall 4: sampleDotStyle radius vs. clusterStyle single-specimen radius
**What goes wrong:** If `sampleDotStyle` uses the same radius as a single-specimen cluster (4px), sample dots are visually indistinguishable from solo specimen dots at a glance.
**Why it happens:** The two styles share color space overlap at `older` tier (both use `#7f8c8d`).
**How to avoid:** Use a slightly different radius per Claude's Discretion (suggested: 5px or 6px fixed). The existing single-specimen radius is `displayCount <= 1 ? 4 : ...` — sample dots at a slightly larger fixed size provide visual distinction.

### Pitfall 5: Vite doesn't bundle assets not imported
**What goes wrong:** `links.parquet` placed in `frontend/src/assets/` but never imported with `?url` in any TypeScript file won't appear in the production `dist/` output automatically.
**Why it happens:** Vite only bundles assets that are referenced from source code or explicitly configured.
**How to avoid:** Phase 13 only needs `links.parquet` present in `frontend/src/assets/` for the `npm run build` success criterion — Vite *does* copy all files in the `public/` directory unconditionally, but `src/assets/` files require an import. Since the import (`import linksDump from './assets/links.parquet?url'`) is deferred to Phase 15, Phase 13's success criterion ("present after `npm run build`") should be interpreted as: present in `frontend/src/assets/` (pre-build), not necessarily in `dist/`. Verify against the actual success criterion wording.

---

## Code Examples

### SampleParquetSource (complete implementation)
```typescript
// frontend/src/parquet.ts — add after existing ParquetSource class

const sampleColumns = [
  'observation_id',
  'observer',
  'date',
  'lat',
  'lon',
  'specimen_count',
];

export class SampleParquetSource extends VectorSource {
  constructor({url}: {url: string}) {
    const load = (extent: Extent, resolution: number, projection: Projection, success: any, failure: any) => {
      asyncBufferFromUrl({url})
        .then(buffer => parquetReadObjects({columns: sampleColumns, file: buffer}))
        .then(objects => {
          const features = objects.flatMap(obj => {
            if (obj.lat == null || obj.lon == null) return [];
            const feature = new Feature();
            feature.setGeometry(new Point(fromLonLat([obj.lon, obj.lat])));
            feature.setId(`inat:${Number(obj.observation_id)}`);
            feature.setProperties({
              observation_id: Number(obj.observation_id),
              observer: obj.observer,
              date: obj.date,
              specimen_count: Number(obj.specimen_count),
            });
            return feature;
          });
          console.debug(`Adding ${features.length} features from ${url}`);
          this.addFeatures(features);
          if (success) success(features);
        })
        .catch(failure);
    };
    super({loader: load, strategy: all});
  }
}
```

### occurrenceID addition to ParquetSource
```typescript
// frontend/src/parquet.ts — modify existing columns array
const columns = [
  'ecdysis_id',
  'occurrenceID',    // ← add this line
  'longitude',
  'latitude',
  'year',
  'month',
  'scientificName',
  'recordedBy',
  'fieldNumber',
  'genus',
  'family',
];

// In the flatMap — add occurrenceID to setProperties:
feature.setProperties({
  occurrenceID: obj.occurrenceID,   // ← add this line
  year: Number(obj.year),
  month: Number(obj.month),
  // ... rest unchanged
});
```

### sampleDotStyle (complete implementation)
```typescript
// frontend/src/style.ts — add after RECENCY_COLORS

export const SAMPLE_RECENCY_COLORS = {
  fresh:    '#1abc9c',  // teal — within 6 weeks
  thisYear: '#3498db',  // blue — this year, older than 6 weeks
  older:    '#7f8c8d',  // slate — before this year (reuses existing older-gray)
} as const;

const sampleStyleCache = new Map<string, Style>();

export function sampleDotStyle(feature: FeatureLike): Style {
  const date = feature.get('date') as string;
  // Parse ISO datetime string (e.g. '2023-04-04 15:32:38-07:00')
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const tier = recencyTier(year, month);

  if (sampleStyleCache.has(tier)) return sampleStyleCache.get(tier)!;

  const style = new Style({
    image: new Circle({
      radius: 5,   // fixed; distinct from single-specimen cluster radius of 4
      fill: new Fill({ color: SAMPLE_RECENCY_COLORS[tier] }),
      stroke: new Stroke({ color: '#ffffff', width: 1 }),
    }),
  });
  sampleStyleCache.set(tier, style);
  return style;
}
```

### build-data.sh links.parquet copy (graceful)
```bash
# Add after the "Done: samples.parquet copied" line in scripts/build-data.sh
cp "$REPO_ROOT/data/links/links.parquet" "$REPO_ROOT/frontend/src/assets/links.parquet" \
  || echo "links.parquet not found, skipping (pipeline not yet run)"
echo "--- Done: links.parquet step complete ---"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A — this is new code | Follow established ParquetSource / clusterStyle patterns | Phase 13 | No migration needed |

**No deprecated patterns relevant to this phase.** hyparquet 1.23.3, OL 10.7.0, and temporal-polyfill 0.2.5 are current installed versions — no upgrades needed.

---

## Open Questions

1. **Vite asset bundling for links.parquet**
   - What we know: Vite bundles `src/assets/` files only when referenced via `?url` import; that import is deferred to Phase 15
   - What's unclear: Phase 13's success criterion says "present after `npm run build`" — does this mean in `dist/` or just in `src/assets/`?
   - Recommendation: Interpret as "present in `frontend/src/assets/`" for Phase 13 (the `build-data.sh` copy succeeds without error). The `dist/` presence is Phase 15's concern when the import is added.

2. **recencyTier visibility to SampleParquetSource**
   - What we know: `recencyTier()` is currently a non-exported module-private function in `style.ts`
   - What's unclear: `sampleDotStyle` will be in the same file (`style.ts`), so no visibility issue — it can call `recencyTier()` directly
   - Recommendation: No change needed; add `sampleDotStyle` to `style.ts` alongside `clusterStyle`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None for frontend TypeScript — no test runner configured |
| Config file | No jest.config, vitest.config, or similar detected |
| Quick run command | `cd frontend && npm run build` (TypeScript compile + Vite build) |
| Full suite command | `cd frontend && npm run build` |

The frontend has no automated unit test suite. The `nyquist_validation` check for this phase is build + manual browser console verification.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-03 (partial) | `SampleParquetSource` loads rows from `samples.parquet` without error | smoke (browser console) | `cd frontend && npm run build` (compile check) | ❌ manual verify |
| LINK-05 (prereq) | Specimen OL features carry `occurrenceID` property (UUID string) | smoke (browser console) | `cd frontend && npm run build` (compile check) | ❌ manual verify |
| N/A | `sampleDotStyle` defined and exported from `style.ts` | compile | `cd frontend && npm run build` | ❌ Wave 0 |
| N/A | `links.parquet` present in `frontend/src/assets/` after `build-data.sh` | shell | `test -f frontend/src/assets/links.parquet` | ❌ manual (requires pipeline run) |

### Sampling Rate
- **Per task commit:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` (TypeScript compile gate)
- **Per wave merge:** same
- **Phase gate:** Build green + browser console verification per success criteria before `/gsd:verify-work`

### Wave 0 Gaps
- No test files needed — this phase has no automated test infrastructure and does not require new test files
- TypeScript compilation (`npm run build`) is the primary automated correctness check
- Manual browser console verification is required for runtime behavior (feature properties, parquet loading)

*(Note: frontend has no vitest/jest setup. Compile-time correctness is the automated gate; runtime correctness requires browser.)*

---

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `frontend/src/parquet.ts` — exact VectorSource subclass pattern
- Direct file inspection: `frontend/src/style.ts` — recencyTier, RECENCY_COLORS, clusterStyle, styleCache patterns
- Direct file inspection: `frontend/src/bee-map.ts` — asset URL import pattern, specimenSource/clusterSource wiring
- Direct file inspection: `scripts/build-data.sh` — existing cp pattern, set -euo pipefail context
- Direct parquet inspection: `data/samples.parquet` schema + first rows (via `uv run python`)
- Direct parquet inspection: `data/ecdysis.parquet` schema confirming `occurrenceID` column presence
- Direct directory listing: `data/links/` confirming `links.parquet` does not yet exist
- `frontend/package.json` — confirmed hyparquet ^1.23.3, ol ^10.7.0, temporal-polyfill ^0.2.5

### Secondary (MEDIUM confidence)
- None needed — all critical facts verifiable from local source files

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — patterns read directly from existing source files
- Pitfalls: HIGH — BigInt and date parsing verified against actual parquet data; build pipeline verified against actual script
- Test validation: HIGH — no test runner confirmed by glob search of frontend directory

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable libraries, internal codebase — long validity)
