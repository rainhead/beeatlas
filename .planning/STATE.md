---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Species Tab
status: phase-complete
last_updated: "2026-05-04T07:35:37.000Z"
last_activity: 2026-05-04
progress:
  total_phases: 12
  completed_phases: 3
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v3.2 Species Tab milestone started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 078 — pipeline-outputs (complete)

## Current Position

Phase: 078
Plan: All 4 plans complete (078-01..04)
Status: Phase complete — verification passed (5/5 criteria, 121/121 tests, 13/13 requirements)
Last activity: 2026-05-04

## Accumulated Context

### Decisions

(decisions log cleared at v3.0 close — full history in .planning/PROJECT.md Key Decisions table)

- [Phase ?]: Phase 077-01: skip 'Lasioglossum zonulum' from new LIN-05 seed; PK conflict with existing scientificName
- [Phase ?]: Phase 077-01: trim plan's 11-row occurrence seed to 8 so union of canonical_names is exactly 20 once existing seed's 3 names are accounted for
- [Phase ?]: Phase 077-02: utcnow() deprecated in Python 3.14 — replaced with dt.datetime.now(dt.UTC).replace(tzinfo=None) to preserve tz-naive ISO 8601 output without DeprecationWarning
- [Phase ?]: Phase 077-02: refresh=True reads UNRESOLVED_CSV but never deletes bridge rows (D-A6) — successful resolutions are durable across refresh reruns
- [Phase ?]: Phase 77 lineage coverage expansion complete: bridge populated via resolve-taxon-ids step, walked via enrich_taxon_lineage_extended UNION arm, LIN-05 coverage pinned at >=0.95 by deterministic fixture
- [Phase 078]: Wave 0 scaffolding extends occurrences.parquet with canonical_name (load-bearing for per-species county_count / ecoregion_count), introduces [tool.beeatlas] config for STATE_FIPS, lays test stubs that go red until Plans 02/03 land
- [Phase 078-02]: DuckDB 1.4.x COALESCE-on-INTEGER[12] unimplemented — backfill NULL month_histogram (checklist-only rows) with [0]*12 in Python; pyarrow schema still pins list<int32>
- [Phase 078-03]: ST_GeomFromText(geometry_wkt) instead of plan's literal `geom` column — matches existing data/export.py::export_counties_geojson idiom
- [Phase 078-04]: SVG byte-stability via sorted attrib dicts in _write_species_svg before ET.tostring — sha256 byte-equality across consecutive runs proven on 556 SVGs at host scale

### Pending Todos

- Cluster blob selection visual feedback — `.planning/todos/pending/cluster-selection-visual-feedback.md`
- Boundary edge gap/overlap rendering (from Phase 73 verification, commit 193a57b)

### Blockers/Concerns

CR-01 (pre-existing from Phase 67): bee-filter-controls.ts uses `observer` field in CollectorToken but filter.ts CollectorEntry defines `host_inat_login` — collector filtering by iNat username silently non-functional until resolved.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-t1a | Table mode improvements (filter button, selection highlight, links column, collector coalesce, field# fallback) | 2026-04-21 | c9c1b8c | [260421-t1a-table-mode-improvements](./quick/260421-t1a-table-mode-improvements/) |
| 260421-qk1 | Drop atom feeds for counties and ecoregions | 2026-04-21 | c1f196e | [260421-qk1-drop-county-ecoregion-feeds](./quick/260421-qk1-drop-county-ecoregion-feeds/) |
| 260422-sc1 | Fix specimen count mismatch between map filter panel and table view | 2026-04-22 | 78ccd3e | [260422-sc1-fix-specimen-count-mismatch](./quick/260422-sc1-fix-specimen-count-mismatch/) |

## Deferred Items

Items acknowledged and deferred at v3.1 milestone close on 2026-04-30:

| Category | Item | Status |
|----------|------|--------|
| debug | selection-ring-not-displaying | diagnosed |
| quick_task | 1-store-full-observation-json-in-cache-wit | missing |
| quick_task | 260408-roy-move-region-overlay-control-from-sidebar | missing |
| quick_task | 260408-tkd-add-occurrence-observation-id-columns-to | missing |
| quick_task | 260408-tvl-show-recent-filters-when-filter-input-is | missing |
| quick_task | 260411-pru-unidentified-specimens-like-5611752-are- | missing |
| quick_task | 260412-dl6-in-the-frontend-in-the-specimen-table-vi | missing |
| quick_task | 260412-due-re-add-sort-controls-to-the-specimen-tab | missing |
| quick_task | 260412-kpe-schema-validation-is-failing-on-build-de | missing |
| quick_task | 260421-qk1-drop-county-ecoregion-feeds | missing |
| quick_task | 260421-t1a-table-mode-improvements | missing |
| quick_task | 260422-sc1-fix-specimen-count-mismatch | missing |
| todo | boundary-edge-gaps.md | low |
| todo | cluster-selection-visual-feedback.md | medium |
