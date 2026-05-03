# Phase 77: Lineage Coverage Expansion — Context (seed)

**Created:** 2026-05-03
**Status:** Pre-discuss / pre-plan — seeded from the inserted ROADMAP entry to bootstrap downstream agents.

## Why this phase exists

During the original `/gsd-plan-phase 77` (which became Phase 78 — Pipeline Outputs), the researcher discovered that the iNat lineage bridge covers only ~31% of species (227 / 738) in the FULL OUTER union of `checklist_data.species` and `ecdysis_data.occurrences`. The other ~70% would have NULL `family` / `subfamily` / `tribe` / `subgenus` from the iNat side, and the checklist also leaves these NULL for bulk-loaded rows. Without intervention, the downstream species-tab nav tree would render hundreds of species under "(no family)".

This phase resolves that gap *before* Phase 78 (Pipeline Outputs) consumes the lineage table.

## Phase Boundary

Pipeline resolves every species name (checklist + ecdysis occurrences) to an iNat `taxon_id`, populates a `canonical_name → taxon_id` bridge table, and re-runs `enrich_taxon_lineage_extended` so `inaturalist_data.taxon_lineage_extended` covers ≥95% of species in the FULL OUTER union. Unresolved names are written to `data/lineage_unresolved.csv` for expert review.

## Locked Decisions (from /gsd-plan-phase 77 conversation, captured 2026-05-03)

### D-01 Lineage coverage strategy [LOCKED]
This phase is the gate. Phase 78 (Pipeline Outputs) assumes ≥95% coverage and uses `COALESCE(checklist, iNat-via-bridge)` precedence per TAX-02; genus falls back to `split_part(canonical_name, ' ', 1)` only when both checklist and iNat are NULL.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture (Phase 76 patterns to mirror)
- `data/inaturalist_pipeline.py::enrich_taxon_lineage_extended` — existing iNat lineage walk; the 429/5xx retry helper `_inat_get_with_retry` added 2026-05-02 is the rate-limit pattern to reuse
- `data/canonical.py` — `canonical_name` computation
- `data/checklist_pipeline.py` — checklist load + species table
- `data/run.py` — STEPS list ordering (this phase's step lands after `checklist` and before `enrich-taxon-lineage-extended`)

### Roadmap and requirements
- `.planning/ROADMAP.md` — Phase 77 success criteria (5 numbered items)
- `.planning/REQUIREMENTS.md` — LIN-01..LIN-05

### Sister-phase research (for context, not spec)
- `.planning/phases/078-pipeline-outputs/078-RESEARCH.md` — Pitfall #1 documents the coverage gap that motivated this phase

## Specific Ideas

- iNat taxon-search endpoint: `GET /taxa?q=<canonical_name>&rank=species` (also `genus`, `subspecies`); rate-limited to ≤1 req/sec like Phase 76
- Bridge table candidate name: `inaturalist_data.canonical_to_taxon_id (canonical_name TEXT PRIMARY KEY, taxon_id INTEGER, resolved_at TIMESTAMP, source TEXT)`
- Unresolved-CSV columns: `(canonical_name, reason, attempted_at)` where reason ∈ `{'404', 'ambiguous', 'api_error'}`
- A `--refresh-lineage` CLI flag (or equivalent config knob) bypasses the cache for re-resolution

## Deferred Ideas

- Static `genus → family` map fallback — superseded by this phase's ≥95% target
- Consolidating the two iNat lineage tables (`taxon_lineage` narrow vs `taxon_lineage_extended` wide) — Phase 76 D-03 deferred to v3.3+
- DwC-A migration as an alternate lineage source — deferred to v3.3+ per `.planning/seeds/inat-taxonomy-dwca.md`

---

*Phase: 077-lineage-coverage-expansion (inserted 2026-05-03 between Phase 76 and the original Phase 77 → now Phase 78)*
*Seed context written by HANDOFF-RENUMBER.md execution; expand via `/gsd-discuss-phase 77` or directly via `/gsd-plan-phase 77`.*
