<!-- refreshed: 2026-05-13 -->
# Architecture

**Analysis Date:** 2026-05-13

## System Overview

The Washington Bee Atlas is a static-hosted interactive map of bee occurrences in Washington State, built on a three-layer pipeline:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       Frontend (Static SPA)                              │
│  `_pages/`, `src/entries/`, Eleventy + Vite bundler                      │
├──────────────┬──────────────┬───────────────┬──────────────┬────────────┤
│  <bee-atlas> │  <bee-map>   │ <bee-sidebar> │ <bee-table>  │ <bee-*>    │
│  Coordinator │  Map Render  │  Presenter    │  Presenter   │ Components │
│  `bee-atlas` │  `bee-map`   │  `bee-sidebar`│  `bee-table` │ `bee-*.ts` │
└──────┬───────┴──────┬───────┴───────┬───────┴──────┬───────┴────────────┘
       │              │               │              │
       └──────────────┴───────────────┴──────────────┘
                      │
                      ▼ CloudFront/S3
┌─────────────────────────────────────────────────────────────────────────┐
│                  Data Files (Public CDN)                                 │
│         parquet (indexed), GeoJSON, SVG maps, Atom feeds                 │
│         `public/data/`, CloudFront → beeatlas.net/data/                 │
└────────────────────────┬────────────────────────────────────────────────┘
                         │
                         ▼ Build-time generation
┌─────────────────────────────────────────────────────────────────────────┐
│                 Data Pipeline (Python + dbt)                             │
│         `data/` — orchestrates ECDYSIS, iNat, WABA, geography            │
│         Pipeline layers: staging → intermediate → marts                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **bee-atlas** | App root, state ownership, filter coordination, URL state persistence | `src/bee-atlas.ts` |
| **bee-map** | Mapbox GL JS rendering, occurrence dots, boundary regions, click events | `src/bee-map.ts` |
| **bee-sidebar** | Occurrence detail display (pure presenter) | `src/bee-sidebar.ts` |
| **bee-table** | Paginated table view with sorting, CSV export | `src/bee-table.ts` |
| **bee-filter-panel** | Filter UI, taxon/date/region/elevation dropdowns | `src/bee-filter-panel.ts` |
| **bee-header** | Top navigation, view mode toggle (map/table) | `src/bee-header.ts` |
| **bee-species-page** | Species browse (secondary route) | `src/species/bee-species-page.ts` |
| **sqlite.ts** | wa-sqlite initialization, parquet→SQLite load, exec serialization | `src/sqlite.ts` |
| **filter.ts** | Filter query engine, CSV export, SQL builders | `src/filter.ts` |
| **features.ts** | GeoJSON construction from SQLite, summary stats | `src/features.ts` |
| **url-state.ts** | Deep-link URL parsing/building, state serialization | `src/url-state.ts` |

## Pattern Overview

**Overall:** Coordinator + Presenter pattern (Lit Web Components)

**Key Characteristics:**
- **State ownership**: `<bee-atlas>` exclusively owns all reactive state (`@state()` decorators)
- **Prop-down, events-up**: `<bee-map>`, `<bee-sidebar>`, `<bee-table>` receive state as `@property()` inputs and emit `CustomEvent` back to coordinator
- **No shared module state**: No module-level mutable singletons; all state flows through `<bee-atlas>`
- **Async-safe filter queries**: Generation counter guards prevent stale filter results from overwriting current state
- **URL as state persistence**: Every filter/view/selection change persists to `window.history` with debounced pushState for map pan

## Layers

**Frontend Presentation (Vite-bundled):**
- Purpose: Interactive map and species browser
- Location: `src/`, `_pages/`
- Contains: Lit components, TypeScript SPA, Eleventy templates
- Depends on: wa-sqlite (in-memory DB), Mapbox GL JS, Lit, GeoJSON
- Used by: Browser/CloudFront consumers

**Backend Data Pipeline (Python + dbt):**
- Purpose: Ingest occurrence records from ECDYSIS, iNaturalist, WABA; deduplicate; enrich; export
- Location: `data/`
- Contains: ETL scripts, dbt models (3 layers), DuckDB
- Depends on: DuckDB, Parquet, SQL
- Used by: Build process; outputs written to `public/data/` for CloudFront distribution

**Static Build (Eleventy + Vite):**
- Purpose: Render templates, bundle TypeScript, output `_site/`
- Location: `eleventy.config.js`, `vite.config.ts`, Vite plugin
- Contains: Eleventy 3.x config, rename-and-build mechanism
- Depends on: Eleventy, Vite, Eleventy-plugin-Vite
- Used by: CI/CD (GitHub Actions) → CloudFront upload

