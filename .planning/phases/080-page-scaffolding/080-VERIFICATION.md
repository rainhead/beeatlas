---
phase: 080-page-scaffolding
verified: 2026-05-04T19:00:00Z
status: passed
score: 10/10 must-haves verified
verdict: PASS
---

# Phase 80: Page Scaffolding — Verification Report

**Phase Goal:** A static `/species/` page server-renders one `<bee-species-card>` per species (skeleton, no visual polish), shipped in its own Vite chunk that does NOT pull `mapbox-gl` or `wa-sqlite`. ARCH-04 source-analysis test enforces the chunk boundary. Page consumes Phase 78 species feed and Phase 79 photo manifest. Defers visual design and interaction to Phase 81.

**Verified:** 2026-05-04
**Status:** PASS
**Re-verification:** No — initial verification

## Goal Achievement

The phase delivers a working scaffolding page that Phase 81 can build atop. Every architectural decision from CONTEXT.md (D-01 through D-07) is verifiable in the codebase. Every PAGE-* requirement has a test guarding it, and the entire Wave 0 test set is GREEN. The build produces the expected separated chunk with no leakage of forbidden dependencies.

## Per-Requirement Check

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| PAGE-01 | `_pages/species.njk` declares `layout: default.njk` + `permalink: /species/index.html`; renders one card per species | VERIFIED | `_pages/species.njk` lines 1-5 (front-matter), line 7 (`{%- for sp in species.flat -%}`); `_site/species/index.html` contains 735 `<bee-species-card>` substrings (matches the species count in `_data/species.js`) |
| PAGE-02 | `_data/species.js` reads species.json (NOT parquet); exports `{ tree, flat, byScientificName }` | VERIFIED | `_data/species.js` (1914 B) imports `readFileSync`, parses `public/data/species.json`; default-exports the three required keys; zero occurrences of `parquet` token; `data-species.test.ts` GREEN |
| PAGE-03 | `_data/photos.js` reads TOML via `@iarna/toml`, sorts by `ordering`, exposes `Record<scientificName, {description, photos[]}>` | VERIFIED | `_data/photos.js` (1243 B) uses `TOML.parse(readFileSync(...))`; sorts photos by `ordering`; `data-photos.test.ts` GREEN |
| PAGE-04 | `src/entries/species.ts` Vite side-effect entry; referenced by `<script type="module" src="/src/entries/species.ts">` | VERIFIED | `src/entries/species.ts` has exactly 3 side-effect imports (bee-header, bee-species-page, bee-species-card); `_pages/species.njk:26` references the entry; `arch.test.ts` allowlist branch GREEN; chunk emitted at `_site/assets/species/index-CM7zB6fH.js` |
| PAGE-05 | `<bee-species-page>` coordinator owns `_activeTaxonPath`, `_geoFilter`, `_seasonFilter` | VERIFIED | `src/species/bee-species-page.ts` lines 41-43 declare all three `@state` fields with locked D-07 defaults; `bee-species-page.test.ts` GREEN |
| PAGE-06 | Presenters are pure, never import `bee-species-page.ts` | VERIFIED | `src/species/bee-species-card.ts` import lines (21-22) are only `lit`/`lit/decorators.js`; the only `bee-species-page` references in the file are comment lines (7, 12); `arch.test.ts` `PAGE-06: presenter→coordinator non-import` describe block GREEN |
| PAGE-07 | `loading="lazy"` on every photo + map; `content-visibility: auto` on each card | VERIFIED | `_site/species/index.html` contains 1045 `<img>` tags, **0** without `loading="lazy"`; `bee-species-card.ts:38-44` defines `static styles` with `:host { content-visibility: auto; ... }` |
| PAGE-08 | ARCH-04 — `src/species/**.ts` does NOT import `mapbox-gl`, `wa-sqlite`, `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts` | VERIFIED | Both files in `src/species/` import only from `lit` and `lit/decorators.js`; `arch.test.ts` checks all 10 forbidden specifiers (static + dynamic) and is GREEN; runtime confirmation: species chunk contains 0 `mapboxgl` / 0 `wa-sqlite` strings |
| PAGE-09 | Build produces separate `species-*.js` chunk distinct from SPA `index-*.js` | VERIFIED | `_site/assets/species/index-CM7zB6fH.js` (1.34 KB raw / 0.63 KB gzip) emitted; `_site/assets/index-DhaNqc-8.js` (1998 KB) is the separate SPA chunk; no overlap; `build-output.test.ts` GREEN |
| ARCH-04 | Invariant: src/species/** boundary excluded from heavy SPA deps | VERIFIED | Source: `arch.test.ts` checks all forbidden imports; Bundle: `strings _site/assets/species/index-*.js \| grep -ci mapbox` = 0, `wa-sqlite` = 0 |

## D-* Decision Lock Verification

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 (flat alphabetical list) | VERIFIED | `_data/species.js` sorts by `localeCompare(scientificName)`; `data-species.test.ts` "flat is sorted alphabetically" assertion GREEN |
| D-02 (skeleton card; deep-link `/?taxon=`) | VERIFIED | `_pages/species.njk:22` `<a href="/?taxon={{ sp.scientificName \| urlencode }}">` |
| D-03 (`<img>` reference for SVG) | VERIFIED | `_pages/species.njk:17` `<img loading="lazy" src="/data/species-maps/{{ sp.slug }}.svg" ...>` |
| D-04 (skip slot when data missing) | VERIFIED | Template has explicit `{%- if photoEntry and photoEntry.photos and photoEntry.photos.length > 0 -%}` (line 11) and `{%- if sp.occurrence_count > 0 -%}` (line 16); 1045 imgs / 735 cards = ~310 cards with at least one omitted slot |
| D-05 (`createRenderRoot() → this`; no `render()`) | VERIFIED | Both `bee-species-card.ts` and `bee-species-page.ts` define `createRenderRoot(): HTMLElement { return this; }`; deterministic regex for method-definition lines (`^[[:space:]]*(modifier)?render\s*\(`) returns 0 matches in both files; `bee-species-card.test.ts` asserts `BeeSpeciesCard.prototype.render === LitElement.prototype.render` and is GREEN |
| D-06 (only `bee-species-page` + `bee-species-card`) | VERIFIED | `ls src/species/` shows exactly the two files; the four deferred components are not present |
| D-07 (state defaults) | VERIFIED | `bee-species-page.ts` lines 41-43 with empty defaults `[]` / `null` / `null` |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npm test` | 242 tests passed across 16 files | PASS |
| Build succeeds end-to-end | `npm run build` | Exit 0; validate-schema → validate-species → typecheck → eleventy + Vite all green; 2.73s Vite build | PASS |
| Species page emitted with full card count | `grep -c '<bee-species-card\b' _site/species/index.html` | 735 | PASS |
| Every img is lazy | `grep -oE '<img\b[^>]*>' _site/species/index.html \| grep -v 'loading="lazy"' \| wc -l` | 0 | PASS |
| Species chunk is separate | `ls _site/assets/species/index-*.js` | `_site/assets/species/index-CM7zB6fH.js` (1.34 KB) | PASS |
| No mapbox in species chunk | `strings _site/assets/species/index-*.js \| grep -ci mapbox` | 0 | PASS |
| No wa-sqlite in species chunk | `strings _site/assets/species/index-*.js \| grep -ci 'wa-sqlite\|wa_sqlite'` | 0 | PASS |
| SVG precondition (Wave 0 task 1) | `ls public/data/species-maps/*.svg \| wc -l` | 556 | PASS |

## Goal-Backward Analysis

**Phase goal:** "A static `/species/` page renders one server-rendered `<bee-species-card>` per species (skeleton content), shipped in its own Vite chunk that does NOT pull mapbox-gl or wa-sqlite. Page scaffolding ready for Phase 81 to build atop."

Working backwards:
1. **Does Phase 81 have a coordinator with reactive state to wire?** Yes — `BeeSpeciesPage._activeTaxonPath`, `_geoFilter`, `_seasonFilter` are declared with empty defaults, and `GeoFilter` / `SeasonFilter` types are exported. Phase 81 wires events onto existing fields (D-07).
2. **Does Phase 81 have a card component to slot data into?** Yes — `BeeSpeciesCard` is a light-DOM presenter with `@property` declarations (`scientificName`, `slug`, `occurrenceCount`); the SSR markup is preserved across upgrade (D-05 verified by prototype-identity test).
3. **Does Phase 81 have a working data cascade?** Yes — `_data/species.js` (`{tree, flat, byScientificName}`) and `_data/photos.js` are exposed to Eleventy and consumed by the template.
4. **Does the boundary hold?** Yes — `arch.test.ts` enforces ARCH-04 (forbidden imports) AND PAGE-06 (presenter→coordinator non-import) at source level; build artifact confirms 0 mapbox / 0 wa-sqlite tokens in the species chunk.
5. **Does Phase 81 have a deep-link contract to extend?** Yes — `?taxon=` href is server-rendered (intentionally partial per Pitfall 2); Phase 81's LINK-01 adds `&taxonRank=species` via the existing anchor.
6. **Does Phase 81 face any unresolved scaffolding work?** No — visual polish, the four deferred presenters, and event wiring are explicitly Phase 81/82 scope per CONTEXT.md.

The phase achieves its scaffolding goal. The footing for Phase 81 is concrete: state shape locked, data feed wired, template emits, boundary enforced.

## Anti-Patterns Found

None blocking. The codebase deliberately omits `render()` (D-05) and uses the locked state-default shape (D-07). Comments in `bee-species-card.ts` reference `bee-species-page.ts` by name in prose, but no actual import statement exists — `arch.test.ts` strips comments before regex-matching imports, so this is correctly not flagged.

## Deviations Documented in Plan SUMMARYs

- **Plan 03:** Dropped `private` modifier on `@state` fields in `BeeSpeciesPage` because `noUnusedLocals` flagged forward-looking declarations. Tests still access via `(el as any)._field` and pass. Acceptable — semantically equivalent for the contract.
- **Plan 04:** `build-output.test.ts` originally asserted flat-layout chunk path (`^species-.*\.js$`); plugin-vite MPA actually emits the chunk under `_site/assets/species/index-<hash>.js` (nested per page slug). Test updated to accept either layout via a `findSpeciesChunk()` helper. Architectural intent (separate chunk + mapbox-free) is satisfied; only the filename pattern was wrong.
- **Plan 04:** Auto-fixed three pre-existing test type errors (matchAll inference under `noUncheckedIndexedAccess`; protected-member access via `as any`) that were blocking the typecheck step.

These are recorded in their respective SUMMARYs and are not gaps — all deviations are documented and the phase contracts remain satisfied.

## Human Verification Recommended (Not Blocking)

Per VALIDATION.md Manual-Only:
- `npm run dev` smoke: open `http://localhost:8080/species/`, verify page loads, cards visible, no console errors. Visual sanity of three card variants (with-photo+map, checklist-only, photoless).

These are deferred per the validation strategy (Phase 80 explicitly scaffolds; visual polish is Phase 81). Not required for goal achievement.

## Verdict: PASS

All 9 PAGE-* requirements + ARCH-04 invariant verified at source AND build-artifact level. Wave 0 test suite (7 files, 14+ assertions) GREEN. End-to-end `npm run build` succeeds. Species chunk is 1.34 KB (3 orders of magnitude smaller than SPA chunk) and contains zero mapbox/wa-sqlite tokens — the architectural payoff is real. Phase 81 has a complete scaffolding to build atop: declared state, exported types, working data cascade, server-rendered template, enforced boundary.

---

_Verified: 2026-05-04_
_Verifier: Claude (gsd-verifier)_
