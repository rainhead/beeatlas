# Phase 60: wa-sqlite Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 60-wa-sqlite-integration
**Areas discussed:** SQL dialect, GeoJSON tables, hyparquet

---

## SQL Dialect

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite SQL in filter.ts | Edit ~4 DuckDB-specific expressions to SQLite syntax. Clean, no shim needed. 'Without changes' meant behavioral, not literal. | ✓ |
| Compatibility shim in sqlite.ts | Wrap wa-sqlite to intercept and rewrite queries at runtime (regex-replace year(), month() calls). filter.ts stays untouched but adds indirection. | |
| SQLite custom functions | Register year() and month() as custom SQL functions in wa-sqlite DB setup. filter.ts SQL stays valid, no regex, but adds setup complexity. | |

**User's choice:** Rewrite SQL in filter.ts (and bee-atlas.ts — confirmed in follow-up)
**Notes:** User specified "run the plan by me first" — wants to review SQL rewrite diff before execution.

---

## GeoJSON Tables

| Option | Description | Selected |
|--------|-------------|----------|
| Skip them entirely | Don't load counties/ecoregions into SQLite. The OL sources read GeoJSON directly; no SQL consumer exists. Reduces init work. | ✓ |
| Keep loading them into SQLite | Preserve symmetry with current DuckDB behavior. Costs extra init time but matches the existing loadAllTables contract. | |

**User's choice:** Skip them entirely
**Notes:** Confirmed that nothing in the codebase queries counties/ecoregions via SQL.

---

## hyparquet

| Option | Description | Selected |
|--------|-------------|----------|
| Add hyparquet back | Install hyparquet, use it to read parquet → JS row objects → INSERT INTO sqlite in batched transactions. Canonical v2.6 migration path. | ✓ |
| Fetch → custom reader | Use a different parquet library or write a minimal reader. | |

**User's choice:** Add hyparquet back
**Notes:** hyparquet was used pre-v1.0 before DuckDB was introduced; re-adding is straightforward.

---

## Claude's Discretion

- New module name/file structure (sqlite.ts or equivalent)
- Export API surface of the new module
- Result object format (wa-sqlite → plain JS, not Apache Arrow)
- wa-sqlite package variant and build for in-memory use
- Batch insert size and transaction strategy

## Deferred Ideas

None.
