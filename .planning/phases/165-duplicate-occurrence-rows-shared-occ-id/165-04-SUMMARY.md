---
phase: 165-duplicate-occurrence-rows-shared-occ-id
plan: "04"
subsystem: documentation
tags: [domain-model, docs, CLAUDE.md, int_combined, occ_id, is_provisional, waba_specimen, waba_sample]
dependency_graph:
  requires:
    - 165-02 (as-built five-category data model; waba_specimen/waba_sample/ecdysis arms)
    - 165-03 (as-built frontend SourceKey wiring; toggle labels confirmed)
  provides:
    - docs/domain-model.md (human-first five-category occurrence data model reference)
    - CLAUDE.md (link to docs/domain-model.md from Domain Vocabulary section)
  affects:
    - Any future phase touching int_combined arms or occIdFromRow (doc is the durable reference)
tech_stack:
  added: []
  patterns:
    - "Human-first reference doc in docs/ (not an ADR — no Status/Decision header); links out to authoritative sources rather than duplicating code or SQL"
key_files:
  created:
    - docs/domain-model.md
  modified:
    - CLAUDE.md
decisions:
  - "docs/domain-model.md placed in docs/ (not docs/adr/) — it is reference material, not a decision record; docs/adr/0001 is format precedent only"
  - "CLAUDE.md link is a single sentence at the end of Domain Vocabulary, before Architecture Invariants — per D-07 and global CLAUDE.md 'link, don't duplicate' convention"
  - "Domain-model doc references src/occurrence.ts as the authoritative occIdFromRow definition rather than restating the CASE logic in prose"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-24"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 165 Plan 04: Domain Model Reference Documentation Summary

Human-first `docs/domain-model.md` covering the five `int_combined` occurrence categories, the corrected `is_provisional` definition (project-166376 membership), the `occIdFromRow` prefix vocabulary and its positional coupling, the same-occurrence identity rule, and the pipeline-lag state for `waba_specimen` rows. Linked from `CLAUDE.md` Domain Vocabulary section.

## What Was Built

**Task 1 — docs/domain-model.md (`9b668813`):**
- Five occurrence categories as a table: `ecdysis` / `waba_specimen` / `waba_sample` / `inat_obs` / `checklist` — with `source` value, `is_provisional`, `occ_id` prefix, and real-world meaning for each
- One paragraph per category explaining its pipeline source arm and why its `occ_id` prefix is what it is
- Corrected `is_provisional` definition: project `166376` membership + lack of specimen-count OFV. Explicit call-out that `waba_specimen` is NOT provisional. Full project URL included
- `occIdFromRow` ID-prefix vocabulary: priority table plus the positional-coupling warning (change `src/occurrence.ts`, `src/filter.ts` `OCC_ID_SQL_CASE`, and `data/dbt/models/marts/occurrence_places.sql` together)
- Same-occurrence rule: `same occ_id = same occurrence`; known deferred "two occ_ids for one bee" case and Shape C OFV fan-out documented
- Pipeline-lag section: `waba_specimen` rows are transient first-class specimens; transition to `ecdysis` once Ecdysis record uploaded + nightly pipeline runs; occ_id changes on transition
- 157 lines (well above 60-line minimum)

**Task 2 — CLAUDE.md Domain Vocabulary link (`681f6e12`):**
- Single sentence added after Collection event definition, before `## Architecture Invariants`
- Links to `docs/domain-model.md`; references the five categories, `is_provisional`, and `occ_id` vocabulary
- No content from domain-model.md duplicated into CLAUDE.md

## Verification Results

- `test -f docs/domain-model.md` — PASS
- Content greps — PASS: `166376`, `waba_specimen`, `is_provisional`, `occIdFromRow|occ_id`, `inat_obs:|ecdysis:` all matched
- `grep -n "domain-model.md" CLAUDE.md` — line 19 (in Domain Vocabulary section)
- `awk` section check — LINK-IN-VOCAB-SECTION: OK
- `wc -l docs/domain-model.md` — 157 lines

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: docs/domain-model.md | `9b668813` | docs/domain-model.md |
| Task 2: CLAUDE.md link | `681f6e12` | CLAUDE.md |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The documentation is complete and accurate to the as-built model from Plans 02 and 03.

## Threat Flags

No new security-relevant surface. Documentation-only change; no executable code, no data flow, no new endpoints.

## Self-Check: PASSED

- `docs/domain-model.md` — exists, 157 lines
- `CLAUDE.md` — contains `domain-model.md` link in Domain Vocabulary section (line 19)
- `9b668813` — found in git log
- `681f6e12` — found in git log
- All five categories documented (ecdysis, waba_specimen, waba_sample, inat_obs, checklist)
- `is_provisional` corrected definition present with project_id 166376 and full URL
- `occIdFromRow` vocabulary table present with positional-coupling warning
- Pipeline-lag state documented

---
*Phase: 165-duplicate-occurrence-rows-shared-occ-id*
*Completed: 2026-06-24*
