# Phase 74: Eleventy Build Wrapper — Pattern Map

**Mapped:** 2026-04-29
**Files in scope:** 6 primary (config, build, CI), plus optional layout-relocation diff
**Reference project:** `/Users/rainhead/dev/pnwmoths` (single-package layout, `_site/` output, GitHub Pages target)

This map is biased toward **Option A** (keep `frontend/` as Vite root, add Eleventy at repo root) because it minimizes CI churn and preserves the existing workspace shape. Option B notes are inlined where the diff materially differs.

---

## File Classification

| New / Edited File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `eleventy.config.js` (NEW, repo root) | build-config | request-response (build-time) | `/Users/rainhead/dev/pnwmoths/eleventy.config.js` | exact — same plugin |
| `vite.config.ts` (EDIT — `frontend/` keeps it; OR new at root for Option B) | build-config | request-response | `/Users/rainhead/dev/pnwmoths/vite.config.js` + `frontend/vite.config.ts` | hybrid — must merge |
| `package.json` (root, EDIT) | build-config | n/a | `/Users/rainhead/dev/pnwmoths/package.json` (scripts) + existing root `package.json` (workspaces) | role-match — invariants differ |
| `frontend/package.json` (EDIT — only if Option B collapses workspace) | build-config | n/a | existing `frontend/package.json` | exact (delete or trim) |
| `.github/workflows/deploy.yml` (EDIT) | ci | request-response | existing `.github/workflows/deploy.yml` (in-repo) | exact — only paths/commands shift |
| `.eleventyignore` (NEW, optional) | build-config | n/a | none in pnwmoths; project-specific | no analog — invent from rules below |
| Reserved Eleventy dirs: `src/` (input), `_includes/`, `_data/` (NEW, **empty in this phase**) | scaffold | n/a | `/Users/rainhead/dev/pnwmoths/src/` shape | structural reference only |

---

## Pattern Assignments

### `eleventy.config.js` (NEW, repo root)

**Analog:** `/Users/rainhead/dev/pnwmoths/eleventy.config.js`

**Imports + ESM** (lines 1–7) — copy the import shape, drop everything pnwmoths-specific:

```javascript
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
// drop: EleventyRenderPlugin, csv-parse, glossary-transform, execFile (no copy-images / emit-species-states scripts in beeatlas)
```

**Plugin registration shape** (lines 78–90) — this is the load-bearing pattern:

```javascript
eleventyConfig.addPlugin(EleventyVitePlugin, {
  viteOptions: {
    appType: "mpa",
    // base: pathPrefix,  ← OMIT. beeatlas serves at root on CloudFront, not GitHub Pages subpath.
    // plugins: [{ ... writeBundle: copy-images ... }]  ← OMIT. No image copy scripts; preloadAssets() lives in vite.config.ts.
  }
});
```

**Explicit `dir` config in return** (lines 101–108) — required by CONTEXT decision "explicit, not defaulted, so Phase 75 knows where to add files":

```javascript
return {
  // pathPrefix: "/",  ← omit; "/" is default
  dir: {
    input: "src",          // Phase 75 will populate; empty/passthrough-only this phase
    output: "_site",       // OR "frontend/dist" — see Output Directory Decision below
    includes: "_includes", // explicit per CONTEXT requirement
    layouts: "_layouts",   // pnwmoths uses _includes for both; beeatlas can split
    data: "_data"
  }
};
```

**Passthrough copy pattern** (lines 60–73) — adapt to wrap the existing SPA:

Pnwmoths copies `data/parquet`, `node_modules/@picocss`, `src/components`, `src/styles`, `src/images`. **Beeatlas needs different passthrough rules** because the Vite SPA *is* the primary content this phase, not a sidecar:

```javascript
// SPA entry — under Option A, point Eleventy at the existing Vite app
// so frontend/index.html + frontend/src/* + frontend/public/* land in _site/
// untouched by Eleventy templating, then Vite picks them up.
//
// Exact passthrough shape depends on Option A vs B layout decision:
//   Option A: eleventyConfig.addPassthroughCopy({ "frontend/index.html": "index.html" });
//             eleventyConfig.addPassthroughCopy({ "frontend/public": "/" });
//             eleventyConfig.addPassthroughCopy({ "frontend/src": "src" });
//   Option B: identical to pnwmoths — index.html and src/ already at root.
//
// Either way, addPassthroughCopy is the right primitive. addTemplateFormats is NOT
// needed; .ts files should pass through, not be templated.
```

