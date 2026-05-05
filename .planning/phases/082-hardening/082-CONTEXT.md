# Phase 82: Hardening - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The species page (`/species/`) meets its perf, a11y, and durability budgets and survives a UAT pass against the seed's stated use cases ("Which species of *Eucera* are present in this ecoregion?", "Which are most likely / frequently collected?").

In scope (PERF-01..06):
- CI bundle-size gate enforcing `species-*.js` < 100 KB gzipped
- Lighthouse mobile LCP < 3 s on the largest-subgenus species page (re-runnable command)
- Lazy-loaded photos with iNat `medium` (500px) hero + `square`/`small` srcset
- Weekly cron HEAD-checking photo manifest URLs, writing drift report
- A11y assertions: alt text, role/aria on nav tree, keyboard expand/collapse + filter input
- UAT against seed use cases, recorded in phase summary

In scope (carry-ins from 081 UAT):
- T2 (no layout) — minimal CSS pass for `/species/` is folded into this phase, see D-01
- T7 (ambiguous single-letter month hint in seasonality fallback) — see D-08

Out of scope:
- Visual polish beyond the minimal layout (no design system, no photo carousel, no responsive grid for the cards themselves)
- SPA-side perf/a11y work
- Map page Lighthouse budget

</domain>

<decisions>
## Implementation Decisions

### Layout strategy (T2)
- **D-01:** Fold a minimal CSS pass into Phase 82. Plain CSS Grid: single-column on mobile (nav collapses to a `<details>` above the cards), two-column with sticky `position: sticky` left rail at `≥768px`. **No drawer, no JS** — drawers add bundle weight that fights PERF-01 and keyboard surface that fights PERF-05, for no real estate gain over native `<details>`. Light-DOM Lit components already inherit page CSS so no component refactor is needed. Photos and the SVG occurrence map MUST carry explicit `width`/`height` (or aspect-ratio) to preserve LCP/CLS budgets under PERF-02 / PERF-03's lazy-load.
- **D-02:** CSS file location: new `src/styles/species.css`, imported once from `src/entries/species.ts` so Vite includes it in the species build. `_layouts/base.njk` currently has no `<link rel=stylesheet>` — Vite's HTML output handles the asset injection via the entry import. Do **not** add a global stylesheet in `base.njk`; keep the species CSS scoped to the species entry to protect the SPA chunk.
- **D-03:** A `/gsd-ui-phase 82` design contract is **not** spawned. T2 was filed as *minor*; without an existing design system to anchor to, a UI-SPEC would over-invest. Revisit if a future phase requires a designed look.

