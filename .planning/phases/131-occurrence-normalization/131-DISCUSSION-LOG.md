# Phase 131: Occurrence Normalization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 131-Occurrence Normalization
**Areas discussed:** Summary-count semantics, geo_blob payload & size win, Size/perf gate vs record

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Summary-count semantics | Rewrite species/genus/family totals against taxon_id | ✓ |
| geo_blob payload & size win | What replaces the dropped name strings in geo_blob | ✓ |
| Size/perf: gate vs record | Enforced regression gate vs recorded baseline | ✓ |
| Cleanup scope of the audit | Full delete of dead Phase-130 code vs minimal migration | (delegated to Claude) |

---

## Summary-count semantics

First question — count basis when rewriting against taxon_id:

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve specimen-only | Keep today's number via hierarchy rollup; no visible change | |
| Align to all-sources (D-01) | Re-derive consistent with the map / autocomplete; numbers go up | ✓ (initially) |

**Pivot:** User asked "where do the counts show up, how are they used?" Investigation
found `totalSpecimens` is the only rendered summary field ("N specimens" overlay
button); `speciesCount`/`genusCount`/`familyCount` are computed but **never
rendered** anywhere. Re-asked:

| Option | Description | Selected |
|--------|-------------|----------|
| Drop them entirely | Remove the dead fields + their dropped-column query | ✓ |
| Keep + rewrite vs taxon_id (D-01) | Speculative rebuild for invisible numbers | |

**User's choice:** Drop them entirely (D-01).
**Notes:** The "align to all-sources" answer was superseded once the counts were
shown to be invisible. `totalSpecimens` is untouched by the column drop.

---

## geo_blob payload & size win

Confirmed in-memory features are matched only by `occId`; filtering re-queries the
DB. So geo_blob needs no name and no taxon_id.

| Option | Description | Selected |
|--------|-------------|----------|
| Drop strings, add nothing | 7-field layout; biggest size win; matches what the map reads | ✓ |
| Swap strings for taxon_id | One int/point for speculative future use | |

**User's choice:** Drop strings, add nothing (D-03/D-04).
**Notes:** New layout `[lat, lon, ecdysis_id, observation_id,
specimen_observation_id, year, source]`. The size win is the 3 strings × ~90k rows.

---

## Size/perf: gate vs record

Surfaced that `tablesReady` is a browser benchmark (un-gateable in the Python/dbt
nightly), and an absolute DB-size ceiling fights legitimate data growth; the dbt
contract already hard-enforces column removal.

| Option | Description | Selected |
|--------|-------------|----------|
| Record + structural guards | Record-only + geo_blob-arity assertion + dbt contract | |
| Add absolute size/perf gate | Nightly byte ceiling + browser perf harness | |
| Record-only, no new guards | Measure + record in VERIFICATION.md; rely on dbt contract | ✓ |

**User's choice:** Record-only, no new guards (D-05).
**Notes:** Declined even the cheap geo_blob-arity assertion; the dbt contract is
the sole enforcement.

---

## Claude's Discretion

- **Cleanup scope** (delegated): Full cleanup of dead string-column paths
  (`features.ts` summary/taxaOptions, `queryFilteredCounts`, unfiltered counts);
  complete the audit beyond the roadmap's named list (migrate `bee-table.ts`
  Species column + `bee-occurrence-detail.ts` provisional name to taxon_id-resolved
  names); leave `checklist.parquet` + its filter untouched. (D-06, D-07, D-08)
- **D-07 name-resolution mechanism** (SQL JOIN to `taxa` vs lazy `taxonCache`) left
  as an open RESEARCH.md question — codebase-internal, not a user decision.

## Deferred Ideas

- Migrate the checklist filter off name+rank strings to `taxon_id` (separate
  artifact; out of NORM scope).
- Sweep for other dead intermediate-model columns beyond
  `specimen_inat_genus`/`specimen_inat_family`.
</content>