**Do NOT mirror from pnwmoths:**
- `EleventyRenderPlugin` (no `{% renderFile %}` md needs in v3.1)
- `addTransform("glossary-terms", ...)` (no glossary in beeatlas)
- `applyGlossaryTerms` / `buildTermMap` / `csv-parse` imports (lines 6–7, 21–25)
- `addGlobalData("cdnBaseUrl", ...)` (CloudFront base is Vite env, not Eleventy data)
- `pathPrefix` GitHub Pages branch (line 12) — beeatlas has no subpath
- `execFile` calls to `copy-images.js` / `emit-species-states.js` in writeBundle hook (lines 82–88)
- `eleventy.after` serve-mode image copy (lines 95–99)
- `addFilter("fileExists", ...)` and `addFilter("urlencode", ...)` — no callers in beeatlas yet (Phase 75/v3.2 may add)
- `addPassthroughCopy({ "node_modules/@picocss/pico/css/pico.min.css": ... })` — beeatlas has no Pico dep

---

### `vite.config.ts` (EDIT — beeatlas-specific merge)

**Analogs (must combine):**
- Eleventy integration shape: `/Users/rainhead/dev/pnwmoths/vite.config.js` lines 3–11
- Beeatlas-specific invariants: existing `/Users/rainhead/dev/beeatlas/frontend/vite.config.ts` lines 4–16

**Pattern from pnwmoths** (entire file, lines 3–11):

```javascript
export default defineConfig({
  root: '_site',           // CRITICAL — Vite's root is the Eleventy output dir
  base: '/pnwmoths/',      // OMIT for beeatlas — drop this line entirely
  build: {
    outDir: '_site',       // CRITICAL — write back into the same dir
    emptyOutDir: false,    // CRITICAL — DO NOT delete Eleventy's output before Vite's build
    sourcemap: true,
  },
});
```

**Beeatlas invariants that MUST survive the merge** (from `frontend/vite.config.ts`):

```typescript
// Line 2: keep the preload plugin import
import preloadAssets from './vite-plugin-preload.ts';

// Line 5: keep plugin registration — it injects <link rel="modulepreload"> for WASM + parquet
plugins: [preloadAssets()],

// Lines 6–8: keep — Vite must NOT pre-bundle wa-sqlite (breaks runtime WASM URL resolution)
optimizeDeps: {
  exclude: ['wa-sqlite'],
},

// Lines 9–11: keep sourcemap (already present in both configs)
build: {
  sourcemap: true,
  // ADD: outDir + emptyOutDir from pnwmoths pattern above
},

// Lines 12–15: keep Vitest config — environment: 'happy-dom' is non-negotiable per CONTEXT
test: {
  environment: 'happy-dom',
  passWithNoTests: true,
},
```

**Merged shape (Option A example, conceptual):**

```typescript
import { defineConfig } from 'vite';
import preloadAssets from './vite-plugin-preload.ts';

export default defineConfig({
  root: '../_site',           // Vite root = Eleventy output (relative if config stays in frontend/)
  plugins: [preloadAssets()],
  optimizeDeps: { exclude: ['wa-sqlite'] },
  build: {
    outDir: '../_site',       // OR '../frontend/dist' if output stays under frontend/
    emptyOutDir: false,
    sourcemap: true,
  },
  test: { environment: 'happy-dom', passWithNoTests: true },
});
```

(Option B simplifies the relative paths to `'_site'` — same as pnwmoths verbatim.)

**Output Directory Decision (planner picks):**
- pnwmoths uses `_site/` for both Eleventy and Vite (shared dir, `emptyOutDir: false` makes it safe)
- beeatlas currently uses `frontend/dist/`
- CONTEXT explicitly allows either; the deploy workflow is the only consumer that cares
- Recommendation: adopt `_site/` to match the reference exactly — only diff cost is updating CI paths

**Do NOT mirror:**
- `base: '/pnwmoths/'` — beeatlas serves at `/`, no subpath

---

### `package.json` (root, EDIT)

