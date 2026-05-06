---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Species Tab
status: shipped
last_updated: "2026-05-05T00:00:00.000Z"
last_activity: 2026-05-05 -- v3.2 milestone closed (tagged v3.2; 72/72 reqs; audit PASSED)
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 34
  completed_plans: 34
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v3.2 Species Tab milestone started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Planning next milestone

## Current Position

Milestone: v3.2 Species Tab — SHIPPED (2026-05-05)
Status: Awaiting `/gsd-new-milestone` to scope next cycle
Resume file: None
Last activity: 2026-05-05 -- v3.2 milestone closed

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
- [Phase 079-01]: validate-species.mjs uses error-accumulator + CLI-guard pattern (fileURLToPath(import.meta.url) === resolve(process.argv[1])) so the script is both a Vitest-importable module and a stand-alone build-time CLI; speciesJsonArray=null path skips unknown-name cross-ref while keeping license/attribution gates active (graceful degradation on fresh checkouts without species.json)
- [Phase 079-01]: build chain order is load-bearing: validate-schema (parquet gate) → validate-species (TOML gate) → typecheck → eleventy; subprocess integration test isolates the TOML gate via `npm run validate-species` rather than `npm run build` so it stays deterministic when local public/data/*.parquet is absent
- [Phase 079-02]: iNat fallback resolved — WA-preferred top-up: take all WA license-clean photos first, then fill remaining slots up to 3 from a global query, deduping by photo_id (resolves CONTEXT.md open question; minimizes "no photo" gaps for species rare in WA at the cost of one extra iNat call per under-covered species)
- [Phase 079-02]: seed RateLimiter is a tiny class (rolling lastCall timestamp, first wait() free) tested against real Date.now()/setTimeout at 30–50ms intervals; production CLI uses 1000ms — only the constructor argument differs between test and prod, exercising the same code path
- [Phase 079-02]: build-chain isolation regression guard — Vitest assertion that scans package.json scripts for any reference to seed-species-photos and fails the suite if found (PHOTO-07 NOT-in-CI invariant); reusable pattern for future "this must NEVER be in CI" rules
- [Phase 079-03]: loadTaxonIds query rewritten to mirror data/species_export.py species_universe — COALESCE(checklist.scientificName, occurrences.canonical_name) keyed on LOWER(canonical_name) against the bridge; eliminates the snake_case `o.scientificName` BinderError and makes the seed's scientificName key set agree byte-for-byte with public/data/species.json (735/735 coverage)
- [Phase 079-03]: iNat enforces a tighter effective burst limit than the documented 1 req/sec; rate-ms=1000 hit 231 HTTP 429s on a 735-species sweep but rate-ms=1500 cleared them entirely — recommendation for Phase 82 PERF-04 cron is rate-ms=1500 default
- [Phase 079-03]: D-01 fill-only recovery loop established — programmatically delete bare entries (the 429 victims) from the manifest, then re-run the seed at slower rate; existing photo-bearing entries are preserved while only deleted bare keys get refetched. Reusable pattern for any future incremental data-fetch repair

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

Items acknowledged and deferred at v3.2 milestone close on 2026-05-05 (20 total):

| Category | Item | Status |
|----------|------|--------|
| debug | nav-routes-to-atlas-instead-of-filter | diagnosed |
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
| uat_gap | 077-HUMAN-UAT.md | partial (live-DB ≥95% periodic re-verify) |
| uat_gap | 081-UAT.md | partial (visual UX flows recorded) |
| uat_gap | 082-UAT.md | unknown (both seed use cases PASS recorded) |
| verification_gap | 077-VERIFICATION.md | human_needed |
| verification_gap | 081-VERIFICATION.md | human_needed |
