---
phase: 080-page-scaffolding
plan: 03
subsystem: species-page
tags: [lit, eleventy, vite, light-dom, mpa, page-scaffolding]
requires:
  - 080-01 (Wave 0 RED tests scaffolding)
provides:
  - "src/species/ directory exists with two TypeScript files"
  - "BeeSpeciesPage coordinator (light DOM, no render(), state defaults locked)"
  - "BeeSpeciesCard presenter (light DOM, no render(), content-visibility: auto)"
  - "src/entries/species.ts MPA entry"
  - "_pages/species.njk Eleventy template"
affects: []
tech-stack:
  added: []
  patterns:
    - "Light-DOM Lit element via createRenderRoot() returning this + omitted render()"
    - "Vite MPA entry with side-effect imports for custom-element registration"
    - "Eleventy Nunjucks loop emitting one custom element per data row"
key-files:
  created:
    - src/species/bee-species-page.ts
    - src/species/bee-species-card.ts
    - src/entries/species.ts
    - _pages/species.njk
  modified: []
decisions:
  - "Dropped `private` modifier on @state fields in BeeSpeciesPage so noUnusedLocals doesn't flag forward-looking declarations before Phase 81 wires them; tests still access via `(el as any)._field`"
  - "content-visibility: auto kept inside `static styles` on BeeSpeciesCard (light-DOM root); fallback to global :where() in template was not needed"
metrics:
  duration: ~5 min
  completed: 2026-05-04
---

# Phase 80 Plan 03: Component Scaffolding Summary

Created the four files that constitute Phase 80's user-facing surface — the two Lit coordinator/presenter skeletons under `src/species/`, the Vite MPA entry that registers them, and the Eleventy template that server-renders one `<bee-species-card>` per species in alphabetical order.

## Wave 0 Tests Now GREEN

Tests in this plan's responsibility (depends_on Plan 01):

- `src/tests/arch.test.ts` — ARCH-04 boundary (no forbidden imports under `src/species/**`); PAGE-06 presenter→coordinator non-import; `src/entries/species.ts` allowlist
- `src/tests/bee-species-card.test.ts` — D-05 prototype identity (`render === LitElement.prototype.render`); `createRenderRoot` returns host
- `src/tests/bee-species-page.test.ts` — PAGE-05 state defaults (`_activeTaxonPath = []`, `_geoFilter = null`, `_seasonFilter = null`)
- `src/tests/page-scaffold.test.ts` — PAGE-01 front-matter + PAGE-04 entry script tag

Combined: **14 tests passing across 4 files.**

Tests in sibling Plan 02's responsibility (still RED until Plan 02 ships `_data/species.js` and `_data/photos.js`):

- `src/tests/data-species.test.ts`
- `src/tests/data-photos.test.ts`

Build-output tests (`src/tests/build-output.test.ts`) remain RED until Plan 04 runs `npm run build`.

## Where content-visibility Lives

`content-visibility: auto` (PAGE-07) is declared in `BeeSpeciesCard`'s `static styles` block:

```css
:host {
  content-visibility: auto;
  contain-intrinsic-size: 1px 400px;
  display: block;
}
```

Lit's `static styles` are emitted as a `<style>` tag inside the host element on connect when `createRenderRoot` returns `this`. The `:host` selector resolves against the host element directly. The plan's documented fallback (global `:where(bee-species-card)` in the template) was not needed — the static-styles location compiles cleanly and satisfies the VALIDATION.md line 49 grep.

## Exact Import Lines (ARCH-04 + PAGE-06 audit posterity)

`src/species/bee-species-page.ts`:
```typescript
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
```

`src/species/bee-species-card.ts`:
```typescript
import { LitElement, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
```

`src/entries/species.ts`:
```typescript
import '../bee-header.ts';
import '../species/bee-species-page.ts';
import '../species/bee-species-card.ts';
```

No forbidden imports. The card never imports the coordinator. The entry imports only the bee-header leaf and the two species components.

## Files NOT Touched (Confirmation)

- `_pages/index.html` — untouched
- `_layouts/default.njk` — untouched (chrome chain reused)
- `_layouts/base.njk` — untouched
- `eleventy.config.js` — untouched (MPA auto-discovery handles the new entry)
- `vite.config.ts` — untouched (no `rollupOptions.input` needed)

Plugin-vite's MPA `appType` auto-discovers `<script type="module">` entries from any Eleventy-emitted HTML. The species chunk will be emitted as `_site/assets/species-*.js` — Plan 04 verifies post-build.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `noUnusedLocals` flagged forward-looking @state private fields**

- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `tsconfig.json` enables `noUnusedLocals: true`. The three `@state private _foo` declarations in `BeeSpeciesPage` are never read in Phase 80 (Phase 81 will wire them into a `render()` override or event handlers). TypeScript flagged TS6133 errors blocking the build.
- **Fix:** Dropped the `private` modifier (kept `@state()` decorator + underscore-prefix convention). Tests already access via `(el as any)._field`; the underscore signals "internal — do not depend on from outside the class." Compatible with the test contract; PAGE-05 still GREEN.
- **Files modified:** `src/species/bee-species-page.ts`
- **Commit:** 3f4842e (folded into Task 2's commit because the introduction of the card + entry made the typecheck reachable from the test suite)

### Out-of-Scope (Pre-existing)

`npx tsc --noEmit` reports three additional errors in test files from Plan 01:

- `src/tests/arch.test.ts:79` — `Type '(string | undefined)[]' is not assignable to type 'string[]'` (regex matchAll inference under `noUncheckedIndexedAccess`)
- `src/tests/bee-species-card.test.ts:12,17` — TS2445 protected access to `LitElement.prototype.render` and `BeeSpeciesCard.prototype.createRenderRoot`

These errors existed before Plan 03 (verified via stash inspection — they only become visible once `bee-species-card.ts` and `bee-species-page.ts` exist for the type-checker to resolve the test imports). Per scope boundary, they are not Plan 03's fix; logged here for Plan 04 / verifier visibility. Vitest itself runs the tests successfully (the type-check failures don't block runtime).

## Per-task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add BeeSpeciesPage coordinator skeleton | a008d35 |
| 2 | Add BeeSpeciesCard presenter + Vite MPA entry | 3f4842e |
| 3 | Add `_pages/species.njk` Eleventy template | 9b5f3b8 |

## Self-Check: PASSED

Files exist:
- FOUND: src/species/bee-species-page.ts
- FOUND: src/species/bee-species-card.ts
- FOUND: src/entries/species.ts
- FOUND: _pages/species.njk

Commits exist:
- FOUND: a008d35
- FOUND: 3f4842e
- FOUND: 9b5f3b8
