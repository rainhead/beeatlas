# Phase 31: Feature Creation from DuckDB - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 31-feature-creation-from-duckdb
**Areas discussed:** parquet.ts fate, Loading lifecycle driver

---

## parquet.ts Fate

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite in-place as features.ts | Rename parquet.ts → features.ts; replace hyparquet internals with DuckDB SELECT queries; keep VectorSource subclass shape | ✓ |
| Delete and inline in bee-map.ts | Remove parquet.ts; put DuckDB → OL feature conversion directly in bee-map.ts | |
| Delete and inline in duckdb.ts | Extend duckdb.ts with feature-creation helpers | |

**User's choice:** Rewrite in-place as features.ts

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep VectorSource subclasses | EcdysisSource and SampleSource extend VectorSource — same interface as today | ✓ |
| Plain functions returning Feature[] | Export createEcdysisFeatures(db) and createSampleFeatures(db); bee-map.ts wires into plain VectorSource | |

**User's choice:** Keep VectorSource subclasses

---

## Loading Lifecycle Driver

| Option | Description | Selected |
|--------|-------------|----------|
| Keep specimenSource.once('change') as-is | EcdysisSource loader calls success(features) when DuckDB query completes; 'change' fires naturally; zero changes to bee-map.ts lifecycle | ✓ |
| Drive directly from DuckDB promise | Remove specimenSource.once; await loadAllTables() in connectedCallback; set _dataLoading = false on resolve | |

**User's choice:** Keep specimenSource.once('change') as-is

---

## Claude's Discretion

- Column selection for DuckDB queries
- BigInt handling for DuckDB result rows
- Exact class/function naming in features.ts
