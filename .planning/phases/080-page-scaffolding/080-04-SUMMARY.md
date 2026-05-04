---
phase: 080-page-scaffolding
plan: 04
subsystem: species-page
tags: [build-verification, vite, eleventy, page-scaffolding, page-09, page-07]
requires:
  - 080-02 (build-time data feeds)
  - 080-03 (component scaffolding)
provides:
  - "Verified separate species chunk emission with no mapbox/wa-sqlite leakage"
  - "Verified PAGE-07 lazy-loading on every <img> in the emitted /species/ page"
  - "Verified PAGE-01 build-time card emission (735 cards)"
  - "Verified D-04 skip-slot behavior for occurrence_count==0 species"
  - "Phase 80 species chunk size baseline for Phase 82 PERF-01 budget"
affects:
  - "src/tests/build-output.test.ts (test fix — accepts nested chunk path)"
  - "src/tests/arch.test.ts (test fix — noUncheckedIndexedAccess)"
  - "src/tests/bee-species-card.test.ts (test fix — protected member access)"
tech-stack:
  added: []
  patterns:
    - "plugin-vite MPA emits per-page entry under _site/assets/<page-slug>/index-<hash>.js when the page is at a non-root permalink"
key-files:
  created:
    - .planning/phases/080-page-scaffolding/080-04-SUMMARY.md
  modified:
    - src/tests/arch.test.ts
    - src/tests/bee-species-card.test.ts
    - src/tests/build-output.test.ts
decisions:
  - "Build-output test was asserting `^species-.*\\.js$` (flat layout), but plugin-vite MPA emits the species page entry under `_site/assets/species/index-<hash>.js`. Test updated to accept either layout — architectural intent (separate chunk, mapbox-free) is what matters, not the exact filename shape."
metrics:
  duration: ~10 min
  completed: 2026-05-04
---

# Phase 80 Plan 04: Build Verification Summary

Phase 80's payoff plan: ran `npm run build` end-to-end and confirmed all four PAGE-09 / PAGE-07 / PAGE-01 invariants. The species page emits 735 cards from build-time data, the page entry is bundled as a chunk distinct from the SPA, the chunk is mapbox-free and wa-sqlite-free, and every emitted `<img>` carries `loading="lazy"`. The ARCH-04 boundary held all the way through to the bundle.

## Build artifacts

| Artifact | Path | Size |
|----------|------|------|
| Page HTML | `_site/species/index.html` | 249,214 B (gzip ~24.1 KB per Vite report) |
| Species chunk | `_site/assets/species/index-CrcsdKg-.js` | 1,336 B raw / 648 B gzipped |
| SPA chunk (for comparison) | `_site/assets/index-DrPTd4ZK.js` | 1,998,012 B raw |

The species chunk is **3 orders of magnitude smaller** than the SPA chunk (1.3 KB vs 2 MB). PERF-01 (Phase 82) sets a < 100 KB ceiling for the species page bundle; current baseline including shared `bee-header-*` and `state-*` chunks is well under that. Build wall-time: **5.0s** total (validate-schema 0.4s, validate-species 0.3s, typecheck ~1s, eleventy + Vite 3.3s).

## PAGE-09 boundary verification

- **mapbox-gl strings in species chunk:** 0 (both `grep mapboxgl` and `strings | grep -ci mapbox`)
- **wa-sqlite strings in species chunk:** 0 (`strings | grep -ci 'wa-sqlite\|wa_sqlite'`)
- **Imports resolved into the species chunk** (from disassembling the emitted JS):
  - `../bee-header-BrJuCt-o.js` (re-exports Lit `LitElement`, `customElement`, `property`, `css`)
  - `../bee-header-CdD26Nqa.js` (side-effect import for `<bee-header>` registration)
  - `../state-DczTDWI9.js` (re-exports `@state` decorator)
- **Forbidden imports observed:** none. ARCH-04 holds at runtime.

The species chunk contains exactly the two custom-element class definitions (`BeeSpeciesPage`, `BeeSpeciesCard`) with their state/property decorators and the `createRenderRoot(){return this}` light-DOM hook. No `render()` overrides (D-05). No event wiring yet (Phase 81).

## PAGE-07 lazy-loading verification

- Total `<img>` tags in emitted page: **1,045**
- `<img>` tags missing `loading="lazy"`: **0**

Every emitted image (photo + map combined) carries `loading="lazy"`. The card subtree's `content-visibility: auto` is applied via the species chunk's compiled `static styles` (visible in the bundle source).

## Wave 0 closure

| Test | Status |
|------|--------|
| arch.test.ts (incl. PAGE-06 presenter→coordinator non-import) | GREEN |
| bee-species-card.test.ts | GREEN |
| bee-species-page.test.ts | GREEN |
| data-species.test.ts | GREEN |
| data-photos.test.ts | GREEN |
| page-scaffold.test.ts | GREEN |
| build-output.test.ts | GREEN (4/4 passing after fix) |

Full repo Vitest run: **238 tests passed across 15 files** (build-output skipped only when `VITEST_SKIP_BUILD=1` is set; runs cleanly without the flag too).

## D-04 skip-slot evidence

