---
phase: 80
slug: page-scaffolding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Distilled from `080-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 (`devDependencies` in `package.json`) |
| **Config file** | `vite.config.ts` (test config inlined: `environment: 'happy-dom'`; excludes `_site/`, `node_modules/`, `.claire/`) |
| **Quick run command** | `npm test -- src/tests/arch.test.ts src/tests/bee-species-card.test.ts src/tests/bee-species-page.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (quick); ~30 seconds (full + happy-dom) |

---

## Sampling Rate

- **After every task commit:** Run quick command (above)
- **After every plan wave:** Run `npm test` (full Vitest suite)
- **Before `/gsd-verify-work`:** Full suite green; `npm run build` green; `_site/species/index.html` exists; `_site/assets/species-*.js` exists; no `mapboxgl` symbols in species chunk
- **Max feedback latency:** ~5 seconds (quick); ~30 seconds (full)

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Status |
|--------|----------|-----------|-------------------|-------------|
| PAGE-01 (build) | `/species/index.html` emitted with one `<bee-species-card>` per species | integration | `npm run build && test -f _site/species/index.html && [ $(grep -c '<bee-species-card' _site/species/index.html) -ge 735 ]` | ❌ W0 |
| PAGE-01 (template) | `_pages/species.njk` exists with `layout: default.njk`, `permalink: /species/index.html` | unit | `npm test -- src/tests/page-scaffold.test.ts` | ❌ W0 |
| PAGE-02 | `_data/species.js` reads `species.json` (NOT parquet); exports `{ tree, flat, byScientificName }` | unit | `npm test -- src/tests/data-species.test.ts` + `! grep -q parquet _data/species.js` | ❌ W0 |
| PAGE-03 | `_data/photos.js` reads TOML, sorts by `ordering`, exports `Record<scientificName, {description, photos[]}>` | unit | `npm test -- src/tests/data-photos.test.ts` (fixture-TOML scrambled `ordering`, asserts sorted) | ❌ W0 |
| PAGE-04 | `src/entries/species.ts` exists; only side-effect imports of `bee-header`, `bee-species-page`, `bee-species-card` | unit | `npm test -- src/tests/arch.test.ts` (entry allowlist branch) | ❌ W0 |
| PAGE-05 | `<bee-species-page>` declares `_activeTaxonPath`, `_geoFilter`, `_seasonFilter` with empty defaults | unit | `npm test -- src/tests/bee-species-page.test.ts` (instance shape assertions) | ❌ W0 |
| PAGE-06 (partial) | `<bee-species-card>` does NOT import from `bee-species-page.ts` | unit | `src/tests/arch.test.ts` (cross-file import regex) | ❌ W0 |
| PAGE-07 | Every `<img>` carries `loading="lazy"`; `<bee-species-card>` host applies `content-visibility: auto` | unit + integration | post-build: `[ $(grep -c 'loading="lazy"' _site/species/index.html) -ge $((n_with_photo + n_with_map)) ]`; `grep -q 'content-visibility' src/species/bee-species-card.ts` | ❌ W0 |
| PAGE-08 | No `src/species/**.ts` imports `mapbox-gl`, `wa-sqlite`, `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts` (static AND dynamic) | unit | `npm test -- src/tests/arch.test.ts` | ❌ W0 |
| PAGE-09 | `_site/assets/species-*.js` exists; mapbox-gl symbols absent | integration | `npm run build && ls _site/assets/species-*.js && ! grep -l mapboxgl _site/assets/species-*.js` | ❌ W0 |
| D-05 lock | `BeeSpeciesCard.prototype.render === LitElement.prototype.render` (no override); `createRenderRoot` returns `this` | unit | `npm test -- src/tests/bee-species-card.test.ts` (prototype identity + render-root return) | ❌ W0 |
| D-04 (skip slot) | When `occurrence_count === 0`, no `<img src=".../species-maps/*">` in card | integration | post-build snapshot test (e.g., a known checklist-only species) | ❌ W0 |
| Skip empty manifest | When TOML photos array is empty, no photo `<img>` in card | integration | post-build snapshot test (species with empty photos array) | ❌ W0 |
| SVG precondition | `public/data/species-maps/*.svg` count ≥ 1 | environment | `[ $(ls public/data/species-maps/*.svg 2>/dev/null | wc -l) -gt 0 ]` (gates `npm run build`) | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · W0 = Wave 0 dependency*

---

## Wave 0 Requirements

- [ ] `src/tests/arch.test.ts` — PAGE-08 + partial PAGE-06 (import allowlist regex over `src/species/**.ts` and `src/entries/species.ts`; covers static `from '...'` AND dynamic `import('...')`)
- [ ] `src/tests/bee-species-card.test.ts` — D-05 prototype identity + `content-visibility` style presence
- [ ] `src/tests/bee-species-page.test.ts` — PAGE-05 state-shape assertions
- [ ] `src/tests/data-species.test.ts` — PAGE-02 (`{ tree, flat, byScientificName }` shape; no parquet import)
- [ ] `src/tests/data-photos.test.ts` — PAGE-03 (sort-by-`ordering`, missing-description handling)
- [ ] `src/tests/page-scaffold.test.ts` — PAGE-01 + PAGE-04 (front-matter regex; entry path)
- [ ] `src/tests/build-output.test.ts` (or shell step in CI) — PAGE-07 (lazy attrs in emitted HTML), PAGE-09 (chunk presence + no-mapbox), D-04 skip-slot snapshot
- [ ] SVG-population precondition documented as a Wave-0 task: `cd data && uv run python species_maps.py` (or equivalent) before `npm run build` is meaningful
- [x] Vitest 4.1.2 already installed — no new framework

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run dev` serves `/species/` and renders cards in browser | PAGE-01 (smoke) | HMR + Vite middleware behavior is hard to assert in CI without launching a real dev server | Run `npm run dev`; open `http://localhost:8080/species/`; verify page loads, cards visible, no console errors |
| Visual sanity of skeleton card | D-02 (data-wiring smoke) | Skeleton phase explicitly defers visual polish; manual eyeball confirms data wired correctly | Spot-check 3 cards: (a) one with photo + map, (b) one checklist-only (no map), (c) one with empty photo array (no photo slot) |

*Visual-design verification is intentionally deferred to Phase 81 per CONTEXT.md D-02/D-06.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (7 new test files + SVG precondition)
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 lands)

**Approval:** pending
