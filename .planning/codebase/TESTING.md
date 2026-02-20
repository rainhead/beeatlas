# Testing Patterns

**Analysis Date:** 2026-02-18

## Test Framework

**Runner:** None detected

No test runner is configured. Neither the root `package.json` nor `frontend/package.json` contains a `test` script. No `jest.config.*`, `vitest.config.*`, or `pytest.ini` / `pyproject.toml` `[tool.pytest]` section was found. The Python `pyproject.toml` at `data/pyproject.toml` has no test dependencies listed.

**Assertion Library:** None

**Run Commands:**
```bash
# No test commands configured
```

## Test File Organization

**Location:** No test files exist in this codebase.

A search for `*.test.*` and `*.spec.*` files returned no results (excluding `node_modules` and `.venv`).

## Test Structure

No test structure to document. The codebase has no automated tests.

## Mocking

**Framework:** None

## Fixtures and Factories

**Test Data:** None

## Coverage

**Requirements:** None enforced

No coverage tooling is configured.

## Test Types

**Unit Tests:** Not present

**Integration Tests:** Not present

**E2E Tests:** Not present

## Manual Verification Patterns

While no automated tests exist, the codebase uses the following manual verification approaches:

**Python data scripts:**
- Progress output via `print()` statements to verify row counts and file sizes
- `response.raise_for_status()` used consistently for HTTP error checking (`data/scripts/download.py`, `data/ecdysis/download.py`, `data/scripts/fetch_inat_links.py`)
- DuckDB ad-hoc verification documented in `data/CLAUDE.md`:
  ```bash
  duckdb test.db < script.sql
  duckdb test.db -c "SELECT COUNT(*) FROM table_name"
  rm test.db  # Clean up test database
  ```

**Debug tooling:**
- `import pdb; pdb.set_trace()` left inline in `data/ecdysis/occurrences.py` line 95 (indicates manual step-through debugging rather than test-driven development)

## Recommendations for Adding Tests

If tests are added, the existing tech stack supports:

**Frontend (TypeScript):**
- Add `vitest` as dev dependency (compatible with Vite build setup)
- Config: `frontend/vitest.config.ts`
- Test files: co-located as `frontend/src/*.test.ts`
- The `ParquetSource` class in `frontend/src/parquet.ts` and `clusterStyle` function in `frontend/src/style.ts` are pure enough to unit test

**Data pipeline (Python):**
- Add `pytest` as dev dependency in `data/pyproject.toml`
- Pure transformation functions (`apply_transformations`, `read_occurrences`, `samples_2025`, `extract_observation_id`) are candidates for unit tests
- Test data fixtures: small TSV/CSV snippets representing each dtype specification

---

*Testing analysis: 2026-02-18*
