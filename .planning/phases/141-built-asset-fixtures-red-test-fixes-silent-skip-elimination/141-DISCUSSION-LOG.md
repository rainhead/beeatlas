# Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Phase:** 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
**Areas discussed:** Parquet fixture format, test_dbt_diff disposition (Silent-skip enforcement and WR-01 hardening delegated to Claude's lean)

---

## Gray-area selection

Four areas presented; user chose to discuss two and delegate two to Claude's recommended lean.

| Area | Discussed? |
|------|-----------|
| Parquet fixture format | ✓ discussed |
| test_dbt_diff disposition | ✓ discussed |
| Silent-skip enforcement | delegated → Claude's lean (conftest guard) |
| WR-01 fixture hardening | delegated → Claude's lean (save/restore + exact counts) |

---

## Parquet fixture format (TFIXTURE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Build from CSV in-test | Committed distilled CSVs → COPY to .parquet at expected path at test time; no binary blobs; diffable provenance | ✓ |
| Commit tiny binary .parquet | Direct binary fixtures; exact format coverage, zero build cost, but opaque blobs in git | |
| Build from CSV, keep .parquet too | Hybrid; CSV source-of-truth + regenerated .parquet | |

**User's choice:** Build from CSV in-test.
**Notes:** Consistent with Phase 140's real-code-path / no-opaque-blobs philosophy. Per-test COPY cost is ms-scale and acceptable.

---

## test_dbt_diff disposition (TFIX-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Tag @integration, run nightly | Deselected (not skipped) in fast tier → satisfies TFIX-04 + TTIER-02; runs against real built data in nightly | ✓ |
| Loud skip-when-stale in fast | Convert silent skipif to visible skip; weaker (a skip is not a run) | |
| Attempt fixture-based diff | Advised against — fixture-built both sides makes the diff tautological | |

**User's choice:** Tag @integration, run nightly.
**Notes:** Surfaced during discussion that test_dbt_diff compares a fresh dbt sandbox build against published public/data — a cross-artifact regression guard whose value is entirely in comparing two independently-produced real artifacts. A fixture version would pass trivially and test nothing.

---

## Claude's Discretion (delegated by user)

- **Silent-skip enforcement (TFIX-04):** automated `conftest.py` guard that fails the fast tier if a non-`integration` test would skip on a missing built asset (vs. manual audit). Locked as D-05.
- **WR-01 fixture hardening:** drop `importlib.reload` for save/restore discipline in `test_checklist_pipeline.py` (vs. autouse guard). **WR-02:** pin the two `n>=1` assertions to exact counts (6 species, 8 county rows). Locked as D-08/D-09.
- Exact distilled rows for each parquet fixture CSV; the specific conftest hook; the TFIX-03 fuzzy-candidate diagnosis path.

## Deferred Ideas

- TFIXTURE-05 (broaden fixtures to more DuckDB builders) — stretch, deferred.
- Nightly wiring (TTIER-03) + budget verification (TPERF-02/03) — Phase 142.
- CI gate — Phase 143.
- genus-page-subgenera-breakout / pluralization-sweep-web-copy todos — keyword false-positives, unrelated web work, not folded.
