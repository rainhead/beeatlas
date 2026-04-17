---
phase: 60-wa-sqlite-integration
plan: "02"
subsystem: frontend
tags: [sqlite, wa-sqlite, migration, sql-dialect, duckdb-removal]
dependency_graph:
  requires: [60-01]
  provides: [features.ts wa-sqlite, filter.ts wa-sqlite, bee-atlas.ts wa-sqlite]
  affects: [frontend/src/features.ts, frontend/src/filter.ts, frontend/src/bee-atlas.ts, frontend/src/tests/filter.test.ts, all 5 other test files]
tech_stack:
  added: []
  patterns: [sqlite3.exec callback row accumulation, explicit unknown[] type annotations for exec callbacks]
key_files:
  created: []
  modified:
    - frontend/src/features.ts
    - frontend/src/filter.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/filter.test.ts
    - frontend/src/tests/bee-atlas.test.ts
    - frontend/src/tests/bee-header.test.ts
    - frontend/src/tests/bee-filter-toolbar.test.ts
    - frontend/src/tests/bee-sidebar.test.ts
    - frontend/src/tests/bee-table.test.ts
decisions:
  - "Used explicit unknown[]/string[] type annotations on all exec callbacks to satisfy noImplicitAny (SQLiteAPI is typed as any via Factory return)"
  - "Used null checks + String() casts instead of ?? null for unknown-typed fields in _restoreSelectionSamples"
  - "Cast rows as unknown as SpecimenRow[] | SampleRow[] in queryTablePage return since sqlite exec builds Record<string,unknown>[]"
metrics:
  duration_seconds: 240
  completed_date: "2026-04-16"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 9
---

# Phase 60 Plan 02: Migrate caller files to wa-sqlite Summary

**One-liner:** features.ts, filter.ts, and bee-atlas.ts migrated from DuckDB (conn.query/Arrow .toArray()/.toJSON()) to wa-sqlite (sqlite3.exec callback); 5 DuckDB SQL dialect expressions rewritten to SQLite syntax; all duckdb.ts mocks removed from 6 test files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate features.ts and filter.ts to wa-sqlite | 33192d8 | features.ts, filter.ts, filter.test.ts, 5 other test files |
| 2 | Migrate bee-atlas.ts to wa-sqlite | b890b9f | bee-atlas.ts |

## Verification Results

- `npx tsc --noEmit`: exits 0 (clean)
- `npm test`: 165/165 tests pass across 7 test files
- `grep -r "from './duckdb.ts'" frontend/src/features.ts frontend/src/filter.ts frontend/src/bee-atlas.ts`: empty
- `grep -r "vi.mock('../duckdb.ts'" frontend/src/tests/`: empty (all removed)
- `grep -c "year(date::TIMESTAMP)" frontend/src/filter.ts`: 0
- `grep -c "month(date::TIMESTAMP)" frontend/src/filter.ts`: 0
- `grep "toArray()" frontend/src/features.ts frontend/src/filter.ts frontend/src/bee-atlas.ts`: empty
- `grep "conn.close()" frontend/src/features.ts frontend/src/filter.ts frontend/src/bee-atlas.ts`: empty

## SQL Dialect Rewrites Applied (D-01)

| Location | DuckDB | SQLite |
|----------|--------|--------|
| filter.ts buildFilterSQL yearFrom | `year(date::TIMESTAMP) >= N` | `CAST(strftime('%Y', date) AS INTEGER) >= N` |
| filter.ts buildFilterSQL yearTo | `year(date::TIMESTAMP) <= N` | `CAST(strftime('%Y', date) AS INTEGER) <= N` |
| filter.ts buildFilterSQL months | `month(date::TIMESTAMP) IN (...)` | `CAST(strftime('%m', date) AS INTEGER) IN (...)` |
| filter.ts queryAllFiltered | `strftime(date, '%Y-%m-%d') as date` | `strftime('%Y-%m-%d', date) as date` |
| filter.ts queryTablePage | `strftime(${col}, '%Y-%m-%d') as ${col}` | `strftime('%Y-%m-%d', ${col}) as ${col}` |

Also: `CAST(ecdysis_id AS VARCHAR)` → `CAST(ecdysis_id AS TEXT)` in bee-atlas.ts (SQLite uses TEXT not VARCHAR).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript implicit-any errors on all exec callback parameters**
- **Found during:** Task 1 (initial tsc run after writing features.ts and filter.ts)
- **Issue:** `SQLiteAPI` is typed as `ReturnType<typeof SQLite.Factory>` which returns `any`; TypeScript's noImplicitAny flag rejected untyped callback parameters in `sqlite3.exec(...)` calls
- **Fix:** Added explicit `(rowValues: unknown[], columnNames: string[])` type annotations to all exec callbacks in features.ts, filter.ts, and bee-atlas.ts
- **Files modified:** frontend/src/features.ts, frontend/src/filter.ts, frontend/src/bee-atlas.ts
- **Commit:** Fixed inline before per-task commit

**2. [Rule 1 - Bug] Type error on floralHost/inatHost/inatQualityGrade in _restoreSelectionSamples**
- **Found during:** Task 2 (tsc run after bee-atlas.ts edits)
- **Issue:** `obj` built via `Object.fromEntries(...)` is `Record<string, unknown>`; using `?? null` on `unknown` fields yields `{} | null` which is not assignable to `string | null`
- **Fix:** Changed `obj.floralHost ?? null` etc. to `obj.floralHost != null ? String(obj.floralHost) : null`
- **Files modified:** frontend/src/bee-atlas.ts
- **Commit:** Fixed inline before per-task commit

**3. [Rule 1 - Bug] queryTablePage return type mismatch**
- **Found during:** Task 1 (tsc run)
- **Issue:** `rows` accumulates as `Record<string, unknown>[]` but return type is `SpecimenRow[] | SampleRow[]`
- **Fix:** Cast return as `rows as unknown as SpecimenRow[] | SampleRow[]` — same data shape, just bypassing structural mismatch between generic Record and typed row interfaces
- **Files modified:** frontend/src/filter.ts
- **Commit:** Fixed inline before per-task commit

## Known Stubs

None. All three caller files are fully wired to sqlite.ts; no placeholders remain.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes introduced. SQL injection guards (column allowlist, string escaping) from original DuckDB implementation are preserved unchanged.

## Self-Check: PASSED

- Commit 33192d8 exists: FOUND
- Commit b890b9f exists: FOUND
- `frontend/src/features.ts` imports from sqlite.ts: FOUND (grep -c returns 1)
- `frontend/src/filter.ts` imports from sqlite.ts: FOUND (grep -c returns 1)
- `frontend/src/bee-atlas.ts` imports from sqlite.ts: FOUND (grep -c returns 1)
- No duckdb imports in any of the 3 caller files: CONFIRMED
- No duckdb mocks in any test file: CONFIRMED
- TypeScript clean: PASSED
- 165 tests passing: PASSED
