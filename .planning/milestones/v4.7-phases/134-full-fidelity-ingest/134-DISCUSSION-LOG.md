# Phase 134: Full-Fidelity Ingest - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 134-full-fidelity-ingest
**Areas discussed:** Coordinate validation & recovery, date_quality classification rules, Old 4-col path transition

---

## Coordinate validation & recovery

### WA bounding box strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Tight WA bounds | lat [45.5, 49.0], lon [-124.85, -116.9] — actual state extent | ✓ |
| Padded bounds (~0.5°) | lat [45.0, 49.5], lon [-125.3, -116.4] — ~50km margin | |
| Tight + count out-of-box only | Tight bounds, log margin separately before deciding | |

**User's choice:** Tight WA bounds.

### Swap policy

Question rejected by user, who pointed out: (1) this is a static dataset, so swap presence
is empirically verifiable rather than a matter of policy; (2) the original framing of how
swapped coords interact with the bbox was confusingly stated.

**Resolution (empirical, not a vote):** Ran an analysis over all 50,646 rows. **Zero rows have
an impossible latitude** (`|lat| > 90`), so no swapped `Latitude`/`Longitude` pairs exist. The
`x`/`y` columns are a coarser fallback (rounded county centroids), not a swap authority. The
918 `Latitude/Longitude ≠ x/y` rows are not swaps. → **No swap detection/recovery needed; ignore x/y.** (CONTEXT D-02.)

**Notes:** Lesson applied — for a static file, verify against the data instead of asking a
policy question. Counts: ~45,927 valid · 4,595 null · 2 zero · 122 out-of-bbox.

---

## date_quality classification rules

Grounded in an empirical scan of the `Date` column before deciding. Findings: every non-empty
date is a complete year+month+day (ISO datetime 43,602 · ISO date 64 · M/D/YYYY 291 · empty
6,689 · malformed/partial **0**). No year-only, year-range, or year-month entries exist. Year
span 1812–2022. This made the planned "year+month-no-day" and "year-range" sub-questions moot —
`date_quality` reduces to `full` (43,957) vs `none` (6,689); `year_only` stays in the enum for
robustness but 0 current rows hit it.

### M/D/YYYY interpretation

| Option | Description | Selected |
|--------|-------------|----------|
| US month-first M/D/YYYY | month/day/year, deterministic (DATE_ORDER=MDY / strptime %m/%d/%Y) | ✓ |
| Let dateparser auto-detect | per-row heuristic; non-deterministic risk | |

**User's choice:** US month-first M/D/YYYY.

### Store verbatim date string?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, keep verbatim_date | store raw Date string alongside parsed integers | |
| No, parsed integers only | year/month/day + date_quality only | ✓ |

**User's choice:** No verbatim_date string — parsed integers only. (Overrides research's
"preserve verbatim_date" suggestion; no success criterion mandates it.)

---

## Old 4-col path transition

| Option | Description | Selected |
|--------|-------------|----------|
| Add-only, leave old path untouched | Add checklist_records_full; old TSV/table/checklist.sql unchanged; retire later | ✓ |
| Derive old table from new CSV, retire TSV | Re-derive checklist_records from CSV + delete TSV + gate on unchanged county-fill output | |
| Full cutover to new table now | Re-point checklist.sql at new table, delete old — scope creep into Phase 137/138 | |

**User's choice:** Add-only. 134 stays the zero-architecture-risk ingest phase; the old
county-fill path is untouched and the redundant TSV is retired in a later phase.

---

## Claude's Discretion

- `coord_flag` column type/values, function decomposition, table column order (research-aligned defaults).
- Table keeps all 50,646 rows with `coord_flag`; point-arm exclusion realized downstream (Phase 137).
- Preserve source `ObjectID` + raw `Family`/`Genus` for traceability; no synthetic checklist_id in 134.
- Add all three pip deps per SC#4; `dateparser` is fallback-only since stdlib parses 100% of current dates.

## Deferred Ideas

- Retire `wa_bee_checklist_records.tsv` / re-derive `checklist_records` — Phase 137/138.
- Excluded-coordinate sidecar CSV — discussed, not selected for 134.
- Synthetic checklist_id, synonym JOIN, taxon_id bridge, dedup, ARM 4, contract bump — Phases 135–137.
- County-fill retirement, map points, detail card, source toggle — Phases 137–138.