- **Checklist-only species sampled:** *Agapostemon texanus* (slug `agapostemon-texanus`, `occurrence_count == 0`)
- **Card subtree contains `/data/species-maps/agapostemon-texanus.svg`:** NO. D-04 holds.
- **Photoless skip:** the species.njk template guards the photo `<img>` with `{%- if photoEntry and photoEntry.photos and photoEntry.photos.length > 0 -%}`, so any species without a photos entry receives no `<img>` for photos. (Total `<img>` count of 1,045 across 735 cards = ~310 cards have either no photo or no map; mechanics verified by template inspection.)

## Phase 80 ROADMAP success criteria

1. **`/species/` page renders cards:** VERIFIED at build time (735 cards in `_site/species/index.html`); manual `npm run dev` smoke deferred to `/gsd-verify-work` per VALIDATION.md
2. **`<bee-species-page>` coordinator + `<bee-species-card>` presenter shipped, ARCH-03 mirrored:** VERIFIED (Plan 03 unit tests + chunk source inspection here)
3. **`loading="lazy"` + `content-visibility: auto`:** VERIFIED (0 non-lazy imgs; static-styles block visible in bundled chunk)
4. **ARCH-04 + PAGE-06 source-analysis tests pass:** VERIFIED (arch.test.ts 9/9 GREEN)
5. **Separate species chunk, no mapbox-gl symbols:** VERIFIED (`_site/assets/species/index-CrcsdKg-.js` exists; 0 mapbox/wa-sqlite tokens)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pre-existing test type errors blocked `npm run build`**

- **Found during:** Task 1 Step 1 (`npm run build` exited non-zero at `tsc --noEmit`)
- **Issue:** Three TS errors in test files authored in Plan 01 (and explicitly logged in Plan 03's "Out-of-Scope (Pre-existing)" section as Plan 04's responsibility):
  - `src/tests/arch.test.ts:79` — `matchAll` produces `(string | undefined)[]` under `noUncheckedIndexedAccess`
  - `src/tests/bee-species-card.test.ts:12,17` — TS2445 protected access to `LitElement.prototype.render` and `BeeSpeciesCard.prototype.createRenderRoot`
- **Fix:**
  - `arch.test.ts`: `.filter((s): s is string => s !== undefined)` after `.map(m => m[1])`
  - `bee-species-card.test.ts`: cast `prototype` to `any` for protected-member access (semantics unchanged — these tests intentionally inspect prototype identity)
- **Files modified:** `src/tests/arch.test.ts`, `src/tests/bee-species-card.test.ts`
- **Commit:** 17cbc3a

**2. [Rule 1 — Bug] `build-output.test.ts` regex did not match plugin-vite MPA chunk path**

- **Found during:** Task 1 Step 8 (`npx vitest run src/tests/build-output.test.ts` — 2 failures)
- **Issue:** The test asserted the species chunk filename matches `^species-.*\.js$` (flat layout), but plugin-vite MPA emits the `/species/` page's entry as `_site/assets/species/index-<hash>.js` (nested under a `species/` subdirectory matching the page slug). The architectural contract (separate chunk + mapbox-free) is fully satisfied; only the filename pattern was wrong in the test.
- **Fix:** Added a `findSpeciesChunk()` helper that returns the chunk regardless of layout (flat OR nested). Both assertions now use it.
- **Files modified:** `src/tests/build-output.test.ts`
- **Commit:** 17cbc3a

### Out-of-Scope / Deferred

None. All blockers were directly caused by the build sequence this plan exists to verify, so Rule 3 applies.

### Worktree-only setup (not deviations)

- Symlinked `node_modules -> /Users/rainhead/dev/beeatlas/node_modules` and `public/data -> /Users/rainhead/dev/beeatlas/public/data` (per parallel-execution guidance — `public/data/` is gitignored and required for build).

## Manual-only items deferred to /gsd-verify-work

- `npm run dev` smoke (per VALIDATION.md Manual-Only)
- Visual sanity check of three card variants (with-photo+map, checklist-only, photoless)

## Footing for Phase 81

- **State properties already declared per D-07** — `_activeTaxonPath`, `_geoFilter`, `_seasonFilter` defaults visible in the compiled species chunk source; Phase 81 `render()` override + event handlers can read them without re-declaring.
- **Deep-link href already in place per D-02 / Pitfall 2** — the `<a href="/?taxon={{ sp.scientificName | urlencode }}">Open in atlas</a>` line in `_pages/species.njk` is server-rendered; Phase 81's atlas-side query-param handler can rely on it.
- **PAGE-06 contract pre-locked** — `arch.test.ts` already enforces presenter-cannot-import-coordinator, so Phase 81 can add new presenters under `src/species/` without re-litigating the boundary.

## Per-task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Build verification + auto-fix three test type/regex errors | 17cbc3a |

(Plan 04 was a single-task verification plan; the only modifications were Rule 3 / Rule 1 auto-fixes folded into one commit.)

## Self-Check: PASSED

Files exist:
- FOUND: .planning/phases/080-page-scaffolding/080-04-SUMMARY.md
- FOUND: _site/species/index.html (build artifact; not committed)
- FOUND: _site/assets/species/index-CrcsdKg-.js (build artifact; not committed)
- FOUND: src/tests/arch.test.ts (modified)
- FOUND: src/tests/bee-species-card.test.ts (modified)
- FOUND: src/tests/build-output.test.ts (modified)

Commits exist:
- FOUND: 17cbc3a (`fix(080-04): correct Wave 0 test type errors and species chunk path glob`)
