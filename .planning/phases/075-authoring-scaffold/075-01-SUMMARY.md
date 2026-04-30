---
phase: 075-authoring-scaffold
plan: 01
subsystem: infra
tags: [eleventy, vite, lit, layout-chain, scaffold, nunjucks]

requires:
  - phase: 074-eleventy-build-wrapper
    provides: Eleventy + plugin pipeline; _pages/_includes/_layouts/_data placeholders; SPA at / preserved; src/ passthrough
provides:
  - Two-layer Nunjucks layout chain (base.njk root + default.njk chrome wrapper)
  - bee-header bundle entry (Vite-derived from default.njk's <script> tag — no rollupOptions.input)
  - _data/build.js exposing eleventy/plugin/vite/lit/node versions + builtAt + gitSha as {{ build.* }}
  - Permanent orphan deploy diagnostic at /_scaffold-check/
  - Verified A5 architecture (load-bearing): Vite's appType:"mpa" HTML processor rewrites <script src="/src/entries/bee-header.ts"> to /assets/bee-header-[hash].js across every templated HTML page
affects: [075-02 (UAT + STATE bump), v3.2 species-tab content pages]

tech-stack:
  added: []  # No new packages — used existing Eleventy 3.1.5 + plugin 7.1.1 + Vite 6.4.2 + Lit 3.3.2
  patterns:
    - "Layout chain via Eleventy front-matter + {{ content | safe }} (NOT {% extends %}/{% block %} — pnwmoths verbatim)"
    - "Side-effect Vite Rollup entry (1-line file): import '../component.ts' triggers @customElement decorator self-registration"
    - "_data/<name>.js → {{ <name>.* }} namespace mapping; readFileSync of node_modules/<pkg>/package.json for version resolution"
    - "Orphan diagnostic page: filename without underscore + permalink: /_scaffold-check/ (sidesteps Eleventy underscore-prefix-in-input ambiguity)"
    - "Vite HTML processor auto-derives Rollup entries from emitted Eleventy HTML — no explicit rollupOptions.input, no _data/manifest.js"

key-files:
  created:
    - "_layouts/base.njk (chrome-less HTML5 shell, root of layout chain)"
    - "_layouts/default.njk (chrome wrapper extending base; embeds <bee-header> + bee-header.ts script tag)"
    - "_data/build.js (build-time metadata producer)"
    - "src/entries/bee-header.ts (1-line side-effect Vite entry)"
    - "_pages/scaffold-check.njk (permanent orphan deploy diagnostic at /_scaffold-check/)"
  modified:
    - "eleventy.config.js (Rule 1 deviation: dir.{includes,layouts,data} ../-traversal; see Deviations)"

key-decisions:
  - "dir.includes/layouts/data resolved relative to dir.input by Eleventy 3.x — bare '_layouts' became '_pages/_layouts/' which doesn't exist; '../_layouts' (etc.) preserves repo-root layout"
  - "<script type='module' src='/src/entries/bee-header.ts'> in default.njk — Vite rewrites to /assets/bee-header-[hash].js automatically; no manifest read needed"
  - "Bee-header bundle deduped into shared chunk by Rollup default chunking — SPA index.html now has <link rel='modulepreload' .../bee-header-...js>; CONTEXT decision #5 explicitly accepts this"

patterns-established:
  - "Layout chain via Eleventy front-matter (layout: parent.njk) + {{ content | safe }}"
  - "Vite Rollup entry from layout's <script> tag — no explicit rollupOptions.input config"
  - "_data/build.js for build-time version metadata"
  - "dir.{includes,layouts,data}: '../_<name>' for repo-root placement when dir.input is a leaf folder"

requirements-completed: [D-01, D-02, D-03, D-04, D-05]

duration: 5min
completed: 2026-04-30
---

# Phase 075 Plan 01: Authoring Scaffold Summary

**Two-layer Nunjucks layout chain + Vite-derived bee-header bundle (8.5 KB gz) + build-info data file + permanent orphan diagnostic at /_scaffold-check/ — A5 architecture (Vite HTML processor rewrites layout-injected script tags) verified end-to-end.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-30T16:10:05Z
- **Completed:** 2026-04-30T16:13:45Z
- **Tasks:** 4 (all `type="auto"`)
- **Files modified:** 6 (5 new + 1 modified)

## Accomplishments

- Layout chain rendering through default.njk → base.njk: scaffold-check.njk produces correct HTML with `<bee-header></bee-header>` element and Vite-rewritten `<script type="module" crossorigin src="/assets/bee-header-DNHAQll3.js">`.
- bee-header bundle: 22.78 KB raw, 8.47 KB gzipped — well under research's ~20–25 KB estimate and CONTEXT's <100 KB budget.
- Build-info table on /_scaffold-check/ resolves real versions: Eleventy 3.1.5, plugin 7.1.1, Vite 6.4.2, Lit 3.3.2, Node v24.12.0, git SHA 09d48ba.
- 172/172 Vitest tests pass (no regressions; CONTEXT non-negotiable preserved).
- Phase 74 invariants intact: SPA at / still references /assets/index-pgqDAatT.js; .11ty-vite/ cleaned up; no rollupOptions.input or _data/manifest.js.
- A5 verified (load-bearing assumption per research): the entire scaffold architecture works because Vite's `appType: "mpa"` HTML processor walks every emitted Eleventy HTML page, parses each `<script type="module">` tag, and rewrites the source path in-place to a hashed bundle URL.

## Task Commits

All four tasks were committed together as a single atomic unit per the plan's `<output>` instruction ("No commits between tasks. … commit Tasks 1–4 together at the end of Task 4"):

1. **Task 1: Write the layout chain (base.njk + default.njk)** — included
2. **Task 2: Write _data/build.js and src/entries/bee-header.ts** — included
3. **Task 3: Write _pages/scaffold-check.njk (orphan diagnostic page)** — included
4. **Task 4: End-to-end build smoke + load-bearing A5 probe + tests** — included

**Atomic commit:** `b86d67c` — `feat(075-01): authoring scaffold (layout chain + bee-header bundle entry + orphan smoke)`

## Files Created/Modified

**Created:**
- `_layouts/base.njk` — chrome-less HTML5 shell, root of layout chain. Uses `{{ content | safe }}`. No `<script>` tag (chrome-less surface — CONTEXT decision #3).
- `_layouts/default.njk` — extends base.njk via `layout: base.njk` front-matter. Renders `<bee-header></bee-header>` + `<script type="module" src="/src/entries/bee-header.ts">` + `<main>{{ content | safe }}</main>`.
- `_data/build.js` — ESM data file. `readFileSync` of `node_modules/<pkg>/package.json` for version strings; `execSync('git rev-parse --short HEAD')` for SHA. `try/catch` returns `'unknown'` for shallow CI clones.
- `src/entries/bee-header.ts` — 1-line side-effect import (`import '../bee-header.ts';`). Lit `@customElement('bee-header')` decorator self-registers on module load. No `customElements.define()` call.
- `_pages/scaffold-check.njk` — orphan diagnostic page. `permalink: /_scaffold-check/index.html`, `eleventyExcludeFromCollections: true`, `layout: default.njk`. Renders the seven `{{ build.* }}` template references in a small table. Permanent deploy diagnostic — NOT a temp file.

**Modified:**
- `eleventy.config.js` — `dir.{includes,layouts,data}` updated from bare names to `"../<name>"` (Rule 1 deviation; see below). All other Phase 74 invariants preserved (passthroughs, plugin viteOptions block).

## Build Outputs (`_site/` after `npm run build`)

```
_site/index.html                              SPA — <script src="/assets/index-pgqDAatT.js">
_site/_scaffold-check/index.html              orphan — <script src="/assets/bee-header-DNHAQll3.js">
_site/assets/index-pgqDAatT.js                SPA bundle (1998 KB / 549 KB gz — unchanged shape from Phase 74)
_site/assets/bee-header-DNHAQll3.js           NEW Vite bundle (22.78 KB / 8.47 KB gz)
_site/assets/index-B_7PMgUM.css               styles
_site/assets/wa-sqlite-Bkv7CwRB.wasm          (passthrough preserved)
_site/data/, _site/feeds/, _site/db/          (passthroughs preserved)
_site/src/entries/bee-header.ts               passthrough — Vite source for the build pass
```

The exact rewritten `<script>` tag in `_site/_scaffold-check/index.html` (verbatim from grep, A5 evidence):

```html
<script type="module" crossorigin src="/assets/bee-header-DNHAQll3.js"></script>
```

## Decisions Made

- **`dir.{includes,layouts,data}` use `"../"` traversal.** Eleventy 3.x normalizes these relative to `dir.input` (verified by reading `node_modules/@11ty/eleventy/src/Util/ProjectDirectories.js:setLayouts` — line 203: `TemplatePath.join(this.input, dir)`). The Phase 74 placeholders live at repo root (`_includes/`, `_layouts/`, `_data/`), so paths must walk up out of `_pages/`. Confirmed via official 11ty.dev docs ("These are both relative to your input directory!").
- **Vite HTML processor handles bundling automatically.** No `rollupOptions.input` configuration; the `<script type="module" src="/src/entries/bee-header.ts">` tag in `default.njk` is the entry-point declaration. `appType: "mpa"` (already enabled in `eleventy.config.js` from Phase 74) is sufficient. Pnwmoths reference confirmed.
- **bee-header.ts dedup into shared chunk is acceptable.** Rollup's default chunking detected that both `src/bee-atlas.ts` (SPA) and `src/entries/bee-header.ts` (chrome entry) reach `src/bee-header.ts`; produced a shared `bee-header-DNHAQll3.js` chunk. The SPA's `_site/index.html` now contains `<link rel="modulepreload" crossorigin href="/assets/bee-header-DNHAQll3.js">`. CONTEXT decision #5 explicitly accepts this ("a single shared chunk is fine").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Eleventy `dir.{includes,layouts,data}` resolution**

- **Found during:** Task 4 (first `npm run build` invocation)
- **Issue:** Build failed with `You're trying to use a layout that does not exist: _pages/_layouts/default.njk (via 'layout: default.njk')`. Eleventy resolved the configured `dir.layouts: "_layouts"` as `_pages/_layouts/` rather than repo-root `_layouts/`.
- **Root cause:** Eleventy 3.x normalizes `dir.includes`, `dir.layouts`, and `dir.data` **relative to `dir.input`** (source: `node_modules/@11ty/eleventy/src/Util/ProjectDirectories.js:setLayouts:198-205` — `TemplatePath.join(this.input, dir)`). Confirmed by official 11ty.dev docs accessed via Context7 ("These are both relative to your input directory!"). Plan's research §Pattern 1 incorrectly stated bare layout names "resolve against `dir.layouts: '_layouts'` automatically" — the resolution is bare names → joined under input dir.
- **Why pnwmoths reference didn't surface this:** pnwmoths uses default `dir` config (`includes: "_includes"` under `dir.input: "src"` → `src/_includes/`); their layouts physically live inside `src/_includes/`. Beeatlas's Phase 74 placed `_includes/`, `_layouts/`, `_data/` at repo root — the inverse arrangement.
- **Fix:** Updated `eleventy.config.js` `dir` block from `includes: "_includes"`, `layouts: "_layouts"`, `data: "_data"` to `"../_includes"`, `"../_layouts"`, `"../_data"`. Eleventy joins these with `_pages/` → resolves to `_pages/../_includes/` = repo root. Inline comment added explaining the constraint.
- **Files modified:** `eleventy.config.js` (dir block only; all other Phase 74 invariants preserved)
- **Verification:** Re-ran `npm run build`; succeeded; produced both `_site/index.html` and `_site/_scaffold-check/index.html`; A5 probe passed; 172/172 tests still green.
- **Committed in:** `b86d67c` (atomic commit)
- **Alternative considered:** Move `_layouts/`, `_includes/`, `_data/` into `_pages/`. Rejected because (a) those directories were created at repo root by Phase 74 and the plan's `key-files` lists them at repo root, (b) the relocation would make the auto-fix more invasive, (c) pnwmoths' "all under input" pattern is a project structure choice, not a requirement. The `..` traversal is a one-line config tweak with an inline comment that documents the constraint.

---

**Total deviations:** 1 auto-fixed (1 bug — pre-existing Phase 74 config gap, exposed by first use of layouts).
**Impact on plan:** Required for correctness. Repo-root `_layouts/` layout (per plan's `files_modified`) preserved. All success criteria met. No scope creep.

## Issues Encountered

- The plan's success criterion #2 stated `eleventy.config.js` "byte-identical to before this plan." That criterion conflicted with success criterion #3 (clean `npm run build` exits 0) once the buggy `dir` block was actually exercised by a real layout. Resolved by treating the `dir`-block fix as a Rule 1/3 auto-fix (build-config error blocking task completion); preserved the plan's intent (repo-root layout files) while making the resolved paths point where the files actually are.
- No other issues. All other plan-prescribed commands and grep gates passed first-try after the `dir` fix.

## Verification Summary (all `must_haves.truths` from plan frontmatter)

| Truth | Result |
|-------|--------|
| `_site/_scaffold-check/index.html` exists | PASS |
| Hashed bee-header script: `src="/assets/bee-header-DNHAQll3.js"` (A5 probe) | **PASS** |
| Literal `<bee-header></bee-header>` element | PASS |
| Build-info table contains resolved Eleventy version (`<td>3.1.5</td>`) | PASS |
| `_site/assets/bee-header-*.js` exists | PASS (`bee-header-DNHAQll3.js`) |
| `_site/index.html` still references `/assets/index-*.js` | PASS (`index-pgqDAatT.js`) |
| `npm run build` exits 0 end-to-end | PASS |
| `npm test` reports 172 tests passing | **PASS** (172/172) |
| `.11ty-vite/` cleaned up post-build | PASS |
| No `rollupOptions.input` in `eleventy.config.js` or `vite.config.ts` | PASS |
| No `_data/manifest.js` | PASS |

## Bee-header Bundle Size (informational)

```
_site/assets/bee-header-DNHAQll3.js    22.78 KB raw    8.47 KB gzipped
```

Research expected ~20–25 KB raw / Lit core (~16 KB gz) + bee-header (~1–2 KB gz) ≈ ~17–18 KB gz. Actual is **8.47 KB gz** — better than estimate, likely because Rollup's shared chunking (with the SPA bundle also reaching `bee-header.ts`) tightened minification and dedup. Bundle composition: Lit core + bee-header component (no SPA-coupled imports — verified by grep against `_site/assets/bee-header-*.js`). Well under CONTEXT's <100 KB budget.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**075-02 inherits a known-good baseline:**

- Layout chain ready for v3.2 content pages (`layout: default.njk` in any new `.njk` file → bee-header chrome auto-included).
- `_data/build.js` available to all templates as `{{ build.* }}` — no further wiring needed for diagnostics.
- bee-header bundle entry at `src/entries/bee-header.ts` — pattern ready for v3.2 to add additional standalone entries (e.g., a species-page entry as sibling).
- Permanent `/_scaffold-check/` page in `_site/` for deploy diagnostics post-merge.

**075-02 picks up:**
- Manual UAT (`npm run dev` → visit `/_scaffold-check/` in browser → confirm bee-header chrome renders + build-info table; visit `/` → confirm SPA Mapbox tiles still work).
- Doc check: `CLAUDE.md` "Running Locally" section — likely unchanged because no dev URL changed; revisit if scaffold-check belongs in the "Running Locally" cheat-sheet.
- ROADMAP/STATE bump for v3.1 milestone completion.

**Concerns:** None. The Rule 1 deviation (dir block traversal) is documented with an inline config comment so 075-02 (or any future contributor) sees it immediately.

## Self-Check: PASSED

Verified post-write:

- `_layouts/base.njk` exists — FOUND
- `_layouts/default.njk` exists — FOUND
- `_data/build.js` exists — FOUND
- `src/entries/bee-header.ts` exists — FOUND
- `_pages/scaffold-check.njk` exists — FOUND
- `eleventy.config.js` modified (dir block traversal) — FOUND
- Atomic commit `b86d67c` — FOUND in `git log --oneline -3`
- `_site/_scaffold-check/index.html` — FOUND (post-build)
- `_site/assets/bee-header-DNHAQll3.js` — FOUND (post-build)

---

*Phase: 075-authoring-scaffold*
*Plan: 01*
*Completed: 2026-04-30*