**Data Storage Layer (Frontend):**
- Purpose: Query indexed occurrence records in browser
- Location: `src/sqlite.ts`, parquet files at `public/data/`
- Contains: wa-sqlite WASM instance, hyparquet parquet parser, in-memory occurrence table
- Depends on: wa-sqlite, hyparquet
- Used by: filter.ts, features.ts queries

## Data Flow

### Primary Request Path: Map View with Filtering

1. **Page load** (`_pages/index.html`) — Vite entry point script imports `src/bee-atlas.ts`
2. **Initialize app state** (`src/bee-atlas.ts:211-276`) — Parse URL params, restore filter/view/selection state
3. **Load parquet → SQLite** (`src/bee-atlas.ts:279-291`, `src/sqlite.ts:63-120`) — Fetch occurrences parquet, deserialize via hyparquet, load into wa-sqlite in-memory table
4. **Run async filter query** (`src/bee-atlas.ts:308-315`, `src/filter.ts`) — Query SQLite with current filter state (taxon, date, region, elevation), return visible occurrence IDs
5. **Load GeoJSON** (`src/bee-map.ts`) — Construct FeatureCollection from SQLite, attach occurrence properties
6. **Render Mapbox layer** (`src/bee-map.ts`) — Add occurrence points, style by recency tier, attach click handlers
7. **User filters** → `_onFilterChanged` event → increment `_filterQueryGeneration`, run new async query
8. **Guard against stale results** — Discard query results if generation counter has advanced (prevents flicker)
9. **Render sidebar on click** — User clicks dot → `_onOccurrenceClick` → `<bee-sidebar>` displays matched records
10. **Persist to URL** → `buildParams` → `window.history.pushState` (debounced for map pan)

**State Management:**
- `_filterState` changes trigger async `_runFilterQuery()` → `_visibleIds` update → `<bee-map>` sees new props → re-renders dots
- `_selectedOccIds` changes → `<bee-sidebar>` re-renders with matched rows
- Map pan events update `_currentView` → URL state, debounced to avoid excessive history entries
- Browser back/forward → `_onPopState` → restore all state from URL, re-run queries

### Secondary Flow: Species Page