### Bundle-size gate (PERF-01)
- **D-04:** Hand-rolled `scripts/validate-bundle-size.mjs` in the existing `validate-*.mjs` family. Uses `node:zlib` `gzipSync` against `_site/assets/species-*.js` (glob match), asserts < 100 KB (102_400 bytes). Wired into `package.json` `build` chain **after** `eleventy` step so it runs against the actual deployed artifact: `npm run build` → `validate-schema && validate-species && typecheck && eleventy && validate-bundle-size`. Hard fail (non-zero exit) on regression. No `size-limit` / `bundlesize` dep — would be the only npm gate dep and value-add is marginal for one chunk pattern.
- **D-05:** The script must also fail loudly if zero `species-*.js` files match the glob (catches Vite output-naming drift, mirrors `validate-schema.mjs`'s expected-columns assertion style). Keep the budget constant (`100 * 1024`) at the top of the file with a comment citing PERF-01.

### Lighthouse runner (PERF-02)
- **D-06:** Local one-shot `scripts/measure-lcp.sh`. Pipeline: `npm run build` → `npx serve _site -l 8080 &` → `npx lighthouse http://localhost:8080/species/<canary-slug> --preset=desktop --form-factor=mobile --throttling.cpuSlowdownMultiplier=4 --output=json --quiet`. Parse `largestContentfulPaint` numeric value, assert `< 3000`, exit non-zero on miss. **Not** wired into CI / GH Actions — Lighthouse on shared runners is ±15% noisy on mobile throttle and would burn trust. Pre-release ritual, documented under `data/README.md` "Performance" section per SC #2 wording ("re-runnable from a documented command in `data/README.md` or `scripts/`").
- **D-07:** Canary subgenus locked at planning time via DuckDB query against `public/data/species.parquet`. Pin slug as a constant in the script with a comment recording the query and rationale so a future maintainer can re-derive after data shifts. Suggested query: `SELECT slug, occurrence_count FROM read_parquet('public/data/species.parquet') ORDER BY occurrence_count DESC LIMIT 5;` (use top-1; verify it has occurrence_count > 0). Static pinning > dynamic-each-run because run-to-run comparability matters more than tracking the *current* worst case.

### Carry-ins from 081 UAT (Claude's discretion items)
- **D-08:** T7 month-letter resolution — drop the trailing `, ${monthLetter}` suffix entirely when `monthsWithData.length === 1`. Cleanest fix; avoids introducing a parallel month-name system in `src/species/seasonality-viz.ts`. Keep single-letter MONTH_LABELS for axis labels (12 cells, space-constrained). Update the corresponding test in the seasonality-viz suite.
- **D-09:** Photo srcset (PHOTO-03 / PERF-03) — generate srcset at template-render time from the iNat URL pattern. iNat photo URLs follow a stable size-token pattern (e.g. `.../photos/<id>/medium.jpg` → `square.jpg` / `small.jpg` / `medium.jpg`). Add a small helper in `_data/photos.js` (or template filter) that emits `srcset="<square> 75w, <small> 240w, <medium> 500w"` and keeps `src=<medium>` as the hero default. **No TOML schema change** — keeps the manifest stable and avoids a migration. If a non-iNat photo URL is encountered, fall back to single-URL `src=` only (no srcset).
- **D-10:** PERF-04 cron failure mode — report-only. Workflow writes `data/manifest_drift_report.json`, commits via the cron's GH token if non-empty, and exits 0 either way (informational, never blocks deploys per SC #4). No issue creation, no Slack. Concurrency: `concurrency: photo-availability` to skip overlapping runs; ≤1 req/sec (matches `seed-species-photos.mjs` pacing); single retry on 5xx with 2s backoff.
- **D-11:** PERF-05 a11y test approach — hand-rolled aria/keyboard assertions in vitest. Matches the project's "minimal deps" stance (cf. D-04 bundle gate). Coverage: nav tree `role="tree"`/`role="treeitem"`/`aria-expanded` rendered correctly, keyboard expand/collapse via Enter/Space (synthesized KeyboardEvent dispatch, assert child visibility / details `open` toggles), every photo `<img>` has non-empty `alt`, every map `<img>` has non-empty `alt`. Filter input keyboard scope: tab order through county/ecoregion/month-from/month-to is sequential and each control is focusable — that's the minimum to satisfy SC #3 ("keyboard expand/collapse plus filter input"). No JSDOM-axe pass needed.

### Claude's Discretion
- Exact Vite config to keep `species-*.js` separate from `index-*.js` — already in place (verified by 080-04-PLAN.md and ARCH-04 test); no change required.
- Test filenames and fixture organization for new vitest suites.
- Whether validate-bundle-size emits human-readable output (size in KB + budget headroom) — yes, makes regressions diagnosable.
- Exact CSS variable / token system for the species layout — none. Use raw values; a token system is design-system work (deferred).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 82: Hardening" (lines 609–619) — goal, depends-on, success criteria, plan placeholder
- `.planning/REQUIREMENTS.md` §"PERF" (lines 109–115) and the requirement-to-phase map (lines 229–234) — authoritative requirement IDs
- `.planning/PROJECT.md` — project-level constraints (static hosting, OIDC deploy, minimal-deps stance)

### Carry-ins from 081
- `.planning/phases/081-filter-ux-nav/081-UAT.md` §"Deferred to Phase 82" (lines 159–172) — exact carry-in scope for T2 and T7 with diagnosis
- `.planning/phases/081-filter-ux-nav/081-CONTEXT.md` lines 23, 111, 169 — original layout deferral; explains why no CSS exists yet
- `.planning/debug/species-page-no-layout.md` — T2 diagnosis session
- `.planning/debug/lit-markers-in-fallback.md` — T7 diagnosis session
- `.planning/phases/081-filter-ux-nav/081-04-PLAN.md` line ~177 — confirm before changing month-letter behavior (D-08)

### Code patterns the planner must mirror
- `scripts/validate-schema.mjs` and `scripts/validate-species.mjs` — pattern for D-04 bundle-size gate (hard fail, glob check, top-of-file constants with rationale comment)
- `src/species/bee-species-page.ts` (header comment, lines 1–60) — D-05 light-DOM invariant; layout CSS must respect it
- `src/species/seasonality-viz.ts` lines 24, 41–43, 62–70 — site of D-08 month-letter change; light-DOM rationale (D-04 from 081 context, NOT to be confused with D-04 here) is locked
- `_layouts/base.njk`, `_layouts/default.njk`, `_pages/species.njk` — layout integration points for D-01/D-02
- `src/entries/species.ts` — Vite entry where `src/styles/species.css` will be imported (D-02)
- `data/species_export.py` and `public/data/species.parquet` schema — source for D-07 canary query
- `scripts/seed-species-photos.mjs` — pacing/auth pattern for D-10 cron HEAD checks
- `src/url-state.ts:35-89` and `src/species/url-state.ts` — keep separate; PERF work must not leak SPA imports into species chunk (ARCH-04 test in `src/tests/arch.test.ts`)

### CI / build
- `.github/workflows/deploy.yml` — wire D-04 gate; weekly D-10 cron lives as a sibling workflow file
- `package.json` scripts block — `build` chain extension point for D-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/validate-schema.mjs` — copy-as-template for `validate-bundle-size.mjs` (D-04). Same idiom: top-of-file constant, hard fail, helpful error messages.
- `scripts/seed-species-photos.mjs` — pacing primitives for the weekly D-10 cron (≤1 req/sec, gentle iNat client).
- `_data/photos.js` (Eleventy data loader, PHOTO-03 to be implemented per AGG/PHOTO requirements) — natural home for the iNat-URL-srcset helper (D-09).
- `<bee-species-card>` already emits `loading="lazy"` on photo and SVG `<img>` (verified at `_pages/species.njk` lines 31, 36) — PERF-03 image lazy-load is partly satisfied; the remaining work is `srcset` + `width`/`height` for CLS.

### Established Patterns
- **Validate-* gate pattern:** every new build-time check is a hand-rolled `scripts/validate-*.mjs` chained into `npm run build`. PERF-01 follows this exactly (D-04).
- **Light-DOM Lit:** all `src/species/*.ts` components return `this` from `createRenderRoot()` (D-04 from Phase 80, locked). External CSS styles them directly — no Shadow DOM piercing. This *enables* D-01/D-02 to work without component changes.
- **ARCH-04 import-boundary test:** `src/tests/arch.test.ts` blocks SPA imports leaking into `src/species/`. Any new perf/a11y code in `src/species/` must respect the same constraint or the test fails before the bundle gate even runs.
- **State ownership invariant (CLAUDE.md):** `<bee-species-page>` owns reactive state; no module-level mutable state. A11y test scaffolding must not introduce a sidecar store.

### Integration Points
- `src/entries/species.ts` — add `import '../styles/species.css'` (D-02)
- `package.json` `build` script — append `&& npm run validate-bundle-size` (D-04)
- `package.json` scripts — add `validate-bundle-size` and `measure-lcp` entries
- `data/README.md` — add "Performance" section documenting `bash scripts/measure-lcp.sh` invocation (SC wording)
- `.github/workflows/` — new `photo-availability.yml` cron sibling to `deploy.yml` (D-10)
- `_data/photos.js` — extend with iNat-URL srcset helper (D-09)
- `src/species/seasonality-viz.ts` — drop `, ${monthLetter}` branch when single-month (D-08)

</code_context>

<specifics>
## Specific Ideas

- Layout vibe: BeeSearch-adjacent — utilitarian two-column, no decorative chrome. Sticky nav rail behaves like a left sidebar in technical docs (e.g. MDN side nav). Cards stay in document flow.
- Mobile: native `<details>` for the nav so the page works without JS (matches the SSR `<details>`/`<ul>` rendering already shipped in 081-02).
- Lighthouse pinning by slug, not by genus — slug is the actual URL segment and survives genus-rename data corrections better than a free-text genus name.
- `validate-bundle-size.mjs` should print: `species chunk: 64 KB / 100 KB (36 KB headroom)` on success; `species chunk: 112 KB / 100 KB — OVER BUDGET (PERF-01)` on failure. Mirrors the helpful-output convention of `validate-schema.mjs`.

</specifics>

<deferred>
## Deferred Ideas

- Designed visual polish for the species page (typography, spacing tokens, photo carousel, responsive card grid) — needs a design system + `/gsd-ui-phase` pass; no anchor exists yet.
- Lighthouse CI in GH Actions — revisit if mobile-throttle flakiness improves or if we adopt preview deploys per PR.
- jest-axe / vitest-axe integration — defer until the page has more interactive surface; hand-rolled assertions cover SC #3 today.
- TOML schema extension to carry all 3 photo sizes explicitly — defer; D-09 iNat URL-pattern derivation is zero-cost and keeps the manifest small.
- Issue auto-creation on photo drift — defer; report-only is the SC default. Revisit if drift becomes frequent enough to need triage automation.
- Map page (`/`) Lighthouse budget — separate phase; this hardening pass is species-page-only.

</deferred>

---

*Phase: 82-Hardening*
*Context gathered: 2026-05-04*