**Analogs (combine):**
- Script ordering + plugin versions: `/Users/rainhead/dev/pnwmoths/package.json` lines 7–20, 24–41
- Workspaces + existing scripts: existing `/Users/rainhead/dev/beeatlas/package.json` lines 17–28

**From pnwmoths — script naming convention** (lines 9, 15):

```json
"build:eleventy": "eleventy",
"build": "npm run build:data && npm run build:eleventy && npm run build:copy-parquet && ..."
```

Note: pnwmoths runs `eleventy` THEN runs Vite via the plugin's writeBundle hook — but in pnwmoths, `build:eleventy` is the only invocation needed because `EleventyVitePlugin` handles Vite internally. Beeatlas should use the same shape:

```json
{
  "scripts": {
    "build": "npm run validate-schema && eleventy",
    "build:eleventy": "eleventy",
    "dev": "eleventy --serve",
    "validate-schema": "node scripts/validate-schema.mjs",
    "test": "vitest run",
    "build:data": "cd data && uv run python run.py",
    "fetch-data": "bash scripts/fetch-data.sh"
  }
}
```

**From pnwmoths — devDependency block** (lines 38–41):

```json
"devDependencies": {
  "@11ty/eleventy": "^3.1.5",
  "@11ty/eleventy-plugin-vite": "^7.0.0",
  "vite": "^8.0.8"
}
```

Beeatlas currently pins Vite at `^6.2.3` (frontend/package.json line 21). The plugin version `^7.0.0` requires Vite ^6 or ^7 (verify against `eleventy-plugin-vite` peer deps at install time). Planner: **lock the plugin version after `npm install` resolves**; do not pre-commit a version that hasn't been resolution-tested.

**Beeatlas invariants that MUST survive the edit:**

```json
// Line 23–25: workspaces array — keep if Option A; remove or update to ["."] if Option B
"workspaces": ["frontend"],

// Line 18: build:data script — keep verbatim
"build:data": "cd data && uv run python run.py",

// Line 20: validate-schema script — KEEP and MUST RUN before build (CONTEXT non-negotiable)
"validate-schema": "node scripts/validate-schema.mjs",

// Line 21: fetch-data — keep verbatim
"fetch-data": "bash scripts/fetch-data.sh"
```

**Type field decision:** root `package.json` is `"type": "commonjs"` (line 15); `frontend/package.json` is `"type": "module"` (line 12). Eleventy 3.x and the Vite plugin both use ESM. Either:
- (a) Switch root to `"type": "module"` (cleaner; matches pnwmoths line 6); OR
- (b) Name the config `eleventy.config.mjs` to opt into ESM in a CommonJS package.

Pnwmoths picks (a). Recommend the same.

**Do NOT mirror from pnwmoths:**
- `pagefind`, `lychee` (`build:pagefind`, `build:validate-links`) — deferred per CONTEXT
- `build:check-weight` (no page-weight budget in v3.1)
- `build:copy-parquet`, `build:copy-images`, `build:species-states` — beeatlas has no equivalent assets
- `migrate:images`, `migrate:species` — pnwmoths historical migration scripts
- `node --test` test runner — beeatlas uses Vitest, keep `vitest run`
- Dependencies: `@duckdb/node-api`, `@picocss/pico`, `chart.js`, `csv-*`, `leaflet`, `node-html-parser`, `openseadragon` — none used in beeatlas
- `hyparquet` is already in beeatlas root devDeps for the schema gate; keep there

---

### `frontend/package.json` (EDIT — only under Option B layout collapse)

**Analog:** existing `/Users/rainhead/dev/beeatlas/frontend/package.json`

If Option A: leave this file unchanged. Vite app continues to live in `frontend/`, root delegates via workspaces.

If Option B (hoist to root): merge contents into root `package.json`, delete this file, drop `"workspaces"` array. Reference: pnwmoths is single-package (no workspaces, no nested package.json).

Either way, **CONTEXT-locked invariants** at lines 6–11 must move with whatever path they take:
- `"dev": "vite"` → becomes `"dev": "eleventy --serve"` (pnwmoths pattern)
- `"build": "tsc && vite build"` → split: `tsc --noEmit` runs separately (pre-build, see CI), `eleventy` replaces `vite build`
- `"test": "vitest"` → keep verbatim (becomes `vitest run` in CI; `vitest` for watch mode)

