# Testing Patterns

**Analysis Date:** 2026-05-13

## Test Frameworks

**Frontend (TypeScript):**
- **Runner:** Vitest 4.1.2 with happy-dom environment
- **Config:** `vite.config.ts` (lines 17–23) — inline test configuration
- **Commands:**
  ```bash
  npm test                # Run all tests (Vitest run mode)
  npm test -- --watch    # Watch mode (development)
  npm test -- --coverage # Coverage report
  ```

**Backend (Python):**
- **Runner:** pytest 9.0.2+ (configured in `data/pyproject.toml`)
- **Config:** `data/pyproject.toml` (lines 22–23) — `testpaths = ["tests"]`
- **Commands:**
  ```bash
  cd data && uv run pytest                    # Run all tests
  cd data && uv run pytest -x                 # Exit on first failure
  cd data && uv run pytest --tb=short -v      # Verbose with short tracebacks
  ```

## Test File Organization

**Frontend (TypeScript):**
- **Location:** `src/tests/` (separate directory) + `src/species/tests/` (species-specific)
- **Naming:** `{module}.test.ts` pattern
- **Count:** 23 test files with 335 tests (4 skipped)
- **Test files:**
  ```
  src/tests/
    ├── arch.test.ts                      # Architecture constraints (ARCH-04, PAGE-06, PAGE-08)
    ├── bee-atlas.test.ts                 # Main app controller
    ├── bee-header.test.ts                # Header component (HDR)
    ├── bee-filter-panel.test.ts          # Filter panel
    ├── bee-filter-toolbar.test.ts        # Filter toolbar
    ├── bee-sidebar.test.ts               # Sidebar panel
    ├── bee-species-card.test.ts          # Species card (D-05: light DOM)
    ├── bee-species-filter.test.ts        # Species-specific filter
    ├── bee-species-page.test.ts          # Species page coordinator
    ├── bee-table.test.ts                 # Table view component
    ├── bee-taxon-nav.test.ts             # Taxon hierarchy navigation
    ├── build-output.test.ts              # Build artifact validation (PAGE-07, PAGE-09)
    ├── data-photos.test.ts               # Photo data loading
    ├── data-species.test.ts              # Species data loading
    ├── filter.test.ts                    # Filter SQL generation
    ├── page-scaffold.test.ts             # Page rendering scaffold
    ├── seasonality-viz.test.ts           # Seasonality visualization
    ├── seed-species-photos.test.ts       # Photo seeding
    ├── spa-link.test.ts                  # SPA link handling
    ├── species-url-state.test.ts         # URL state for species pages
    ├── url-state.test.ts                 # URL state management
    ├── validate-bundle-size.test.ts      # Bundle size gate (PERF-01)
    ├── validate-species.test.ts          # Species photo validation (PHOTO-01..PHOTO-05)
  src/species/tests/
    └── a11y.test.ts                      # Accessibility tests
  ```

**Backend (Python):**
- **Location:** `data/tests/`
- **Naming:** `test_{module_name}.py` pattern
- **Count:** 17 test files (scope: checklist, canonical names, exports, feeds, species maps, taxon resolution, dbt validation)
- **Test files:**
  ```
  data/tests/
    ├── conftest.py                       # Shared session-scoped DuckDB fixture + seed data
    ├── fixtures.py                       # WKT geometry constants (WA state, Chelan, North Cascades)
    ├── test_canonical_name.py            # D-04 canonicalization algorithm (5 steps)
    ├── test_checklist_pipeline.py        # CHECK-02/03: Checklist TSV loading
    ├── test_checklist_reconcile.py       # Canonical name reconciliation
    ├── test_config.py                    # Configuration loading
    ├── test_dbt_diff.py                  # Phase 84: DIFF-01/02/03 parquet + GeoJSON comparison
    ├── test_dbt_scaffold.py              # Phase 83: dbt model scaffold validation
    ├── test_export.py                    # Export pipeline (parquet + CSV + JSON output)
    ├── test_feeds.py                     # iNat feeds (recent identifications)
    ├── test_resolve_taxon_ids.py         # Taxon ID resolution via iNat API
    ├── test_species_export.py            # Species.json export
    ├── test_species_maps.py              # GeoJSON species maps + bbox clipping (MAP-04)
    ├── test_taxon_lineage.py             # Taxonomic hierarchy (family, genus, etc.)
    ├── test_taxon_lineage_extended.py    # Extended lineage with subfamily, tribe
    └── test_transforms.py                # Data transformation utilities
  ```

