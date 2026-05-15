---
phase: 92-slug-migration-pipeline-prep
plan: "03"
subsystem: content
tags: [species-photos, toml, orphan-cleanup, PIPE-03, validate-species]
requirements-completed: [PIPE-03]

dependency-graph:
  requires:
    - phase: 92-02
      provides: "Updated public/data/species.json with hierarchical slugs and correct scientificName set"
  provides:
    - "content/species-photos.toml with all 629 keys matching species.json scientificName values"
    - "Audit trail at 92-03-toml-audit.json documenting all 106 removed entries"
  affects: [content/species-photos.toml, Phase 94 species page photo lookups]

tech-stack:
  added:
    - "tomlkit (ephemeral, uv run --with tomlkit, not added to pyproject.toml)"
  patterns:
    - "tomlkit for round-trip TOML mutation preserving style (removes bare-word section and all sub-tables atomically)"
    - "Audit JSON drive dispositions pattern: human reviews JSON, script applies approved actions"

key-files:
  created:
    - .planning/phases/92-slug-migration-pipeline-prep/92-03-toml-audit.json
  modified:
    - content/species-photos.toml

key-decisions:
  - "All 106 orphans were non-bee taxa (wasps, beetles, flies, insect orders) with no path to rekey; all received remove disposition"
  - "Used tomlkit for round-trip TOML mutation rather than regex/line-based editing to avoid TOML corruption"
  - "tomlkit installed ephemerally via uv run --with tomlkit; not persisted in pyproject.toml (one-shot migration)"
  - "Human-review checkpoint (Task 2) provided blanket approval; no per-entry overrides required"

patterns-established:
  - "Audit-then-apply pattern: generate JSON disposition report, human reviews, script applies — gives auditable trail"

metrics:
  duration: "~20 minutes"
  completed: "2026-05-15"
---

# Phase 92 Plan 03: TOML Orphan Cleanup Summary

**Removed 106 non-bee-taxa orphan entries from species-photos.toml (735 -> 629 keys), eliminating all validate-species warnings and satisfying PIPE-03 TOML cleanup requirement**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-15T22:30:00Z
- **Completed:** 2026-05-15T22:50:00Z
- **Tasks:** 3 (Task 1: audit report; Task 2: human checkpoint; Task 3: apply dispositions)
- **Files modified:** 2 (content/species-photos.toml, 92-03-toml-audit.json)

## Accomplishments
- Generated programmatic audit report (92-03-toml-audit.json) covering all 106 orphan TOML keys with proposed dispositions
- Human review confirmed all 106 as genuine orphans (non-bee taxa: wasps, beetles, flies, insect orders) — blanket approved for removal
- Applied all 106 remove dispositions, reducing species keys from 735 to 629 and removing 299 photo references
- npm run validate-species now reports 0 warnings; end-to-end build passes

## Photo Count Conservation

| Metric | Count |
|--------|-------|
| Species keys before | 735 |
| Orphans removed | 106 |
| Species keys after | 629 |
| Photo references before | 1424 |
| Photo references removed | 299 |
| Photo references after | 1125 |

Photo count delta (299) exactly matches the sum of `photo_count` over all remove dispositions in the audit JSON.

## Task Commits

1. **Task 1: Generate orphan disposition report** - `3420b84` (feat)
2. **Task 2: Human review** - (checkpoint; no commit)
3. **Task 3: Apply approved dispositions** - `e044b25` (feat)

## Files Created/Modified
- `content/species-photos.toml` - Removed 106 orphan species sections (3008 lines deleted)
- `.planning/phases/92-slug-migration-pipeline-prep/92-03-toml-audit.json` - Audit report with all 106 dispositions

## Decisions Made
- All 106 orphans were non-bee taxa (wasps, beetles, flies, parasitoids, insect orders like Coleoptera/Diptera/Lepidoptera) with no matching scientificName in species.json under any capitalization — all correctly classified as `remove`
- No `rekey` dispositions were needed because none of the bare-word keys corresponded to a bee genus or species
- tomlkit used for round-trip TOML mutation (not regex) to guarantee syntactic correctness post-edit
- tomlkit installed ephemerally (not persisted to pyproject.toml) since this is a one-shot migration

## Deviations from Plan

None - plan executed exactly as written. The audit heuristic correctly produced only `remove` dispositions; no `rekey` cases arose because the orphan set was entirely non-bee taxa (wasps, wasps, insects from other orders) rather than bee species with capitalization mismatches.

## Issues Encountered

None.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run validate-species` | `629 species, 0 warning(s)` (exit 0) |
| TOML parseability (`@iarna/toml`) | ok |
| Python `tomllib` parseability | (confirmed via tomlkit round-trip) |
| validate-species test suite (16 tests) | passed |
| `npm run build` end-to-end | passed |

## Threat Surface Scan

No new security surface introduced. This plan only deletes TOML sections; it does not add new endpoints, auth paths, or schema changes. T-92-03-02 (photo loss risk) was mitigated by the Task 2 human-review checkpoint; the audit trail in 92-03-toml-audit.json is committed to the repo.

## Next Phase Readiness
- PIPE-03 TOML cleanup requirement is now fully satisfied
- Phase 94 (species page rendering) can safely look up photos via `photos[sp.scientificName]` with confidence that all TOML keys are valid scientificName values
- No blockers or concerns

---
*Phase: 92-slug-migration-pipeline-prep*
*Completed: 2026-05-15*
