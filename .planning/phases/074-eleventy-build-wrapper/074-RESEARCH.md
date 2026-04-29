# Phase 74: Eleventy Build Wrapper — Research

**Researched:** 2026-04-29
**Domain:** Static site generator integration (Eleventy 3.x outer build wrapping Vite 6.x SPA)
**Confidence:** HIGH

## Summary

Phase 74 wraps the existing Vite SPA in Eleventy 3.x using `@11ty/eleventy-plugin-vite`. The integration model — once the plugin internals are understood — is straightforward and the pnwmoths reference (which ships this exact pattern) covers the entire build path. Key non-obvious facts:

1. **The plugin owns the build orchestration.** Eleventy writes its output to `dir.output`; the plugin then **renames** that directory to a temp folder (`.11ty-vite/` by default), runs Vite with `root` = temp folder and `outDir` = original `dir.output`, then deletes the temp folder. So `vite.config.ts`'s `root`/`outDir` are overridden during Eleventy-driven builds; they only apply when `vite build` runs standalone.
2. **The SPA becomes "an Eleventy passthrough page."** Beeatlas's `frontend/index.html` is the entry point; Eleventy passes it through unchanged (with the `src/` JS/CSS tree alongside) into `_site/`, then Vite — operating on the renamed temp folder — discovers `<script type="module" src="...">` references in that index.html and produces the hashed bundle in `_site/assets/`.
3. **Hashed bundles still land in `assets/`** (verified in `~/dev/pnwmoths/_site/assets/index-*.js`). The two-rule cache-control deploy strategy (`max-age=31536000, immutable` for `assets/*`; `max-age=0` for everything else) keeps working with no rule changes — only path prefix changes if `frontend/dist/` becomes `_site/`.

**Primary recommendation:** Adopt **Layout B (hoist the Vite app to repo root)** with output dir `_site/`, mirroring pnwmoths exactly. Collapse the `npm workspaces` setup. The diff is larger but every downstream complication of Layout A (cross-boundary `dir.input`, two `package.json` files, awkward Vite plugin invocation paths, `.eleventyignore` gymnastics) goes away. Keep `tsc --noEmit` as a separate top-level npm script that runs in CI before `eleventy`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Static page generation (templates, `index.html`) | Eleventy | — | Owns templating; produces HTML into `_site/` |
| Client JS/CSS bundling, content hashing | Vite (via plugin) | — | Reads HTML inputs Eleventy emitted, outputs to `_site/assets/` |
| Dev-server hot reload | Eleventy + Vite middleware | — | `eleventy --serve` runs Vite as middleware; one command, one port |
| Public asset serving (`/data/`, `/db/`) | Eleventy passthrough copy | Vite `publicDir` | Either works; Eleventy passthrough is the canonical pnwmoths pattern |
| TypeScript type checking | `tsc --noEmit` (separate npm script) | — | Vite handles transpilation; tsc is a check-only gate |
| Vitest test runs | Vite (via Vitest, no Eleventy) | — | Test config rides on root `vite.config.ts`; Eleventy uninvolved |
| Schema validation gate | Standalone Node script | — | Runs before any build step, unchanged |
| Mapbox token injection | Vite (`import.meta.env`) | — | Build env → Vite — plugin path is transparent to env handling |
| Cache-control rules at deploy | GitHub Actions (`aws s3 sync` flags) | — | Hashed `/assets/*` immutable; everything else `max-age=0` — **no change to rules** |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@11ty/eleventy` | `^3.1.5` [VERIFIED: `npm view @11ty/eleventy version` → 3.1.5] | Outer SSG | Pnwmoths runs this version; current stable |
| `@11ty/eleventy-plugin-vite` | `^7.1.1` [VERIFIED: `npm view @11ty/eleventy-plugin-vite version` → 7.1.1] | Vite integration | Official plugin; pnwmoths pins `^7.0.0` (compatible) |
| `vite` | `^6.2.3` (existing) | Inner bundler | Already in `frontend/package.json`; no upgrade needed for this phase |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^4.1.2` (existing) | Test runner | Existing — runs against root `vite.config.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@11ty/eleventy-plugin-vite` | Hand-rolled `npm-run-all -s eleventy vite` | [ASSUMED] Loses Vite-as-middleware dev server (no HMR for Eleventy-rendered pages); breaks v3.2 SSR/hydration story. Decision locked in CONTEXT.md anyway. |
| Eleventy 3.x | Eleventy 2.x | 3.x is the current stable line; native ESM config; default in pnwmoths reference. No reason to use 2.x. |
| Plain JS `eleventy.config.js` | TypeScript `eleventy.config.ts` | [ASSUMED] Plugin and Eleventy itself are JS; pnwmoths uses `.js`; mixing TS adds tooling without benefit for a config file the planner expects to be ~30 lines. |