## Test Structure and Patterns

**Frontend (Vitest):**

```typescript
// Typical test file structure
import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';

// Mock heavy/side-effect modules
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

// Setup/teardown if needed (frozen time, etc.)
beforeAll(() => { 
  vi.useFakeTimers(); 
  vi.setSystemTime(new Date('2026-01-15')); 
});
afterAll(() => { vi.useRealTimers(); });

// Test suites
describe('filter operations', () => {
  test('empty filter returns 1 = 1', () => {
    const { occurrenceWhere } = buildFilterSQL(emptyFilter());
    expect(occurrenceWhere).toBe('1 = 1');
  });

  test('family filter adds WHERE clause', () => {
    const f = { ...emptyFilter(), taxonName: 'Apidae', taxonRank: 'family' };
    const { occurrenceWhere } = buildFilterSQL(f);
    expect(occurrenceWhere).toBe("family = 'Apidae'");
  });
});
```

**Backend (pytest):**

```python
# Typical test file structure
import pytest
import duckdb

# Fixtures (session-scoped in conftest.py)
@pytest.fixture(scope="session")
def fixture_db(tmp_path_factory):
    """Create a test DuckDB with all schemas and seed data."""
    db_path = str(tmp_path_factory.mktemp("db") / "test.duckdb")
    con = duckdb.connect(db_path)
    # Setup code...
    con.close()
    return db_path

# Test with parametrization or setup
def test_canonicalize_strips_authority(monkeypatch):
    """Pure function test — no DB dependency."""
    assert canonicalize("Andrena fulva (Müller, 1766)") == "andrena fulva"

# Test with fixture
def test_load_checklist_creates_species_table(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [row[0] for row in con.execute("...").fetchall()]
    finally:
        con.close()
    assert cols == [expected list]
```

## Mocking Patterns

**Frontend:**

```typescript
// Mock entire modules with vi.mock()
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

// Spy on function calls
vi.spyOn(someModule, 'someFunction').mockImplementation(() => ...);

// Fake timers for deterministic date/time tests
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-01-15'));
vi.useRealTimers(); // cleanup
```

**What to mock:**
- Heavy libraries: `sqlite.ts`, `features.ts` (parquet loading, DB calls)
- External APIs: mapbox-gl initialization
- Side effects: file I/O, timers

**What NOT to mock:**
- Filter logic (`filter.ts`)
- URL state management (`url-state.ts`)
- Pure functions
- Lit component internals (test via DOM queries)

**Backend:**

```python
# Use pytest fixtures for test isolation
@pytest.fixture
def fixture_con(fixture_db):
    """Return a connection to the fixture DB."""
    con = duckdb.connect(fixture_db, read_only=False)
    con.execute("LOAD spatial;")
    yield con
    con.close()

# Monkeypatch for module-level constants (timing/pacing)
def _zero_inat_pacing(monkeypatch):
    """Zero iNat retry/pacing so tests don't real-time-sleep."""
    try:
        import inaturalist_pipeline
    except ImportError:
        return
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0, raising=False)
```

## Fixtures and Factories

**Frontend:**

```typescript
// Helper factory (not a formal fixture pattern)
function emptyFilter(): FilterState {
  return {
    taxonName: null,
    taxonRank: null,
    yearFrom: null,
    yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
    elevMin: null,
    elevMax: null,
  };
}
```

**Backend:**

