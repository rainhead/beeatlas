# Phase 167: Collector Identity Column - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 167-collector-identity-column
**Areas discussed:** Assertion scope, Assertion severity, COALESCE site

---

## Assertion scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 WABA arms | ecdysis + waba_sample + waba_specimen must all be non-NULL (criterion 2 wording; strictest) | |
| Only the 2 WABA-named arms | waba_sample + waba_specimen non-NULL; ecdysis tolerated NULL (criterion 4 wording) | |
| You decide from the data | Run the COALESCE against live duckdb, pick scope from real counts | ✓ |

**User's choice:** You decide from the data.
**Notes:** Live query of `dbt_sandbox.int_combined` (2026-06-24) showed waba_sample (0/28) and waba_specimen (0/33) fully resolved, but ecdysis at 2,767/48,801 NULL (5.7%) — all 2,767 carrying a `recordedBy` with no matched iNat obs. Decision: split — hard-error on the two always-clean WABA-named arms (D-05), warn+log on ecdysis (D-06). All 3 arms covered, severity differentiated by population.

---

## Assertion severity

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-fail the build | severity=error, nightly aborts on any in-scope NULL | |
| Warn + log count | severity=warn, build continues, count surfaced | ✓ |

**User's choice:** Warn + log count.
**Notes:** Applied as the severity for the population that actually NULLs (ecdysis, D-06). The two provably-clean WABA arms additionally get a hard-error guard (D-05) since a NULL there is a real regression that cannot false-trip on current data.

---

## COALESCE site

| Option | Description | Selected |
|--------|-------------|----------|
| Mart-only (occurrences.sql) | Single COALESCE in the mart final SELECT | |
| int_combined (all 5 arms) | Compute per-arm alongside source login fields (ARCHITECTURE.md rec) | ✓ |
| You decide | Pick whichever threads cleaner | |

**User's choice:** int_combined (all 5 arms).
**Notes:** Also structurally required — int_combined is a 5-way UNION ALL, so every arm must project the column anyway (D-02).

---

## Claude's Discretion

- Exact dbt test file layout (singular SQL vs. generic `where`-scoped test).
- Whether the warn-test baseline (~2,767) is a hard-coded threshold or just logged.

## Deferred Ideas

- Per-collector page generation gating → Phase 169.
- Temporal lifecycle dates (collection/posted/id dates) → Phase 168 (separate contract bump).
- Stale-research flag: `collector_identity.csv` seed proposed in research docs is explicitly rejected (D-04) — not deferred, killed.
