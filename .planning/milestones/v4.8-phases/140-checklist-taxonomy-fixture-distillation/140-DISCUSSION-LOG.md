# Phase 140: Checklist & Taxonomy Fixture Distillation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Phase:** 140-checklist-taxonomy-fixture-distillation
**Areas discussed:** Sample wiring, DB scope & in-memory mechanics, Ancestry fixture, Coverage policy, Provenance

---

## Sample wiring (TFIXTURE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Small CSV via load_checklist() | Commit a tiny sample CSV; point load_checklist() at it via env/path override; fast tier still exercises real CSV→DB parse path | ✓ |
| Seed rows directly into DB | INSERT rows straight into checklist_data tables, bypassing CSV parsing | |
| Hybrid | Most tests off a sample CSV; a couple keep tiny inline cases | |

**User's choice:** Small CSV via load_checklist()
**Notes:** Keep CSV-parse + insert + transform code under fast-tier coverage; only shrink the dataset.

---

## DB scope & in-memory mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Module-scoped (per file) | One built DuckDB per test file | ✓ (scope) |
| Session-scoped (whole run) | One DuckDB shared read-only across the entire run | |
| You decide | Claude picks per-file | |

**User's choice:** "Module-scoped and in-memory."

Follow-up — reconciling in-memory with the separate-connection verify pattern:

| Option | Description | Selected |
|--------|-------------|----------|
| Shared in-memory connection fixture | Module fixture yields ONE in-memory connection; load_checklist() and asserts share it; requires test rewrites | ✓ |
| Module-scoped temp-file DB | Build once per file in a tmp file; separate read-only asserts keep working unchanged | |
| You decide | Least invasive rewrite hitting "seconds" | |

**User's choice:** Shared in-memory connection fixture
**Notes:** Accepts the test-rewrite cost of threading one connection through load_checklist() and the asserts. Implies a production-code seam (connection injection) — flagged for researcher (CONTEXT D-05).

---

## Ancestry fixture (TFIXTURE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Tiny taxa.csv.gz subset | Small gzip with only needed taxa rows; real ancestry-parse path covered | ✓ |
| Structured ancestry fixture | Small JSON/dict injected, bypassing gz parsing | |
| You decide | Keep coverage honest with least code change | |

**User's choice:** Tiny taxa.csv.gz subset
**Notes:** Fast tier must pass with the real raw/taxa.csv.gz absent from disk.

---

## Coverage policy (SC#4)

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: one row per asserted branch | Smallest sample covering every coord_flag/date_quality branch; rewrite asserts to exact known counts | ✓ |
| Modest fixed sample (~50–100 rows) | Slightly larger curated sample for headroom | |
| You decide | Smallest sample preserving every assertion's intent | |

**User's choice:** Minimal: one row per asserted branch
**Notes:** No assertion may silently lose coverage; each rewritten assertion traceable to a sample row.

---

## Provenance (TFIXTURE-04)

| Option | Description | Selected |
|--------|-------------|----------|
| README in data/tests/fixtures/ | Central markdown listing provenance per fixture | |
| Per-fixture docstrings/header comments | Provenance recorded inline at each fixture/loader | ✓ |
| Both (README + inline) | Directory README plus per-fixture notes | |

**User's choice:** Per-fixture docstrings/header comments
**Notes:** Inline CSV header comment or loader/fixture docstring stating distilled-from rows and preserved invariants.

---

## Claude's Discretion

- Exact load_checklist() connection-injection seam and ancestry-path override mechanism.
- Whether the two existing integration-tagged tests need adjustment to coexist with sample fixtures (they keep reading the real CSV).

## Deferred Ideas

- TFIXTURE-05 (stretch): broaden module/session-scoped DB to other per-test DuckDB builders — only if needed to hit budget (Phase 142 territory).
- Reviewed-not-folded todos: data-test-suite-environmental-deps (→ Phase 141); genus-page-subgenera-breakout, pluralization-sweep-web-copy, table-rank-column, cluster-selection-visual-feedback (frontend, off-domain).