1. **Route to /species/** → `_pages/species.njk` rendered by Eleventy
2. **Build-time data injection** → `_data/species.js` provides taxon tree and photos via Eleventy.js API
3. **Vite entry** (`src/entries/species.ts`) imports species components
4. **User clicks species card** → `<bee-species-card>` emits event with `scientificName`
5. **SPA deep-link** → `<bee-species-page>` calls `buildSpaTaxonLink()` → routes back to `/` with taxon filter params

### Query Flow (SQLite + wa-sqlite)

```
filter.ts:buildFilterSQL() → constructs WHERE clause
                           → queryVisibleIds() → sqlite3.exec(db, sql)
                           → results parsed into visible ID set
                           → _visibleIds property updated
                           → bee-map.updated() sees new visibleIds
                           → mapbox layer setData() called with filtered features
```

## Key Abstractions

**FilterState:**
- Purpose: Captures all user-selectable filter dimensions (taxon, date range, month set, county/ecoregion, elevation)
- Examples: `src/filter.ts:11-22`, `src/bee-atlas.ts:19-30`
- Pattern: Immutable; `<bee-atlas>` replaces entire object on change to trigger Lit re-render

**OccurrenceRow:**
- Purpose: Flattened row schema for a single occurrence record (specimen or sample observation)
- Examples: `src/filter.ts:24-54`, `src/sqlite.ts:66-100` (table schema)
- Pattern: Struct-like; loaded from SQLite; contains ID discriminators (`ecdysis_id` vs `observation_id`)

**SelectionState:**
- Purpose: Tracks user-selected occurrences for sidebar display (either specific IDs or cluster radius)
- Examples: `src/url-state.ts:24-26`, `src/bee-atlas.ts:42-43`
- Pattern: Union type; `'ids'` for direct selection, `'cluster'` for radius-based click

**ViewState:**
- Purpose: Mapbox camera state (lon, lat, zoom)
- Examples: `src/url-state.ts:18-22`
- Pattern: Immutable; serialized in URL and restored from history

## Entry Points

**`src/bee-atlas.ts`:**
- Location: Main SPA coordinator
- Triggers: `<script type="module" src="./src/bee-atlas.ts"></script>` in `_pages/index.html`
- Responsibilities: Root state container, filter/view orchestration, event coordination, URL persistence

**`src/entries/bee-header.ts`:**
- Location: Vite rollup entry for header component registration
- Triggers: Imported by Eleventy-rendered pages (e.g., base layout)
- Responsibilities: Side-effect import to register `<bee-header>` custom element

**`src/entries/species.ts`:**
- Location: Vite rollup entry for species page
- Triggers: `<script type="module" src="/src/entries/species.ts"></script>` in `_pages/species.njk`
- Responsibilities: Register species-related components; isolate species CSS to species chunk

**`_pages/index.html`:**
- Location: SPA entry point (plain HTML template)
- Triggers: Eleventy processes as template (not passthrough) so Vite runs and rewrites script tags
- Responsibilities: Render `<bee-atlas>` root element; include CSS and JS entries

**`_pages/species.njk`:**
- Location: Species page template
- Triggers: Eleventy renders with `_data/species.js` context
- Responsibilities: Render species tree, cards, filter UI; inject build-time data

## Architectural Constraints

- **Threading:** Single-threaded event loop (browser). SQLite exec calls serialized by `_serializedExec()` to prevent concurrent Asyncify corruption.
- **Global state:** SQLite database instance (`_dbPromise`) is module-level singleton in `src/sqlite.ts`; accessed via `getDB()`. No other shared mutable state.
- **Circular imports:** None detected; components import from `filter.ts`, `features.ts`, `sqlite.ts` (leaves of dependency tree).
- **Component boundary:** `<bee-map>`, `<bee-sidebar>`, `<bee-table>` are pure presenters; all logic lives in `<bee-atlas>` or utility functions. ID format is load-bearing: `ecdysis:<n>` vs `inat:<n>` disambiguates source.
- **Static hosting:** No server runtime; all queries run in-browser SQLite or via S3 CDN (parquet files).
- **URL state contract:** Taxon deep-links require BOTH `taxon` and `taxonRank` params (see `src/url-state.ts` comment LINK-04, line 1).

## Anti-Patterns

### Stale Filter Results Flash

**What happens:** Async `queryVisibleIds()` completes after user changes filter twice. Old query result overwrites new state, causing brief flicker of wrong dots.

**Why it's wrong:** User expects immediate feedback; stale state is a UX regression.

**Do this instead:** Use generation counter (`_filterQueryGeneration`) to discard results if counter advanced since query started. Implemented in `src/bee-atlas.ts:58-65, 308-315`.

### Style Cache Invalidation

**What happens:** Mapbox GL style functions cache expensive computations (e.g., color tier assignments). Cache persists when filter changes, showing stale colors until cache is manually cleared.

**Why it's wrong:** Filter state changes require style re-evaluation; cache becomes invisible source of truth.

**Do this instead:** Bypass cache when `_filterState` is active or `_selectedOccIds` is non-empty. Check dynamic state before cache lookup in `src/bee-map.ts` style builders.

### Module-Level Mutable State Outside SQLite

**What happens:** Filter options cached in module-level variables; user loads page A, filters update the cache, user navigates to page B, old cache pollutes new context.

**Why it's wrong:** Breaks multi-page/multi-tab scenarios; state becomes implicit and brittle.

**Do this instead:** Always reload filter options from SQLite on app start or on demand. See `src/bee-atlas.ts:317-415` for proper per-instance loading.

## Error Handling

**Strategy:** Top-level error catch in `firstUpdated()` and async pipeline steps.

**Patterns:**
- SQLite load failure → set `_error` → overlay error message on app (line 289-290)
- Filter query exception → log to console, leave `_visibleIds` unchanged (line 464-466)
- Parquet parse failure → caught by hyparquet, bubbles as DuckDB error through `loadOccurrencesTable()`
- Missing data files → HTTP 404 → caught as fetch error → propagates as SQLite init failure

## Cross-Cutting Concerns

**Logging:** `console.debug()` for benchmarks and SQL trace; `console.error()` for failures. No production logging framework (static hosting).

**Validation:** Type-safe throughout via TypeScript strict mode. SQLite queries use string templates (safe due to static filter values, not user input). ID format validation via regex (`/^\d+$/`) at deserialization boundaries (lines 815, 825).

**Authentication:** None (static public data). iNaturalist links are informational only, not API-authed.

**Caching:** Parquet fetched once via CDN (immutable naming), cached by browser. SQLite in-memory, never re-fetched. URL history used as browser cache for filter state.

---

*Architecture analysis: 2026-05-13*