Test data lives in `conftest.py`:
- **Session-scoped:** `fixture_db`, `fixture_con` — shared DuckDB with 100+ seed rows
- **Function-scoped:** `export_dir`, `checklist_db` — fresh temporary directories per test
- **Geometry constants:** `WA_STATE_WKT`, `CHELAN_WKT`, `NORTH_CASCADES_WKT` (in `fixtures.py`)

**Seed data strategy (conftest.py, lines 156–527):**
- Create minimal schemas matching production tables
- Seed with representative test data:
  - Ecdysis specimen (catalog_number='WSDA_5594569')
  - iNat observations with observation fields
  - WABA observations with cross-references
  - Checklist entries (phase 76 disagreement fixture)
  - Taxon lineage rows for bridging
  - Phase 77 coverage fixture (20 distinct canonical_names, 19 resolvable)
  - Phase 78 bbox clipping test data (out-of-bounds point)

**Isolation:**
- Each test gets a fresh connection to the session-scoped DB
- Tests run in parallel where independent (pytest's default)
- Fixtures use `monkeypatch` to redirect file paths to `tmp_path` (no repo mutations)

## Coverage

**Frontend:**
- Target: Not explicitly enforced in CI
- Current state: 335 tests across 23 files (strong coverage of components, filters, URL state)
- Notable gaps: E2E browser testing (not in scope), performance benchmarks

**Backend:**
- Target: Not explicitly enforced
- Current state: 17 test files covering pipeline stages
- Coverage focus: Data transformation (canonicalize, exports, species maps) and pipeline contracts (schema, row counts)

**Gaps identified:**
- `src/tests/build-output.test.ts` — 4 tests SKIPPED (requires full build via `npm run build`)
  - Runs full build pipeline (slow, only in CI or manual builds)
  - Validates PAGE-07 + PAGE-09 contracts
- Integration tests (browser) — Not implemented (would use Playwright or Puppeteer)
- Performance regression tests — Not systematic (manual measurement via `npm run measure-lcp`)

## Build-Time Validation Gates

**Order in `npm run build` (load-bearing):**

1. **validate-schema** (`scripts/validate-schema.mjs`)
   - **Contract:** DATA-01 — Parquet files have required columns
   - **Inputs:** `public/data/occurrences.parquet`, `public/data/species.parquet`
   - **Mode:**
     - Local: Read from `public/data/` if present (dev with local pipeline)
     - CloudFront: Fetch via Range requests from production CDN (CI without local data)
   - **Behavior:** Validates column names match frontend expectations; skips if files not found (graceful degradation)
   - **Failure:** Hard fail with `process.exit(1)` if columns missing

2. **validate-species** (`scripts/validate-species.mjs`)
   - **Contract:** PHOTO-01 through PHOTO-05 (license + attribution)
   - **Input:** `content/species-photos.toml`
   - **Checks:**
     - License field present; must be one of: `cc0`, `cc-by`, `cc-by-nc`, `cc-by-sa`, `cc-by-nc-sa`
     - Attribution required for non-CC0 photos
     - Unknown species names are warnings, not errors
     - When `species.json` absent, cross-reference check skipped (mirrors validate-schema graceful degradation)
   - **Exported function:** `validateSpeciesPhotos()` — callable from Vitest (no process.exit side effects)
   - **Failure:** Exit 1 on errors; exit 0 on warnings-only or clean

3. **typecheck** (`npm run typecheck` → `tsc --noEmit`)
   - **Contract:** All TypeScript compiles with strict settings
   - **Scope:** `src/` (tsconfig.json include)
   - **Failure:** Hard fail if any type errors

4. **eleventy** (static site build)
   - **Input:** `src/` + `content/` + `public/data/`
   - **Output:** `_site/` directory with HTML + Vite-bundled assets
   - **Failure:** Hard fail on build errors

5. **validate-bundle-size** (`scripts/validate-bundle-size.mjs`)
   - **Contract:** PERF-01 — Species-page Vite chunk ≤100 KB gzipped
   - **Input:** `_site/assets/species/*` or `_site/assets/species-*`
   - **Checks:**
     - Locates species chunk files (Vite output)
     - Measures raw + gzipped sizes
     - Reports headroom against budget
   - **Failure:** Hard fail if chunk exceeds budget

**Observation:** Order is critical — validate-schema must run before eleventy to catch stale data cache; validate-bundle-size must run after eleventy to measure actual output.

## Test Skipping and Conditional Execution

**Frontend:**

```typescript
// build-output.test.ts — skipped in watch mode (requires full build)
// - Runs when: npm test (Vitest run mode, full build via test)
// - Skips when: npm test -- --watch
```

**Backend:**

```python
# pytest skipif marker (dbt diff tests)
@_SANDBOX_GUARD
def test_occurrences_row_count_within_tolerance():
    """Skipped unless `bash data/dbt/run.sh build` has been run to produce sandbox outputs."""
    pass

# Defined as:
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first..."
)
```

## Async Testing

**Frontend (happy-dom):**

```typescript
test('clicking inactive Table button dispatches view-changed', async () => {
  await import('../bee-header.ts');  // Dynamic import (mock-safe)
  const el = document.createElement('bee-header') as any;
  el.viewMode = 'map';
  document.body.appendChild(el);
  await el.updateComplete;  // Wait for Lit render
  
  // Test event emission
  let receivedEvent: CustomEvent | null = null;
  el.addEventListener('view-changed', (e: CustomEvent) => {
    receivedEvent = e;
  });
  
  const shadow = el.shadowRoot!;
  const tableBtn = shadow.querySelector('button[aria-label="Table view"]');
  tableBtn!.click();
  
  expect(receivedEvent!.detail).toBe('table');
});
```

**Backend (async fixtures):**

```python
# Async pipelines use pytest-asyncio or blocking calls in fixtures
@pytest.fixture(scope="session")
def fixture_con(fixture_db):
    """Connection stays open for session lifetime (blocking)."""
    con = duckdb.connect(fixture_db, read_only=False)
    con.execute("LOAD spatial;")
    yield con
    con.close()
```

## Common Test Types

**Unit Tests (majority):**
- Filter logic: `filter.test.ts` (pure SQL generation)
- Canonicalization: `test_canonical_name.py` (pure string transformation)
- URL state: `url-state.test.ts` (URL ↔ object serialization)

**Component Tests (frontend):**
- Properties: `bee-header.test.ts` (HDR — element properties declared)
- Events: `bee-header.test.ts` (view-changed emission)
- Rendering: `bee-species-card.test.ts` (light DOM preservation for SSR)

**Contract Tests (validation gates):**
- Parquet schema: `validate-schema.mjs` (DATA-01)
- Photo manifest: `validate-species.mjs` (PHOTO-01..PHOTO-05)
- Bundle size: `validate-bundle-size.mjs` (PERF-01)
- Architecture: `arch.test.ts` (ARCH-04, PAGE-06, PAGE-08 — forbidden imports)

**Pipeline Tests (backend):**
- Schema verification: `test_checklist_pipeline.py` (CHECK-02/03)
- Row count parity: `test_dbt_diff.py` (DIFF-01)
- Spatial accuracy: `test_species_maps.py` (bbox clipping MAP-04)

## Architecture Test (arch.test.ts)

**Purpose:** Prevent forbidden imports in species pages (ARCH-04, PAGE-06, PAGE-08)

**What it enforces:**
- No `src/species/**.ts` file may import: `mapbox-gl`, `wa-sqlite`, `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts`
- Presenter files MUST NOT import the coordinator `bee-species-page.ts`
- Side-effect + dynamic imports both checked (Pitfall 3 mitigation)

**State:** RED (Phase 80 Wave 0) — `src/species/` directory does not exist yet (Plan 03 creates it)

**When tests will activate:** Plan 03 execution (POST v1.6 milestone)

---

*Testing analysis: 2026-05-13*