---

### `.github/workflows/deploy.yml` (EDIT)

**Analog:** existing `/Users/rainhead/dev/beeatlas/.github/workflows/deploy.yml` (no pnwmoths CI analog — pnwmoths uses GitHub Pages, not S3+CloudFront)

This file is **beeatlas-internal**. Do not import patterns from pnwmoths' Docker/compose flow. Only the build/output paths shift.

**Patterns that MUST keep working (do not refactor):**

```yaml
# Lines 14–19: Node setup via .nvmrc — unchanged
- uses: actions/setup-node@v6
  with:
    node-version-file: '.nvmrc'
    cache: 'npm'

# Lines 22: npm ci — unchanged
- name: Install dependencies
  run: npm ci

# Line 25: validate-schema before build — CONTEXT non-negotiable, KEEP
- name: Validate parquet schema
  run: npm run validate-schema

# Lines 33: Mapbox token injection via VITE_MAPBOX_TOKEN env — CONTEXT non-negotiable
env:
  VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_TOKEN }}

# Lines 47–50: OIDC permissions on deploy job — unchanged
permissions:
  id-token: write
  contents: read

# Lines 60–64: configure-aws-credentials — unchanged
# Lines 79–92: CloudFront invalidation + wait — unchanged
```

**Patterns that MUST shift (5 places per CONTEXT — verify all):**

```yaml
# Line 28: test command — shifts under Option B (no workspace)
# Option A: unchanged: npm test --workspace=frontend
# Option B: npm test  (or: npx vitest run)

# Line 31: build command — shifts to root build
# Was: npm run build --workspace=frontend
# Now: npm run build  (which now runs eleventy)

# Line 39: artifact upload path — shifts if outDir moves
# Was: path: frontend/dist/
# Now (if _site/): path: _site/

# Line 58: artifact download path — must match upload
# Was: path: frontend/dist/
# Now (if _site/): path: _site/

# Lines 68, 73: aws s3 sync source paths — both must shift
# Was: aws s3 sync frontend/dist/assets/ s3://...
#      aws s3 sync frontend/dist/ s3://...
# Now: aws s3 sync _site/assets/ s3://...
#      aws s3 sync _site/ s3://...
```

The **cache-control rules at lines 67–77 are load-bearing and must not change shape:**
- `assets/*` → `max-age=31536000, immutable` (hashed Vite output)
- everything else → `max-age=0` (HTML, dynamic)
- excludes for `cache/*`, `data/*`, `db/*` (runtime-fetched, owned by pipeline)

If Eleventy ever introduces non-`assets/`-prefixed hashed files (it doesn't by default — `EleventyVitePlugin` keeps Vite's `assets/` convention), the exclude rules need re-examination. For this phase: don't worry, pattern holds.

**Do NOT mirror from pnwmoths:** pnwmoths has no equivalent CI workflow (GitHub Pages auto-deploy). Don't pull patterns there.

---

### `.eleventyignore` (NEW, optional — planner picks)

No pnwmoths analog (pnwmoths' single-package layout doesn't need one).

If Option A keeps `frontend/` adjacent to Eleventy `src/`, Eleventy may try to template files in `frontend/src/*.ts`. Two ways to prevent:

1. Set `dir.input: "src"` explicitly (config above) — Eleventy only walks `src/`, not `frontend/`. Sufficient by itself.
2. Add `.eleventyignore` listing `frontend/`, `data/`, `infra/`, `scripts/`, `node_modules/` — defense in depth.

Pnwmoths does (1) only, no `.eleventyignore`. Recommend the same minimum; planner can add `.eleventyignore` if Phase 75 / Option A surfaces collisions.

---

### Reserved Eleventy directories (NEW, **empty in this phase per CONTEXT**)

**Analog:** `/Users/rainhead/dev/pnwmoths/src/` shape

Pnwmoths' `src/` contains: `_data/`, `_includes/`, `_lib/`, content folders (`browse/`, `species/`, `glossary/`, `faqs/`, `plates/`, `search/`), `components/`, `images/`, `styles/`, `index.njk`.

**For Phase 74 (this phase):** create only the directories named in `eleventy.config.js`'s `dir:` block. **No content, no layouts, no index page.** Phase 75 fills these.

