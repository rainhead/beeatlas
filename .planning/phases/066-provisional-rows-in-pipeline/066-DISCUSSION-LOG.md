# Phase 66: Provisional Rows in Pipeline — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 66-provisional-rows-in-pipeline
**Areas discussed:** Taxon fields for genus/family, OFV 1718 URL format

---

## Taxon Fields for Genus/Family

| Option | Description | Selected |
|--------|-------------|----------|
| Genus from binomial, family NULL | split_part(taxon__name, ' ', 1) for genus; family always NULL | |
| Add taxon.ancestors to pipeline | Add taxon.ancestors.rank + taxon.ancestors.name to DEFAULT_FIELDS; dlt creates child table; export SQL joins to extract genus/family ancestor rows | ✓ |
| Genus + family from taxon name + rank | Derive from rank='family' observation; NULL otherwise | |

**User's choice:** Add taxon.ancestors to pipeline  
**Notes:** Minimal fields: `taxon.ancestors.rank` and `taxon.ancestors.name` only.

---

## OFV 1718 URL Format

| Option | Description | Selected |
|--------|-------------|----------|
| Full URL | https://www.inaturalist.org/observations/163069968 — regex needed | ✓ |
| Bare integer ID | CAST(value AS BIGINT) directly | |

**User's choice:** Full URL  
**Notes:** SQL: `CAST(regexp_extract(value, '([0-9]+)$', 1) AS BIGINT)`

---

## Schema Discussion (freeform)

The discussion surfaced that the correct mental model for the three-way join is:
- ARM 1: Ecdysis specimens
- ARM 2: iNat specimen observations (WABA bee photos)
- ARM 3: iNat host sample observations (collection events / plant photos)

ARMs 2 and 3 are categorically distinct — "specimen" and "host" are different things. Coalescing Ecdysis determination columns with iNat community ID columns was flagged as wrong: `scientificName`/`genus`/`family` from Ecdysis are expert determinations; iNat taxon columns (`specimen_inat_taxon_name` etc.) are crowd-sourced community IDs. These should remain separate columns.

`observer` (existing, host sample login) renamed to `host_inat_login` for consistency with new `specimen_inat_login` column.

ARM 2 is LEFT JOINed for ALL Ecdysis rows (not just provisional), so `specimen_inat_login` and taxon columns are populated for any Ecdysis row with a `specimen_observation_id`.

## Claude's Discretion

- SQL CTE naming and structure for three-way join
- Unique `_row_id` strategy across UNION ALL arms
- Anti-join approach for provisional row identification (separate CTE vs inline)

## Deferred Ideas

- iNat community ID confidence columns (num_identification_agreements) — future milestone
- Distinct map symbols for provisional rows — out of scope v2.8