**Installation:**
```bash
npm install --save-dev @11ty/eleventy @11ty/eleventy-plugin-vite
```

**Version verification:** Both packages confirmed against the npm registry on 2026-04-29. Pnwmoths `package.json:25,38` uses these same packages at compatible versions.

## Project Constraints (from CLAUDE.md)

From `/Users/rainhead/dev/beeatlas/CLAUDE.md`:

- **Static hosting only** — no server runtime. Eleventy + Vite output is fully static; OK.
- **Python 3.14+** — pipeline language; unaffected by this phase.
- **AWS via CDK; deploy via GitHub OIDC** — `.github/workflows/deploy.yml` will need its `frontend/dist/` paths updated; OIDC role unchanged.
- **`speicmenLayer` typo deferred** — do not fix incidentally (irrelevant here, but flagged for awareness).
- **Local dev:** `cd frontend && npm run dev` — **will change** if we hoist (Layout B). Update CLAUDE.md as part of this phase.

From `/Users/rainhead/.claude/CLAUDE.md`:

- **Node version pinned in `.nvmrc`** — currently `24.12`. No change needed; Eleventy 3.x runs on Node 18+.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────┐
                         │ Developer runs `npm run build`   │
                         └─────────────┬────────────────────┘
                                       │
                                       ▼
                ┌──────────────────────────────────────────┐
                │ npm run validate-schema                  │
                │   scripts/validate-schema.mjs            │
                │   (parquet column gate — unchanged)      │
                └─────────────────────┬────────────────────┘
                                      │
                                      ▼
                ┌──────────────────────────────────────────┐
                │ npm run typecheck                        │
                │   tsc --noEmit                           │
                │   (was: `tsc &&` prefix in frontend)     │
                └─────────────────────┬────────────────────┘
                                      │
                                      ▼
                ┌──────────────────────────────────────────┐
                │ npm run build:eleventy                   │
                │   eleventy                               │
                │                                          │
                │   Reads:  src/ (templates, layouts)      │
                │           index.html (passthrough)       │
                │           public/ (passthrough)          │
                │   Writes: _site/                         │
                └─────────────────────┬────────────────────┘
                                      │
                                      ▼ EleventyVitePlugin's runBuild()
                ┌──────────────────────────────────────────┐
                │ 1. fs.rename(_site → .11ty-vite)         │
                │ 2. vite build                            │
                │      root:    .11ty-vite                 │
                │      outDir:  _site                      │
                │      input:   .11ty-vite/index.html      │
                │ 3. fs.rm(.11ty-vite)                     │
                └─────────────────────┬────────────────────┘
                                      │
                                      ▼
                ┌──────────────────────────────────────────┐
                │ _site/                                   │
                │   index.html        (Vite-rewritten      │
                │                      with hashed paths)  │
                │   assets/index-*.js (hashed bundle)      │
                │   assets/*.css      (hashed CSS)         │
                │   assets/*.wasm     (hashed wa-sqlite)   │
                │   data/             (passthrough)        │
                │   db/               (passthrough, if     │
                │                     populated)           │
                └─────────────────────┬────────────────────┘
                                      │
                                      ▼ GitHub Actions deploy job
                ┌──────────────────────────────────────────┐
                │ aws s3 sync _site/assets/                │
                │   → s3://bucket/assets/ immutable        │
                │ aws s3 sync _site/                       │
                │   → s3://bucket/ max-age=0 (excl assets) │
                │ CloudFront invalidate /*                 │
                └──────────────────────────────────────────┘
```

### Recommended Project Structure (Layout B — hoisted, recommended)

```
beeatlas/
├── eleventy.config.js             # NEW: Eleventy config
├── vite.config.ts                 # MOVED from frontend/
├── vite-plugin-preload.ts         # MOVED from frontend/
├── tsconfig.json                  # MOVED from frontend/
├── package.json                   # MERGED: deps from frontend/package.json
├── package-lock.json              # regenerated
├── index.html                     # MOVED from frontend/
├── src/                           # MOVED from frontend/src/
│   └── (all .ts files unchanged)
├── public/                        # MOVED from frontend/public/
│   └── data/                      # runtime-fetched at /data/
├── _site/                         # NEW build output (was frontend/dist/)
├── scripts/                       # unchanged
├── data/                          # unchanged (Python pipeline)
├── infra/                         # unchanged (CDK)
└── .github/workflows/deploy.yml   # path updates only
```

### Pattern 1: Plugin-managed build with passthrough SPA

**What:** Eleventy passes through the SPA's `index.html` and `src/` tree; the plugin renames the Eleventy output to a temp folder, then Vite builds from that temp folder discovering the HTML entry naturally.

**When to use:** Always. This is the only path the plugin supports for builds (verified by reading `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js:55-95`).

**Example — minimal `eleventy.config.js`:**
```js
// Source: derived from ~/dev/pnwmoths/eleventy.config.js
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";

export default function (eleventyConfig) {
  // Pass the SPA index.html through unchanged.
  eleventyConfig.addPassthroughCopy({ "index.html": "index.html" });
  // Pass the src tree through so Vite can discover modules from it.
  eleventyConfig.addPassthroughCopy({ "src": "src" });
  // Pass public/ assets through (data, db, anything fetched at runtime).
  eleventyConfig.addPassthroughCopy({ "public": "/" });

  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      // appType: "mpa" is the plugin default; left explicit for clarity.
      appType: "mpa",
    },
  });

  return {
    dir: {
      input: "src/_eleventy",   // empty for v3.1; Phase 75 populates
      output: "_site",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
    },
  };
}
```

[ASSUMED] Whether `src/_eleventy/` is the right input dir name vs. some other path: pnwmoths uses `src/` as input but pnwmoths has no SPA-as-passthrough alongside. For beeatlas, the input dir must be **disjoint from `src/`** so Eleventy doesn't try to template the TypeScript files. A subdirectory like `src/_eleventy/` (currently empty, populated in Phase 75) keeps related concerns under `src/` while disambiguating.

### Pattern 2: `vite.config.ts` survives unchanged (mostly)

The plugin overrides `root` and `outDir` at build time. Beeatlas's existing config keeps:

```ts
// vite.config.ts (after move to repo root)
import { defineConfig } from 'vite';
import preloadAssets from './vite-plugin-preload.ts';

export default defineConfig({
  plugins: [preloadAssets()],
  optimizeDeps: {
    exclude: ['wa-sqlite'],   // KEEP: required for runtime WASM resolution
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
    passWithNoTests: true,
  },
});
```

No `root: '_site'`, no `emptyOutDir: false` needed. **Why not?** Pnwmoths sets those because it explicitly supports running `vite build` standalone (and Vitest reads root from there). Beeatlas can choose either pattern; the simpler choice is to omit them and let the plugin own the build root entirely. Vitest doesn't care about `root` for tests because tests don't invoke the build pipeline.

[ASSUMED] If anyone later runs `vite build` standalone (without Eleventy) it'll fail to find an entry. Mitigation: don't expose a top-level `vite build` script. Use `npm run build` which always goes through Eleventy.

### Anti-Patterns to Avoid

- **Setting `viteOptions.root` or `viteOptions.build.outDir` in `eleventy.config.js`.** The plugin overwrites them; configuring them creates the illusion of control. Source: `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js:62,80`.
- **Trying to keep `frontend/` as a separate Vite root with Eleventy at the parent.** Layout A. The plugin's rename-and-build dance assumes Eleventy and Vite share a single output directory. Cross-boundary integration requires re-implementing the rename logic — that's hand-rolling, which CONTEXT.md prohibits.
- **`emptyOutDir: false` "to be safe."** Cargo-cult from pnwmoths. The plugin renames `_site/` away before Vite runs, so when Vite's `emptyOutDir: true` (the default) runs, the dir is already empty. Setting `false` is harmless but confusing — don't add it without the standalone-build justification pnwmoths has.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential Eleventy → Vite execution | `npm-run-all -s eleventy vite` | `@11ty/eleventy-plugin-vite` | Plugin owns the rename/restore/cleanup; manual sequencing breaks dev-server middleware path |
| Dev server with HMR + Eleventy reload | Custom proxy/concatenated dev servers | `eleventy --serve` | Plugin runs Vite as middleware on the Eleventy dev server — single port, single process |
| Asset hashing for cache-busting | Hand-rolled hash plugin | Vite's built-in (already used) | Already produces `assets/index-*.js` that the deploy cache rule depends on |
| Public-dir passthrough | Custom recursive copy script | Eleventy `addPassthroughCopy` | Built-in, watched in dev, deterministic in build |

**Key insight:** Every part of this integration except `eleventy.config.js` itself already exists in this codebase or in the plugin. The phase is wiring, not engineering.

## Runtime State Inventory

> Layout B (recommended) is a refactor that moves files. Inventory of state that won't auto-update:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by inspection. No cached paths in any S3 prefix or DB reference `frontend/dist/` (CloudFront serves from S3 root, not from a `dist`-prefixed key). | None |
| Live service config | **CloudFront origin config** points to the S3 bucket root, not to a path. **GitHub Pages**: not used. **GitHub Actions environment**: `S3_BUCKET_NAME`, `AWS_DEPLOYER_ROLE_ARN`, `CF_DISTRIBUTION_ID`, `MAPBOX_TOKEN` — all referenced by name only, no path baked in. | None |
| OS-registered state | None. Maderas nightly cron runs `data/nightly.sh` which doesn't touch the frontend build. | None |
| Secrets/env vars | `MAPBOX_TOKEN` (GitHub Actions secret) → `VITE_MAPBOX_TOKEN` (build env) → `import.meta.env.VITE_MAPBOX_TOKEN` (Vite). Names unchanged. `frontend/.env` and `frontend/.env.example` move with the directory under Layout B. | Update `.env` location if hoisting; otherwise none |
| Build artifacts / installed packages | `frontend/node_modules/` — discarded; root `node_modules/` regenerated from new merged `package.json`. `package-lock.json` regenerated. `frontend/dist/` — discarded; new build emits to `_site/`. | `rm -rf node_modules frontend/node_modules frontend/package-lock.json` once during the migration commit |

**Canonical question answer:** After Layout B's file moves, runtime systems that still reference the old layout: **none**. Every consumer of the build output (S3, CloudFront, GitHub Actions) refers to paths inside the build output (`assets/*`, `data/*`), not to the source-tree path of where it was built. The CI workflow is the one place where source-tree paths leak out (`path: frontend/dist/`); those leak points must be updated coherently in `.github/workflows/deploy.yml`.

## Common Pitfalls

### Pitfall 1: SPA `index.html` references break under passthrough

**What goes wrong:** `frontend/index.html:9-10` uses **relative** paths: `./src/index.css` and `./src/bee-atlas.ts`. After Eleventy passthrough copies `index.html` to `_site/index.html` and the plugin renames `_site/` → `.11ty-vite/`, Vite resolves these as `.11ty-vite/src/index.css`. That file only exists if `src/` was also passed through to `_site/src/`.

**Why it happens:** Vite needs to *see* the source modules from the temp folder it's working in. Without passthrough copy of `src/`, Vite emits "could not resolve" errors.

**How to avoid:** Pass through both `index.html` AND `src/` (see Pattern 1 example). pnwmoths does this at `eleventy.config.js:69`: `addPassthroughCopy({ "src/components": "components" })`.

**Warning signs:** Build error of the form `Could not resolve "./src/bee-atlas.ts" from "index.html"`.

### Pitfall 2: `public/data/` and `public/db/` paths get duplicated or moved

**What goes wrong:** Vite has its own `publicDir` convention (defaults to `<root>/public/`). Under the plugin, root is the temp folder. If `public/` was passthrough-copied to `_site/public/`, Vite would then try to publish `_site/public/*` to `_site/` again, doubling files or 404ing.

**Why it happens:** Two concepts of "public" colliding — Eleventy's passthrough vs. Vite's `publicDir`.

**How to avoid:** Use **only one** mechanism. Recommended: Eleventy passthrough at `addPassthroughCopy({ "public": "/" })` (mounts contents of `public/` at site root), and disable Vite's `publicDir` with `publicDir: false` in `vite.config.ts`. [VERIFIED via Vite docs: `publicDir: false` disables the feature.] Pnwmoths handles this differently — it doesn't have a Vite `public/` because all assets are passed through Eleventy explicitly. Either approach works; the rule is "never both."

**Warning signs:** Files under `_site/public/` instead of `_site/` directly. `/data/occurrences.parquet` returns 404 after build.

### Pitfall 3: Vitest happy-dom config silently drops because `root` changed

**What goes wrong:** If the recommended `vite.config.ts` lives at repo root (Layout B), Vitest finds it normally. If `vite.config.ts` stays in `frontend/` (Layout A), `npm test` from the root needs `--workspace=frontend` or a relocated config — and the `test:` block's `environment: 'happy-dom'` and `passWithNoTests: true` must be findable from wherever Vitest is invoked.

**Why it happens:** Vitest's config resolution follows the cwd it runs in.

**How to avoid:** Layout B — single `vite.config.ts` at root, Vitest invoked from root. The test config block in `frontend/vite.config.ts:12-14` moves with the file.

**Warning signs:** Tests pass locally but `Cannot find package 'happy-dom'` in CI, or 172 → 0 tests collected because Vitest didn't find the config.

### Pitfall 4: The `tsc` step disappears when build script splits

**What goes wrong:** Current `frontend/package.json:8` runs `"build": "tsc && vite build"`. After migration, the top-level build script is something like `npm run validate-schema && eleventy`. If `tsc --noEmit` isn't explicitly added back, type errors stop failing the build.

**Why it happens:** The plugin doesn't run TypeScript checks; Vite transpiles without checking. Easy to forget.

**How to avoid:** Add explicit `"typecheck": "tsc --noEmit"` script and chain it: `"build": "npm run validate-schema && npm run typecheck && eleventy"`. Verify in CI by intentionally breaking a type and confirming the build fails.

**Warning signs:** A type error gets through to production. The CI build job comes back green for a known-broken commit.

### Pitfall 5: Mapbox token is silently empty in dev because `.env` moves

**What goes wrong:** Under Layout B, `frontend/.env` (containing `VITE_MAPBOX_TOKEN=...` for local dev) needs to move to repo root. If forgotten, `import.meta.env.VITE_MAPBOX_TOKEN` is `undefined`; `bee-map.ts:235` falls back to `''`; Mapbox initializes with no token; tiles return 401.

**Why it happens:** Vite reads `.env` from `viteOptions.root`, which the plugin sets to its temp folder (which doesn't contain `.env`). Vite still reads `.env` from `process.cwd()` for env-variable resolution at config-load time, so root-level `.env` works.

**How to avoid:** Move `frontend/.env` and `frontend/.env.example` to repo root in the same commit as the file hoisting. Verify dev server: `npm run dev`, open the map, confirm tiles load.

**Warning signs:** Map shows blank gray; browser console shows 401 from Mapbox tiles.

## Code Examples

### Top-level `package.json` scripts (recommended after Layout B)

```json
{
  "name": "beeatlas",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "eleventy --serve",
    "build:data": "cd data && uv run python run.py",
    "validate-schema": "node scripts/validate-schema.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "build": "npm run validate-schema && npm run typecheck && eleventy",
    "preview": "vite preview --outDir _site",
    "fetch-data": "bash scripts/fetch-data.sh"
  }
}
```

Notes:
- `"type": "module"` flips from `"commonjs"` (current root) — required for Eleventy's ESM config and for `vite.config.ts` resolution semantics under nodenext.
- `npm run dev` becomes `eleventy --serve` (no longer `cd frontend && npm run dev`). Update `CLAUDE.md` to reflect.
- `vite preview` requires `--outDir _site` because the default `dist/` no longer exists.
- Workspaces array removed.

### `.github/workflows/deploy.yml` minimum diff

```yaml
# Build job:
- name: Run tests
  run: npm test                 # was: npm test --workspace=frontend

- name: Build frontend
  run: npm run build            # was: npm run build --workspace=frontend
  env:
    VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_TOKEN }}

- name: Upload build artifact
  uses: actions/upload-artifact@v7
  with:
    name: site
    path: _site/                 # was: frontend/dist/
    retention-days: 1

# Deploy job:
- name: Download build artifact
  uses: actions/download-artifact@v8
  with:
    name: site                   # was: frontend-dist
    path: _site/                 # was: frontend/dist/

- name: Sync hashed assets
  run: |
    aws s3 sync _site/assets/ s3://${{ vars.S3_BUCKET_NAME }}/assets/ \
      --cache-control "max-age=31536000, immutable"

- name: Sync everything else
  run: |
    aws s3 sync _site/ s3://${{ vars.S3_BUCKET_NAME }} \
      --delete \
      --exclude "assets/*" \
      --exclude "cache/*" --exclude "data/*" --exclude "db/*" \
      --cache-control "max-age=0"
```

The `assets/` path inside the bundle is preserved — no cache-control rule changes needed.

### `tsconfig.json` after move

The current `frontend/tsconfig.json` has `"include": ["src"]`. After moving to repo root, `src/` resolves to repo-root `src/`, so the include works unchanged. Other settings (`types: ["vite/client", "node"]`, `verbatimModuleSyntax`, etc.) are unchanged.

### `scripts/validate-schema.mjs` path adjustment

Line 19 currently:
```js
const ASSETS_DIR = new URL('../frontend/public/data/', import.meta.url).pathname;
```

After Layout B (public/ at repo root):
```js
const ASSETS_DIR = new URL('../public/data/', import.meta.url).pathname;
```

One-line change. The script lives at `scripts/validate-schema.mjs` in both layouts (no script move). [VERIFIED: read of `scripts/validate-schema.mjs:19`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Eleventy 2.x with CommonJS configs | Eleventy 3.x with ESM configs | 2024 | Use ESM `eleventy.config.js`; `module.exports =` form is legacy |
| `slinkity` for Eleventy + Vite + components | `@11ty/eleventy-plugin-vite` | ongoing | slinkity is unmaintained per the plugin's own README; the official plugin is the path |
| Hashed-path manifest plugins | Vite's built-in `assets/` hashing | n/a | Already what beeatlas uses |

**Deprecated/outdated:**
- `slinkity` — listed as "currently unmaintained" in the official plugin's README (`node_modules/@11ty/eleventy-plugin-vite/README.md:99`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TypeScript `eleventy.config.ts` adds tooling complexity without benefit | Standard Stack > Alternatives | Low — config is small; reverting to TS later is trivial |
| A2 | `src/_eleventy/` is a reasonable input-dir name (vs `pages/`, `eleventy-input/`, etc.) | Pattern 1 | Cosmetic — Phase 75 picks the final name; this just avoids collision with `src/*.ts` |
| A3 | Layout A's pain points (cross-boundary `dir.input`, two `package.json`s) outweigh its smaller diff | Summary > Primary Recommendation | Medium — if user prefers minimal diff, A is viable but every plan task gets harder |
| A4 | Standalone `vite build` won't be needed after migration | Pattern 2 | Low — `npm run preview` against `_site/` covers the local-serve case |
| A5 | `publicDir: false` in vite.config.ts is the right disambiguation | Pitfall 2 | Low — alternative is to leave Vite's publicDir on and skip the Eleventy passthrough for `public/`; either works, pick one |

## Open Questions

1. **Should the input dir be inside `src/` or at repo root?**
   - What we know: pnwmoths uses `src/` as Eleventy input AND has its JS in `src/components/`. There's no conflict because pnwmoths has no SPA-style `src/main.ts` at the same level.
   - What's unclear: For beeatlas, mixing Eleventy templates with `src/bee-atlas.ts` etc. risks Eleventy templating non-template files (or requires `.eleventyignore` listing every `.ts`).
   - Recommendation: Use `src/_eleventy/` (or `src/pages/`) as input — disjoint from the SPA's TS files. Phase 75 finalizes naming.

2. **Keep `frontend/.env` strategy or unify?**
   - What we know: `frontend/.env` (gitignored) has the local Mapbox token; `.env.example` is checked in.
   - What's unclear: After Layout B move, where do these live? Repo root `.env` is conventional but may surprise users who expect `.env` next to where they ran `npm install`.
   - Recommendation: Move to repo root with `.env`. Update `.gitignore` to ensure root `.env` is ignored (it likely already covers it; verify).

3. **Should `package.json` keep workspaces despite collapse?**
   - What we know: Pnwmoths is single-package (no workspaces). CONTEXT.md explicitly allows either keeping or replacing workspaces.
   - What's unclear: Are there future tools (CDK in `infra/`, Python pipeline in `data/`) that would benefit from being workspace members?
   - Recommendation: Drop workspaces. `infra/` is TypeScript+CDK with its own `package.json` but doesn't need workspace linking. `data/` is Python (uv). Single root `package.json` is simpler and matches pnwmoths.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Eleventy, Vite, Vitest | ✓ (assumed — pinned in `.nvmrc`) | 24.12 | — |
| npm | Package install | ✓ | (Node 24 ships npm 10) | — |
| `@11ty/eleventy` | Outer build | ✗ — not yet installed | will install `^3.1.5` | — |
| `@11ty/eleventy-plugin-vite` | Build orchestration | ✗ — not yet installed | will install `^7.1.1` | — |
| `vite` | Inner bundler | ✓ | 6.2.3 (root via workspace) | — |
| `tsc` | Typecheck gate | ✓ | 5.8.2 (in frontend devDeps) | — |
| `vitest` | Test runner | ✓ | 4.1.2 | — |
| AWS CLI (CI only) | Deploy step | ✓ (in `aws-actions/configure-aws-credentials`) | n/a | — |

**Missing dependencies with no fallback:** None blocking — both Eleventy packages are normal `npm install` adds.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 with happy-dom 20.8.9 |
| Config file | `vite.config.ts` (test block — survives the move from `frontend/`) |
| Quick run command | `npm test` (after workspace collapse) |
| Full suite command | `npm test` |
| Test count target | 172 (must remain green) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ELEV-WRAP-01 | All 172 existing Vitest tests pass under new layout | unit | `npm test` | ✅ existing |
| ELEV-WRAP-02 | `npm run build` produces `_site/index.html` with hashed `<script type="module" src="/assets/index-*.js">` | smoke | `npm run build && grep -E 'src="/assets/index-[A-Za-z0-9_-]+\.js"' _site/index.html` | ❌ Wave 0 (manual smoke until automated) |
| ELEV-WRAP-03 | `_site/assets/` contains a `.wasm` file (wa-sqlite preserved) | smoke | `npm run build && ls _site/assets/*.wasm` | ❌ Wave 0 |
| ELEV-WRAP-04 | `_site/data/` exists after build (passthrough preserved) | smoke | `npm run build && test -d _site/data` | ❌ Wave 0 |
| ELEV-WRAP-05 | `tsc --noEmit` exits non-zero on injected type error | manual UAT | introduce `const x: string = 1` and run `npm run typecheck` | ❌ manual |
| ELEV-WRAP-06 | `eleventy --serve` starts and serves SPA at `/` with map rendering | manual UAT | `npm run dev`, open browser, click around | ❌ manual |
| ELEV-WRAP-07 | CI deploy succeeds end-to-end on PR branch (build job green) | integration | push branch, observe Actions | ❌ branch-push UAT |

### Sampling Rate

- **Per task commit:** `npm test` (172 tests, runs in seconds with happy-dom)
- **Per wave merge:** `npm test && npm run build && ls _site/assets/*.wasm && test -d _site/data`
- **Phase gate:** Full smoke-test sequence above + manual `npm run dev` UAT + GitHub Actions build job green

### Wave 0 Gaps

- [ ] No new test files needed — existing Vitest suite covers SPA behavior. Build smoke-tests are shell-level (no unit tests for build orchestration; the integration is too thin to mock meaningfully).
- [ ] [ASSUMED] An optional `eleventy.config.test.js` mirroring pnwmoths' (which validates constants in the config source) could be added later if config grows; not needed for Phase 74.

## Sources

### Primary (HIGH confidence)

- `~/dev/pnwmoths/package.json` — script ordering, devDependencies, plugin versions [verified by Read]
- `~/dev/pnwmoths/eleventy.config.js` — `EleventyVitePlugin` registration, passthrough patterns, `viteOptions: { appType: "mpa" }` [verified by Read]
- `~/dev/pnwmoths/vite.config.js` — `root: '_site'`, `outDir: '_site'`, `emptyOutDir: false` (CRITICAL when `vite build` runs standalone) [verified by Read]
- `~/dev/pnwmoths/_site/index.html` — confirmed Vite-rewritten paths use `/assets/main-*.js` [verified by Read]
- `~/dev/pnwmoths/_site/assets/` — confirmed hashed bundles land in `assets/` subdirectory [verified by Bash ls]
- `~/dev/pnwmoths/node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js` — read plugin source; verified rename-build-restore mechanism [verified by Read]
- `~/dev/pnwmoths/node_modules/@11ty/eleventy-plugin-vite/README.md` — official defaults: `tempFolderName: ".11ty-vite"`, `appType: "mpa"`, `serverOptions.middlewareMode: true`, `build.emptyOutDir: true` [verified by Read]
- `npm view @11ty/eleventy version` → `3.1.5` (2026-04-29) [verified by Bash]
- `npm view @11ty/eleventy-plugin-vite version` → `7.1.1` (2026-04-29) [verified by Bash]
- `/Users/rainhead/dev/beeatlas/.github/workflows/deploy.yml` — current cache-control structure [verified by Read]
- `/Users/rainhead/dev/beeatlas/scripts/validate-schema.mjs:19` — current ASSETS_DIR path [verified by Read]

### Secondary (MEDIUM confidence)

- pnwmoths plugin behavior with TypeScript: pnwmoths is plain JS, so TS-specific behavior under the plugin is inferred not observed. [ASSUMED] Vite's TS handling under `appType: "mpa"` works the same as standalone. Risk: low — Vite TS handling is path-independent.

### Tertiary (LOW confidence)

- None. All architectural claims are backed by either pnwmoths file inspection, plugin source code reading, or beeatlas codebase grep.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry, pinned in pnwmoths reference
- Architecture: HIGH — plugin source code inspected; pnwmoths' built `_site/` confirms output shape
- Pitfalls: HIGH — derived from concrete file inspection of beeatlas (relative paths in index.html, env file location, validate-schema.mjs path) and pnwmoths (passthrough patterns)
- Layout recommendation: MEDIUM — Layout B is the cleaner pattern but the diff is larger; Layout A is "less wrong" rather than "wrong" and the planner can override

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days — Eleventy 3.x and the plugin are stable; nothing in this research is on a fast-moving edge)