If using `dir.input: "src"` and `frontend/` already exists at repo root (Option A), there is a name collision — `frontend/src/` is the Vite source dir. Resolve by:
- Option A.1: name Eleventy input something else: `dir.input: "_pages"` (Eleventy convention permits underscore-prefixed)
- Option A.2: hoist to Option B and let `src/` mean Eleventy input (Vite app moves to root)

CONTEXT defers this to planner discretion. Worth flagging in the plan: the `src/` name collision is the strongest argument for Option B.

---

## Shared Patterns

### Build sequencing invariant
**Source:** CONTEXT line 23 ("Eleventy is the outer build, Vite is the inner bundler")
**Apply to:** root `package.json` `build` script, deploy.yml build step, dev server command

The `@11ty/eleventy-plugin-vite` plugin owns the orchestration: invoking `eleventy` runs Eleventy first (templates → output dir), then triggers Vite's build via the plugin's hook (bundles → same output dir, `emptyOutDir: false` preserves Eleventy's files). The npm script is just `"build": "eleventy"` (plus pre-flight schema validation). Do not invoke `vite build` separately.

### Vitest preservation
**Source:** existing `frontend/vite.config.ts` lines 12–15; CONTEXT "172 tests must pass at every executable plan boundary"
**Apply to:** every plan boundary in this phase

```typescript
test: {
  environment: 'happy-dom',
  passWithNoTests: true,
},
```

Vitest reads the same `vite.config.ts` Vite uses. Whatever changes happen to that file (new `root`, new `outDir`), `test:` block must remain reachable and untouched. Vitest does not care about `root` for test discovery — it walks from the config's directory. Verify by running `npm test` after each plan.

### Mapbox token wiring
**Source:** deploy.yml line 33; CONTEXT non-negotiable
**Apply to:** deploy.yml build job env block

`VITE_MAPBOX_TOKEN` flows: GitHub secret → job env → Vite `import.meta.env`. The Vite config does not need to declare it explicitly (`VITE_*` prefix is auto-exposed). When Vite is invoked via `EleventyVitePlugin`, the env propagation still works — the plugin spawns Vite in-process with the parent process env. No code change needed; just preserve the env block on whichever step now invokes the build.

### Schema validation gate
**Source:** existing `scripts/validate-schema.mjs` line 19; deploy.yml line 25
**Apply to:** root `package.json` `build` script (run before `eleventy`), deploy.yml (already present)

The script reads `frontend/public/data/occurrences.parquet` (line 19 — `ASSETS_DIR`). Under Option B (hoist), this path becomes `public/data/occurrences.parquet`. **The script's hardcoded path must be updated coherently** if frontend layout shifts. Under Option A (keep frontend/), no change needed.

### Public asset paths (runtime-fetched data)
**Source:** CONTEXT "All public asset paths must continue to resolve"; Vite default `public/` → root copy
**Apply to:** Eleventy passthrough config

Files served at `/data/*`, `/db/*`, `/feeds/*` come from `frontend/public/`. Vite's default `publicDir` is `<root>/public`. Under Eleventy + Vite plugin, with `vite.root: '_site'`, the public dir would resolve to `_site/public/` — wrong. Two fixes:

1. Set `vite.publicDir: false` in vite.config (disable Vite's public dir handling) and use `eleventyConfig.addPassthroughCopy({ "frontend/public": "/" })` in eleventy.config.js. Eleventy owns the copy.
2. Set `vite.publicDir: '../frontend/public'` (or `'public'` under Option B). Vite owns the copy.

Pnwmoths does (1) — uses `addPassthroughCopy` (lines 60–73) and never sets `publicDir`. Recommend (1); single owner of static asset copy is simpler.

### Preload plugin compatibility
**Source:** existing `frontend/vite-plugin-preload.ts` lines 13–48
**Apply to:** vite.config.ts plugins array (must keep registered)

The plugin uses `transformIndexHtml` with `order: 'post'`. Under Eleventy + Vite plugin, Eleventy generates the HTML file and Vite picks it up — `transformIndexHtml` still fires after Vite's bundle is known (line 18: `ctx.bundle` is populated post-bundle). The plugin will continue to function unchanged. Verify by checking that `_site/index.html` (or wherever the SPA index lands) contains the expected `<link rel="preload" ... .wasm>` and `<link rel="preload" href="/data/occurrences.parquet">` tags after a build.

If Option A's relative paths cause the plugin to mis-resolve `ctx.bundle` keys, fall back to absolute paths in the link `href` (already done — lines 25, 39 use `/`-prefixed paths).

### TypeScript noEmit type-check
**Source:** existing `frontend/package.json` line 8 (`"build": "tsc && vite build"`); CONTEXT "must continue to fail the build on type errors"
**Apply to:** root `package.json` (Option B) or `frontend/package.json` (Option A)

`tsc` runs purely as a type-checker (`noEmit: true` per `frontend/tsconfig.json` line 18). It does not produce output. Under the new build, `tsc --noEmit` should run **before** `eleventy` (so type errors abort the build before any output is written):

```json
"build": "tsc --noEmit && eleventy"
// or, with schema validation:
"build": "npm run validate-schema && tsc --noEmit && eleventy"
```

Under Option A, `tsc` should be invoked from `frontend/` (where `tsconfig.json` lives) — either via `tsc -p frontend` or by keeping the workspace script and invoking `npm run build:check --workspace=frontend`.

---

## No Analog Found

| File | Reason |
|------|--------|
| `.eleventyignore` (if added) | Project-specific; pnwmoths doesn't need one. Construct from rules above. |
| Eleventy/Vite path-shift in `validate-schema.mjs` | Beeatlas-internal; only relevant if Option B hoists frontend. Update line 19 `ASSETS_DIR` path. |
| `lighthouse` job in deploy.yml | Already exists and post-deploys against `https://beeatlas.net/`; no shift needed since URL doesn't change. |

---

## Existing Beeatlas Config That MUST Keep Working (Quick-Reference Checklist)

The planner should treat each of these as a regression risk; a plan is only "done" when all still hold:

| Invariant | Source | Risk Surface |
|-----------|--------|--------------|
| `optimizeDeps.exclude: ['wa-sqlite']` | `frontend/vite.config.ts` line 6–8 | Migrating vite.config — must persist into merged config |
| `preloadAssets()` plugin registered | `frontend/vite.config.ts` line 5; `frontend/vite-plugin-preload.ts` | Plugin import path may shift if vite.config.ts moves |
| `validate-schema.mjs` runs pre-build | `package.json` line 20; deploy.yml line 25 | `ASSETS_DIR` path under Option B; build script ordering |
| `VITE_MAPBOX_TOKEN` build env | deploy.yml line 33 | Must remain on the step that invokes the build (now `eleventy`) |
| Public asset paths `/data/`, `/db/`, `/feeds/` | `frontend/public/` + Vite default `publicDir` | Single-owner decision (Eleventy passthrough vs Vite publicDir) |
| Vitest `environment: 'happy-dom'` | `frontend/vite.config.ts` lines 12–15 | Must survive vite.config.ts merge |
| `tsc` type-check fails build | `frontend/package.json` line 8 | New build script must keep this gate |
| Cache-control split `assets/* immutable` vs `* max-age=0` | deploy.yml lines 68–77 | Eleventy + Vite plugin keeps `assets/` convention; verify post-build |
| 172 Vitest tests pass | CONTEXT; existing `frontend/src/tests/` | Run at every plan boundary |
| `npm workspaces` resolution | root `package.json` line 23–25 | Coherent update if Option B collapses |
| `.nvmrc` Node 24.12 | `/Users/rainhead/dev/beeatlas/.nvmrc` | Verify Eleventy 3.x + plugin 7.x support — pnwmoths pins 22; should be fine on 24 |

---

## Metadata

**Analog search scope:**
- `/Users/rainhead/dev/pnwmoths/` — primary reference
- `/Users/rainhead/dev/beeatlas/` — invariants source

**Files read:**
- pnwmoths: `eleventy.config.js`, `vite.config.js`, `package.json`, `src/_includes/base.njk` (structure ref), `_site/` listing, `.gitignore`, `.nvmrc`
- beeatlas: `package.json`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/vite-plugin-preload.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `.github/workflows/deploy.yml`, `scripts/validate-schema.mjs`, `.nvmrc`, `.gitignore`
- Phase: `074-CONTEXT.md`, `.planning/PROJECT.md`

**Pattern extraction date:** 2026-04-29
