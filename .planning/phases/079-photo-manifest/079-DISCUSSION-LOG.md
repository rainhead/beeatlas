# Phase 79: Photo Manifest — Discussion Log

**Conducted:** 2026-05-04
**Mode:** /gsd-discuss-phase 79 (default)

This log is a human-reference audit trail of the discussion. **Downstream agents (researcher, planner, executor) read CONTEXT.md, not this file.**

## Areas Discussed

### Area 1: Seed write policy

**Question:** How should the seed helper treat an existing `content/species-photos.toml`?

**Options presented:**
1. Fill-only, never overwrite (Recommended)
2. Overwrite photos array, preserve description
3. Refuse to run if file exists; require --force
4. Per-species --species flag, no bulk overwrite

**User selected:** Fill-only, never overwrite

**Rationale captured:** the workflow is "manual editing", so re-runs must be safe. Humans always win at the table-key level.

### Area 2: Manifest scope

**Question:** Which species should the starter manifest cover?

**Options presented:**
1. Only species with occurrence_count > 0 (Recommended)
2. All species in species.json (~735)
3. Only species the operator names via --species flags

**User selected:** All species in species.json (~735)

**Rationale captured:** the manifest is the canonical place to author per-species content (descriptions, hand-curated photos). Up-front coverage avoids "missing species" surprises in Phase 80.

### Area 3: Photo selection heuristic

**Question:** What should the seed pull from iNat per species?

**Options presented:**
1. Top 3 research-grade by faves, WA observations preferred (Recommended)
2. Top 1 photo per species, WA only
3. Top 5 research-grade by faves, global
4. Configurable via --top-n and --wa-only flags

**User selected:** Top 3 research-grade by faves, WA observations preferred

**Rationale captured:** WA-first preserves project locality; fall back to global to fill the slot when WA candidates are scarce; license-whitelist filtering applied at seed time.

### Area 4: Test runtime

**Question:** Which test runtime for the validator? Success criterion 5 explicitly offers either.

**Options presented:**
1. Vitest in src/tests/ (Recommended)
2. Pytest in data/
3. Both — vitest for unit, pytest for end-to-end

**User selected:** Vitest in src/tests/

**Rationale captured:** validator is a Node script; Vitest is the natural fit and matches existing src/tests/arch.test.ts pattern. No Node-from-Python coupling.

## Deferred Ideas

(See CONTEXT.md `<deferred>` for the full list — comment preservation, photo-count tuning, --refresh flag, auto-rotation, non-iNat photo sources.)

## Claude's Discretion Items

(See CONTEXT.md `<decisions>` "Claude's Discretion" — validator API surface, error message format, fixture-TOML location, etc.)
