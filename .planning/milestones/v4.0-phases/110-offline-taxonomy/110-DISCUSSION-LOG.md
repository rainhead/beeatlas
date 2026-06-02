# Phase 110: Offline Taxonomy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 110-Offline Taxonomy
**Areas discussed:** WABA lineage migration

---

## WABA Lineage Migration

| Option | Description | Selected |
|--------|-------------|----------|
| dbt view on lineage_extended | Change stg_waba__taxon_lineage to SELECT taxon_id, genus, family FROM stg_inat__taxon_lineage_extended. No new Python step. int_specimen_obs_base unchanged. | ✓ |
| New Python step populates waba table | A new step in run.py reads taxa.csv.gz and populates inaturalist_waba_data.taxon_lineage separately. Keeps two-table architecture. | |
| Migrate int_specimen_obs_base to reference extended directly | Drop stg_waba__taxon_lineage entirely; change int_specimen_obs_base to JOIN stg_inat__taxon_lineage_extended. | |

**User's choice:** dbt view on lineage_extended (Recommended)
**Notes:** inaturalist_waba_data.taxon_lineage source in sources.yml must also be removed.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as source wrapper | Remove inaturalist_waba_data source, make stg_waba__taxon_lineage use {{ ref('stg_inat__taxon_lineage_extended') }}. | |
| You decide | Planner picks the cleanest dbt pattern. | ✓ |

**User's choice:** You decide (planner discretion on exact dbt ref pattern)

---

## Claude's Discretion

- Exact dbt ref pattern for the rewritten stg_waba__taxon_lineage
- Taxon scope for the new taxon_lineage_extended (all active bees vs. all active taxa vs. observed-only)
- Module placement for the taxa.csv.gz downloader
- Test migration strategy for test_taxon_lineage_extended.py

## Deferred Ideas

- Test migration strategy left to planner
- Cluster blobs visual feedback todo — unrelated to Phase 110
