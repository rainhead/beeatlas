# Testing Patterns

*Updated: 2026-04-07 (from intel refresh)*

## Test Frameworks

**Frontend:** Vitest, configured inline in `frontend/vite.config.ts`
```bash
cd frontend && npm test
```

**Data pipeline:** pytest
```bash
cd data && uv run pytest
```

## Frontend Tests (Vitest)

61 tests across 4 files in `frontend/src/tests/`:

- **url-state.test.ts** — `buildParams`/`parseParams` round-trips for all fields individually, combined, and edge cases (20 tests)
- **filter.test.ts** — `buildFilterSQL` for all filter fields, combined clauses, empty filter, SQL quote escaping (13 tests)
- **bee-specimen-detail.test.ts** — Lit component render test; sample fixture mounts into shadow DOM (happy-dom environment)
- **arch.test.ts** — Source analysis tests using `readFileSync`; verifies `bee-atlas` does not import OpenLayers (architectural invariant)

**Environment:** happy-dom (avoids DuckDB WASM / OL canvas incompatibility)

**Import style:** Explicit `import { test, expect } from 'vitest'` in all test files (avoids type conflicts with `"types": ["vite/client"]`)

## Data Pipeline Tests (pytest)

13 tests in `data/tests/`:

- Export schema validation — verifies parquet column schemas from `export.py`
- Transform unit tests — pure function coverage for pipeline transforms
- Fixture pattern: programmatic DuckDB fixture (not mocked — hits real DuckDB)

## What Is Not Tested

- dlt pipeline write-path (resource tests deferred — only pure functions and export integration are covered)
- OL map rendering (canvas setup incompatible with test environments)
- Lambda handler (stub only)
